-- Scheduled cancellation support for base subscription and Share Perks
-- Never instant-cancel; webhook remains source of truth for entitlement removal.

alter table public.profiles
  add column if not exists subscription_cancel_at_period_end boolean not null default false,
  add column if not exists subscription_cancel_requested_at timestamptz,
  add column if not exists subscription_cancel_reason text,
  add column if not exists subscription_cancel_reason_other text,
  add column if not exists share_perks_subscription_id text,
  add column if not exists share_perks_subscription_status text,
  add column if not exists share_perks_subscription_current_period_end timestamptz,
  add column if not exists share_perks_cancel_at_period_end boolean not null default false,
  add column if not exists share_perks_cancel_requested_at timestamptz,
  add column if not exists share_perks_cancel_reason text,
  add column if not exists share_perks_cancel_reason_other text;
create index if not exists idx_profiles_share_perks_subscription_id
  on public.profiles(share_perks_subscription_id)
  where share_perks_subscription_id is not null;
