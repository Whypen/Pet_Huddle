create or replace function public.get_native_map_blocked_user_ids()
returns table(user_id uuid)
language sql
security definer
set search_path = public
as $$
  select case
    when ub.blocker_id = auth.uid() then ub.blocked_id
    else ub.blocker_id
  end as user_id
  from public.user_blocks ub
  where auth.uid() is not null
    and (ub.blocker_id = auth.uid() or ub.blocked_id = auth.uid());
$$;

revoke all on function public.get_native_map_blocked_user_ids() from public, anon;
grant execute on function public.get_native_map_blocked_user_ids() to authenticated;
grant execute on function public.get_native_map_blocked_user_ids() to service_role;

create or replace function public.native_map_alert_supported(p_alert_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.broadcast_alert_interactions i
    where auth.uid() is not null
      and i.alert_id = p_alert_id
      and i.user_id = auth.uid()
      and i.interaction_type = 'support'
  );
$$;

revoke all on function public.native_map_alert_supported(uuid) from public, anon;
grant execute on function public.native_map_alert_supported(uuid) to authenticated;
grant execute on function public.native_map_alert_supported(uuid) to service_role;

create or replace function public.native_map_alert_support_count(p_alert_id uuid)
returns integer
language sql
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.broadcast_alert_interactions i
  where auth.uid() is not null
    and i.alert_id = p_alert_id
    and i.interaction_type = 'support';
$$;

revoke all on function public.native_map_alert_support_count(uuid) from public, anon;
grant execute on function public.native_map_alert_support_count(uuid) to authenticated;
grant execute on function public.native_map_alert_support_count(uuid) to service_role;

create or replace function public.native_map_upsert_alert_interaction(
  p_alert_id uuid,
  p_interaction_type text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_type text := lower(nullif(btrim(p_interaction_type), ''));
begin
  if v_uid is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if v_type not in ('support', 'report') then
    raise exception 'invalid_interaction_type' using errcode = '22023';
  end if;

  insert into public.broadcast_alert_interactions(alert_id, user_id, interaction_type)
  values (p_alert_id, v_uid, v_type)
  on conflict (alert_id, user_id, interaction_type) do nothing;

  return true;
end;
$$;

revoke all on function public.native_map_upsert_alert_interaction(uuid, text) from public, anon;
grant execute on function public.native_map_upsert_alert_interaction(uuid, text) to authenticated;
grant execute on function public.native_map_upsert_alert_interaction(uuid, text) to service_role;

create or replace function public.native_map_remove_alert_interaction(
  p_alert_id uuid,
  p_interaction_type text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_type text := lower(nullif(btrim(p_interaction_type), ''));
begin
  if v_uid is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if v_type not in ('support', 'report') then
    raise exception 'invalid_interaction_type' using errcode = '22023';
  end if;

  delete from public.broadcast_alert_interactions
  where alert_id = p_alert_id
    and user_id = v_uid
    and interaction_type = v_type;

  return true;
end;
$$;

revoke all on function public.native_map_remove_alert_interaction(uuid, text) from public, anon;
grant execute on function public.native_map_remove_alert_interaction(uuid, text) to authenticated;
grant execute on function public.native_map_remove_alert_interaction(uuid, text) to service_role;

create or replace function public.native_map_actor_name(p_user_id uuid)
returns table(display_name text)
language sql
security definer
set search_path = public
as $$
  select nullif(btrim(p.display_name), '') as display_name
  from public.profiles p
  where auth.uid() is not null
    and p.id = p_user_id
  limit 1;
$$;

revoke all on function public.native_map_actor_name(uuid) from public, anon;
grant execute on function public.native_map_actor_name(uuid) to authenticated;
grant execute on function public.native_map_actor_name(uuid) to service_role;

create or replace function public.native_map_set_invisible(p_invisible boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  update public.profiles
  set hide_from_map = coalesce(p_invisible, false)
  where id = v_uid;

  return true;
end;
$$;

revoke all on function public.native_map_set_invisible(boolean) from public, anon;
grant execute on function public.native_map_set_invisible(boolean) to authenticated;
grant execute on function public.native_map_set_invisible(boolean) to service_role;
