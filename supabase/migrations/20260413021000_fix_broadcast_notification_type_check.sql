-- Fix broadcast notification fan-out type to satisfy notifications_type_check.
-- Allowed notification types are: booking, chats, map, social, system.
-- Broadcast map alerts must emit "map" (not "alert").

create or replace function public.notify_on_broadcast_alert_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  has_title boolean := false;
  has_message boolean := false;
  has_body boolean := false;
  has_content boolean := false;
  has_type boolean := false;
  has_metadata boolean := false;
  has_href boolean := false;
  has_data boolean := false;
  cols text[] := array['user_id'];
  exprs text[] := array['p.id'];
  msg_expr text := $q$case
      when $4 = 'Lost' then 'Alert: Missing in ' || coalesce(p.location_name, 'your area') || '!'
      when $4 = 'Stray' then 'Alert: Furry friend sighting in ' || coalesce(p.location_name, 'your area') || '!'
      else 'Alert nearby in ' || coalesce(p.location_name, 'your area') || '!'
    end$q$;
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

  if has_title then
    cols := array_append(cols, 'title');
    exprs := array_append(exprs, quote_literal('Alert'));
  end if;

  if has_message then
    cols := array_append(cols, 'message');
    exprs := array_append(exprs, msg_expr);
  end if;

  if has_body then
    cols := array_append(cols, 'body');
    exprs := array_append(exprs, msg_expr);
  end if;

  if has_content then
    cols := array_append(cols, 'content');
    exprs := array_append(exprs, msg_expr);
  end if;

  if has_type then
    cols := array_append(cols, 'type');
    exprs := array_append(exprs, quote_literal('map'));
  end if;

  if has_metadata then
    cols := array_append(cols, 'metadata');
    exprs := array_append(exprs, $q$jsonb_build_object('alert_id', $5, 'alert_type', $4)$q$);
  end if;

  if has_href then
    cols := array_append(cols, 'href');
    exprs := array_append(exprs, $q$'/map?alert=' || $5::text$q$);
  end if;

  if has_data then
    cols := array_append(cols, 'data');
    exprs := array_append(exprs, $q$jsonb_build_object('alert_id', $5, 'alert_type', $4, 'thread_id', $6)$q$);
  end if;

  sql := format(
    'insert into public.notifications(%s) ' ||
    'select %s ' ||
    'from public.profiles p ' ||
    'where p.id <> $1 ' ||
    '  and p.location_retention_until is not null ' ||
    '  and p.location_retention_until > now() ' ||
    '  and coalesce(p.location, p.location_geog) is not null ' ||
    '  and $2 is not null ' ||
    '  and ST_DWithin(' ||
    '    coalesce(p.location, p.location_geog), ' ||
    '    $2, ' ||
    '    greatest(0, least(coalesce($3, 10000), 150000))' ||
    '  ) ' ||
    'order by p.location_retention_until desc ' ||
    'limit 500',
    array_to_string(cols, ','),
    array_to_string(exprs, ',')
  );

  execute sql
    using new.creator_id, new.geog, round(coalesce(new.range_km, 10) * 1000.0)::int, new.type, new.id, new.thread_id;

  return new;
end;
$$;
