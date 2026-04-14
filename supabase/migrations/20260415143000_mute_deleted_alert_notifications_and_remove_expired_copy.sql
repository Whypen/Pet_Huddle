-- Broadcast notifications contract:
-- 1) If alert is removed/archived before delay window ends, mute queued notification.
-- 2) Remove "Your alert has expired and is no longer visible" notifications.

create or replace function public.process_due_broadcast_alert_notifications(p_limit int default 200)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  v_processed int := 0;
  has_title boolean := false;
  has_message boolean := false;
  has_body boolean := false;
  has_content boolean := false;
  has_type boolean := false;
  has_metadata boolean := false;
  has_href boolean := false;
  has_data boolean := false;
  cols text[];
  exprs text[];
  msg text;
  v_location text;
  sql text;
begin
  select exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='notifications' and column_name='title'
  ) into has_title;
  select exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='notifications' and column_name='message'
  ) into has_message;
  select exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='notifications' and column_name='body'
  ) into has_body;
  select exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='notifications' and column_name='content'
  ) into has_content;
  select exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='notifications' and column_name='type'
  ) into has_type;
  select exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='notifications' and column_name='metadata'
  ) into has_metadata;
  select exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='notifications' and column_name='href'
  ) into has_href;
  select exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='notifications' and column_name='data'
  ) into has_data;

  for rec in
    select
      q.id,
      q.alert_id,
      q.recipient_user_id,
      q.alert_type,
      q.location_name,
      q.thread_id,
      b.id as active_alert_id,
      b.archived_at,
      b.created_at as alert_created_at,
      b.duration_hours as alert_duration_hours
    from public.broadcast_alert_notification_queue q
    left join public.broadcast_alerts b on b.id = q.alert_id
    where q.processed_at is null
      and q.available_at <= now()
    order by q.available_at asc, q.id asc
    limit greatest(1, coalesce(p_limit, 200))
    for update of q skip locked
  loop
    begin
      -- Mute queue item when alert no longer valid at delivery time.
      if rec.active_alert_id is null
         or rec.archived_at is not null
         or now() > (
           rec.alert_created_at
           + make_interval(hours => greatest(1, least(72, coalesce(rec.alert_duration_hours, 0))))
         )
      then
        update public.broadcast_alert_notification_queue
        set processed_at = now(),
            attempt_count = attempt_count + 1,
            last_error = 'muted: alert unavailable before delivery'
        where id = rec.id;
        continue;
      end if;

      v_location := coalesce(nullif(btrim(rec.location_name), ''), 'you');
      msg := case rec.alert_type
        when 'Stray' then '💡 A stray was spotted near ' || v_location || ' — keep an eye out'
        when 'Caution' then '⚠️ A caution was raised near ' || v_location || ' — tap to see what''s happening'
        when 'Lost' then '🆘 A furry friend is lost near ' || v_location || ' — tap to help bring them home'
        else '📍 A community alert was posted near ' || v_location || ' — tap to view details'
      end;

      cols := array['user_id'];
      exprs := array[quote_literal(rec.recipient_user_id::text) || '::uuid'];

      if has_title then
        cols := array_append(cols, 'title');
        exprs := array_append(exprs, quote_literal('Alert'));
      end if;
      if has_message then
        cols := array_append(cols, 'message');
        exprs := array_append(exprs, quote_literal(msg));
      end if;
      if has_body then
        cols := array_append(cols, 'body');
        exprs := array_append(exprs, quote_literal(msg));
      end if;
      if has_content then
        cols := array_append(cols, 'content');
        exprs := array_append(exprs, quote_literal(msg));
      end if;
      if has_type then
        cols := array_append(cols, 'type');
        exprs := array_append(exprs, quote_literal('map'));
      end if;
      if has_metadata then
        cols := array_append(cols, 'metadata');
        exprs := array_append(
          exprs,
          format(
            'jsonb_build_object(''alert_id'',''%s'',''alert_type'',''%s'')',
            rec.alert_id::text,
            rec.alert_type
          )
        );
      end if;
      if has_href then
        cols := array_append(cols, 'href');
        exprs := array_append(exprs, quote_literal('/map?alert=' || rec.alert_id::text));
      end if;
      if has_data then
        cols := array_append(cols, 'data');
        exprs := array_append(
          exprs,
          format(
            'jsonb_build_object(''alert_id'',''%s'',''alert_type'',''%s'',''thread_id'',%s)',
            rec.alert_id::text,
            rec.alert_type,
            case when rec.thread_id is null then 'null' else quote_literal(rec.thread_id::text) end
          )
        );
      end if;

      sql := format(
        'insert into public.notifications(%s) values (%s)',
        array_to_string(cols, ','),
        array_to_string(exprs, ',')
      );
      execute sql;

      update public.broadcast_alert_notification_queue
      set processed_at = now(),
          attempt_count = attempt_count + 1,
          last_error = null
      where id = rec.id;
      v_processed := v_processed + 1;
    exception
      when others then
        update public.broadcast_alert_notification_queue
        set attempt_count = attempt_count + 1,
            last_error = sqlerrm
        where id = rec.id;
    end;
  end loop;

  return v_processed;
end;
$$;

-- Ensure cleanup path itself never creates expiry notifications.
create or replace function public.cleanup_expired_broadcast_alerts()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer := 0;
begin
  delete from public.broadcast_alerts
  where archived_at is not null
     or (created_at + make_interval(hours => greatest(1, least(72, duration_hours)))) <= now();

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- Remove existing legacy expiry notification copy from history.
do $$
declare
  v_text_expr text := 'null::text';
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'notifications' and column_name = 'message'
  ) then
    v_text_expr := 'coalesce(' || v_text_expr || ', n.message)';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'notifications' and column_name = 'body'
  ) then
    v_text_expr := 'coalesce(' || v_text_expr || ', n.body)';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'notifications' and column_name = 'content'
  ) then
    v_text_expr := 'coalesce(' || v_text_expr || ', n.content)';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'notifications' and column_name = 'title'
  ) then
    v_text_expr := 'coalesce(' || v_text_expr || ', n.title)';
  end if;
  v_text_expr := 'coalesce(' || v_text_expr || ', '''')';

  execute format(
    'delete from public.notifications n where lower(%s) = lower(%L)',
    v_text_expr,
    'Your alert has expired and is no longer visible'
  );
end;
$$;
