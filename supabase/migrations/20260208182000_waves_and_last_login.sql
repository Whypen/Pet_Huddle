-- Contract v2.0: "Who waved at you" + "Active users only" support

alter table public.profiles
  add column if not exists last_login timestamptz default now();

create index if not exists idx_profiles_last_login on public.profiles(last_login desc);

-- waves table may already exist from earlier iterations. This migration makes the table
-- compatible with the v2.0 contract schema (`from_user_id`/`to_user_id`) without breaking
-- previously created columns.
do $$
begin
  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'waves'
  ) then
    create table public.waves (
      id uuid primary key default gen_random_uuid(),
      from_user_id uuid not null references public.profiles(id) on delete cascade,
      to_user_id uuid not null references public.profiles(id) on delete cascade,
      created_at timestamptz not null default now()
    );
  end if;

  -- Ensure v2.0 columns exist (backfill from common legacy names when present).
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='waves' and column_name='from_user_id'
  ) then
    alter table public.waves add column from_user_id uuid;
    if exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='waves' and column_name='user_id'
    ) then
      execute 'update public.waves set from_user_id = user_id where from_user_id is null';
    elsif exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='waves' and column_name='from_profile_id'
    ) then
      execute 'update public.waves set from_user_id = from_profile_id where from_user_id is null';
    end if;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='waves' and column_name='to_user_id'
  ) then
    alter table public.waves add column to_user_id uuid;
    if exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='waves' and column_name='target_user_id'
    ) then
      execute 'update public.waves set to_user_id = target_user_id where to_user_id is null';
    elsif exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='waves' and column_name='to_profile_id'
    ) then
      execute 'update public.waves set to_user_id = to_profile_id where to_user_id is null';
    end if;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='waves' and column_name='created_at'
  ) then
    alter table public.waves add column created_at timestamptz not null default now();
  end if;

  -- Add FKs only if not already present. (best-effort: skip if legacy table uses different refs)
  begin
    alter table public.waves
      add constraint waves_from_user_fk foreign key (from_user_id) references public.profiles(id) on delete cascade;
  exception when duplicate_object then
    null;
  end;

  begin
    alter table public.waves
      add constraint waves_to_user_fk foreign key (to_user_id) references public.profiles(id) on delete cascade;
  exception when duplicate_object then
    null;
  end;

  -- Unique pair constraint (if feasible).
  begin
    execute 'create unique index if not exists waves_from_to_unique on public.waves(from_user_id, to_user_id)';
  exception when others then
    null;
  end;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='waves' and column_name='to_user_id'
  ) then
    execute 'create index if not exists idx_waves_to on public.waves(to_user_id, created_at desc)';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='waves' and column_name='from_user_id'
  ) then
    execute 'create index if not exists idx_waves_from on public.waves(from_user_id, created_at desc)';
  end if;
end $$;

alter table public.waves enable row level security;

drop policy if exists "waves_select_involving_user" on public.waves;
create policy "waves_select_involving_user"
on public.waves
for select
using (auth.uid() = from_user_id or auth.uid() = to_user_id);

drop policy if exists "waves_insert_from_user" on public.waves;
create policy "waves_insert_from_user"
on public.waves
for insert
with check (auth.uid() = from_user_id);

drop policy if exists "waves_delete_from_user" on public.waves;
create policy "waves_delete_from_user"
on public.waves
for delete
using (auth.uid() = from_user_id);

drop policy if exists "waves_service_role_all" on public.waves;
create policy "waves_service_role_all"
on public.waves
for all
using ((auth.jwt() ->> 'role') = 'service_role')
with check ((auth.jwt() ->> 'role') = 'service_role');
