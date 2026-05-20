-- Admin Safety: live dispute execution persistence columns (minimal additive)
-- No Stripe runtime redesign. No payout worker/webhook changes.

begin;

alter table public.service_disputes
  add column if not exists stripe_payment_intent_id text,
  add column if not exists stripe_charge_id text,
  add column if not exists stripe_connected_account_id text,
  add column if not exists stripe_transfer_id text,
  add column if not exists stripe_refund_id text,
  add column if not exists stripe_idempotency_key text,
  add column if not exists stripe_action_status text,
  add column if not exists stripe_error_code text,
  add column if not exists stripe_error_message text,
  add column if not exists executed_by uuid references public.profiles(id) on delete set null,
  add column if not exists executed_at timestamptz,
  add column if not exists final_provider_receives_amount numeric(12,2),
  add column if not exists final_customer_refund_amount numeric(12,2),
  add column if not exists final_huddle_retained_amount numeric(12,2);

create index if not exists idx_service_disputes_stripe_idempotency_key
  on public.service_disputes(stripe_idempotency_key)
  where stripe_idempotency_key is not null;

create index if not exists idx_service_disputes_stripe_action_status
  on public.service_disputes(stripe_action_status)
  where stripe_action_status is not null;

commit;
