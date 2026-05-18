-- Keep backend admin checks aligned with the web /admin/safety allowlist.
-- Profile saves can rewrite user_role/is_admin; this guard prevents known
-- human admin accounts from being silently demoted and seeing empty queues.

create or replace function public.is_huddle_admin_allowlisted_email(p_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select lower(coalesce(p_email, '')) = any (
    array[
      'huddle.pet@icloud.com',
      'twenty_illkid@msn.com',
      'fongpoman114@gmail.com',
      'kuriocollectives@gmail.com'
    ]::text[]
  );
$$;

revoke all on function public.is_huddle_admin_allowlisted_email(text) from public, anon, authenticated;

create or replace function public.enforce_admin_allowlist_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text;
begin
  select u.email
    into v_email
  from auth.users u
  where u.id = new.id;

  if public.is_huddle_admin_allowlisted_email(v_email) then
    new.is_admin := true;
    new.user_role := 'admin';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_admin_allowlist_profile_role() from public, anon, authenticated;

drop trigger if exists trg_enforce_admin_allowlist_profile_role on public.profiles;
create trigger trg_enforce_admin_allowlist_profile_role
before insert or update of id, is_admin, user_role on public.profiles
for each row
execute function public.enforce_admin_allowlist_profile_role();

update public.profiles p
set
  is_admin = true,
  user_role = 'admin',
  updated_at = now()
from auth.users u
where u.id = p.id
  and public.is_huddle_admin_allowlisted_email(u.email)
  and (
    coalesce(p.is_admin, false) is distinct from true
    or lower(coalesce(p.user_role, '')) <> 'admin'
  );
