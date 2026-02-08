-- Fix signup failures: allow auth trigger role to create profiles even when auth.uid() is null.
-- Supabase Auth writes auth.users using an internal DB role (commonly `supabase_auth_admin`).
-- If RLS is enabled on public.profiles and the trigger function owner does not bypass RLS,
-- INSERT can be rejected. This policy is scoped to the internal role only.

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    drop policy if exists "profiles_insert_supabase_auth_admin" on public.profiles;
    create policy "profiles_insert_supabase_auth_admin"
      on public.profiles
      for insert
      to supabase_auth_admin
      with check (true);

    drop policy if exists "profiles_update_supabase_auth_admin" on public.profiles;
    create policy "profiles_update_supabase_auth_admin"
      on public.profiles
      for update
      to supabase_auth_admin
      using (true)
      with check (true);
  end if;
end $$;

