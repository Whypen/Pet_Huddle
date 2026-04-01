-- Add optional wallet lifecycle fields to pet_care_profiles.
-- All columns nullable — no backfill needed.

alter table public.pet_care_profiles
  add column if not exists stripe_onboarding_started_at   timestamptz default null,
  add column if not exists stripe_onboarding_completed_at  timestamptz default null,
  add column if not exists stripe_requirements_state       jsonb       default null;

comment on column public.pet_care_profiles.stripe_onboarding_started_at   is 'Set when create-or-get-stripe-account first runs for this user.';
comment on column public.pet_care_profiles.stripe_onboarding_completed_at  is 'Set by stripe-webhook on first account.updated where payouts_enabled becomes true.';
comment on column public.pet_care_profiles.stripe_requirements_state       is 'Snapshot of Stripe requirements synced by webhook; used to drive UI state and notification dedup.';
