-- Fix: array concatenation in notify_on_map_alert_insert trigger (Postgres requires array operands).
-- Prior version used `cols := cols || 'title'` which attempts to cast text to text[] and can error with:
-- "malformed array literal: \"title\"".

create or replace function public.notify_on_map_alert_insert()
returns trigger
language plpgsql
security definer
as $$
declare
  has_title boolean := false;
  has_message boolean := false;
  has_body boolean := false;
  has_content boolean := false;
  has_type boolean := false;
  has_metadata boolean := false;
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

  if has_title then
    cols := cols || array['title'];
    exprs := exprs || array[quote_literal('Alert')];
  end if;

  if has_message then
    cols := cols || array['message'];
    exprs := exprs || array[msg_expr];
  end if;

  if has_body then
    cols := cols || array['body'];
    exprs := exprs || array[msg_expr];
  end if;

  if has_content then
    cols := cols || array['content'];
    exprs := exprs || array[msg_expr];
  end if;

  if has_type then
    cols := cols || array['type'];
    exprs := exprs || array[quote_literal('alert')];
  end if;

  if has_metadata then
    cols := cols || array['metadata'];
    exprs := exprs || array[$q$jsonb_build_object('alert_id', $5, 'alert_type', $4)$q$];
  end if;

  sql := format(
    'insert into public.notifications(%s) ' ||
    'select %s ' ||
    'from public.profiles p ' ||
    'where p.id <> $1 ' ||
    '  and p.location_retention_until is not null ' ||
    '  and p.location_retention_until > now() ' ||
    '  and coalesce(p.location, p.location_geog) is not null ' ||
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

  execute sql using new.creator_id, new.location_geog, new.range_meters, new.alert_type, new.id;
  return new;
end;
$$;

