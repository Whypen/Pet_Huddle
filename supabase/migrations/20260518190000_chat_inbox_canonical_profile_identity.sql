-- Align chat inbox peer identity with the native public/profile surfaces.
-- Direct/group member names and avatars use the canonical profiles row.
-- Service chats keep provider skills as the subtitle instead of social role.

do $$
declare
  v_function_oid oid;
  v_function_def text;
  v_previous_sender text := 'coalesce(sender_profile.display_name, sender_public.display_name) as last_message_sender_name';
  v_next_sender text := 'sender_profile.display_name as last_message_sender_name';
  v_previous_peer text := 'coalesce(p.display_name, pp.display_name, sr.chat_name, ''Conversation'') as peer_name,
        coalesce(p.avatar_url, pp.avatar_url, sr.avatar_url) as peer_avatar_url,
        coalesce(p.is_verified, pp.is_verified, false) as peer_is_verified,
        coalesce(p.has_car, pp.has_car, false) as peer_has_car,
        case
          when coalesce(array_length(p.availability_status, 1), 0) > 0 then array_to_string(p.availability_status, '' • '')
          when coalesce(array_length(pp.availability_status, 1), 0) > 0 then array_to_string(pp.availability_status, '' • '')
          else coalesce(p.user_role, pp.user_role, ''Friend'')
        end as peer_availability_label,
        p.social_id as peer_social_id';
  v_next_peer text := 'coalesce(nullif(btrim(p.display_name), ''''), sr.chat_name, ''Conversation'') as peer_name,
        coalesce(nullif(btrim(p.avatar_url), ''''), sr.avatar_url) as peer_avatar_url,
        coalesce(p.is_verified, false) as peer_is_verified,
        coalesce(p.has_car, false) as peer_has_car,
        case
          when sr.room_type = ''service'' then (
            select nullif(array_to_string(array(
              select distinct nullif(btrim(skill), '''')
              from public.pet_care_profiles pcp
              cross join lateral unnest(coalesce(pcp.skills, ''{}''::text[])) as skill
              where pcp.user_id = sr.service_provider_id
                and nullif(btrim(skill), '''') is not null
              limit 3
            ), '' / ''), '''')
          )
          when nullif(array_to_string(array(
            select nullif(btrim(status), '''')
            from unnest(coalesce(p.availability_status, ''{}''::text[])) as status
            where nullif(btrim(status), '''') is not null
              and lower(btrim(status)) <> ''free''
          ), '' • ''), '''') is not null then nullif(array_to_string(array(
            select nullif(btrim(status), '''')
            from unnest(coalesce(p.availability_status, ''{}''::text[])) as status
            where nullif(btrim(status), '''') is not null
              and lower(btrim(status)) <> ''free''
          ), '' • ''), '''')
          when nullif(btrim(coalesce(p.user_role, '''')), '''') is not null
            and lower(btrim(coalesce(p.user_role, ''''))) <> ''free'' then nullif(btrim(p.user_role), '''')
          when coalesce(p.owns_pets, false) = true
            or exists (
              select 1
              from public.pets pet
              where pet.owner_id = p.id
                and coalesce(pet.is_active, true) = true
                and (pet.owner_id = auth.uid() or coalesce(pet.is_public, false) = true)
              limit 1
            ) then ''Pet Parent''
          else ''Animal Friend''
        end as peer_availability_label,
        p.social_id as peer_social_id';
  v_previous_activity text := 'and (p_only_with_activity is null
      or (p_only_with_activity = true and e.last_message_at is not null)
      or (p_only_with_activity = false and e.last_message_at is null))';
  v_next_activity text := 'and (p_only_with_activity is null
      or (e.room_type = ''service'' and p_only_with_activity = false)
      or (p_only_with_activity = true and e.last_message_at is not null)
      or (p_only_with_activity = false and e.last_message_at is null))';
begin
  select p.oid
  into v_function_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'get_chat_inbox_summaries'
    and pg_get_function_identity_arguments(p.oid) = 'p_scope text, p_chat_ids uuid[], p_only_with_activity boolean, p_limit integer, p_cursor timestamp with time zone';

  if v_function_oid is null then
    raise exception 'get_chat_inbox_summaries_signature_missing';
  end if;

  v_function_def := pg_get_functiondef(v_function_oid);

  if position(v_previous_sender in v_function_def) > 0 then
    v_function_def := replace(v_function_def, v_previous_sender, v_next_sender);
  end if;

  if position(v_next_peer in v_function_def) = 0 then
    if position(v_previous_peer in v_function_def) = 0 then
      raise exception 'get_chat_inbox_summaries_peer_identity_shape_changed';
    end if;
    v_function_def := replace(v_function_def, v_previous_peer, v_next_peer);
  end if;

  if position(v_next_activity in v_function_def) = 0 and position(v_previous_activity in v_function_def) > 0 then
    v_function_def := replace(v_function_def, v_previous_activity, v_next_activity);
  end if;

  execute v_function_def;
end;
$$;
