-- Service requests should not require requester verification.
-- Provider-side verification and requestability remain enforced.

create or replace function public.create_service_chat(p_provider_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requester_id uuid := auth.uid();
  v_existing_chat_id uuid;
  v_chat_id uuid;
begin
  if v_requester_id is null then
    raise exception 'not_authenticated';
  end if;
  if p_provider_id is null then
    raise exception 'provider_required';
  end if;
  if v_requester_id = p_provider_id then
    raise exception 'cannot_create_service_chat_with_self';
  end if;

  if not exists (select 1 from public.profiles where id = v_requester_id) then
    raise exception 'requester_profile_missing';
  end if;

  if not exists (select 1 from public.profiles where id = p_provider_id) then
    raise exception 'provider_profile_missing';
  end if;

  if not public.can_request_service_from_provider(p_provider_id) then
    raise exception 'provider_not_requestable';
  end if;

  select sc.chat_id
  into v_existing_chat_id
  from public.service_chats sc
  where sc.requester_id = v_requester_id
    and sc.provider_id = p_provider_id
    and sc.status in ('pending', 'booked', 'in_progress')
  order by sc.updated_at desc nulls last
  limit 1;

  if v_existing_chat_id is not null then
    return v_existing_chat_id;
  end if;

  insert into public.chats (type, created_by)
  values ('service', v_requester_id)
  returning id into v_chat_id;

  insert into public.chat_room_members (chat_id, user_id)
  values (v_chat_id, v_requester_id), (v_chat_id, p_provider_id);

  insert into public.service_chats (
    chat_id, requester_id, provider_id, status, request_opened_at
  )
  values (
    v_chat_id, v_requester_id, p_provider_id, 'pending', now()
  );

  return v_chat_id;
end;
$$;
