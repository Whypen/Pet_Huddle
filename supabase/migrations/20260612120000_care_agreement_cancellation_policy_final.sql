begin;

-- Owner decision (2026-06-12): within 24 hours of the scheduled start, a booking is
-- final and non-refundable. The cancellation policy must NOT advertise a Support /
-- Trust & Safety refund path (the support path still exists operationally; the policy
-- text does not state it). Supersedes the v2 wording.
create or replace function public.care_agreement_policy_snapshot()
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'cancellationRefundPolicyVersion', '2026-06-service-cancel-v3',
    'cancellationRefundPolicyText', 'More than 72 hours before care starts -- full refund. 24 to 72 hours before -- 50% refund; the retained 50% covers the provider''s reserved time and the cost of arranging the booking. Less than 24 hours before -- the booking is final and non-refundable, and cancelling within this window forfeits the full booking amount.',
    'platformRoleDisclaimerVersion', '2026-06-platform-facilitator-v1',
    'platformRoleDisclaimerText', 'This Care Agreement is between the owner and the carer. Huddle provides the platform, payment, messaging, safety tooling, and support processes, but Huddle is not the direct care provider.',
    'careAgreementTermsVersion', '20 May 2026',
    'careAgreementTermsPath', '/booking-terms'
  )
$$;

revoke all on function public.care_agreement_policy_snapshot() from public, anon, authenticated;
grant execute on function public.care_agreement_policy_snapshot() to service_role;

commit;
