-- Critical care-flow unblock.
--
-- The care notification helpers all insert a notification with type
-- 'service_booking' via insert_care_agreement_notification():
--   * record_service_care_scope_signature   (each care-scope signature)
--   * create_care_scope_counterproposal      (each quote / scope change)
--   * finalize_service_care_agreement_for_payment (paid booking confirmation)
--   * confirm_voluntary_service_booking       (voluntary booking confirmation)
--
-- The notifications_type_check constraint never listed 'service_booking', so that
-- INSERT raised a check-constraint violation that rolled back the ENTIRE enclosing
-- transaction. Net effect: every quote, signature, and booking confirmation past
-- the initial request failed silently (no rows ever reached service_care_agreements;
-- prod had 0 completed bookings). Same drift class as the can_deliver_notification
-- column-rename regression — code referenced a value the schema constraint had not
-- been kept in sync with.
--
-- The native notifications panel routes on metadata.kind (NativeNotificationsPanel.tsx),
-- not the type column, so widening the allowed set is behavior-preserving for rendering.
-- Verified via a rolled-back transaction: with this value allowed,
-- confirm_voluntary_service_booking returns {"ok": true, "status": "booked", ...} and
-- writes a service_care_agreements row with both signatures.
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type = any (array[
    'wave','star','match','message','group_invite','broadcast','mention',
    'thread_reply','booking','system','family_invite','chats','map','social',
    'group_join_request','group_approved','group_joined_via_code','group_join_declined',
    'service_booking'
  ]));
