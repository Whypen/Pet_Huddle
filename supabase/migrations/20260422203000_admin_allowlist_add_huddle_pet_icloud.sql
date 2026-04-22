-- Extend the backend admin sync allowlist to include the official huddle.pet iCloud account.
-- Team Huddle case messaging remains the reserved system sender identity; these are human admin accounts.

update public.profiles p
set
  is_admin = true,
  user_role = 'admin',
  updated_at = now()
from auth.users u
where u.id = p.id
  and lower(coalesce(u.email, '')) in (
    'huddle.pet@icloud.com',
    'twenty_illkid@msn.com',
    'fongpoman114@gmail.com',
    'kuriocollectives@gmail.com'
  )
  and (
    coalesce(p.is_admin, false) is distinct from true
    or lower(coalesce(p.user_role, '')) <> 'admin'
  );
