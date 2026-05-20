create or replace function public.notify_service_midcare_photo_reminder(p_chat_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_uid uuid := auth.uid();
  v_sc public.service_chats%rowtype;
  v_existing uuid;
  v_href text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select *
    into v_sc
  from public.service_chats
  where id = p_chat_id
  limit 1;

  if not found then
    raise exception 'service_chat_not_found';
  end if;

  if v_sc.provider_id <> v_uid then
    raise exception 'not_service_provider';
  end if;

  if coalesce(v_sc.care_status, '') <> 'in_progress' and coalesce(v_sc.status, '') <> 'in_progress' then
    raise exception 'service_not_in_progress';
  end if;

  select id
    into v_existing
  from public.notifications
  where user_id = v_sc.provider_id
    and coalesce(data->>'kind', metadata->>'kind') = 'service_midcare_photo_reminder'
    and coalesce(data->>'service_chat_id', metadata->>'service_chat_id') = p_chat_id::text
  order by created_at desc nulls last, id desc
  limit 1;

  if v_existing is not null then
    return v_existing;
  end if;

  v_href := '/chats?tab=service&room=' || p_chat_id::text;

  return public.service_notify(
    v_sc.provider_id,
    'service_midcare_photo_reminder',
    'Send a quick update?',
    'Pet parents love a photo during care.',
    v_href,
    jsonb_build_object(
      'service_chat_id', p_chat_id,
      'care_status', v_sc.care_status
    )
  );
end;
$function$;

revoke all on function public.notify_service_midcare_photo_reminder(uuid) from public, anon;
grant execute on function public.notify_service_midcare_photo_reminder(uuid) to authenticated;
