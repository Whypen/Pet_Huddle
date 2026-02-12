-- Atomic broadcast RPC (jsonb return) for production schema-cache stability.
-- Keeps server-side auth/profile guard and avoids partial client writes.

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
  v_thread_title text;
  v_thread_content text;
  v_should_create_thread boolean;
  v_thread_id uuid := null;
  v_alert_id uuid;
begin
  perform set_config('search_path', 'public', true);

  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  v_lat := coalesce(nullif(payload->>'lat', '')::double precision, nullif(payload->>'latitude', '')::double precision);
  v_lng := coalesce(nullif(payload->>'lng', '')::double precision, nullif(payload->>'longitude', '')::double precision);
  v_type := coalesce(nullif(payload->>'type', ''), nullif(payload->>'alert_type', ''), 'Alert');
  v_title := nullif(payload->>'title', '');
  v_description := nullif(payload->>'description', '');
  v_photo_url := nullif(payload->>'photo_url', '');
  v_range_meters := coalesce(nullif(payload->>'range_meters', '')::integer, 10000);
  v_expires_at := coalesce(nullif(payload->>'expires_at', '')::timestamptz, now() + interval '12 hours');
  v_address := nullif(payload->>'address', '');
  v_should_create_thread := coalesce((payload->>'post_on_threads')::boolean, (payload->>'posted_to_threads')::boolean, false);

  if v_lat is null or v_lng is null then
    raise exception 'invalid_coordinates' using errcode = '22023';
  end if;

  -- Safety: guarantee FK parent exists even for legacy users that missed bootstrap.
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

  if v_should_create_thread then
    v_thread_title := format('%s Alert: %s', v_type, coalesce(v_address, 'Pinned Location'));
    v_thread_content := coalesce(v_description, '');

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
    v_address,
    v_thread_id,
    v_should_create_thread
  )
  returning id into v_alert_id;

  if v_thread_id is not null then
    update public.threads
    set map_id = v_alert_id
    where id = v_thread_id;
  end if;

  return jsonb_build_object('thread_id', v_thread_id, 'alert_id', v_alert_id);
end;
$$;

revoke all on function public.create_alert_thread_and_pin(jsonb) from public;
revoke all on function public.create_alert_thread_and_pin(jsonb) from anon;
grant execute on function public.create_alert_thread_and_pin(jsonb) to authenticated;
grant execute on function public.create_alert_thread_and_pin(jsonb) to service_role;

select pg_notify('pgrst', 'reload schema');
