create or replace function public.get_native_social_blocked_user_ids()
returns table(user_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select ub.blocked_id as user_id
  from public.user_blocks ub
  where auth.uid() is not null
    and ub.blocker_id = auth.uid()
    and ub.blocked_id is not null
  union
  select ub.blocker_id as user_id
  from public.user_blocks ub
  where auth.uid() is not null
    and ub.blocked_id = auth.uid()
    and ub.blocker_id is not null;
$$;

revoke all on function public.get_native_social_blocked_user_ids() from public, anon;
grant execute on function public.get_native_social_blocked_user_ids() to authenticated;
grant execute on function public.get_native_social_blocked_user_ids() to service_role;
