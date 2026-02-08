-- v1.9/v2.0 hardening: notifications table compatibility + map alert notification trigger fix.
-- Production currently has `public.notifications.title` as NOT NULL (no default),
-- while our trigger inserts only (user_id, message, type, metadata). This causes
-- inserts to fail and breaks UAT + map broadcast flows.

-- 1) Ensure `title` exists and is safe for inserts that omit it.
do $$
begin
  if to_regclass('public.notifications') is null then
    -- If notifications does not exist, the earlier normalization migration will create it.
    return;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='notifications' and column_name='title'
  ) then
    alter table public.notifications add column title text;
  end if;

  execute 'update public.notifications set title = coalesce(title, ''Alert'')';
  execute 'alter table public.notifications alter column title set default ''Alert''';
  execute 'alter table public.notifications alter column title set not null';
exception when others then
  null;
end $$;

-- 2) Update map alert -> notifications fanout trigger to include title and to target the
-- canonical columns added by our normalization migration (`message`, `type`, `metadata`).
-- If some columns are missing in a given environment, the earlier normalization migration
-- (20260209023000) will add them.
create or replace function public.notify_on_map_alert_insert()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.notifications(user_id, title, message, type, metadata)
  select
    p.id,
    'Alert',
    case
      when new.alert_type = 'Lost' then 'Alert: Missing in ' || coalesce(p.location_name, 'your area') || '!'
      when new.alert_type = 'Stray' then 'Alert: Furry friend sighting in ' || coalesce(p.location_name, 'your area') || '!'
      else 'Alert nearby in ' || coalesce(p.location_name, 'your area') || '!'
    end,
    'alert',
    jsonb_build_object('alert_id', new.id, 'alert_type', new.alert_type)
  from public.profiles p
  where p.id <> new.creator_id
    and p.location_retention_until is not null
    and p.location_retention_until > now()
    and coalesce(p.location, p.location_geog) is not null
    and ST_DWithin(
      coalesce(p.location, p.location_geog),
      new.location_geog,
      greatest(0, least(coalesce(new.range_meters, 10000), 150000))
    )
  order by p.location_retention_until desc
  limit 500;

  return new;
end;
$$;

