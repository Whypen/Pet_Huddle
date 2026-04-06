-- Fix update_broadcast_alert: malformed array literal "News"
-- `|| 'News'` resolves as text[] || text[] and fails to parse the
-- untyped literal. Change to `|| ARRAY['News']` for unambiguous
-- element-append operator.
-- This also captures the function into migration history (was schema-drift).

CREATE OR REPLACE FUNCTION public.update_broadcast_alert(p_alert_id uuid, p_patch jsonb)
 RETURNS broadcast_alerts
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_row public.broadcast_alerts%rowtype;
  v_is_admin boolean := false;
  v_images text[];
begin
  if v_uid is null then
    raise exception 'unauthorized';
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
    raise exception 'broadcast_not_found';
  end if;

  if v_row.creator_id <> v_uid and coalesce(v_is_admin, false) = false then
    raise exception 'forbidden';
  end if;

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
    description = coalesce(nullif(btrim(p_patch->>'description'), ''), description),
    address = coalesce(nullif(btrim(p_patch->>'address'), ''), address),
    type = case
      when p_patch ? 'type' and (p_patch->>'type') in ('Stray','Lost','Others') then (p_patch->>'type')
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
    images = v_images,
    photo_url = case
      when p_patch ? 'images' then coalesce(v_images[1], null)
      when p_patch ? 'photo_url' then nullif(p_patch->>'photo_url', '')
      else photo_url
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
        when array_position(coalesce(tags, '{}'::text[]), 'News') is null then coalesce(tags, '{}'::text[]) || ARRAY['News']
        else tags
      end,
      images = case
        when coalesce(array_length(v_row.images, 1), 0) > 0 then v_row.images
        when v_row.photo_url is not null and v_row.photo_url <> '' then array_remove(array[v_row.photo_url], null)
        else images
      end
    where id = v_row.thread_id;
  end if;

  return v_row;
end;
$function$;

-- Preserve execute grants
GRANT EXECUTE ON FUNCTION public.update_broadcast_alert(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_broadcast_alert(uuid, jsonb) TO service_role;
