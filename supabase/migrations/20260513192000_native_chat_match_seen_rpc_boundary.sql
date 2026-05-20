create or replace function public.mark_native_discover_match_seen(p_matched_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_matched_user_id is null then
    raise exception 'missing_matched_user';
  end if;

  insert into public.discover_match_seen (viewer_id, matched_user_id)
  values (v_uid, p_matched_user_id)
  on conflict (viewer_id, matched_user_id) do nothing;

  return true;
end;
$$;

revoke all on function public.mark_native_discover_match_seen(uuid) from public, anon;
grant execute on function public.mark_native_discover_match_seen(uuid) to authenticated, service_role;

create or replace function public.get_native_seen_match_ids()
returns table(matched_user_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select d.matched_user_id
  from public.discover_match_seen d
  where d.viewer_id = auth.uid()
  limit 500;
$$;

revoke all on function public.get_native_seen_match_ids() from public, anon;
grant execute on function public.get_native_seen_match_ids() to authenticated, service_role;

create or replace function public.has_native_reciprocal_wave(p_target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.waves w
    where (
      w.sender_id = p_target_user_id
      and w.receiver_id = auth.uid()
    ) or (
      w.from_user_id = p_target_user_id
      and w.to_user_id = auth.uid()
    )
    limit 1
  );
$$;

revoke all on function public.has_native_reciprocal_wave(uuid) from public, anon;
grant execute on function public.has_native_reciprocal_wave(uuid) to authenticated, service_role;
