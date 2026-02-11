alter table public.map_alerts
  add column if not exists posted_to_threads boolean not null default false;
