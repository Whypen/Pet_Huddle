begin;

alter table public.transactions
  drop constraint if exists transactions_type_check;

alter table public.transactions
  add constraint transactions_type_check check (
    type = any (array[
      'subscription'::text,
      'star_pack'::text,
      'emergency_alert'::text,
      'vet_media'::text,
      'family_slot'::text,
      '5_media_pack'::text,
      '7_day_extension'::text,
      'verified_badge'::text,
      'marketplace_booking'::text,
      'service_booking'::text,
      'card_verification'::text
    ])
  );

commit;
