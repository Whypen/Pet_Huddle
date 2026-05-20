-- Star starts a direct conversation immediately.
-- Unlike normal direct chat entry, this path does not require an existing match.
-- It still blocks self-chat, blocked users, and unmatched relationships.

create or replace function public.ensure_star_direct_chat_room(
  p_target_user_id uuid,
  p_target_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
begin
  if v_actor_id is null then
    raise exception 'not_authenticated';
  end if;

  if p_target_user_id is null then
    raise exception 'target_required';
  end if;

  if v_actor_id = p_target_user_id then
    raise exception 'cannot_chat_with_self';
  end if;

  if exists (
    select 1
    from public.user_blocks ub
    where (ub.blocker_id = v_actor_id and ub.blocked_id = p_target_user_id)
       or (ub.blocker_id = p_target_user_id and ub.blocked_id = v_actor_id)
  ) then
    raise exception 'blocked_relationship';
  end if;

  if exists (
    select 1
    from public.user_unmatches uu
    where (uu.actor_id = v_actor_id and uu.target_id = p_target_user_id)
       or (uu.actor_id = p_target_user_id and uu.target_id = v_actor_id)
  ) then
    raise exception 'unmatched_relationship';
  end if;

  return public.ensure_direct_chat_room_for_users(v_actor_id, p_target_user_id, p_target_name);
end;
$$;

grant execute on function public.ensure_star_direct_chat_room(uuid, text) to authenticated;
