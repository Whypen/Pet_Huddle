-- Create pins table for permanent pin persistence + threads linking
create extension if not exists "uuid-ossp";

create table if not exists public.pins (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  lat double precision,
  lng double precision,
  address text,
  is_invisible boolean default false,
  thread_id uuid references public.threads(id) on delete set null,
  created_at timestamptz default now()
);

alter table public.map_alerts
  add column if not exists address text;
