-- Brevo CSV export (runtime-safe)
-- Source of truth:
--   EMAIL from auth.users.email (required)
--   profile fields from public.profiles
--   pet/activity aggregations from existing public tables
-- Missing direct columns are exported as NULL placeholders.

WITH pets_agg AS (
  SELECT
    p.owner_id AS user_id,
    COUNT(*) FILTER (WHERE COALESCE(p.is_active, true))::int AS pet_count,
    STRING_AGG(DISTINCT UPPER(COALESCE(p.species, 'OTHERS')), ',' ORDER BY UPPER(COALESCE(p.species, 'OTHERS'))) AS pet_types,
    BOOL_OR(UPPER(COALESCE(p.species, '')) = 'DOG') AS has_dog,
    BOOL_OR(UPPER(COALESCE(p.species, '')) = 'CAT') AS has_cat,
    BOOL_OR(UPPER(COALESCE(p.species, '')) NOT IN ('DOG', 'CAT', '')) AS has_others
  FROM public.pets p
  GROUP BY p.owner_id
),
chat_touch AS (
  SELECT crm.user_id, c.last_message_at AS ts
  FROM public.chat_room_members crm
  JOIN public.chats c ON c.id = crm.chat_id
  UNION ALL
  SELECT cp.user_id, c.last_message_at AS ts
  FROM public.chat_participants cp
  JOIN public.chats c ON c.id = cp.chat_id
),
last_chat AS (
  SELECT user_id, MAX(ts) AS last_chat_at
  FROM chat_touch
  GROUP BY user_id
),
last_broadcast AS (
  SELECT creator_id AS user_id, MAX(created_at) AS last_broadcast_at
  FROM public.broadcast_alerts
  GROUP BY creator_id
),
last_booking AS (
  SELECT user_id, MAX(created_at) AS last_booking_at
  FROM (
    SELECT client_id AS user_id, created_at FROM public.marketplace_bookings
    UNION ALL
    SELECT sitter_id AS user_id, created_at FROM public.marketplace_bookings
  ) b
  GROUP BY user_id
)
SELECT
  u.email AS "EMAIL",
  pr.display_name AS "DISPLAY_NAME",
  pr.social_id AS "SOCIAL_ID",
  pr.location_country AS "COUNTRY",
  pr.location_district AS "DISTRICT",
  COALESCE(pa.pet_count > 0, pr.owns_pets, false) AS "HAS_PET",
  pa.pet_types AS "PET_TYPES",
  COALESCE(pr.effective_tier::text, pr.tier) AS "TIER",
  NULL::boolean AS "SERVICE_PROVIDER",
  pr.verification_status::text AS "VERIFICATION_STATUS",
  pr.subscription_status AS "SUBSCRIPTION_STATUS",
  COALESCE(pa.has_dog, false) AS "HAS_DOG",
  COALESCE(pa.has_cat, false) AS "HAS_CAT",
  COALESCE(pa.has_others, false) AS "HAS_OTHERS",
  COALESCE(pa.pet_count, 0) AS "PET_COUNT",
  u.created_at AS "USER_CREATED_AT",
  NULL::text AS "ONBOARDING_STEP",
  NULL::timestamptz AS "PROFILE_COMPLETED_AT",
  pr.marketing_consent AS "MARKETING_CONSENT",
  pr.marketing_opt_in_checked AS "MARKETING_OPT_IN",
  pr.marketing_doi_confirmed AS "MARKETING_DOI_CONFIRMED",
  pr.last_active_at AS "LAST_ACTIVE_AT",
  lc.last_chat_at AS "LAST_CHAT_AT",
  lb2.last_broadcast_at AS "LAST_BROADCAST_AT",
  lb.last_booking_at AS "LAST_BOOKING_AT",
  NULL::numeric AS "TRUST_SCORE",
  NULL::boolean AS "WELCOME_SENT"
FROM public.profiles pr
JOIN auth.users u ON u.id = pr.id
LEFT JOIN pets_agg pa ON pa.user_id = pr.id
LEFT JOIN last_chat lc ON lc.user_id = pr.id
LEFT JOIN last_broadcast lb2 ON lb2.user_id = pr.id
LEFT JOIN last_booking lb ON lb.user_id = pr.id
ORDER BY u.created_at DESC;
