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

  if v_bucket not in ('notices', 'social_album', 'alerts', 'chat_attachments', 'profile_photos', 'profiles') then
    raise exception 'invalid_bucket' using errcode = '22023';
  end if;

  v_path := regexp_replace(split_part(v_path, '?', 1), '^/+', '');
  if v_path = '' or v_path like '%..%' then
    raise exception 'invalid_object_path' using errcode = '22023';
  end if;

  if v_role <> 'service_role' and v_path not like v_uid::text || '/%' then
    raise exception 'object_path_owner_mismatch' using errcode = '42501';
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
