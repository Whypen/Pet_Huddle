-- v1.9: Hardening notifications schema to match contract.
-- Some environments created notifications with different column names. This migration normalizes:
-- - message text
-- - type text ('alert'|'admin')
-- - metadata jsonb
-- - created_at timestamptz
-- - read boolean

do $$
begin
  if to_regclass('public.notifications') is null then
    create table public.notifications (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references public.profiles(id) on delete cascade,
      message text not null,
      type text not null check (type in ('alert','admin')),
      metadata jsonb not null default '{}'::jsonb,
      read boolean not null default false,
      created_at timestamptz not null default now()
    );
  end if;
exception when others then
  null;
end $$;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='notifications' and column_name='message'
  ) then
    alter table public.notifications add column message text;

    -- Best-effort backfill from older columns.
    if exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='notifications' and column_name='body'
    ) then
      execute 'update public.notifications set message = coalesce(message, body::text)';
    elsif exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='notifications' and column_name='content'
    ) then
      execute 'update public.notifications set message = coalesce(message, content::text)';
    end if;

    -- If still null, set empty string (then enforce NOT NULL if possible).
    execute 'update public.notifications set message = coalesce(message, '''')';
    alter table public.notifications alter column message set not null;
  end if;
exception when others then
  null;
end $$;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='notifications' and column_name='type'
  ) then
    alter table public.notifications add column type text;
    execute 'update public.notifications set type = coalesce(type, ''alert'')';
    alter table public.notifications alter column type set not null;
  end if;
exception when others then
  null;
end $$;

-- Ensure type constraint exists (best-effort, idempotent).
do $$
begin
  if not exists (
    select 1 from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    where t.relname = 'notifications'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%type%'
  ) then
    alter table public.notifications
      add constraint notifications_type_check check (type in ('alert','admin'));
  end if;
exception when others then
  null;
end $$;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='notifications' and column_name='metadata'
  ) then
    alter table public.notifications add column metadata jsonb not null default '{}'::jsonb;
  end if;
exception when others then
  null;
end $$;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='notifications' and column_name='created_at'
  ) then
    alter table public.notifications add column created_at timestamptz not null default now();
  end if;
exception when others then
  null;
end $$;

-- Normalize column name to `read`.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='notifications' and column_name='read'
  ) then
    alter table public.notifications add column read boolean not null default false;

    if exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='notifications' and column_name='is_read'
    ) then
      execute 'update public.notifications set read = is_read where read is distinct from is_read';
    end if;
  end if;
exception when others then
  null;
end $$;

create index if not exists idx_notifications_user on public.notifications(user_id, created_at desc);

