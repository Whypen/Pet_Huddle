begin;

-- Align tier fields to MASTER_SPEC.md
do $$
begin
  if not exists (select 1 from pg_type where typname = 'tier_enum') then
    create type public.tier_enum as enum ('free', 'plus', 'gold');
  end if;
end $$;

alter table public.profiles
  add column if not exists tier public.tier_enum;

alter table public.profiles
  add column if not exists effective_tier public.tier_enum;

update public.profiles
set
  tier = coalesce(nullif(tier::text, ''), 'free')::public.tier_enum,
  effective_tier = coalesce(nullif(effective_tier::text, ''), tier::text, 'free')::public.tier_enum;

alter table public.profiles
  alter column tier set default 'free'::public.tier_enum;

alter table public.profiles
  alter column effective_tier set default 'free'::public.tier_enum;

-- Align verification_status enum to unverified/pending/verified
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'verification_status_enum') THEN
    DROP TRIGGER IF EXISTS trg_queue_identity_cleanup ON public.profiles;
    DROP TRIGGER IF EXISTS trg_prevent_non_admin_verification ON public.profiles;
    DROP TRIGGER IF EXISTS trg_prevent_sensitive_profile_updates ON public.profiles;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'verification_status_enum_new') THEN
      CREATE TYPE public.verification_status_enum_new AS ENUM ('unverified', 'pending', 'verified');
    END IF;

    ALTER TABLE public.profiles
      ALTER COLUMN verification_status DROP DEFAULT,
      ALTER COLUMN verification_status TYPE public.verification_status_enum_new
      USING (
        CASE
          WHEN verification_status::text IN ('verified', 'approved') THEN 'verified'::public.verification_status_enum_new
          WHEN verification_status::text IN ('unverified', 'rejected') THEN 'unverified'::public.verification_status_enum_new
          WHEN verification_status::text = 'pending' THEN 'pending'::public.verification_status_enum_new
          ELSE 'unverified'::public.verification_status_enum_new
        END
      );

    ALTER TABLE public.profiles
      ALTER COLUMN verification_status SET DEFAULT 'unverified'::public.verification_status_enum_new;

    DROP TYPE public.verification_status_enum;
    ALTER TYPE public.verification_status_enum_new RENAME TO verification_status_enum;
  ELSE
    CREATE TYPE public.verification_status_enum AS ENUM ('unverified', 'pending', 'verified');

    ALTER TABLE public.profiles
      ALTER COLUMN verification_status DROP DEFAULT,
      ALTER COLUMN verification_status TYPE public.verification_status_enum
      USING (
        CASE
          WHEN verification_status::text IN ('verified', 'approved') THEN 'verified'::public.verification_status_enum
          WHEN verification_status::text IN ('unverified', 'rejected') THEN 'unverified'::public.verification_status_enum
          WHEN verification_status::text IN ('pending') THEN 'pending'::public.verification_status_enum
          ELSE 'unverified'::public.verification_status_enum
        END
      );

    ALTER TABLE public.profiles
      ALTER COLUMN verification_status SET DEFAULT 'unverified'::public.verification_status_enum;
  END IF;
END $$;

-- Align verification_uploads status values
alter table public.verification_uploads
  drop constraint if exists verification_uploads_status_check;

update public.verification_uploads
set status = case
  when status in ('verified', 'approved') then 'verified'
  when status in ('unverified', 'rejected') then 'unverified'
  when status = 'pending' then 'pending'
  else 'unverified'
end;

alter table public.verification_uploads
  add constraint verification_uploads_status_check
  check (status in ('pending', 'verified', 'unverified'));

-- Map alert schema alignment
alter table public.map_alerts
  add column if not exists location geography(Point,4326),
  add column if not exists radius_in_meters integer,
  add column if not exists message text,
  add column if not exists pet_id uuid;

update public.map_alerts
set location = location_geog
where location is null and location_geog is not null;

update public.map_alerts
set location = st_setsrid(st_makepoint(longitude, latitude), 4326)::geography
where location is null and latitude is not null and longitude is not null;

update public.map_alerts
set radius_in_meters = range_meters
where radius_in_meters is null and range_meters is not null;

update public.map_alerts
set message = description
where message is null and description is not null;

create index if not exists idx_map_alerts_location
  on public.map_alerts using gist (location);

create or replace function public.map_alerts_sync_location()
returns trigger
language plpgsql
as $$
begin
  if new.location is null and new.latitude is not null and new.longitude is not null then
    new.location := st_setsrid(st_makepoint(new.longitude, new.latitude), 4326)::geography;
  end if;
  if new.radius_in_meters is null and new.range_meters is not null then
    new.radius_in_meters := new.range_meters;
  end if;
  if new.message is null and new.description is not null then
    new.message := new.description;
  end if;
  return new;
end $$;

drop trigger if exists trg_map_alerts_sync_location on public.map_alerts;
create trigger trg_map_alerts_sync_location
before insert or update on public.map_alerts
for each row execute function public.map_alerts_sync_location();

-- Marketplace bookings status alignment
alter table public.marketplace_bookings
  drop constraint if exists marketplace_bookings_status_check;

update public.marketplace_bookings
set status = case
  when status in ('pending', 'confirmed', 'in_progress') then 'pending'
  when status = 'completed' then 'completed'
  when status = 'disputed' then 'disputed'
  when status = 'refunded' then 'cancelled'
  when status = 'cancelled' then 'cancelled'
  else 'pending'
end;

alter table public.marketplace_bookings
  add constraint marketplace_bookings_status_check
  check (status in ('pending', 'completed', 'disputed', 'cancelled'));

-- Verification enforcement functions
create or replace function public.prevent_non_admin_verification()
returns trigger
language plpgsql
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;
  if new.verification_status = 'verified' then
    if not exists (
      select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true
    ) then
      raise exception 'Only admins can verify users';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.prevent_sensitive_profile_updates()
returns trigger
language plpgsql
security definer
as $$
declare
  role text := (auth.jwt() ->> 'role');
  is_admin boolean := false;
  allowed_kyc_transition boolean := false;
  admin_verification_transition boolean := false;
begin
  if role = 'service_role' then
    return new;
  end if;

  select (p.is_admin = true or p.role = 'admin')
    into is_admin
  from public.profiles p
  where p.id = auth.uid();

  allowed_kyc_transition :=
    (old.verification_status is null or old.verification_status = 'unverified'::public.verification_status_enum)
    and (new.verification_status = 'pending'::public.verification_status_enum);

  admin_verification_transition :=
    is_admin
    and new.verification_status is distinct from old.verification_status
    and new.verification_status in (
      'verified'::public.verification_status_enum,
      'unverified'::public.verification_status_enum
    );

  if new.verification_status = 'verified'::public.verification_status_enum and not is_admin then
    raise exception 'forbidden_profile_update';
  end if;

  if (new.legal_name is distinct from old.legal_name) and not allowed_kyc_transition then
    raise exception 'forbidden_profile_update';
  end if;

  if (new.tier is distinct from old.tier)
     or (new.subscription_status is distinct from old.subscription_status)
     or (new.subscription_cycle_anchor_day is distinct from old.subscription_cycle_anchor_day)
     or (new.subscription_current_period_start is distinct from old.subscription_current_period_start)
     or (new.subscription_current_period_end is distinct from old.subscription_current_period_end)
     or ((new.verification_comment is distinct from old.verification_comment) and not admin_verification_transition)
     or (new.family_slots is distinct from old.family_slots)
     or (new.media_credits is distinct from old.media_credits)
     or (new.stars_count is distinct from old.stars_count)
     or (new.mesh_alert_count is distinct from old.mesh_alert_count)
     or ((new.verification_status is distinct from old.verification_status)
         and not allowed_kyc_transition
         and not admin_verification_transition)
  then
    raise exception 'forbidden_profile_update';
  end if;

  return new;
end;
$$;

create or replace function public.queue_identity_cleanup()
returns trigger
language plpgsql
as $$
begin
  if (old.verification_status = 'pending'::public.verification_status_enum)
     and (new.verification_status in ('verified'::public.verification_status_enum, 'unverified'::public.verification_status_enum))
     and new.verification_document_url is not null
  then
    insert into public.identity_verification_cleanup_queue (user_id, object_path, delete_after)
    values (new.id, new.verification_document_url, now() + interval '7 days');
  end if;
  return new;
end;
$$;

create or replace function public.admin_set_verification_status(p_user_id uuid, p_decision text, p_comment text default null::text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_is_admin boolean;
  v_role text;
  v_action text;
  v_actor_social_id text;
  v_target_social_id text;
  v_upload record;
begin
  select is_admin, role, social_id
    into v_is_admin, v_role, v_actor_social_id
  from public.profiles
  where id = auth.uid();

  if not (v_is_admin is true or v_role = 'admin') then
    raise exception 'not_admin';
  end if;

  select social_id
    into v_target_social_id
  from public.profiles
  where id = p_user_id;

  if p_decision not in ('verified', 'unverified') then
    raise exception 'invalid_decision';
  end if;

  select *
    into v_upload
  from public.verification_uploads
  where user_id = p_user_id
  order by uploaded_at desc
  limit 1;

  if p_decision = 'verified' then
    update public.profiles
    set
      verification_status = 'verified'::public.verification_status_enum,
      verification_comment = p_comment
    where id = p_user_id;
    v_action := 'kyc_verified';
  else
    update public.profiles
    set
      verification_status = 'unverified'::public.verification_status_enum,
      verification_comment = p_comment
    where id = p_user_id;
    v_action := 'kyc_unverified';
  end if;

  if v_upload.id is not null then
    if p_decision = 'verified' then
      update public.verification_uploads
      set
        status = 'verified',
        reviewed_by = auth.uid(),
        reviewed_at = now(),
        rejection_reason = null,
        archived_at = null,
        archived_by = null
      where id = v_upload.id;
    else
      update public.verification_uploads
      set
        status = 'unverified',
        reviewed_by = auth.uid(),
        reviewed_at = now(),
        rejection_reason = p_comment,
        archived_at = null,
        archived_by = null
      where id = v_upload.id;
    end if;

    if v_upload.document_url is not null then
      insert into public.identity_verification_cleanup_queue (user_id, object_path, delete_after)
      values (p_user_id, v_upload.document_url, now() + interval '7 days');
    end if;

    if v_upload.selfie_url is not null then
      insert into public.identity_verification_cleanup_queue (user_id, object_path, delete_after)
      values (p_user_id, v_upload.selfie_url, now() + interval '7 days');
    end if;
  end if;

  insert into public.admin_audit_logs (
    actor_id,
    target_user_id,
    action,
    notes,
    created_at,
    actor_social_id,
    target_social_id
  )
  values (
    auth.uid(),
    p_user_id,
    v_action,
    p_comment,
    now(),
    v_actor_social_id,
    v_target_social_id
  );

  return jsonb_build_object('ok', true, 'user_id', p_user_id, 'decision', p_decision);
end;
$$;

create trigger trg_prevent_non_admin_verification
before update of verification_status on public.profiles
for each row execute function public.prevent_non_admin_verification();

create trigger trg_prevent_sensitive_profile_updates
before update on public.profiles
for each row execute function public.prevent_sensitive_profile_updates();

create trigger trg_queue_identity_cleanup
after update of verification_status on public.profiles
for each row execute function public.queue_identity_cleanup();

commit;
