
alter table public.pet_care_profiles
  add column if not exists stripe_onboarding_started_at   timestamptz default null,
  add column if not exists stripe_onboarding_completed_at  timestamptz default null,
  add column if not exists stripe_requirements_state       jsonb       default null;
;
