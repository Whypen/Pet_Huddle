-- Native Service lazy/action exact-token RPC boundaries.

create or replace function public.toggle_native_service_bookmark(p_provider_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viewer_id uuid := auth.uid();
  v_is_bookmarked boolean;
begin
  if v_viewer_id is null then
    raise exception 'not_authenticated';
  end if;
  if p_provider_user_id is null then
    raise exception 'provider_required';
  end if;
  if v_viewer_id = p_provider_user_id then
    raise exception 'cannot_bookmark_self';
  end if;

  if exists (
    select 1
    from public.service_bookmarks sb
    where sb.user_id = v_viewer_id
      and sb.provider_user_id = p_provider_user_id
  ) then
    delete from public.service_bookmarks sb
    where sb.user_id = v_viewer_id
      and sb.provider_user_id = p_provider_user_id;
    v_is_bookmarked := false;
  else
    if not exists (
      select 1
      from public.pet_care_profiles pc
      join public.profiles p on p.id = pc.user_id
      where pc.user_id = p_provider_user_id
        and pc.listed = true
        and p.verification_status::text = 'verified'
    ) then
      raise exception 'provider_not_bookmarkable';
    end if;

    insert into public.service_bookmarks (user_id, provider_user_id)
    values (v_viewer_id, p_provider_user_id)
    on conflict (user_id, provider_user_id) do nothing;
    v_is_bookmarked := true;
  end if;

  return v_is_bookmarked;
end;
$$;

revoke all on function public.toggle_native_service_bookmark(uuid) from public, anon;
grant execute on function public.toggle_native_service_bookmark(uuid) to authenticated, service_role;

create or replace function public.record_native_service_provider_view(p_provider_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viewer_id uuid := auth.uid();
begin
  if v_viewer_id is null then
    raise exception 'not_authenticated';
  end if;
  if p_provider_user_id is null then
    raise exception 'provider_required';
  end if;

  if not exists (
    select 1
    from public.pet_care_profiles pc
    join public.profiles p on p.id = pc.user_id
    where pc.user_id = p_provider_user_id
      and pc.listed = true
      and p.verification_status::text = 'verified'
  ) then
    return false;
  end if;

  if to_regprocedure('public.increment_pet_care_profile_view_count(uuid)') is not null then
    perform public.increment_pet_care_profile_view_count(p_provider_user_id);
  elsif exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'pet_care_profiles'
      and column_name = 'view_count'
  ) then
    execute 'update public.pet_care_profiles set view_count = coalesce(view_count, 0) + 1 where user_id = $1'
    using p_provider_user_id;
  end if;

  return true;
end;
$$;

revoke all on function public.record_native_service_provider_view(uuid) from public, anon;
grant execute on function public.record_native_service_provider_view(uuid) to authenticated, service_role;

create or replace function public.create_native_service_chat(p_provider_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.create_service_chat(p_provider_user_id);
end;
$$;

revoke all on function public.create_native_service_chat(uuid) from public, anon;
grant execute on function public.create_native_service_chat(uuid) to authenticated, service_role;

create or replace function public.record_native_service_analytics(
  p_event text,
  p_payload jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viewer_id uuid := auth.uid();
begin
  if v_viewer_id is null then
    raise exception 'not_authenticated';
  end if;
  if nullif(btrim(coalesce(p_event, '')), '') is null then
    raise exception 'event_required';
  end if;

  insert into public.service_analytics (user_id, event, payload)
  values (v_viewer_id, p_event, coalesce(p_payload, '{}'::jsonb));

  return true;
end;
$$;

revoke all on function public.record_native_service_analytics(text, jsonb) from public, anon;
grant execute on function public.record_native_service_analytics(text, jsonb) to authenticated, service_role;
