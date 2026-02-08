-- Contract v2.0: Map/Broadcast alert enforcement + 50km view limit performance.

-- 1) Extend map_alerts
alter table public.map_alerts
  add column if not exists location_geog geography(point, 4326),
  add column if not exists range_meters int,
  add column if not exists expires_at timestamptz;

-- Expand alert_type options to include 'Others' (keep existing).
do $$
begin
  -- Drop & recreate constraint if it exists. Name is unknown; use pg_constraint lookup.
  if exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    where t.relname = 'map_alerts'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%alert_type%'
  ) then
    execute (
      select 'alter table public.map_alerts drop constraint ' || quote_ident(c.conname)
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      where t.relname = 'map_alerts'
        and c.contype = 'c'
        and pg_get_constraintdef(c.oid) ilike '%alert_type%'
      limit 1
    );
  end if;
exception when others then
  null;
end $$;

alter table public.map_alerts
  add constraint map_alerts_alert_type_check
  check (alert_type in ('Stray','Lost','Found','Others'));

-- Populate location_geog for existing rows
update public.map_alerts
set location_geog = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
where location_geog is null;

-- Default range/duration (free baseline) if missing
update public.map_alerts
set
  range_meters = coalesce(range_meters, 10000),
  expires_at = coalesce(expires_at, created_at + interval '12 hours')
where range_meters is null or expires_at is null;

create index if not exists idx_map_alerts_location_gist on public.map_alerts using gist (location_geog);
create index if not exists idx_map_alerts_active_expires on public.map_alerts(is_active, expires_at desc);

-- 2) Enforce contract on insert (quota + clamp)
create or replace function public.enforce_map_alert_contract()
returns trigger
language plpgsql
security definer
as $$
declare
  u_id uuid := auth.uid();
  owner_id uuid;
  tier text;
  base_range int := 10000;
  base_dur interval := interval '12 hours';
  requested_dur interval;
begin
  if u_id is null then
    raise exception 'unauthorized';
  end if;

  -- Always set geog
  new.location_geog := ST_SetSRID(ST_MakePoint(new.longitude, new.latitude), 4326)::geography;

  -- Description limit (contract: <= 500 chars)
  if new.description is not null and length(new.description) > 500 then
    raise exception 'description_too_long';
  end if;

  -- Gold pooling applies to quotas; determine owner and tier.
  owner_id := public._qms_get_pool_owner(u_id);
  tier := public._qms_effective_tier(owner_id);
  if tier <> 'gold' then
    owner_id := u_id;
    tier := public._qms_effective_tier(owner_id);
  end if;

  if tier = 'premium' then
    base_range := 25000;
    base_dur := interval '24 hours';
  elsif tier = 'gold' then
    base_range := 50000;
    base_dur := interval '48 hours';
  end if;

  -- Consume broadcast quota (base or extra). If not allowed, reject.
  if public.check_and_increment_quota('broadcast_alert') is not true then
    raise exception 'quota_exceeded';
  end if;

  -- Apply defaults/clamps for duration and range.
  new.range_meters := coalesce(new.range_meters, base_range);
  if new.expires_at is null then
    new.expires_at := now() + base_dur;
  end if;
  requested_dur := new.expires_at - now();

  -- If request exceeds base, require extended add-on token (extras_broadcasts) and clamp to 150km/72h.
  if (new.range_meters > base_range) or (requested_dur > base_dur) then
    update public.user_quotas
    set extras_broadcasts = extras_broadcasts - 1, updated_at = now()
    where user_id = owner_id and extras_broadcasts > 0;
    if not found then
      -- No extended token: clamp down to base.
      new.range_meters := base_range;
      new.expires_at := now() + base_dur;
    else
      new.range_meters := 150000;
      new.expires_at := now() + interval '72 hours';
    end if;
  else
    -- Clamp down to base if still above.
    if new.range_meters > base_range then
      new.range_meters := base_range;
    end if;
    if requested_dur > base_dur then
      new.expires_at := now() + base_dur;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_map_alerts_contract on public.map_alerts;
create trigger trg_map_alerts_contract
before insert on public.map_alerts
for each row
execute function public.enforce_map_alert_contract();

-- 3) Auto-hide after >10 abuse reports
create or replace function public.map_alerts_auto_hide_on_reports()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.report_count is not null and new.report_count >= 10 then
    new.is_active := false;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_map_alerts_auto_hide on public.map_alerts;
create trigger trg_map_alerts_auto_hide
before update of report_count on public.map_alerts
for each row
execute function public.map_alerts_auto_hide_on_reports();

-- 4) RPCs for 50km view limit
create or replace function public.get_map_alerts_nearby(
  p_lat double precision,
  p_lng double precision,
  p_radius_m int default 50000
)
returns table(
  id uuid,
  latitude double precision,
  longitude double precision,
  alert_type text,
  description text,
  photo_url text,
  support_count int,
  report_count int,
  created_at timestamptz,
  expires_at timestamptz,
  range_meters int,
  creator_display_name text,
  creator_avatar_url text
)
language sql
security definer
as $$
  select
    a.id,
    a.latitude,
    a.longitude,
    a.alert_type,
    a.description,
    a.photo_url,
    a.support_count,
    a.report_count,
    a.created_at,
    a.expires_at,
    a.range_meters,
    p.display_name as creator_display_name,
    p.avatar_url as creator_avatar_url
  from public.map_alerts a
  join public.profiles p on p.id = a.creator_id
  where a.is_active = true
    and (a.expires_at is null or a.expires_at > now())
    and coalesce(a.report_count, 0) < 10
    and a.location_geog is not null
    and ST_DWithin(
      a.location_geog,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
      greatest(0, least(p_radius_m, 50000))
    )
  order by a.created_at desc
  limit 200;
$$;

revoke all on function public.get_map_alerts_nearby(double precision, double precision, int) from anon;
grant execute on function public.get_map_alerts_nearby(double precision, double precision, int) to authenticated;
grant execute on function public.get_map_alerts_nearby(double precision, double precision, int) to service_role;

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

