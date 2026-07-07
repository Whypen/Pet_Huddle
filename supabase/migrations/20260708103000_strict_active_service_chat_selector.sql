-- Source-of-truth hardening: "current" service chat means the active booking only.
-- History/dispute rows can share the same conversation room, but they must never
-- be returned to payment/confirm/live Care Scope paths.

create or replace function public.current_active_service_chat_id_for_room(p_chat_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select sc.id
  from public.service_chats sc
  where sc.chat_id = p_chat_id
    and sc.status in ('pending', 'booked', 'in_progress')
    and coalesce(sc.care_status, '') not in ('completed', 'cancelled', 'under_dispute', 'handoff_issue_review')
  order by
    case when exists (
      select 1
      from public.care_scope_versions csv
      where csv.service_chat_id = sc.id
        and csv.is_active
    ) then 0 else 1 end,
    case sc.status
      when 'in_progress' then 0
      when 'booked' then 1
      when 'pending' then 2
      else 9
    end,
    coalesce(sc.updated_at, sc.request_sent_at, sc.booked_at, sc.created_at) desc nulls last,
    sc.created_at desc nulls last,
    sc.id desc
  limit 1;
$$;

revoke all on function public.current_active_service_chat_id_for_room(uuid) from public, anon;
grant execute on function public.current_active_service_chat_id_for_room(uuid) to authenticated, service_role;

create or replace function public.current_service_chat_id_for_room(p_chat_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select public.current_active_service_chat_id_for_room(p_chat_id);
$$;

revoke all on function public.current_service_chat_id_for_room(uuid) from public, anon;
grant execute on function public.current_service_chat_id_for_room(uuid) to authenticated, service_role;
