-- SAFE DEMO FIXTURE CLEANUP: /admin/safety
-- Deletes only rows tagged by [DEMO_FIXTURE_ADMIN_SAFETY_V1].

begin;

do $$
declare
  v_tag constant text := '[DEMO_FIXTURE_ADMIN_SAFETY_V1]';
begin
  delete from public.admin_audit_logs
  where coalesce(notes, '') like '%' || v_tag || '%'
     or coalesce(details->>'demo_fixture_tag', '') = v_tag;

  delete from public.user_reports
  where coalesce(details, '') like '%' || v_tag || '%';

  delete from public.user_moderation
  where coalesce(reason_internal, '') like '%' || v_tag || '%'
     or coalesce(metadata->>'demo_fixture_tag', '') = v_tag;
end $$;

commit;
