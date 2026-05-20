insert into public.service_disputes (
  service_chat_id,
  filed_by,
  category,
  description,
  evidence_urls,
  status
)
select
  sc.id,
  coalesce(issue.actor_id, sc.requester_id),
  coalesce(nullif(issue.metadata->>'reason', ''), 'Other'),
  coalesce(nullif(issue.note, ''), 'Backfilled service dispute from existing under-review service chat.'),
  coalesce(array(select jsonb_array_elements_text(issue.media_urls)), '{}'::text[]),
  'open'
from public.service_chats sc
left join lateral (
  select sce.actor_id, sce.note, sce.media_urls, sce.metadata
  from public.service_care_events sce
  where sce.service_chat_id = sc.id
    and sce.event_type in ('dispute_evidence', 'issue_reported')
  order by sce.created_at desc
  limit 1
) issue on true
where (sc.status = 'disputed' or sc.care_status = 'under_dispute' or sc.disputed_at is not null)
  and not exists (
    select 1
    from public.service_disputes sd
    where sd.service_chat_id = sc.id
  );
