create table if not exists public.native_social_post_saves (
  user_id uuid not null references public.profiles(id) on delete cascade,
  thread_id uuid not null references public.threads(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, thread_id)
);

create table if not exists public.native_social_post_pins (
  user_id uuid not null references public.profiles(id) on delete cascade,
  thread_id uuid not null references public.threads(id) on delete cascade,
  pinned_at timestamptz not null default now(),
  primary key (user_id, thread_id)
);

create index if not exists native_social_post_saves_user_created_idx
  on public.native_social_post_saves (user_id, created_at desc);

create index if not exists native_social_post_pins_user_pinned_idx
  on public.native_social_post_pins (user_id, pinned_at desc);

alter table public.native_social_post_saves enable row level security;
alter table public.native_social_post_pins enable row level security;

drop policy if exists "native social saves own select" on public.native_social_post_saves;
create policy "native social saves own select"
  on public.native_social_post_saves
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "native social saves own insert" on public.native_social_post_saves;
create policy "native social saves own insert"
  on public.native_social_post_saves
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "native social saves own delete" on public.native_social_post_saves;
create policy "native social saves own delete"
  on public.native_social_post_saves
  for delete
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "native social pins own select" on public.native_social_post_pins;
create policy "native social pins own select"
  on public.native_social_post_pins
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "native social pins own insert" on public.native_social_post_pins;
create policy "native social pins own insert"
  on public.native_social_post_pins
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "native social pins own update" on public.native_social_post_pins;
create policy "native social pins own update"
  on public.native_social_post_pins
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "native social pins own delete" on public.native_social_post_pins;
create policy "native social pins own delete"
  on public.native_social_post_pins
  for delete
  to authenticated
  using (user_id = auth.uid());

create or replace function public.get_native_social_post_preferences(p_thread_ids uuid[])
returns table (
  thread_id uuid,
  is_saved boolean,
  is_pinned boolean,
  pinned_at timestamptz
)
language sql
security invoker
set search_path = public
as $$
  with requested as (
    select distinct unnest(coalesce(p_thread_ids, array[]::uuid[])) as thread_id
  )
  select
    r.thread_id,
    s.thread_id is not null as is_saved,
    p.thread_id is not null as is_pinned,
    p.pinned_at
  from requested r
  join public.threads t on t.id = r.thread_id
  left join public.native_social_post_saves s
    on s.user_id = auth.uid()
   and s.thread_id = r.thread_id
  left join public.native_social_post_pins p
    on p.user_id = auth.uid()
   and p.thread_id = r.thread_id;
$$;

create or replace function public.set_native_social_post_saved(p_thread_id uuid, p_saved boolean)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'missing_auth' using errcode = '28000';
  end if;

  if not exists (select 1 from public.threads t where t.id = p_thread_id) then
    raise exception 'thread_not_found' using errcode = 'P0002';
  end if;

  if coalesce(p_saved, false) then
    insert into public.native_social_post_saves (user_id, thread_id)
    values (v_user_id, p_thread_id)
    on conflict (user_id, thread_id) do nothing;
    return true;
  end if;

  delete from public.native_social_post_saves
  where user_id = v_user_id
    and thread_id = p_thread_id;
  return false;
end;
$$;

create or replace function public.set_native_social_post_pinned(p_thread_id uuid, p_pinned boolean)
returns table (
  thread_id uuid,
  is_pinned boolean,
  pinned_at timestamptz
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_pinned_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'missing_auth' using errcode = '28000';
  end if;

  if not exists (select 1 from public.threads t where t.id = p_thread_id) then
    raise exception 'thread_not_found' using errcode = 'P0002';
  end if;

  if coalesce(p_pinned, false) then
    if not exists (
      select 1
      from public.native_social_post_pins p
      where p.user_id = v_user_id
        and p.thread_id = p_thread_id
    ) and (
      select count(*)
      from public.native_social_post_pins p
      where p.user_id = v_user_id
    ) >= 3 then
      raise exception 'native_social_pin_limit_reached' using errcode = 'P0001';
    end if;

    insert into public.native_social_post_pins (user_id, thread_id, pinned_at)
    values (v_user_id, p_thread_id, now())
    on conflict (user_id, thread_id) do update
      set pinned_at = excluded.pinned_at
    returning native_social_post_pins.pinned_at into v_pinned_at;

    return query select p_thread_id, true, v_pinned_at;
    return;
  end if;

  delete from public.native_social_post_pins
  where user_id = v_user_id
    and thread_id = p_thread_id;

  return query select p_thread_id, false, null::timestamptz;
end;
$$;

revoke all on table public.native_social_post_saves from public, anon;
revoke all on table public.native_social_post_pins from public, anon;
grant select, insert, delete on table public.native_social_post_saves to authenticated;
grant select, insert, update, delete on table public.native_social_post_pins to authenticated;

revoke all on function public.get_native_social_post_preferences(uuid[]) from public, anon;
revoke all on function public.set_native_social_post_saved(uuid, boolean) from public, anon;
revoke all on function public.set_native_social_post_pinned(uuid, boolean) from public, anon;
grant execute on function public.get_native_social_post_preferences(uuid[]) to authenticated;
grant execute on function public.set_native_social_post_saved(uuid, boolean) to authenticated;
grant execute on function public.set_native_social_post_pinned(uuid, boolean) to authenticated;
