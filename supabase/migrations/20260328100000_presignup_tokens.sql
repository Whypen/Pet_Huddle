create table if not exists public.presignup_tokens (
  token       uuid        primary key,
  email       text        not null,
  verified    boolean     not null default false,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);

-- RLS enabled; zero policies = zero public access.
-- All reads/writes go through service-role edge functions only.
alter table public.presignup_tokens enable row level security;

comment on table public.presignup_tokens is
  'Pre-signup email verification tokens. No public RLS policies — service-role only.';
