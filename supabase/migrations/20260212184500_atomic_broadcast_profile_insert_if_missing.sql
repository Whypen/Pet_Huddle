-- Ensure broadcast RPC bootstraps profiles only when missing,
-- while satisfying required profile constraints (display_name/legal_name/phone).

drop function if exists public.create_alert_thread_and_pin(jsonb);

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
    coalesce(
      nullif(btrim(coalesce(
        u.raw_user_meta_data->>'phone',
        u.phone,
        '+0000000000'
      )), ''),
      '+0000000000'
    )
  into v_display_name, v_legal_name, v_phone
  from auth.users u
  where u.id = v_uid;

  -- Insert profile only when missing; never overwrite an existing profile row.
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

revoke all on function public.create_alert_thread_and_pin(jsonb) from public;
revoke all on function public.create_alert_thread_and_pin(jsonb) from anon;
grant execute on function public.create_alert_thread_and_pin(jsonb) to authenticated;
grant execute on function public.create_alert_thread_and_pin(jsonb) to service_role;

select pg_notify('pgrst', 'reload schema');
