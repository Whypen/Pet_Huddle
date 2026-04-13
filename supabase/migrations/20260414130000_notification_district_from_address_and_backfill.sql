-- Notification district must come from the alert's exact address string first.
-- Example: "Seymour Terrace 3, Central and Western, Hong Kong" => "Central and Western"
-- Fallback copy should be "near you" only when district cannot be resolved.

create or replace function public.resolve_alert_notification_district(
  p_location_district text,
  p_location_name text,
  p_address text
)
returns text
language plpgsql
immutable
as $$
declare
  v_candidate text;
  v_parts text[];
  v_second text;
  v_first text;
  v_last text;
  v_len int;
begin
  v_candidate := nullif(btrim(coalesce(p_location_district, '')), '');
  if v_candidate is not null then
    return v_candidate;
  end if;

  v_candidate := nullif(btrim(coalesce(p_address, '')), '');
  if v_candidate is null then
    v_candidate := nullif(btrim(coalesce(p_location_name, '')), '');
  end if;
  if v_candidate is null then
    return null;
  end if;

  v_parts := regexp_split_to_array(v_candidate, '\s*,\s*');
  v_len := coalesce(array_length(v_parts, 1), 0);
  if v_len = 0 then
    return null;
  end if;

  v_first := nullif(btrim(coalesce(v_parts[1], '')), '');
  v_second := nullif(btrim(coalesce(v_parts[2], '')), '');
  v_last := lower(btrim(coalesce(v_parts[v_len], '')));

  if v_len = 2 and v_last in ('hong kong', 'hk', 'hksar', 'china', 'cn') then
    return v_first;
  end if;

  if v_len >= 3 and v_second is not null then
    return v_second;
  end if;

  return null;
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
    to_jsonb(new)->>'location_name',
    to_jsonb(new)->>'address'
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
    coalesce(v_alert_district, 'you'),
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
    coalesce(v_alert_district, 'you'),
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

do $$
begin
  update public.broadcast_alert_notification_queue q
  set location_name = coalesce(
    public.resolve_alert_notification_district(
      to_jsonb(b)->>'location_district',
      to_jsonb(b)->>'location_name',
      to_jsonb(b)->>'address'
    ),
    'you'
  )
  from public.broadcast_alerts b
  where b.id = q.alert_id
    and (
      q.location_name is null
      or btrim(q.location_name) = ''
      or lower(btrim(q.location_name)) in ('your district', 'the area', 'you')
    );
end $$;

do $$
declare
  rec record;
  v_message text;
  v_has_message boolean := false;
  v_has_body boolean := false;
  v_has_content boolean := false;
  v_text_expr text;
  v_alert_type_expr text;
  v_sql text;
begin
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'notifications' and column_name = 'message'
  ) into v_has_message;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'notifications' and column_name = 'body'
  ) into v_has_body;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'notifications' and column_name = 'content'
  ) into v_has_content;

  v_text_expr := 'null::text';
  if v_has_message then
    v_text_expr := 'coalesce(' || v_text_expr || ', n.message)';
  end if;
  if v_has_body then
    v_text_expr := 'coalesce(' || v_text_expr || ', n.body)';
  end if;
  if v_has_content then
    v_text_expr := 'coalesce(' || v_text_expr || ', n.content)';
  end if;
  v_text_expr := 'coalesce(' || v_text_expr || ', '''')';

  v_alert_type_expr := 'null::text';
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'notifications' and column_name = 'type'
  ) then
    v_alert_type_expr := 'nullif(btrim(coalesce(n.type, '''')), '''')';
  end if;
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'notifications' and column_name = 'metadata'
  ) then
    v_alert_type_expr := 'coalesce(' || v_alert_type_expr || ', nullif(btrim(coalesce(n.metadata->>''alert_type'', '''')), ''''))';
  end if;
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'notifications' and column_name = 'data'
  ) then
    v_alert_type_expr := 'coalesce(' || v_alert_type_expr || ', nullif(btrim(coalesce(n.data->>''alert_type'', '''')), ''''))';
  end if;
  v_alert_type_expr := 'coalesce(' || v_alert_type_expr || ', '''')';

  v_sql := format(
    $q$
      select
        n.id,
        coalesce(
          public.resolve_alert_notification_district(
            to_jsonb(b)->>'location_district',
            to_jsonb(b)->>'location_name',
            to_jsonb(b)->>'address'
          ),
          'you'
        ) as district,
        %s as alert_type
      from public.notifications n
      join public.broadcast_alerts b
        on b.id::text = coalesce(
          nullif(btrim(coalesce(n.metadata->>'alert_id', '')), ''),
          nullif(btrim(coalesce(n.data->>'alert_id', '')), '')
        )
      where
        %s ilike '%%near your district%%'
        or %s ilike '%%near the area%%'
        or %s ilike '%%near you%%'
    $q$,
    v_alert_type_expr,
    v_text_expr,
    v_text_expr,
    v_text_expr
  );

  for rec in
    execute v_sql
  loop
    v_message := case rec.alert_type
      when 'Stray' then '💡 A stray was spotted near ' || rec.district || ' — keep an eye out'
      when 'Caution' then '⚠️ A caution was raised near ' || rec.district || ' — tap to see what''s happening'
      when 'Lost' then '🆘 A furry friend is lost near ' || rec.district || ' — tap to help bring them home'
      else '📍 A community alert was posted near ' || rec.district || ' — tap to view details'
    end;

    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'notifications' and column_name = 'message'
    ) then
      update public.notifications set message = v_message where id = rec.id;
    end if;
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'notifications' and column_name = 'body'
    ) then
      update public.notifications set body = v_message where id = rec.id;
    end if;
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'notifications' and column_name = 'content'
    ) then
      update public.notifications set content = v_message where id = rec.id;
    end if;
  end loop;
end $$;
