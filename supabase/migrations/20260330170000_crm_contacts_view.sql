-- Canonical CRM view for Brevo backfill/sync source of truth.
-- Includes all CRM-export fields requested by product.
-- Focus fields (service/pets/activity/profile completion) are derived here and
-- should be consumed by Brevo sync handlers.

create or replace view public.crm_contacts_view as
with pets_agg as (
  select
    p.owner_id as user_id,
    count(*)::int as pet_count,
    string_agg(distinct upper(coalesce(p.species, 'OTHERS')), ',' order by upper(coalesce(p.species, 'OTHERS'))) as pet_types,
    bool_or(upper(coalesce(p.species, '')) = 'DOG') as has_dog,
    bool_or(upper(coalesce(p.species, '')) = 'CAT') as has_cat,
    bool_or(upper(coalesce(p.species, '')) not in ('DOG', 'CAT', '')) as has_others
  from public.pets p
  group by p.owner_id
),
service_provider_flags as (
  select
    pc.user_id,
    bool_or(coalesce(pc.listed, false)) as service_provider
  from public.pet_care_profiles pc
  group by pc.user_id
),
chat_touch as (
  select crm.user_id, c.last_message_at as ts
  from public.chat_room_members crm
  join public.chats c on c.id = crm.chat_id
  union all
  select cp.user_id, c.last_message_at as ts
  from public.chat_participants cp
  join public.chats c on c.id = cp.chat_id
),
chat_last as (
  select user_id, max(ts) as last_chat_at
  from chat_touch
  group by user_id
),
broadcast_last as (
  select b.creator_id as user_id, max(b.created_at) as last_broadcast_at
  from public.broadcast_alerts b
  group by b.creator_id
),
booking_last as (
  select x.user_id, max(x.created_at) as last_booking_at
  from (
    select mb.client_id as user_id, mb.created_at from public.marketplace_bookings mb
    union all
    select mb.sitter_id as user_id, mb.created_at from public.marketplace_bookings mb
  ) x
  group by x.user_id
),
device_flags as (
  select
    d.user_id,
    (count(*) > 0) as device_verified
  from public.device_fingerprint_history d
  group by d.user_id
)
select
  u.email as "EMAIL",
  p.display_name as "DISPLAY_NAME",
  p.social_id as "SOCIAL_ID",
  p.phone as "PHONE",
  p.location_country as "COUNTRY",
  p.location_district as "DISTRICT",
  coalesce(p.effective_tier::text, p.tier, 'free') as "TIER",
  coalesce(sp.service_provider, false) as "SERVICE_PROVIDER",
  coalesce(p.verification_status::text, 'unverified') as "VERIFICATION_STATUS",
  p.subscription_status as "SUBSCRIPTION_STATUS",
  coalesce(p.owns_pets, false) as "HAS_PET",
  coalesce(pa.pet_count, 0) as "PET_COUNT",
  pa.pet_types as "PET_TYPES",
  coalesce(pa.has_dog, false) as "HAS_DOG",
  coalesce(pa.has_cat, false) as "HAS_CAT",
  coalesce(pa.has_others, false) as "HAS_OTHERS",
  p.last_active_at as "LAST_ACTIVE_AT",
  case
    when p.last_active_at is null then null
    when now() - p.last_active_at >= interval '30 days' then 'inactive_30d'
    when now() - p.last_active_at >= interval '7 days' then 'inactive_7d'
    else 'active'
  end as "ACTIVITY_BUCKET",
  cl.last_chat_at as "LAST_CHAT_AT",
  bl.last_broadcast_at as "LAST_BROADCAST_AT",
  bkl.last_booking_at as "LAST_BOOKING_AT",
  ts.trust_score as "TRUST_SCORE",
  case
    when ts.trust_score <= 2 then 'low'
    when ts.trust_score <= 4 then 'medium'
    else 'high'
  end as "TRUST_TIER",
  null::text as "ONBOARDING_STEP",
  null::timestamptz as "PROFILE_COMPLETED_AT",
  u.created_at as "USER_CREATED_AT",
  coalesce(p.marketing_consent, false) as "MARKETING_CONSENT",
  coalesce(p.marketing_opt_in_checked, false) as "MARKETING_OPT_IN",
  coalesce(p.marketing_doi_confirmed, false) as "MARKETING_DOI_CONFIRMED"
from public.profiles p
join auth.users u on u.id = p.id
left join pets_agg pa on pa.user_id = p.id
left join service_provider_flags sp on sp.user_id = p.id
left join chat_last cl on cl.user_id = p.id
left join broadcast_last bl on bl.user_id = p.id
left join booking_last bkl on bkl.user_id = p.id
left join device_flags df on df.user_id = p.id
cross join lateral (
  select (
    1
    + case when nullif(trim(coalesce(p.phone, '')), '') is not null then 1 else 0 end
    + case when coalesce(df.device_verified, false) then 1 else 0 end
    + case when p.human_verification_status = 'passed' then 1 else 0 end
    + case when p.card_verification_status = 'passed' then 1 else 0 end
  )::int as trust_score
) ts;
