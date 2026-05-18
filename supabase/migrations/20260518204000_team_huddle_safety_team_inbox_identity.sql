-- Team Huddle is an official non-social account. In chat inbox/dialogue it
-- should present as Safety Team and verified, while staying hidden elsewhere.

do $$
declare
  v_function_oid oid;
  v_function_def text;
  v_previous_peer_name text := 'coalesce(nullif(btrim(p.display_name), ''''), sr.chat_name, ''Conversation'') as peer_name,
        coalesce(nullif(btrim(p.avatar_url), ''''), sr.avatar_url) as peer_avatar_url,
        coalesce(p.is_verified, false) as peer_is_verified,';
  v_next_peer_name text := 'coalesce(nullif(btrim(p.display_name), ''''), sr.chat_name, ''Conversation'') as peer_name,
        coalesce(nullif(btrim(p.avatar_url), ''''), sr.avatar_url) as peer_avatar_url,
        case when p.id = ''8f55ab31-6b25-4d1a-98c7-3a6e8af2d941''::uuid then true else coalesce(p.is_verified, false) end as peer_is_verified,';
  v_previous_availability text := 'case
          when nullif(array_to_string(array(';
  v_next_availability text := 'case
          when p.id = ''8f55ab31-6b25-4d1a-98c7-3a6e8af2d941''::uuid then ''Safety Team''
          when nullif(array_to_string(array(';
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

  if position(v_next_peer_name in v_function_def) = 0 then
    if position(v_previous_peer_name in v_function_def) = 0 then
      raise exception 'get_chat_inbox_summaries_verified_shape_changed';
    end if;
    v_function_def := replace(v_function_def, v_previous_peer_name, v_next_peer_name);
  end if;

  if position('then ''Safety Team''' in v_function_def) = 0 then
    if position(v_previous_availability in v_function_def) = 0 then
      raise exception 'get_chat_inbox_summaries_availability_shape_changed';
    end if;
    v_function_def := replace(v_function_def, v_previous_availability, v_next_availability);
  end if;

  execute v_function_def;
end $$;

revoke all on function public.get_chat_inbox_summaries(text, uuid[], boolean, int, timestamptz) from public, anon;
grant execute on function public.get_chat_inbox_summaries(text, uuid[], boolean, int, timestamptz) to authenticated;
