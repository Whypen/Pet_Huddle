-- Ensure every auth user has a matching public.profiles row, then provide
-- an atomic RPC for thread + map alert creation to avoid FK 23503 ghost failures.

-- 1) Profile bootstrap trigger for auth.users
create or replace function public.ensure_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_display_name text;
  v_legal_name text;
  v_phone text;
begin
  v_display_name := coalesce(
    nullif(btrim(new.raw_user_meta_data->>'display_name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'User'
  );

  v_legal_name := coalesce(
    nullif(btrim(new.raw_user_meta_data->>'legal_name'), ''),
    v_display_name
  );

  v_phone := coalesce(
    nullif(btrim(new.raw_user_meta_data->>'phone'), ''),
    nullif(btrim(new.phone), ''),
    '+10000000000'
  );

  insert into public.profiles (id, display_name, legal_name, phone)
  values (new.id, v_display_name, v_legal_name, v_phone)
  on conflict (id) do update
    set display_name = coalesce(excluded.display_name, public.profiles.display_name),
        legal_name = coalesce(excluded.legal_name, public.profiles.legal_name),
        phone = coalesce(excluded.phone, public.profiles.phone),
        updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.ensure_profile_for_auth_user();

-- Keep compatibility for callers that still reference public.handle_new_user()
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_display_name text;
  v_legal_name text;
  v_phone text;
begin
  v_display_name := coalesce(
    nullif(btrim(new.raw_user_meta_data->>'display_name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'User'
  );
  v_legal_name := coalesce(
    nullif(btrim(new.raw_user_meta_data->>'legal_name'), ''),
    v_display_name
  );
  v_phone := coalesce(
    nullif(btrim(new.raw_user_meta_data->>'phone'), ''),
    nullif(btrim(new.phone), ''),
    '+10000000000'
  );

  insert into public.profiles (id, display_name, legal_name, phone)
  values (new.id, v_display_name, v_legal_name, v_phone)
  on conflict (id) do nothing;

  return new;
end;
$$;

-- 2) Backfill: create profiles for existing auth users missing a profile row
insert into public.profiles (id, display_name, legal_name, phone)
select
  u.id,
  coalesce(
    nullif(btrim(u.raw_user_meta_data->>'display_name'), ''),
    nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
    'User'
  ) as display_name,
  coalesce(
    nullif(btrim(u.raw_user_meta_data->>'legal_name'), ''),
    nullif(btrim(u.raw_user_meta_data->>'display_name'), ''),
    nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
    'User'
  ) as legal_name,
  coalesce(
    nullif(btrim(u.raw_user_meta_data->>'phone'), ''),
    nullif(btrim(u.phone), ''),
    '+10000000000'
  ) as phone
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;

-- 3) RLS hardening on profiles (self access only)
alter table public.profiles enable row level security;

do $$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
  loop
    execute format('drop policy if exists %I on public.profiles', pol.policyname);
  end loop;
end $$;

create policy profiles_select_own
on public.profiles
for select
to authenticated
using (id = auth.uid());

create policy profiles_insert_own
on public.profiles
for insert
to authenticated
with check (id = auth.uid());

create policy profiles_update_own
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- 4) Atomic RPC: thread + map_alert in one transaction
create or replace function public.create_alert_thread_and_pin(payload jsonb)
returns table(thread_id uuid, alert_id uuid)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_display_name text;
  v_legal_name text;
  v_phone text;
  v_lat double precision;
  v_lng double precision;
  v_alert_type text;
  v_title text;
  v_description text;
  v_photo_url text;
  v_range_meters integer;
  v_expires_at timestamptz;
  v_address text;
  v_thread_title text;
  v_thread_content text;
  v_thread_id uuid;
  v_alert_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  v_lat := nullif(payload->>'latitude', '')::double precision;
  v_lng := nullif(payload->>'longitude', '')::double precision;
  v_alert_type := coalesce(nullif(payload->>'alert_type', ''), 'Others');
  v_title := nullif(payload->>'title', '');
  v_description := nullif(payload->>'description', '');
  v_photo_url := nullif(payload->>'photo_url', '');
  v_range_meters := coalesce(nullif(payload->>'range_meters', '')::integer, 10000);
  v_expires_at := coalesce(nullif(payload->>'expires_at', '')::timestamptz, now() + interval '12 hours');
  v_address := nullif(payload->>'address', '');

  if v_lat is null or v_lng is null then
    raise exception 'invalid_coordinates' using errcode = '22023';
  end if;

  -- Safety: ensure profile exists for current user even if trigger was missed historically.
  select
    coalesce(nullif(btrim(raw_user_meta_data->>'display_name'), ''), nullif(split_part(coalesce(email, ''), '@', 1), ''), 'User'),
    coalesce(nullif(btrim(raw_user_meta_data->>'legal_name'), ''), nullif(btrim(raw_user_meta_data->>'display_name'), ''), nullif(split_part(coalesce(email, ''), '@', 1), ''), 'User'),
    coalesce(nullif(btrim(raw_user_meta_data->>'phone'), ''), nullif(btrim(phone), ''), '+10000000000')
  into v_display_name, v_legal_name, v_phone
  from auth.users
  where id = v_uid;

  insert into public.profiles (id, display_name, legal_name, phone)
  values (
    v_uid,
    coalesce(v_display_name, 'User'),
    coalesce(v_legal_name, coalesce(v_display_name, 'User')),
    coalesce(v_phone, '+10000000000')
  )
  on conflict (id) do nothing;

  v_thread_title := coalesce(nullif(payload->>'thread_title', ''), v_title, format('Broadcast (%s)', v_alert_type));
  v_thread_content := coalesce(nullif(payload->>'thread_content', ''), v_description, '');

  insert into public.threads (
    user_id,
    title,
    content,
    tags,
    hashtags,
    images,
    is_map_alert,
    is_public
  ) values (
    v_uid,
    v_thread_title,
    v_thread_content,
    coalesce(
      (select array_agg(x) from jsonb_array_elements_text(coalesce(payload->'tags', '["News"]'::jsonb)) as x),
      array['News']::text[]
    ),
    coalesce(
      (select array_agg(x) from jsonb_array_elements_text(coalesce(payload->'hashtags', '[]'::jsonb)) as x),
      array[]::text[]
    ),
    coalesce(
      (select array_agg(x) from jsonb_array_elements_text(coalesce(payload->'images', '[]'::jsonb)) as x),
      array[]::text[]
    ),
    true,
    coalesce((payload->>'is_public')::boolean, true)
  )
  returning id into v_thread_id;

  insert into public.map_alerts (
    creator_id,
    latitude,
    longitude,
    alert_type,
    title,
    description,
    photo_url,
    range_meters,
    expires_at,
    address,
    thread_id,
    posted_to_threads
  ) values (
    v_uid,
    v_lat,
    v_lng,
    v_alert_type,
    v_title,
    v_description,
    v_photo_url,
    v_range_meters,
    v_expires_at,
    v_address,
    v_thread_id,
    true
  )
  returning id into v_alert_id;

  update public.threads
  set map_id = v_alert_id
  where id = v_thread_id;

  return query
  select v_thread_id, v_alert_id;
end;
$$;

revoke all on function public.create_alert_thread_and_pin(jsonb) from public;
revoke all on function public.create_alert_thread_and_pin(jsonb) from anon;
grant execute on function public.create_alert_thread_and_pin(jsonb) to authenticated;
grant execute on function public.create_alert_thread_and_pin(jsonb) to service_role;
