-- Fix double-notification for service chat messages.
-- notify_new_chat_message fires on ALL chat_messages including service chats,
-- but service state transitions already go through service_notify().
-- Adding an early exit for chat_type = 'service' prevents duplicate push.

create or replace function public.notify_new_chat_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chat_type text;
  v_chat_name text;
  v_sender_name text;
  v_content_obj jsonb;
  v_preview text;
  v_title text;
  v_body text;
  v_kind text;
  v_recipient record;
  v_href text;
begin
  -- Get chat type and name
  select type, name into v_chat_type, v_chat_name
  from public.chats
  where id = new.chat_id;

  if not found then return new; end if;

  -- Service chats go through service_notify() — skip to avoid double-notification
  if v_chat_type = 'service' then return new; end if;

  -- Get sender display_name
  select coalesce(display_name, 'Someone') into v_sender_name
  from public.profiles
  where id = new.sender_id;

  v_href := '/chat-dialogue?room=' || new.chat_id;

  -- Parse content: detect media vs text
  begin
    v_content_obj := new.content::jsonb;
  exception when others then
    v_content_obj := null;
  end;

  -- Determine kind and preview
  if v_content_obj is not null and v_content_obj->>'kind' = 'video' then
    v_kind := 'video_received';
    v_preview := v_sender_name || ' sent you a video';
  elsif v_content_obj is not null
    and (v_content_obj->>'kind' in ('image', 'photo', 'media')
         or v_content_obj ? 'mediaUrl'
         or v_content_obj ? 'imageUrl') then
    v_kind := 'photo_received';
    v_preview := v_sender_name || ' sent you a photo';
  else
    v_preview := left(coalesce(new.content, ''), 60);
    if length(coalesce(new.content, '')) > 60 then
      v_preview := v_preview || '…';
    end if;
  end if;

  -- Build notification copy based on chat type
  if v_chat_type = 'group' then
    v_kind := coalesce(v_kind, 'group_message');
    v_title := coalesce(v_chat_name, 'Group message');
    v_body := v_sender_name || ' in ' || coalesce(v_chat_name, 'group') || ': ' || v_preview;
  else
    v_kind := coalesce(v_kind, 'new_message');
    v_title := v_sender_name;
    v_body := v_sender_name || ': ' || v_preview;
  end if;

  -- Notify all members except sender
  for v_recipient in
    select m.user_id
    from public.chat_room_members m
    where m.chat_id = new.chat_id
      and m.user_id <> new.sender_id
  loop
    perform public.enqueue_chat_notification(
      v_recipient.user_id,
      v_kind,
      v_title,
      v_body,
      v_href,
      jsonb_build_object(
        'chat_id', new.chat_id,
        'sender_id', new.sender_id,
        'message_id', new.id
      )
    );
  end loop;

  return new;
end;
$$;
