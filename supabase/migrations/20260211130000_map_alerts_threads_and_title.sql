alter table public.map_alerts
  add column if not exists title text,
  add column if not exists thread_id uuid references public.threads(id) on delete set null,
  add column if not exists address text;
