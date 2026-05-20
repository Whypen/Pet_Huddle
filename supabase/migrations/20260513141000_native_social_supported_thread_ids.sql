create or replace function public.get_native_social_supported_thread_ids(p_thread_ids uuid[])
returns table(thread_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select ts.thread_id
  from public.thread_supports ts
  where auth.uid() is not null
    and ts.user_id = auth.uid()
    and ts.thread_id = any(coalesce(p_thread_ids, array[]::uuid[]));
$$;

revoke all on function public.get_native_social_supported_thread_ids(uuid[]) from public, anon;
grant execute on function public.get_native_social_supported_thread_ids(uuid[]) to authenticated;
grant execute on function public.get_native_social_supported_thread_ids(uuid[]) to service_role;
