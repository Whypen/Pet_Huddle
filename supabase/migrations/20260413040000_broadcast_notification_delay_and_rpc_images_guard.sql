-- Broadcast notifications: queue with ~2 min delay + stable map deep-links.
-- Also harden create_alert_thread_and_pin image parsing to avoid malformed payload edge cases.

create table if not exists public.broadcast_alert_notification_queue (
  id bigserial primary key,
  alert_id uuid not null references public.broadcast_alerts(id) on delete cascade,
  recipient_user_id uuid not null references public.profiles(id) on delete cascade,
  alert_type text not null,
  location_name text null,
  thread_id uuid null,
  available_at timestamptz not null default (now() + interval '2 minutes'),
  processed_at timestamptz null,
  attempt_count integer not null default 0,
  last_error text null,
  created_at timestamptz not null default now(),
  unique (alert_id, recipient_user_id)
);

create index if not exists idx_broadcast_alert_notification_queue_due
  on public.broadcast_alert_notification_queue (available_at, processed_at);

create or replace function public.notify_on_broadcast_alert_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.broadcast_alert_notification_queue (
    alert_id,
    recipient_user_id,
    alert_type,
    location_name,
    thread_id,
    available_at
  )
  select
    new.id,
    p.id,
    new.type,
    coalesce(nullif(btrim(new.address), ''), nullif(btrim(p.location_name), ''), 'your area'),
    new.thread_id,
    now() + interval '2 minutes'
  from public.profiles p
  where p.id <> new.creator_id
    and p.location_retention_until is not null
    and p.location_retention_until > now()
    and coalesce(p.location, p.location_geog) is not null
    and new.geog is not null
    and st_dwithin(
      coalesce(p.location, p.location_geog),
      new.geog,
      greatest(0, least(coalesce(round(new.range_km * 1000.0)::int, 10000), 150000))
    )
  order by p.location_retention_until desc
  limit 500
  on conflict (alert_id, recipient_user_id) do nothing;

  return new;
end;
$$;

create or replace function public.process_due_broadcast_alert_notifications(p_limit int default 200)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  v_processed int := 0;
  has_title boolean := false;
  has_message boolean := false;
  has_body boolean := false;
  has_content boolean := false;
  has_type boolean := false;
  has_metadata boolean := false;
  has_href boolean := false;
  has_data boolean := false;
  cols text[];
  exprs text[];
  msg text;
  sql text;
begin
  select exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='notifications' and column_name='title'
  ) into has_title;
  select exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='notifications' and column_name='message'
  ) into has_message;
  select exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='notifications' and column_name='body'
  ) into has_body;
  select exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='notifications' and column_name='content'
  ) into has_content;
  select exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='notifications' and column_name='type'
  ) into has_type;
  select exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='notifications' and column_name='metadata'
  ) into has_metadata;
  select exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='notifications' and column_name='href'
  ) into has_href;
  select exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='notifications' and column_name='data'
  ) into has_data;

  for rec in
    select q.id, q.alert_id, q.recipient_user_id, q.alert_type, q.location_name, q.thread_id
    from public.broadcast_alert_notification_queue q
    where q.processed_at is null
      and q.available_at <= now()
    order by q.available_at asc, q.id asc
    limit greatest(1, coalesce(p_limit, 200))
    for update skip locked
  loop
    begin
      msg := case rec.alert_type
        when 'Stray' then '💡 A stray was spotted near ' || rec.location_name || ' — keep an eye out'
        when 'Caution' then '⚠️ A caution was raised near ' || rec.location_name || ' — tap to see what''s happening.'
        when 'Lost' then '🆘 A furry friend is lost near ' || rec.location_name || ' — tap to help bring them home.'
        else '📍 A community alert was posted near ' || rec.location_name || ' — tap to view details.'
      end;

      cols := array['user_id'];
      exprs := array[quote_literal(rec.recipient_user_id::text) || '::uuid'];

      if has_title then
        cols := array_append(cols, 'title');
        exprs := array_append(exprs, quote_literal('Alert'));
      end if;
      if has_message then
        cols := array_append(cols, 'message');
        exprs := array_append(exprs, quote_literal(msg));
      end if;
      if has_body then
        cols := array_append(cols, 'body');
        exprs := array_append(exprs, quote_literal(msg));
      end if;
      if has_content then
        cols := array_append(cols, 'content');
        exprs := array_append(exprs, quote_literal(msg));
      end if;
      if has_type then
        cols := array_append(cols, 'type');
        exprs := array_append(exprs, quote_literal('map'));
      end if;
      if has_metadata then
        cols := array_append(cols, 'metadata');
        exprs := array_append(
          exprs,
          format(
            'jsonb_build_object(''alert_id'',''%s'',''alert_type'',''%s'')',
            rec.alert_id::text,
            rec.alert_type
          )
        );
      end if;
      if has_href then
        cols := array_append(cols, 'href');
        exprs := array_append(exprs, quote_literal('/map?alert=' || rec.alert_id::text));
      end if;
      if has_data then
        cols := array_append(cols, 'data');
        exprs := array_append(
          exprs,
          format(
            'jsonb_build_object(''alert_id'',''%s'',''alert_type'',''%s'',''thread_id'',%s)',
            rec.alert_id::text,
            rec.alert_type,
            case when rec.thread_id is null then 'null' else quote_literal(rec.thread_id::text) end
          )
        );
      end if;

      sql := format(
        'insert into public.notifications(%s) values (%s)',
        array_to_string(cols, ','),
        array_to_string(exprs, ',')
      );
      execute sql;

      update public.broadcast_alert_notification_queue
      set processed_at = now(),
          attempt_count = attempt_count + 1,
          last_error = null
      where id = rec.id;
      v_processed := v_processed + 1;
    exception
      when others then
        update public.broadcast_alert_notification_queue
        set attempt_count = attempt_count + 1,
            last_error = sqlerrm
        where id = rec.id;
    end;
  end loop;

  return v_processed;
end;
$$;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.unschedule(jobid)
    from cron.job
    where jobname = 'process_broadcast_alert_notifications_minutely';

    perform cron.schedule(
      'process_broadcast_alert_notifications_minutely',
      '* * * * *',
      $cron$select public.process_due_broadcast_alert_notifications(300);$cron$
    );
  else
    raise notice 'pg_cron not available; schedule public.process_due_broadcast_alert_notifications() via Scheduled Edge Function.';
  end if;
exception
  when undefined_table then
    raise notice 'pg_cron extension metadata unavailable; schedule manually.';
end $$;

drop trigger if exists trg_notify_on_broadcast_alert_insert on public.broadcast_alerts;
create trigger trg_notify_on_broadcast_alert_insert
after insert on public.broadcast_alerts
for each row
execute function public.notify_on_broadcast_alert_insert();

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
  v_images text[];
  v_range_meters integer;
  v_range_km numeric;
  v_duration_hours integer;
  v_expires_at timestamptz;
  v_address text;
  v_thread_id uuid := null;
  v_alert_id uuid;
  v_post_to_threads boolean;
  v_is_sensitive boolean := coalesce((payload->>'is_sensitive')::boolean, false);
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  v_lat := coalesce(nullif(payload->>'lat', '')::double precision, nullif(payload->>'latitude', '')::double precision);
  v_lng := coalesce(nullif(payload->>'lng', '')::double precision, nullif(payload->>'longitude', '')::double precision);
  if v_lat is null or v_lng is null then
    raise exception 'missing_coords' using errcode = '22023';
  end if;

  v_type := coalesce(nullif(payload->>'type', ''), nullif(payload->>'alert_type', ''), 'Stray');
  v_title := nullif(payload->>'title', '');
  v_description := nullif(payload->>'description', '');
  v_photo_url := nullif(payload->>'photo_url', '');
  v_images := case jsonb_typeof(payload->'images')
    when 'array' then coalesce(array(select jsonb_array_elements_text(payload->'images')), array[]::text[])
    when 'string' then array_remove(array[nullif(payload->>'images', '')], null)
    else array[]::text[]
  end;
  v_range_meters := coalesce(nullif(payload->>'range_meters', '')::integer, 10000);
  v_range_km := greatest(1.0::numeric, least(150.0::numeric, (v_range_meters::numeric / 1000.0)));
  v_expires_at := coalesce(nullif(payload->>'expires_at', '')::timestamptz, now() + interval '12 hours');
  v_duration_hours := greatest(1, least(72, ceil(extract(epoch from (v_expires_at - now())) / 3600.0)::int));
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
      is_public,
      is_sensitive
    ) values (
      v_uid,
      coalesce(v_title, format('%s Alert: %s', v_type, coalesce(v_address, 'Pinned Location'))),
      coalesce(v_description, ''),
      array['News']::text[],
      array[]::text[],
      case when coalesce(array_length(v_images, 1), 0) > 0 then v_images else array_remove(array[v_photo_url], null) end,
      true,
      coalesce((payload->>'is_public')::boolean, true),
      v_is_sensitive
    )
    returning id into v_thread_id;
  end if;

  insert into public.broadcast_alerts (
    creator_id,
    type,
    title,
    description,
    address,
    duration_hours,
    range_km,
    latitude,
    longitude,
    photo_url,
    images,
    post_on_threads,
    thread_id,
    is_sensitive
  ) values (
    v_uid,
    v_type,
    v_title,
    v_description,
    coalesce(v_address, 'Pinned Location'),
    v_duration_hours,
    v_range_km,
    v_lat,
    v_lng,
    v_photo_url,
    case when coalesce(array_length(v_images, 1), 0) > 0 then v_images else array_remove(array[v_photo_url], null) end,
    v_post_to_threads,
    v_thread_id,
    v_is_sensitive
  )
  returning id into v_alert_id;

  if v_thread_id is not null then
    update public.threads
    set map_id = v_alert_id
    where id = v_thread_id;
  end if;

  return jsonb_build_object(
    'alert_id', v_alert_id,
    'thread_id', v_thread_id
  );
end;
$$;
