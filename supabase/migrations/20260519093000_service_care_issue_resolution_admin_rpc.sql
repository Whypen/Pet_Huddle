begin;

create or replace function public.admin_resolve_service_care_issue_event(
  p_event_id uuid,
  p_resolution text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_uid uuid := auth.uid();
  v_role text := auth.role();
  v_is_admin boolean := false;
  v_resolution text := nullif(btrim(coalesce(p_resolution, '')), '');
  v_event public.service_care_events%rowtype;
  v_target_user uuid;
begin
  if v_role = 'service_role' then
    v_is_admin := true;
  elsif v_uid is not null then
    select coalesce(p.is_admin, false) = true or lower(coalesce(p.user_role, '')) = 'admin'
    into v_is_admin
    from public.profiles p
    where p.id = v_uid;
  end if;

  if coalesce(v_is_admin, false) is not true then
    raise exception 'admin_required';
  end if;

  if v_resolution is null then
    raise exception 'resolution_required';
  end if;

  select *
  into v_event
  from public.service_care_events
  where id = p_event_id
    and event_type in ('issue_report', 'dispute_evidence')
  for update;

  if not found then
    raise exception 'issue_event_not_found';
  end if;

  update public.service_care_events
  set metadata = coalesce(metadata, '{}'::jsonb)
    || jsonb_build_object(
      'unresolved', false,
      'status', 'resolved',
      'resolved_at', now(),
      'resolved_by', v_uid,
      'resolution', v_resolution
    )
  where id = v_event.id;

  select case
    when sc.requester_id = v_event.actor_id then sc.provider_id
    else sc.requester_id
  end
  into v_target_user
  from public.service_chats sc
  where sc.id = v_event.service_chat_id;

  insert into public.admin_audit_logs(actor_id, action, target_user_id, notes, details)
  values (
    coalesce(v_uid, v_event.actor_id),
    'service_care_issue_event_resolved',
    v_target_user,
    v_resolution,
    jsonb_build_object(
      'service_care_event_id', v_event.id,
      'service_chat_id', v_event.service_chat_id,
      'event_type', v_event.event_type
    )
  );

  return jsonb_build_object(
    'ok', true,
    'event_id', v_event.id,
    'service_chat_id', v_event.service_chat_id,
    'resolved_at', now()
  );
end;
$function$;

revoke all on function public.admin_resolve_service_care_issue_event(uuid, text) from public;
revoke all on function public.admin_resolve_service_care_issue_event(uuid, text) from anon;
revoke all on function public.admin_resolve_service_care_issue_event(uuid, text) from authenticated;
grant execute on function public.admin_resolve_service_care_issue_event(uuid, text) to authenticated;
grant execute on function public.admin_resolve_service_care_issue_event(uuid, text) to service_role;

commit;
