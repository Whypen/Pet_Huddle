create or replace function public.admin_care_money_flow_status(
  p_booking_status text,
  p_care_status text,
  p_dispute_status text,
  p_payout_released_at timestamptz,
  p_snapshot_status text,
  p_snapshot_error text,
  p_owner_refunded numeric,
  p_total_paid numeric,
  p_carer_receives numeric
)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when nullif(p_snapshot_error, '') is not null then 'stripe_failed'
    when p_snapshot_status = 'stripe_failed' then 'stripe_failed'
    when lower(coalesce(p_dispute_status, '')) in ('open', 'awaiting_evidence', 'under_review', 'decision_ready', 'resolved_hold')
      or lower(coalesce(p_booking_status, '')) = 'disputed'
      or lower(coalesce(p_care_status, '')) in ('under_dispute', 'handoff_issue_review')
      then 'disputed_hold'
    when coalesce(p_owner_refunded, 0) > 0
      and coalesce(p_total_paid, 0) > 0
      and coalesce(p_owner_refunded, 0) >= greatest(coalesce(p_total_paid, 0) - 0.01, 0)
      then 'refund_full_succeeded'
    when coalesce(p_owner_refunded, 0) > 0 then 'refund_partial_succeeded'
    when p_snapshot_status in ('refund_pending', 'refund_full_succeeded', 'refund_partial_succeeded', 'payout_released') then p_snapshot_status
    when (p_payout_released_at is not null or coalesce(p_carer_receives, 0) > 0)
      and lower(coalesce(p_dispute_status, '')) = 'resolved_release_full'
      then 'payout_released'
    when lower(coalesce(p_booking_status, '')) = 'completed' then 'completed_pending_payout'
    when lower(coalesce(p_booking_status, '')) = 'in_progress' or lower(coalesce(p_care_status, '')) = 'in_progress' then 'care_in_progress_hold'
    when nullif(trim(coalesce(p_booking_status, '')), '') is not null then 'paid_pending_care'
    else 'manual_review_required'
  end;
$$;

revoke all on function public.admin_care_money_flow_status(text, text, text, timestamptz, text, text, numeric, numeric, numeric) from anon;
grant execute on function public.admin_care_money_flow_status(text, text, text, timestamptz, text, text, numeric, numeric, numeric) to authenticated;
