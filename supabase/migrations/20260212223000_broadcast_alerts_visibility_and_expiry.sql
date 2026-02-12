-- Broadcast alerts: tier-bound range/duration, server-side visibility, and expiry cleanup

create extension if not exists postgis;

create table if not exists public.broadcast_alerts (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('Stray', 'Lost', 'Others')),
  title text null,
  description text null,
  address text null,
  created_at timestamptz not null default now(),
  duration_hours integer not null check (duration_hours > 0 and duration_hours <= 72),
  range_km numeric(6,2) not null check (range_km > 0 and range_km <= 100),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  geog geography(point,4326),
  photo_url text null,
  post_on_threads boolean not null default false,
  thread_id uuid null
);

create or replace function public.broadcast_alerts_set_geog()
returns trigger
language plpgsql
as $$
begin
  new.geog := st_setsrid(st_makepoint(new.longitude, new.latitude), 4326)::geography;
  return new;
end;
$$;

drop trigger if exists trg_broadcast_alerts_set_geog on public.broadcast_alerts;
create trigger trg_broadcast_alerts_set_geog
before insert or update of latitude, longitude
on public.broadcast_alerts
for each row
execute function public.broadcast_alerts_set_geog();

update public.broadcast_alerts
set geog = st_setsrid(st_makepoint(longitude, latitude), 4326)::geography
where geog is null;

create index if not exists idx_broadcast_alerts_geog on public.broadcast_alerts using gist (geog);
create index if not exists idx_broadcast_alerts_created_at on public.broadcast_alerts (created_at desc);
create index if not exists idx_broadcast_alerts_creator_id on public.broadcast_alerts (creator_id);

alter table public.broadcast_alerts enable row level security;

revoke all on table public.broadcast_alerts from anon, authenticated, public;
grant insert on table public.broadcast_alerts to authenticated;

drop policy if exists "broadcast_alerts_insert_own" on public.broadcast_alerts;
create policy "broadcast_alerts_insert_own"
on public.broadcast_alerts
for insert
to authenticated
with check (creator_id = auth.uid());

drop policy if exists "broadcast_alerts_update_own" on public.broadcast_alerts;
create policy "broadcast_alerts_update_own"
on public.broadcast_alerts
for update
to authenticated
using (creator_id = auth.uid())
with check (creator_id = auth.uid());

drop policy if exists "broadcast_alerts_delete_own" on public.broadcast_alerts;
create policy "broadcast_alerts_delete_own"
on public.broadcast_alerts
for delete
to authenticated
using (creator_id = auth.uid());

-- No SELECT policy on base table by design:
-- reads are forced through SECURITY DEFINER function below.

create or replace function public.get_visible_broadcast_alerts(
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
    a.type as alert_type,
    a.title,
    a.description,
    a.photo_url,
    0::integer as support_count,
    0::integer as report_count,
    a.created_at,
    (a.created_at + make_interval(hours => a.duration_hours)) as expires_at,
    round((a.range_km * 1000.0))::integer as range_meters,
    a.creator_id,
    a.thread_id,
    p.display_name as creator_display_name,
    p.avatar_url as creator_avatar_url
  from public.broadcast_alerts a
  left join public.profiles p on p.id = a.creator_id
  where
    (a.created_at + make_interval(hours => a.duration_hours)) > now()
    and st_dwithin(
      a.geog,
      st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
      a.range_km * 1000.0
    )
  order by a.created_at desc;
$$;

revoke all on function public.get_visible_broadcast_alerts(double precision, double precision) from public, anon;
grant execute on function public.get_visible_broadcast_alerts(double precision, double precision) to authenticated;

create or replace function public.cleanup_expired_broadcast_alerts()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer := 0;
begin
  delete from public.broadcast_alerts
  where (created_at + make_interval(hours => duration_hours)) <= now();

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
      select jobid from cron.job where jobname = 'cleanup_expired_broadcast_alerts_daily'
    loop
      perform cron.unschedule(v_job.jobid);
    end loop;

    perform cron.schedule(
      'cleanup_expired_broadcast_alerts_daily',
      '0 0 * * *',
      $cron$select public.cleanup_expired_broadcast_alerts();$cron$
    );
  else
    raise notice 'pg_cron not available; run public.cleanup_expired_broadcast_alerts() via Scheduled Edge Function.';
  end if;
end
$$;

select pg_notify('pgrst', 'reload schema');
