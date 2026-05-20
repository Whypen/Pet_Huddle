alter table public.broadcast_alerts
  add column if not exists images text[] not null default '{}'::text[],
  add column if not exists is_sensitive boolean not null default false;

create or replace function public.update_broadcast_alert(p_alert_id uuid, p_patch jsonb)
returns public.broadcast_alerts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.broadcast_alerts%rowtype;
  v_is_admin boolean := false;
  v_previous_images text[] := '{}'::text[];
  v_images text[];
  v_removed text;
begin
  if v_uid is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  select coalesce(is_admin, false) or lower(coalesce(role, '')) = 'admin'
  into v_is_admin
  from public.profiles
  where id = v_uid;

  select *
  into v_row
  from public.broadcast_alerts
  where id = p_alert_id
  for update;

  if not found then
    raise exception 'broadcast_not_found' using errcode = '02000';
  end if;

  if v_row.creator_id <> v_uid and coalesce(v_is_admin, false) = false then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_previous_images := case
    when coalesce(array_length(v_row.images, 1), 0) > 0 then v_row.images
    else array_remove(array[v_row.photo_url], null)::text[]
  end;

  v_images := case
    when p_patch ? 'images' then
      coalesce(
        array(
          select x
          from jsonb_array_elements_text(coalesce(p_patch->'images', '[]'::jsonb)) as x
          where nullif(btrim(x), '') is not null
        ),
        '{}'::text[]
      )
    else v_row.images
  end;

  update public.broadcast_alerts
  set
    title = coalesce(nullif(btrim(p_patch->>'title'), ''), title),
    description = case when p_patch ? 'description' then nullif(btrim(p_patch->>'description'), '') else description end,
    address = coalesce(nullif(btrim(p_patch->>'address'), ''), address),
    type = case
      when p_patch ? 'type' and (p_patch->>'type') in ('Stray','Lost','Caution','Others') then (p_patch->>'type')
      else type
    end,
    duration_hours = case
      when p_patch ? 'duration_hours' then greatest(1, least(72, coalesce((p_patch->>'duration_hours')::int, duration_hours)))
      else duration_hours
    end,
    range_km = case
      when p_patch ? 'range_km' then greatest(1::numeric, least(150::numeric, coalesce((p_patch->>'range_km')::numeric, range_km)))
      else range_km
    end,
    range_meters = case
      when p_patch ? 'range_meters' then greatest(1000, least(50000, coalesce((p_patch->>'range_meters')::int, range_meters)))
      else range_meters
    end,
    images = v_images,
    photo_url = case
      when p_patch ? 'images' then coalesce(v_images[1], null)
      when p_patch ? 'photo_url' then nullif(p_patch->>'photo_url', '')
      else photo_url
    end,
    is_sensitive = case
      when p_patch ? 'is_sensitive' then coalesce((p_patch->>'is_sensitive')::boolean, is_sensitive)
      else is_sensitive
    end,
    post_on_threads = case
      when p_patch ? 'post_on_social' then coalesce((p_patch->>'post_on_social')::boolean, post_on_threads)
      when p_patch ? 'post_on_threads' then coalesce((p_patch->>'post_on_threads')::boolean, post_on_threads)
      else post_on_threads
    end
  where id = p_alert_id
  returning * into v_row;

  if v_row.thread_id is not null then
    update public.threads
    set
      title = coalesce(v_row.title, title),
      content = coalesce(v_row.description, content),
      tags = case
        when array_position(coalesce(tags, '{}'::text[]), 'News') is null then coalesce(tags, '{}'::text[]) || array['News']
        else tags
      end,
      images = case
        when coalesce(array_length(v_row.images, 1), 0) > 0 then v_row.images
        when v_row.photo_url is not null and v_row.photo_url <> '' then array_remove(array[v_row.photo_url], null)
        else '{}'::text[]
      end,
      is_sensitive = coalesce(v_row.is_sensitive, false)
    where id = v_row.thread_id;
  end if;

  for v_removed in
    select previous_url
    from unnest(v_previous_images) as previous_url
    where previous_url is not null
      and not (previous_url = any(coalesce(v_row.images, '{}'::text[])))
  loop
    v_removed := regexp_replace(split_part(v_removed, '?', 1), '^.*/storage/v1/object/public/alerts/', '');
    v_removed := regexp_replace(v_removed, '^alerts/+', '');
    if v_removed like v_uid::text || '/%' and position('..' in v_removed) = 0 then
      insert into public.storage_cleanup_queue(bucket, object_path, reason, requested_by)
      values ('alerts', v_removed, 'update_broadcast_alert', v_uid)
      on conflict do nothing;
    end if;
  end loop;

  return v_row;
end;
$$;

revoke all on function public.update_broadcast_alert(uuid, jsonb) from public, anon;
grant execute on function public.update_broadcast_alert(uuid, jsonb) to authenticated;
grant execute on function public.update_broadcast_alert(uuid, jsonb) to service_role;

create or replace function public.delete_broadcast_alert(p_alert_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.broadcast_alerts%rowtype;
  v_is_admin boolean := false;
  v_media_url text;
  v_object_path text;
begin
  if v_uid is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  select coalesce(is_admin, false) or lower(coalesce(role, '')) = 'admin'
  into v_is_admin
  from public.profiles
  where id = v_uid;

  select *
  into v_row
  from public.broadcast_alerts
  where id = p_alert_id
  for update;

  if not found then
    return false;
  end if;

  if v_row.creator_id <> v_uid and coalesce(v_is_admin, false) = false then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  for v_media_url in
    select distinct media_url
    from unnest(
      case
        when coalesce(array_length(v_row.images, 1), 0) > 0 then v_row.images
        else array_remove(array[v_row.photo_url], null)::text[]
      end
    ) as media_url
    where media_url is not null
  loop
    v_object_path := regexp_replace(split_part(v_media_url, '?', 1), '^.*/storage/v1/object/public/alerts/', '');
    v_object_path := regexp_replace(v_object_path, '^alerts/+', '');
    if v_object_path like v_row.creator_id::text || '/%' and position('..' in v_object_path) = 0 then
      insert into public.storage_cleanup_queue(bucket, object_path, reason, requested_by)
      values ('alerts', v_object_path, 'delete_broadcast_alert', v_uid)
      on conflict do nothing;
    end if;
  end loop;

  if v_row.thread_id is not null then
    delete from public.reply_mentions
    using public.thread_comments tc
    where reply_mentions.reply_id = tc.id
      and tc.thread_id = v_row.thread_id;
    delete from public.thread_comments where thread_id = v_row.thread_id;
    delete from public.thread_supports where thread_id = v_row.thread_id;
    delete from public.threads where id = v_row.thread_id and user_id = v_row.creator_id;
  end if;

  delete from public.broadcast_alert_interactions where alert_id = p_alert_id;
  delete from public.broadcast_alerts where id = p_alert_id;
  return true;
end;
$$;

revoke all on function public.delete_broadcast_alert(uuid) from public, anon;
grant execute on function public.delete_broadcast_alert(uuid) to authenticated;
grant execute on function public.delete_broadcast_alert(uuid) to service_role;

create or replace function public.delete_social_thread(p_thread_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner_id uuid;
  v_media text[];
  v_media_url text;
  v_bucket text;
  v_path text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select t.user_id into v_owner_id
  from public.threads t
  where t.id = p_thread_id
  for update;

  if v_owner_id is null then
    return false;
  end if;

  if v_owner_id <> v_uid then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select coalesce(array_agg(distinct media_url), '{}'::text[])
  into v_media
  from (
    select unnest(coalesce(t.images, '{}'::text[])) as media_url
    from public.threads t
    where t.id = p_thread_id
    union all
    select unnest(coalesce(tc.images, '{}'::text[])) as media_url
    from public.thread_comments tc
    where tc.thread_id = p_thread_id
  ) media
  where nullif(btrim(media_url), '') is not null;

  delete from public.reply_mentions rm
  using public.thread_comments tc
  where rm.reply_id = tc.id
    and tc.thread_id = p_thread_id;

  delete from public.post_mentions where post_id = p_thread_id;
  delete from public.thread_supports where thread_id = p_thread_id;
  delete from public.thread_comments where thread_id = p_thread_id;
  delete from public.threads where id = p_thread_id and user_id = v_uid;

  foreach v_media_url in array coalesce(v_media, '{}'::text[]) loop
    v_bucket := case
      when v_media_url like '%/social_album/%' or v_media_url like '%/social-album/%' then 'social_album'
      else 'notices'
    end;
    v_path := split_part(v_media_url, '?', 1);
    v_path := regexp_replace(v_path, '^.*/storage/v1/object/public/(notices|social_album|social-album)/', '');
    v_path := regexp_replace(v_path, '^.*/storage/v1/object/(notices|social_album|social-album)/', '');
    v_path := regexp_replace(v_path, '^/(notices|social_album|social-album)/', '');
    v_path := regexp_replace(v_path, '^(notices|social_album|social-album)/', '');
    v_path := regexp_replace(v_path, '^/+', '');
    if v_path <> '' and v_path not like '%..%' and v_path like v_uid::text || '/%' then
      insert into public.storage_cleanup_queue(bucket, object_path, reason, requested_by)
      values (v_bucket, v_path, 'delete_social_thread', v_uid)
      on conflict do nothing;
    end if;
  end loop;

  return true;
end;
$$;

revoke all on function public.delete_social_thread(uuid) from public, anon;
grant execute on function public.delete_social_thread(uuid) to authenticated;
