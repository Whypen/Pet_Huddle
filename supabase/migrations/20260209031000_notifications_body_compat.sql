-- Notifications schema compatibility (prod variants):
-- Some environments have `body` NOT NULL (and/or `content`) in addition to or instead of `message`.
-- Our notification fanout trigger must populate all NOT NULL text columns to avoid insert failures.

-- 1) If `body` exists, make inserts safe even when only `message` is populated elsewhere.
do $$
begin
  if to_regclass('public.notifications') is null then
    return;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='notifications' and column_name='body'
  ) then
    -- Backfill any nulls from message/body/content and ensure a default.
    execute 'update public.notifications set body = coalesce(body, message, content, '''')';
    execute 'alter table public.notifications alter column body set default ''''';
  end if;
exception when others then
  null;
end $$;

-- 2) Replace map alert -> notifications trigger with a dynamic insert that populates
-- `message` plus any legacy text columns (`body`, `content`) when present.
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
    cols := cols || 'title';
    exprs := exprs || quote_literal('Alert');
  end if;

  if has_message then
    cols := cols || 'message';
    exprs := exprs || msg_expr;
  end if;

  if has_body then
    cols := cols || 'body';
    exprs := exprs || msg_expr;
  end if;

  if has_content then
    cols := cols || 'content';
    exprs := exprs || msg_expr;
  end if;

  if has_type then
    cols := cols || 'type';
    exprs := exprs || quote_literal('alert');
  end if;

  if has_metadata then
    cols := cols || 'metadata';
    exprs := exprs || $q$jsonb_build_object('alert_id', $5, 'alert_type', $4)$q$;
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
