create table if not exists public.phone_otp_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  phone_hash text not null,
  phone_e164 text not null,
  otp_type text not null check (otp_type in ('phone_change', 'sms')),
  status text not null default 'sent' check (status in ('sent', 'verified', 'expired', 'failed')),
  verify_attempt_count integer not null default 0 check (verify_attempt_count >= 0),
  sent_at timestamptz not null default now(),
  verified_at timestamptz,
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  device_id text,
  session_id text,
  provider text not null default 'supabase',
  provider_ref text,
  error_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_phone_otp_challenges_phone_status_created
  on public.phone_otp_challenges (phone_hash, status, created_at desc);

create index if not exists idx_phone_otp_challenges_user_status_created
  on public.phone_otp_challenges (user_id, status, created_at desc);

alter table public.phone_otp_challenges enable row level security;

create or replace function public.get_otp_resend_cooldown(p_request_count int)
returns int
language sql immutable
as $$
  select case
    when p_request_count <= 0 then 0
    when p_request_count = 1 then 60
    when p_request_count = 2 then 90
    when p_request_count = 3 then 120
    when p_request_count = 4 then 180
    else 300
  end;
$$;

create or replace function public.get_phone_otp_request_count(
  p_phone_hash text default null,
  p_user_id uuid default null,
  p_ip text default null,
  p_hours int default 24
)
returns table(cnt int, earliest_at timestamptz)
language sql stable security definer
as $$
  select
    count(*)::int,
    min(created_at)
  from public.phone_otp_attempts
  where attempt_type in ('request', 'resend')
    and status in ('success', 'suspicious')
    and created_at > now() - (p_hours || ' hours')::interval
    and (
      (p_phone_hash is not null and phone_hash = p_phone_hash)
      or (p_user_id is not null and user_id = p_user_id)
      or (p_ip is not null and ip_address = p_ip)
    );
$$;

comment on table public.phone_otp_challenges is
  'Canonical send/verify challenge records for phone OTP. One row per accepted OTP send.';
