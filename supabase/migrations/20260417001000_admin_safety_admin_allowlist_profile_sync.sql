-- Align backend admin checks with existing /admin/safety allowlist accounts.
-- This prevents frontend-allowlisted admins from seeing empty queues due to backend is_admin/user_role filters.

update public.profiles p
set
  is_admin = true,
  user_role = 'admin',
  updated_at = now()
from auth.users u
where u.id = p.id
  and lower(coalesce(u.email, '')) in (
    'twenty_illkid@msn.com',
    'fongpoman114@gmail.com',
    'kuriocollectives@gmail.com'
  )
  and (
    coalesce(p.is_admin, false) is distinct from true
    or lower(coalesce(p.user_role, '')) <> 'admin'
  );
