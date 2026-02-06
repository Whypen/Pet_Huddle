-- Fix profiles RLS policies to remove recursion risk and tighten unauth access

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Drop legacy/duplicate policies
DROP POLICY IF EXISTS "Admins can manage profiles" ON public.profiles;
DROP POLICY IF EXISTS "Anyone can view profiles for public view" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own full profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can select own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own non-monetized fields" ON public.profiles;
DROP POLICY IF EXISTS "profiles_delete_self" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_self" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_authenticated" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_self" ON public.profiles;
DROP POLICY IF EXISTS "users_insert_own_profile" ON public.profiles;
DROP POLICY IF EXISTS "users_update_own_profile" ON public.profiles;
DROP POLICY IF EXISTS "users_update_own_profile_extended" ON public.profiles;
DROP POLICY IF EXISTS "users_view_own_profile" ON public.profiles;

-- Minimal non-recursive policies
CREATE POLICY "profiles_select_authenticated"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "profiles_insert_self"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update_self"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_delete_self"
  ON public.profiles
  FOR DELETE
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "profiles_admin_update"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING ((auth.jwt() ->> 'user_role') = 'admin')
  WITH CHECK ((auth.jwt() ->> 'user_role') = 'admin');

CREATE POLICY "profiles_service_role_full_access"
  ON public.profiles
  FOR ALL
  USING (auth.role() = 'service_role');
