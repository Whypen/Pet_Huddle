alter table public.presignup_tokens
  add column if not exists signup_proof uuid,
  add column if not exists signup_proof_issued_at timestamptz,
  add column if not exists signup_proof_expires_at timestamptz,
  add column if not exists signup_proof_used_at timestamptz;

create unique index if not exists presignup_tokens_signup_proof_key
  on public.presignup_tokens (signup_proof)
  where signup_proof is not null;

comment on column public.presignup_tokens.signup_proof is
  'One-time short-lived signup proof issued after presignup email verification.';
