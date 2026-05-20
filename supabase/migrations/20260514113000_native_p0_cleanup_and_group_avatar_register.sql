create or replace function public.request_storage_cleanup(
  p_bucket text,
  p_object_path text,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role text := coalesce(auth.role(), '');
  v_bucket text := lower(btrim(coalesce(p_bucket, '')));
  v_path text := btrim(coalesce(p_object_path, ''));
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if v_uid is null and v_role <> 'service_role' then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if v_bucket not in ('pets', 'avatars', 'profile_photos', 'alerts', 'notices', 'chat_attachments', 'social_album') then
    raise exception 'invalid_bucket' using errcode = '22023';
  end if;

  v_path := regexp_replace(split_part(v_path, '?', 1), '^/+', '');
  if v_path = '' or v_path like '%..%' then
    raise exception 'invalid_object_path' using errcode = '22023';
  end if;

  if v_role <> 'service_role' and v_path not like v_uid::text || '/%' then
    if not (
      v_bucket = 'avatars'
      and v_path ~ '^groups/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[^/]+$'
      and public.can_write_native_group_avatar(v_path)
    ) then
      raise exception 'object_path_owner_mismatch' using errcode = '42501';
    end if;
  end if;

  v_reason := coalesce(nullif(v_reason, ''), 'native_cleanup');
  perform pg_advisory_xact_lock(hashtextextended(v_bucket || ':' || v_path || ':' || v_reason, 0));

  if exists (
    select 1
    from public.storage_cleanup_queue q
    where q.bucket = v_bucket
      and q.object_path = v_path
      and q.reason = v_reason
      and q.processed_at is null
  ) then
    return true;
  end if;

  insert into public.storage_cleanup_queue(bucket, object_path, reason, requested_by)
  values (v_bucket, v_path, v_reason, v_uid);

  return true;
end;
$$;

revoke all on function public.request_storage_cleanup(text, text, text) from public, anon;
grant execute on function public.request_storage_cleanup(text, text, text) to authenticated, service_role;

create or replace function public.register_native_media_asset(
  p_bucket text,
  p_object_path text,
  p_content_type text default null,
  p_content_id uuid default null,
  p_expires_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_bucket text := lower(btrim(coalesce(p_bucket, '')));
  v_path text := btrim(coalesce(p_object_path, ''));
  v_content_type text := nullif(btrim(coalesce(p_content_type, '')), '');
  v_group_chat_id uuid := null;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if v_bucket not in ('alerts', 'avatars', 'chat_attachments', 'notices', 'pets', 'profile_photos', 'profiles', 'social_album') then
    raise exception 'invalid_bucket';
  end if;

  v_path := regexp_replace(split_part(v_path, '?', 1), '^/+', '');
  if v_path = '' or v_path like '%..%' then
    raise exception 'invalid_object_path';
  end if;

  if v_bucket = 'avatars' and v_content_type = 'group_cover' then
    if v_path !~ '^groups/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[^/]+$' then
      raise exception 'invalid_group_avatar_path';
    end if;

    v_group_chat_id := split_part(v_path, '/', 2)::uuid;
    if p_content_id is null or p_content_id <> v_group_chat_id then
      raise exception 'group_avatar_content_id_mismatch';
    end if;

    if not public.can_write_native_group_avatar(v_path) then
      raise exception 'group_avatar_permission_denied';
    end if;
  elsif v_path not like v_uid::text || '/%' then
    raise exception 'object_path_owner_mismatch';
  end if;

  insert into public.media_assets(bucket, object_path, owner_id, content_type, content_id, expires_at)
  values (v_bucket, v_path, v_uid, v_content_type, p_content_id, p_expires_at)
  on conflict (bucket, object_path) do update
    set content_type = coalesce(excluded.content_type, public.media_assets.content_type),
        content_id = coalesce(excluded.content_id, public.media_assets.content_id),
        expires_at = coalesce(excluded.expires_at, public.media_assets.expires_at),
        deleted_at = null
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.register_native_media_asset(text, text, text, uuid, timestamptz) from public, anon;
grant execute on function public.register_native_media_asset(text, text, text, uuid, timestamptz) to authenticated, service_role;
