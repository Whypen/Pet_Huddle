-- Map Alerts vNext: server-side visibility enforcement, profile bootstrap, and delayed notifications.

-- 1) Guarantee: public.profiles exists for every auth.users row (prevents FK 23503 on map_alerts.creator_id).
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

  v_phone := nullif(btrim(coalesce(new.raw_user_meta_data->>'phone', new.phone, '+0000000000')), '');
  if v_phone is null or v_phone !~ '^\\+[0-9]{7,15}$' then
    v_phone := '+0000000000';
  end if;

  insert into public.profiles (id, display_name, legal_name, phone, updated_at)
  values (new.id, v_display_name, v_legal_name, v_phone, now())
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_auth_user();

-- Backfill for existing users who are missing profiles rows.
insert into public.profiles (id, display_name, legal_name, phone, updated_at)
select
  u.id,
  coalesce(
    nullif(btrim(u.raw_user_meta_data->>'display_name'), ''),
    nullif(btrim(u.raw_user_meta_data->>'name'), ''),
    nullif(btrim(u.raw_user_meta_data->>'full_name'), ''),
    nullif(btrim(split_part(u.email, '@', 1)), ''),
    'Huddle User'
  ) as display_name,
  coalesce(
    nullif(btrim(u.raw_user_meta_data->>'legal_name'), ''),
    nullif(btrim(u.raw_user_meta_data->>'full_name'), ''),
    nullif(btrim(u.raw_user_meta_data->>'display_name'), ''),
    nullif(btrim(split_part(u.email, '@', 1)), ''),
    'Huddle User'
  ) as legal_name,
  case
    when coalesce(nullif(btrim(u.raw_user_meta_data->>'phone'), ''), nullif(btrim(u.phone), '')) ~ '^\\+[0-9]{7,15}$'
      then coalesce(nullif(btrim(u.raw_user_meta_data->>'phone'), ''), nullif(btrim(u.phone), ''))
    else '+0000000000'
  end as phone,
  now() as updated_at
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;

-- 2) Map alerts social metadata (non-breaking; optional fields).
alter table public.map_alerts
  add column if not exists social_status text,
  add column if not exists social_url text,
  add column if not exists media_urls text[],
  add column if not exists location_street text,
  add column if not exists location_district text;

-- 3) Visibility enforcement at read time: no direct table reads; use the filtered function.
drop policy if exists "Anyone can view active alerts" on public.map_alerts;

revoke select on table public.map_alerts from anon;
revoke select on table public.map_alerts from authenticated;

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'get_visible_map_alerts'
  loop
    execute 'drop function if exists ' || r.sig || ' cascade';
  end loop;
end $$;

create function public.get_visible_map_alerts(
  p_lat double precision,
  p_lng double precision
)
returns table (
  id uuid,
  latitude double precision,
  longitude double precision,
  alert_type text,
  title text,
  description text,
  photo_url text,
  support_count integer,
  report_count integer,
  created_at timestamptz,
  expires_at timestamptz,
  range_meters integer,
  creator_id uuid,
  thread_id uuid,
  posted_to_threads boolean,
  social_status text,
  social_url text,
  creator_display_name text,
  creator_avatar_url text
)
language sql
security definer
set search_path = public
as $$
  select
    a.id,
    a.latitude,
    a.longitude,
    a.alert_type,
    a.title,
    a.description,
    a.photo_url,
    coalesce(a.support_count, 0) as support_count,
    coalesce(a.report_count, 0) as report_count,
    a.created_at,
    a.expires_at,
    a.range_meters,
    a.creator_id,
    a.thread_id,
    coalesce(a.posted_to_threads, false) as posted_to_threads,
    a.social_status,
    a.social_url,
    p.display_name as creator_display_name,
    p.avatar_url as creator_avatar_url
  from public.map_alerts a
  join public.profiles p on p.id = a.creator_id
  where a.is_active = true
    and (a.expires_at is null or a.expires_at > now())
    and coalesce(a.report_count, 0) < 10
    and a.location_geog is not null
    and st_dwithin(
      a.location_geog,
      st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
      greatest(0, least(coalesce(a.range_meters, 10000), 150000))
    )
  order by a.created_at desc
  limit 200;
$$;

revoke all on function public.get_visible_map_alerts(double precision, double precision) from public, anon;
grant execute on function public.get_visible_map_alerts(double precision, double precision) to authenticated;
grant execute on function public.get_visible_map_alerts(double precision, double precision) to service_role;

-- 4) Delayed broadcast notifications (5 minutes) via DB queue + pg_cron.
create table if not exists public.map_alert_notification_queue (
  alert_id uuid primary key references public.map_alerts(id) on delete cascade,
  run_at timestamptz not null,
  attempts int not null default 0,
  processed_at timestamptz null,
  last_error text null,
  created_at timestamptz not null default now()
);

create or replace function public.enqueue_map_alert_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.map_alert_notification_queue (alert_id, run_at)
  values (new.id, now() + interval '5 minutes')
  on conflict (alert_id) do update
    set run_at = excluded.run_at,
        processed_at = null,
        last_error = null,
        attempts = 0;
  return new;
end;
$$;

drop trigger if exists trg_notify_on_map_alert_insert on public.map_alerts;
create trigger trg_notify_on_map_alert_insert
after insert on public.map_alerts
for each row
execute function public.enqueue_map_alert_notification();

create or replace function public.process_due_map_alert_notifications(p_limit int default 100)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_processed int := 0;
  v_row record;
begin
  for v_row in
    select q.alert_id
    from public.map_alert_notification_queue q
    where q.processed_at is null
      and q.run_at <= now()
    order by q.run_at asc
    limit greatest(1, least(p_limit, 500))
  loop
    begin
      insert into public.notifications(user_id, message, type, metadata)
      select
        p.id,
        case
          when a.alert_type = 'Lost' then 'Alert: Missing in ' || coalesce(p.location_name, 'your area') || '!'
          when a.alert_type = 'Stray' then 'Alert: Furry friend sighting in ' || coalesce(p.location_name, 'your area') || '!'
          else 'Alert nearby in ' || coalesce(p.location_name, 'your area') || '!'
        end,
        'alert',
        jsonb_build_object('alert_id', a.id, 'alert_type', a.alert_type)
      from public.map_alerts a
      join public.profiles p on true
      where a.id = v_row.alert_id
        and p.id <> a.creator_id
        and p.location_retention_until is not null
        and p.location_retention_until > now()
        and coalesce(p.location, p.location_geog) is not null
        and a.location_geog is not null
        and st_dwithin(
          coalesce(p.location, p.location_geog),
          a.location_geog,
          greatest(0, least(coalesce(a.range_meters, 10000), 150000))
        )
      order by p.location_retention_until desc
      limit 500;

      update public.map_alert_notification_queue
      set processed_at = now()
      where alert_id = v_row.alert_id;

      v_processed := v_processed + 1;
    exception when others then
      update public.map_alert_notification_queue
      set attempts = attempts + 1,
          last_error = left(sqlerrm, 500)
      where alert_id = v_row.alert_id;
    end;
  end loop;

  return v_processed;
end;
$$;

-- Schedule processor every minute when pg_cron is available.
do $$
declare
  v_job record;
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    for v_job in
      select jobid from cron.job where jobname = 'process_map_alert_notifications_minutely'
    loop
      perform cron.unschedule(v_job.jobid);
    end loop;

    perform cron.schedule(
      'process_map_alert_notifications_minutely',
      '* * * * *',
      $cron$select public.process_due_map_alert_notifications(100);$cron$
    );
  else
    raise notice 'pg_cron not available; schedule public.process_due_map_alert_notifications() via Scheduled Edge Function.';
  end if;
end
$$;

-- 5) Expiry cleanup job (daily midnight UTC) when pg_cron is available.
create or replace function public.cleanup_expired_map_alerts()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted int := 0;
begin
  delete from public.map_alerts
  where expires_at is not null
    and expires_at <= now();
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

do $$
declare
  v_job record;
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    for v_job in
      select jobid from cron.job where jobname = 'cleanup_expired_map_alerts_daily'
    loop
      perform cron.unschedule(v_job.jobid);
    end loop;

    perform cron.schedule(
      'cleanup_expired_map_alerts_daily',
      '0 0 * * *',
      $cron$select public.cleanup_expired_map_alerts();$cron$
    );
  else
    raise notice 'pg_cron not available; schedule public.cleanup_expired_map_alerts() via Scheduled Edge Function.';
  end if;
end
$$;

select pg_notify('pgrst', 'reload schema');
