-- Fix recursive RLS policies on public.profiles.
-- This migration removes only policies whose USING / WITH CHECK expressions
-- reference public.profiles via self-subquery patterns that trigger recursion.

alter table public.profiles enable row level security;

do $$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and (
        lower(coalesce(qual, '')) like '%from public.profiles%'
        or lower(coalesce(qual, '')) like '%from profiles%'
        or lower(coalesce(with_check, '')) like '%from public.profiles%'
        or lower(coalesce(with_check, '')) like '%from profiles%'
        or lower(coalesce(qual, '')) like '%exists (select%profiles%'
        or lower(coalesce(with_check, '')) like '%exists (select%profiles%'
      )
  loop
    execute format('drop policy if exists %I on public.profiles', pol.policyname);
  end loop;
end $$;

-- Safe, non-recursive baseline policies

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='profiles' and policyname='profiles_select_authenticated'
  ) then
    create policy profiles_select_authenticated
      on public.profiles
      for select
      to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='profiles' and policyname='profiles_insert_self'
  ) then
    create policy profiles_insert_self
      on public.profiles
      for insert
      to authenticated
      with check (auth.uid() = id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='profiles' and policyname='profiles_update_self'
  ) then
    create policy profiles_update_self
      on public.profiles
      for update
      to authenticated
      using (auth.uid() = id)
      with check (auth.uid() = id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='profiles' and policyname='profiles_delete_self'
  ) then
    create policy profiles_delete_self
      on public.profiles
      for delete
      to authenticated
      using (auth.uid() = id);
  end if;
end $$;
