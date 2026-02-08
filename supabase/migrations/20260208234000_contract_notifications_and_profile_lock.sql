-- Contract v2.0 sweep: notifications hub, map visibility, and profile tier lock-down.

-- 1) Profiles: add map_visible (client "Visible" toggle) and prevent self-upgrade / sensitive edits.
alter table public.profiles
  add column if not exists map_visible boolean not null default false;

comment on column public.profiles.map_visible is
  'Contract v2.0 Map: when true, user allows their pinned location to be visible to others while location_pinned_until > now().';

create or replace function public.prevent_sensitive_profile_updates()
returns trigger
language plpgsql
security definer
as $$
declare
  role text := (auth.jwt() ->> 'role');
begin
  -- Service role can update everything.
  if role = 'service_role' then
    return new;
  end if;

  -- Block self-upgrade / billing / verification tampering.
  if (new.tier is distinct from old.tier)
     or (new.subscription_status is distinct from old.subscription_status)
     or (new.subscription_cycle_anchor_day is distinct from old.subscription_cycle_anchor_day)
     or (new.subscription_current_period_start is distinct from old.subscription_current_period_start)
     or (new.subscription_current_period_end is distinct from old.subscription_current_period_end)
     or (new.is_verified is distinct from old.is_verified)
     or (new.verified is distinct from old.verified)
     or (new.verification_status is distinct from old.verification_status)
     or (new.verification_comment is distinct from old.verification_comment)
     or (new.family_slots is distinct from old.family_slots)
     or (new.media_credits is distinct from old.media_credits)
     or (new.stars_count is distinct from old.stars_count)
     or (new.mesh_alert_count is distinct from old.mesh_alert_count)
  then
    raise exception 'forbidden_profile_update';
  end if;

  -- Allow map_visible toggle (and other safe profile fields).
  return new;
end;
$$;

drop trigger if exists trg_prevent_sensitive_profile_updates on public.profiles;
create trigger trg_prevent_sensitive_profile_updates
before update on public.profiles
for each row
execute function public.prevent_sensitive_profile_updates();

-- 2) Update friend pins RPC to respect map_visible = true (Visible toggle).
create or replace function public.get_friend_pins_nearby(
  p_lat double precision,
  p_lng double precision,
  p_radius_m int default 50000
)
returns table(
  id uuid,
  display_name text,
  avatar_url text,
  dob date,
  relationship_status text,
  owns_pets boolean,
  pet_species text[],
  location_name text,
  last_lat double precision,
  last_lng double precision,
  location_pinned_until timestamptz
)
language sql
security definer
as $$
  with pet_data as (
    select owner_id, array_remove(array_agg(distinct species), null) as pet_species
    from public.pets
    where is_active = true
    group by owner_id
  )
  select
    p.id,
    p.display_name,
    p.avatar_url,
    p.dob,
    p.relationship_status,
    p.owns_pets,
    pd.pet_species,
    p.location_name,
    p.last_lat,
    p.last_lng,
    p.location_pinned_until
  from public.profiles p
  left join pet_data pd on pd.owner_id = p.id
  where p.id <> auth.uid()
    and p.map_visible = true
    and p.location_pinned_until is not null
    and p.location_pinned_until > now()
    and coalesce(p.location, p.location_geog) is not null
    and ST_DWithin(
      coalesce(p.location, p.location_geog),
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
      greatest(0, least(p_radius_m, 50000))
    )
  order by p.location_pinned_until desc
  limit 200;
$$;

revoke all on function public.get_friend_pins_nearby(double precision, double precision, int) from anon;
grant execute on function public.get_friend_pins_nearby(double precision, double precision, int) to authenticated;
grant execute on function public.get_friend_pins_nearby(double precision, double precision, int) to service_role;

-- 3) Notifications hub table + RLS
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  message text not null,
  type text not null check (type in ('alert','admin')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Normalize column name to `read` (some earlier iterations used `is_read`).
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='notifications' and column_name='read'
  ) then
    alter table public.notifications add column read boolean not null default false;

    if exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='notifications' and column_name='is_read'
    ) then
      execute 'update public.notifications set read = is_read where read is distinct from is_read';
    end if;
  end if;
exception when others then
  null;
end $$;

create index if not exists idx_notifications_user on public.notifications(user_id, created_at desc);
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='notifications' and column_name='read'
  ) then
    execute 'create index if not exists idx_notifications_unread on public.notifications(user_id, read) where read = false';
  elsif exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='notifications' and column_name='is_read'
  ) then
    execute 'create index if not exists idx_notifications_unread on public.notifications(user_id, is_read) where is_read = false';
  end if;
exception when others then
  null;
end $$;

alter table public.notifications enable row level security;

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own"
on public.notifications
for select
using (auth.uid() = user_id);

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own"
on public.notifications
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "notifications_insert_service_role" on public.notifications;
create policy "notifications_insert_service_role"
on public.notifications
for insert
with check ((auth.jwt() ->> 'role') = 'service_role');

drop policy if exists "notifications_delete_service_role" on public.notifications;
create policy "notifications_delete_service_role"
on public.notifications
for delete
using ((auth.jwt() ->> 'role') = 'service_role');

-- 4) Auto-generate notifications for nearby users on broadcast insert (contract: Notification Hub + realtime insert stream).
create or replace function public.notify_on_map_alert_insert()
returns trigger
language plpgsql
security definer
as $$
begin
  -- Insert notifications for users who have a retained location and fall within alert range.
  -- Limit recipients to avoid unbounded fanout in early-stage deployments.
  insert into public.notifications(user_id, message, type, metadata)
  select
    p.id,
    case
      when new.alert_type = 'Lost' then 'Alert: Missing in ' || coalesce(p.location_name, 'your area') || '!'
      when new.alert_type = 'Stray' then 'Alert: Furry friend sighting in ' || coalesce(p.location_name, 'your area') || '!'
      else 'Alert nearby in ' || coalesce(p.location_name, 'your area') || '!'
    end,
    'alert',
    jsonb_build_object('alert_id', new.id, 'alert_type', new.alert_type)
  from public.profiles p
  where p.id <> new.creator_id
    and p.location_retention_until is not null
    and p.location_retention_until > now()
    and coalesce(p.location, p.location_geog) is not null
    and ST_DWithin(
      coalesce(p.location, p.location_geog),
      new.location_geog,
      greatest(0, least(coalesce(new.range_meters, 10000), 150000))
    )
  order by p.location_retention_until desc
  limit 500;

  return new;
end;
$$;

drop trigger if exists trg_notify_on_map_alert_insert on public.map_alerts;
create trigger trg_notify_on_map_alert_insert
after insert on public.map_alerts
for each row
execute function public.notify_on_map_alert_insert();
