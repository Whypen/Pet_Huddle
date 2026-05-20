with latest_issue_message as (
  select distinct on (cm.chat_id)
    sc.id as service_chat_id,
    cm.chat_id,
    cm.sender_id,
    cm.created_at,
    nullif(substring(cm.content from '"reason"\s*:\s*"([^"]*)"'), '') as reason
  from public.chat_messages cm
  join public.service_chats sc on sc.chat_id = cm.chat_id
  where cm.content ~ '"kind"\s*:\s*"(service_disputed|service_issue_reported)"'
  order by cm.chat_id, cm.created_at desc
)
update public.service_chats sc
set status = 'disputed',
    care_status = 'under_dispute',
    disputed_at = coalesce(sc.disputed_at, latest_issue_message.created_at, now()),
    payout_release_requested_at = null,
    payout_release_lock_token = null,
    payout_release_locked_at = null,
    updated_at = now()
from latest_issue_message
where sc.id = latest_issue_message.service_chat_id
  and (
    coalesce(sc.status, '') <> 'disputed'
    or coalesce(sc.care_status, '') <> 'under_dispute'
    or sc.disputed_at is null
  );

with latest_issue_message as (
  select distinct on (cm.chat_id)
    sc.id as service_chat_id,
    cm.sender_id,
    nullif(substring(cm.content from '"reason"\s*:\s*"([^"]*)"'), '') as reason
  from public.chat_messages cm
  join public.service_chats sc on sc.chat_id = cm.chat_id
  where cm.content ~ '"kind"\s*:\s*"(service_disputed|service_issue_reported)"'
  order by cm.chat_id, cm.created_at desc
)
insert into public.service_disputes (
  service_chat_id,
  filed_by,
  category,
  description,
  evidence_urls,
  status
)
select
  latest_issue_message.service_chat_id,
  latest_issue_message.sender_id,
  coalesce(latest_issue_message.reason, 'Other'),
  'Backfilled service dispute from existing issue report message.',
  '{}'::text[],
  'open'
from latest_issue_message
where not exists (
  select 1
  from public.service_disputes sd
  where sd.service_chat_id = latest_issue_message.service_chat_id
);
