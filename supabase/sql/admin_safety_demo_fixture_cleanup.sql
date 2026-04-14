-- SAFE DEMO FIXTURE CLEANUP: /admin/safety
-- Deletes only rows tagged by [DEMO_FIXTURE_ADMIN_SAFETY_V1].

begin;

do $$
declare
  v_tag constant text := '[DEMO_FIXTURE_ADMIN_SAFETY_V1]';
  v_chat_ids uuid[];
begin
  delete from public.admin_audit_logs
  where coalesce(notes, '') like '%' || v_tag || '%'
     or coalesce(details->>'demo_fixture_tag', '') = v_tag;

  select array_agg(sc.chat_id)
  into v_chat_ids
  from public.service_chats sc
  where coalesce(sc.request_card::text, '') like '%' || v_tag || '%'
     or coalesce(sc.quote_card::text, '') like '%' || v_tag || '%';

  delete from public.service_disputes
  where coalesce(description, '') like '%' || v_tag || '%'
     or coalesce(admin_notes, '') like '%' || v_tag || '%'
     or coalesce(decision_payload::text, '') like '%' || v_tag || '%';

  delete from public.chat_messages
  where (v_chat_ids is not null and chat_id = any(v_chat_ids))
     or coalesce(content, '') like '%' || v_tag || '%';

  delete from public.chat_participants
  where v_chat_ids is not null and chat_id = any(v_chat_ids);

  delete from public.service_chats
  where coalesce(request_card::text, '') like '%' || v_tag || '%'
     or coalesce(quote_card::text, '') like '%' || v_tag || '%';

  delete from public.chats
  where coalesce(name, '') like '%' || v_tag || '%';

  delete from public.user_reports
  where coalesce(details, '') like '%' || v_tag || '%';

  delete from public.user_moderation
  where coalesce(reason_internal, '') like '%' || v_tag || '%'
     or coalesce(metadata->>'demo_fixture_tag', '') = v_tag;
end $$;

commit;
