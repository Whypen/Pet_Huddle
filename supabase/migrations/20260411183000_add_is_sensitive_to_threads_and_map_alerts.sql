alter table if exists public.threads
  add column if not exists is_sensitive boolean not null default false;

alter table if exists public.map_alerts
  add column if not exists is_sensitive boolean not null default false;
