-- Drop and recreate crm_contacts_view without auth.users join
drop view if exists public.crm_contacts_view;

create view public.crm_contacts_view as
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
  p.email::varchar(255) as "EMAIL",
  p.display_name as "DISPLAY_NAME",
  p.social_id as "SOCIAL_ID",
  p.phone as "PHONE",
  p.location_country as "COUNTRY",
  p.location_district as "DISTRICT",
  coalesce(p.effective_tier::text, p.tier, 'free') as "TIER",
  case when coalesce(sp.service_provider, false) then 'Yes' else 'No' end as "SERVICE_PROVIDER",
  coalesce(p.verification_status::text, 'unverified') as "VERIFICATION_STATUS",
  p.subscription_status as "SUBSCRIPTION_STATUS",
  case when coalesce(p.owns_pets, false) then 'Yes' else 'No' end as "HAS_PET",
  coalesce(pa.pet_count, 0) as "PET_COUNT",
  pa.pet_types as "PET_TYPES",
  case when coalesce(pa.has_dog, false) then 'Yes' else 'No' end as "HAS_DOG",
  case when coalesce(pa.has_cat, false) then 'Yes' else 'No' end as "HAS_CAT",
  case when coalesce(pa.has_others, false) then 'Yes' else 'No' end as "HAS_OTHERS",
  case when p.last_active_at is null then null else to_char((p.last_active_at at time zone 'UTC')::date, 'YYYY-MM-DD') end as "LAST_ACTIVE_AT",
  case
    when p.last_active_at is null then null
    when now() - p.last_active_at >= interval '30 days' then 'inactive_30d'
    when now() - p.last_active_at >= interval '7 days' then 'inactive_7d'
    else 'active'
  end as "ACTIVITY_BUCKET",
  case when cl.last_chat_at is null then null else to_char((cl.last_chat_at at time zone 'UTC')::date, 'YYYY-MM-DD') end as "LAST_CHAT_AT",
  case when bl.last_broadcast_at is null then null else to_char((bl.last_broadcast_at at time zone 'UTC')::date, 'YYYY-MM-DD') end as "LAST_BROADCAST_AT",
  case when bkl.last_booking_at is null then null else to_char((bkl.last_booking_at at time zone 'UTC')::date, 'YYYY-MM-DD') end as "LAST_BOOKING_AT",
  ts.trust_score as "TRUST_SCORE",
  case
    when ts.trust_score <= 2 then 'low'
    when ts.trust_score <= 4 then 'medium'
    else 'high'
  end as "TRUST_TIER",
  to_char((p.created_at at time zone 'UTC')::date, 'YYYY-MM-DD') as "USER_CREATED_AT",
  case when coalesce(p.marketing_consent, false) then 'Yes' else 'No' end as "MARKETING_CONSENT",
  case when coalesce(p.marketing_opt_in_checked, false) then 'Yes' else 'No' end as "MARKETING_OPT_IN",
  case when coalesce(p.marketing_doi_confirmed, false) then 'Yes' else 'No' end as "MARKETING_DOI_CONFIRMED"
from public.profiles p
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

revoke all on public.crm_contacts_view from anon;
revoke all on public.crm_contacts_view from authenticated;
grant select on public.crm_contacts_view to service_role;

-- plan_metadata RLS
alter table public.plan_metadata enable row level security;
drop policy if exists "plan_metadata_authenticated_read" on public.plan_metadata;
create policy "plan_metadata_authenticated_read"
  on public.plan_metadata for select to authenticated using (true);;
