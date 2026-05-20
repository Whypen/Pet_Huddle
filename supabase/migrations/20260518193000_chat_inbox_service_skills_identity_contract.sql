-- Keep chat peer identity canonical while separating service provider skills from social-role subtitle.
-- Direct chats use profile social role/availability. Service chats expose provider skills separately.

do $$
declare
  v_function_oid oid;
  v_function_def text;
  v_previous_return text := 'service_request_card jsonb, shape_issue text, activity_ts timestamp with time zone)';
  v_next_return text := 'service_request_card jsonb, service_provider_skills text[], shape_issue text, activity_ts timestamp with time zone)';
  v_previous_enriched text := 'sr.service_request_card,
      sr.shape_issue,';
  v_next_enriched text := 'sr.service_request_card,
      case
        when sr.service_provider_id is not null then array(
          select value
          from (
            select nullif(btrim(skill), '''') as value, min(ord) as ord
            from public.pet_care_profiles pcp
            cross join lateral unnest(coalesce(pcp.skills, ''{}''::text[])) with ordinality as u(skill, ord)
            where pcp.user_id = sr.service_provider_id
              and nullif(btrim(skill), '''') is not null
            group by nullif(btrim(skill), '''')
            order by min(ord)
            limit 3
          ) ordered_service_skills
        )
        else ''{}''::text[]
      end as service_provider_skills,
      sr.shape_issue,';
  v_previous_unordered_enriched text := 'sr.service_request_card,
      case
        when sr.service_provider_id is not null then array(
          select distinct nullif(btrim(skill), '''')
          from public.pet_care_profiles pcp
          cross join lateral unnest(coalesce(pcp.skills, ''{}''::text[])) as skill
          where pcp.user_id = sr.service_provider_id
            and nullif(btrim(skill), '''') is not null
          limit 3
        )
        else ''{}''::text[]
      end as service_provider_skills,
      sr.shape_issue,';
  v_previous_select text := 'e.service_request_card, e.shape_issue, e.activity_ts';
  v_next_select text := 'e.service_request_card, e.service_provider_skills, e.shape_issue, e.activity_ts';
  v_previous_service_label text := 'case
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
          when';
  v_next_service_label text := 'case
          when';
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

  if position(v_next_return in v_function_def) = 0 then
    if position(v_previous_return in v_function_def) = 0 then
      raise exception 'get_chat_inbox_summaries_return_shape_changed';
    end if;
    v_function_def := replace(v_function_def, v_previous_return, v_next_return);
  end if;

  if position(v_next_enriched in v_function_def) = 0 then
    if position(v_previous_enriched in v_function_def) > 0 then
      v_function_def := replace(v_function_def, v_previous_enriched, v_next_enriched);
    elsif position(v_previous_unordered_enriched in v_function_def) > 0 then
      v_function_def := replace(v_function_def, v_previous_unordered_enriched, v_next_enriched);
    else
      raise exception 'get_chat_inbox_summaries_enriched_shape_changed';
    end if;
  end if;

  if position(v_next_select in v_function_def) = 0 then
    if position(v_previous_select in v_function_def) = 0 then
      raise exception 'get_chat_inbox_summaries_select_shape_changed';
    end if;
    v_function_def := replace(v_function_def, v_previous_select, v_next_select);
  end if;

  if position(v_previous_service_label in v_function_def) > 0 then
    v_function_def := replace(v_function_def, v_previous_service_label, v_next_service_label);
  end if;

  drop function public.get_chat_inbox_summaries(text, uuid[], boolean, integer, timestamp with time zone);
  execute v_function_def;
end;
$$;

revoke all on function public.get_chat_inbox_summaries(text, uuid[], boolean, int, timestamptz) from public, anon;
grant execute on function public.get_chat_inbox_summaries(text, uuid[], boolean, int, timestamptz) to authenticated;

do $$
declare
  v_function_oid oid;
  v_function_def text;
  v_previous_return text := 'service_request_card jsonb, shape_issue text, activity_ts timestamp with time zone)';
  v_next_return text := 'service_request_card jsonb, service_provider_skills text[], shape_issue text, activity_ts timestamp with time zone)';
begin
  select p.oid
  into v_function_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'search_chat_inbox'
    and pg_get_function_identity_arguments(p.oid) = 'p_query text';

  if v_function_oid is null then
    raise exception 'search_chat_inbox_signature_missing';
  end if;

  v_function_def := pg_get_functiondef(v_function_oid);

  if position(v_next_return in v_function_def) = 0 then
    if position(v_previous_return in v_function_def) = 0 then
      raise exception 'search_chat_inbox_return_shape_changed';
    end if;
    v_function_def := replace(v_function_def, v_previous_return, v_next_return);
  end if;

  drop function public.search_chat_inbox(text);
  execute v_function_def;
end;
$$;

revoke all on function public.search_chat_inbox(text) from public, anon;
grant execute on function public.search_chat_inbox(text) to authenticated;
