create or replace function public.dispatch_expo_push_for_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_tokens jsonb;
  v_payload jsonb;
  v_href text;
  v_kind text;
begin
  if coalesce(new.data->>'delivery', new.metadata->>'delivery') <> 'push_and_in_app' then
    return new;
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'to', token,
      'sound', 'default',
      'title', coalesce(new.title, 'Huddle'),
      'body', coalesce(new.body, new.message, ''),
      'data', jsonb_strip_nulls(
        coalesce(new.data, '{}'::jsonb)
        || coalesce(new.metadata, '{}'::jsonb)
        || jsonb_build_object(
          'notificationId', new.id,
          'type', new.type,
          'href', coalesce(new.href, new.data->>'href', new.metadata->>'href'),
          'url', coalesce(new.href, new.data->>'href', new.metadata->>'href')
        )
      )
    )
  )
    into v_tokens
  from public.push_tokens
  where user_id = new.user_id
    and is_active is true
    and token is not null
    and token ~ '^(ExponentPushToken|ExpoPushToken)\\[';

  if v_tokens is null or jsonb_array_length(v_tokens) = 0 then
    return new;
  end if;

  v_href := coalesce(new.href, new.data->>'href', new.metadata->>'href');
  v_kind := coalesce(new.data->>'kind', new.metadata->>'kind', new.type);
  v_payload := v_tokens;

  perform net.http_post(
    url := 'https://exp.host/--/api/v2/push/send',
    body := v_payload,
    headers := jsonb_build_object(
      'Accept', 'application/json',
      'Accept-Encoding', 'gzip, deflate',
      'Content-Type', 'application/json'
    ),
    timeout_milliseconds := 5000
  );

  return new;
end;
$function$;

drop trigger if exists trg_dispatch_expo_push_for_notification on public.notifications;
create trigger trg_dispatch_expo_push_for_notification
after insert on public.notifications
for each row
execute function public.dispatch_expo_push_for_notification();
