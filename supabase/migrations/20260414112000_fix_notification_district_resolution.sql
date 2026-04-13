-- Fix notification district resolution:
-- - never fallback to recipient profile district or literal "your district"
-- - resolve district from alert.location_district, then alert.location_name parsing

create or replace function public.resolve_alert_notification_district(
  p_location_district text,
  p_location_name text
)
returns text
language plpgsql
immutable
as $$
declare
  v_candidate text;
  v_parts text[];
  v_last text;
  v_len int;
begin
  v_candidate := nullif(btrim(coalesce(p_location_district, '')), '');
  if v_candidate is not null then
    return v_candidate;
  end if;

  v_candidate := nullif(btrim(coalesce(p_location_name, '')), '');
  if v_candidate is null then
    return null;
  end if;

  v_parts := regexp_split_to_array(v_candidate, '\s*,\s*');
  v_len := coalesce(array_length(v_parts, 1), 0);
  if v_len >= 2 then
    v_last := lower(btrim(coalesce(v_parts[v_len], '')));
    if v_last in ('hong kong', 'hk', 'hksar', 'china', 'cn') then
      v_candidate := nullif(btrim(coalesce(v_parts[v_len - 1], '')), '');
    else
      v_candidate := nullif(btrim(coalesce(v_parts[v_len], '')), '');
    end if;
  end if;

  return v_candidate;
end;
$$;

create or replace function public.notify_on_broadcast_alert_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alert_district text;
  v_delay interval;
begin
  v_alert_district := public.resolve_alert_notification_district(
    to_jsonb(new)->>'location_district',
    to_jsonb(new)->>'location_name'
  );
  v_delay := public.broadcast_notification_queue_delay();

  insert into public.broadcast_alert_notification_queue (
    alert_id,
    recipient_user_id,
    alert_type,
    location_name,
    thread_id,
    available_at
  )
  select
    new.id,
    p.id,
    new.type,
    coalesce(v_alert_district, 'the area'),
    new.thread_id,
    now() + v_delay
  from public.profiles p
  where p.id <> new.creator_id
    and p.location_retention_until is not null
    and p.location_retention_until > now()
    and coalesce(p.location, p.location_geog) is not null
    and new.geog is not null
    and st_dwithin(
      coalesce(p.location, p.location_geog),
      new.geog,
      greatest(0, least(coalesce(round(new.range_km * 1000.0)::int, 10000), 150000))
    )
  order by p.location_retention_until desc
  limit 500
  on conflict (alert_id, recipient_user_id) do nothing;

  insert into public.broadcast_alert_notification_queue (
    alert_id,
    recipient_user_id,
    alert_type,
    location_name,
    thread_id,
    available_at
  ) values (
    new.id,
    new.creator_id,
    new.type,
    coalesce(v_alert_district, 'the area'),
    new.thread_id,
    now() + v_delay
  )
  on conflict (alert_id, recipient_user_id) do nothing;

  if v_delay = interval '0 minutes' then
    perform public.process_due_broadcast_alert_notifications(500);
  end if;

  return new;
end;
$$;

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
    select q.id, q.alert_id, q.recipient_user_id, q.alert_type, q.location_name, q.thread_id
    from public.broadcast_alert_notification_queue q
    where q.processed_at is null
      and q.available_at <= now()
    order by q.available_at asc, q.id asc
    limit greatest(1, coalesce(p_limit, 200))
    for update skip locked
  loop
    begin
      v_location := coalesce(nullif(btrim(rec.location_name), ''), 'the area');
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
