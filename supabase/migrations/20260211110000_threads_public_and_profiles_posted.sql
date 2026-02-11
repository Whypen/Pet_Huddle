alter table public.threads
  add column if not exists is_public boolean not null default true;

alter table public.profiles
  add column if not exists posted_to_threads boolean not null default false;
