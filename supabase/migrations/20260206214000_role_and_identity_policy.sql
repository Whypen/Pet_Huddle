-- Ensure profiles.role exists
alter table public.profiles add column if not exists role text default 'user';

-- Restrictive policy for identity_verification bucket (owner insert, admin read)
create policy "Strict Identity Access"
on storage.objects as restrictive
for select to authenticated
using (
  bucket_id = 'identity_verification'
  and (
    owner = auth.uid()
    or (select role from public.profiles where id = auth.uid()) = 'admin'
  )
);
