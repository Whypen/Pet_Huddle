alter table public.threads
  add column if not exists is_map_alert boolean not null default false,
  add column if not exists map_id uuid references public.map_alerts(id) on delete set null;
