-- Purge fake phone placeholders and prevent future placeholders.

update public.profiles
set phone = null
where phone is not null and btrim(phone) in ('+0000000000', '+10000000000');

-- Replace auth user profile bootstrap to allow NULL phone.
create or replace function public.handle_new_auth_user()
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
  v_display_name := nullif(
    btrim(coalesce(
      new.raw_user_meta_data->>'display_name',
      new.raw_user_meta_data->>'name',
      new.raw_user_meta_data->>'full_name',
      split_part(new.email, '@', 1),
      'Huddle User'
    )),
    ''
  );
  if v_display_name is null then
    v_display_name := 'Huddle User';
  end if;

  v_legal_name := nullif(
    btrim(coalesce(
      new.raw_user_meta_data->>'legal_name',
      new.raw_user_meta_data->>'full_name',
      v_display_name
    )),
    ''
  );
  if v_legal_name is null then
    v_legal_name := v_display_name;
  end if;

  v_phone := nullif(btrim(coalesce(new.raw_user_meta_data->>'phone', new.phone, '')), '');

  insert into public.profiles (id, display_name, legal_name, phone, updated_at)
  values (new.id, v_display_name, v_legal_name, v_phone, now())
  on conflict (id) do nothing;

  return new;
end;
$$;

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

  v_phone := nullif(btrim(coalesce(new.raw_user_meta_data->>'phone', new.phone, '')), '');

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
  v_phone := nullif(btrim(coalesce(new.raw_user_meta_data->>'phone', new.phone, '')), '');

  insert into public.profiles (id, display_name, legal_name, phone)
  values (new.id, v_display_name, v_legal_name, v_phone)
  on conflict (id) do nothing;

  return new;
end;
$$;

-- Replace atomic broadcast RPC to avoid placeholder phones.
create or replace function public.create_alert_thread_and_pin(payload jsonb)
returns jsonb
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
  v_type text;
  v_title text;
  v_description text;
  v_photo_url text;
  v_range_meters integer;
  v_expires_at timestamptz;
  v_address text;
  v_thread_id uuid := null;
  v_alert_id uuid;
  v_post_to_threads boolean;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  v_lat := coalesce(nullif(payload->>'lat', '')::double precision, nullif(payload->>'latitude', '')::double precision);
  v_lng := coalesce(nullif(payload->>'lng', '')::double precision, nullif(payload->>'longitude', '')::double precision);
  if v_lat is null or v_lng is null then
    raise exception 'missing_coords' using errcode = '22023';
  end if;

  v_type := coalesce(nullif(payload->>'type', ''), nullif(payload->>'alert_type', ''), 'Alert');
  v_title := nullif(payload->>'title', '');
  v_description := nullif(payload->>'description', '');
  v_photo_url := nullif(payload->>'photo_url', '');
  v_range_meters := coalesce(nullif(payload->>'range_meters', '')::integer, 10000);
  v_expires_at := coalesce(nullif(payload->>'expires_at', '')::timestamptz, now() + interval '12 hours');
  v_address := nullif(payload->>'address', '');
  v_post_to_threads := coalesce((payload->>'post_on_threads')::boolean, (payload->>'posted_to_threads')::boolean, false);

  select
    coalesce(
      nullif(btrim(coalesce(
        u.raw_user_meta_data->>'display_name',
        u.raw_user_meta_data->>'full_name',
        split_part(u.email, '@', 1),
        'Huddle User'
      )), ''),
      'Huddle User'
    ),
    coalesce(
      nullif(btrim(coalesce(
        u.raw_user_meta_data->>'legal_name',
        u.raw_user_meta_data->>'full_name',
        u.raw_user_meta_data->>'display_name',
        split_part(u.email, '@', 1),
        'Huddle User'
      )), ''),
      'Huddle User'
    ),
    nullif(btrim(coalesce(
      u.raw_user_meta_data->>'phone',
      u.phone,
      ''
    )), '')
  into v_display_name, v_legal_name, v_phone
  from auth.users u
  where u.id = v_uid;

  insert into public.profiles (id, display_name, legal_name, phone, updated_at)
  select v_uid, v_display_name, v_legal_name, v_phone, now()
  where not exists (
    select 1 from public.profiles p where p.id = v_uid
  );

  if v_post_to_threads then
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
      coalesce(v_title, format('%s Alert: %s', v_type, coalesce(v_address, 'Pinned Location'))),
      coalesce(v_description, ''),
      array['News']::text[],
      array[]::text[],
      array_remove(array[v_photo_url], null),
      true,
      coalesce((payload->>'is_public')::boolean, true)
    )
    returning id into v_thread_id;
  end if;

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
    v_type,
    v_title,
    v_description,
    v_photo_url,
    v_range_meters,
    v_expires_at,
    coalesce(v_address, 'Pinned Location'),
    v_thread_id,
    v_post_to_threads
  )
  returning id into v_alert_id;

  if v_thread_id is not null then
    update public.threads
    set map_id = v_alert_id
    where id = v_thread_id;
  end if;

  return jsonb_build_object('alert_id', v_alert_id, 'thread_id', v_thread_id);
end;
$$;

select pg_notify('pgrst', 'reload schema');

select pg_notify('pgrst', 'reload schema');
