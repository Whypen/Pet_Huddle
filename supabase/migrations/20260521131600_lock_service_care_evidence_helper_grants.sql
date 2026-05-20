revoke all on function public.service_care_evidence_chat_id(text) from public, anon;
revoke all on function public.is_service_care_evidence_participant(text, uuid) from public, anon;
revoke all on function public.is_service_care_evidence_admin(uuid) from public, anon;

grant execute on function public.service_care_evidence_chat_id(text) to authenticated, service_role;
grant execute on function public.is_service_care_evidence_participant(text, uuid) to authenticated, service_role;
grant execute on function public.is_service_care_evidence_admin(uuid) to authenticated, service_role;
