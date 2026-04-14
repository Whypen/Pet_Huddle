begin;

create table if not exists public.user_moderation_restrictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  restriction_key text not null check (restriction_key in (
    'chat_disabled',
    'discovery_hidden',
    'social_posting_disabled',
    'marketplace_hidden',
    'service_disabled',
    'map_hidden',
    'map_disabled'
  )),
  enabled_at timestamptz not null default now(),
  expires_at timestamptz not null,
  disabled_at timestamptz null,
  enabled_by uuid null references public.profiles(id) on delete set null,
  disabled_by uuid null references public.profiles(id) on delete set null,
  source text not null default 'manual' check (source in ('manual', 'automation')),
  note text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_moderation_restrictions_user_key_active
  on public.user_moderation_restrictions(user_id, restriction_key, expires_at)
  where disabled_at is null;

create index if not exists idx_user_moderation_restrictions_user_active
  on public.user_moderation_restrictions(user_id, expires_at)
  where disabled_at is null;

alter table public.user_moderation_restrictions enable row level security;

revoke all on public.user_moderation_restrictions from public;
revoke all on public.user_moderation_restrictions from anon;
revoke all on public.user_moderation_restrictions from authenticated;

drop policy if exists "users_can_read_own_moderation_restrictions" on public.user_moderation_restrictions;
create policy "users_can_read_own_moderation_restrictions"
  on public.user_moderation_restrictions
  for select
  to authenticated
  using (auth.uid() = user_id);

create or replace function public.is_user_restriction_active(
  p_user_id uuid,
  p_restriction_key text,
  p_at timestamptz default now()
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.user_moderation_restrictions umr
    where umr.user_id = p_user_id
      and umr.restriction_key = p_restriction_key
      and umr.disabled_at is null
      and umr.enabled_at <= p_at
      and umr.expires_at > p_at
  );
$$;

revoke all on function public.is_user_restriction_active(uuid, text, timestamptz) from public;
revoke all on function public.is_user_restriction_active(uuid, text, timestamptz) from anon;
grant execute on function public.is_user_restriction_active(uuid, text, timestamptz) to authenticated;
grant execute on function public.is_user_restriction_active(uuid, text, timestamptz) to service_role;

create or replace function public.get_my_active_restrictions()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  with mine as (
    select
      umr.restriction_key,
      umr.enabled_at,
      umr.expires_at,
      umr.source,
      umr.note
    from public.user_moderation_restrictions umr
    where umr.user_id = auth.uid()
      and umr.disabled_at is null
      and umr.expires_at > now()
      and umr.enabled_at <= now()
  )
  select coalesce(
    jsonb_object_agg(
      mine.restriction_key,
      jsonb_build_object(
        'active', true,
        'enabled_at', mine.enabled_at,
        'expires_at', mine.expires_at,
        'source', mine.source,
        'note', mine.note
      )
    ),
    '{}'::jsonb
  )
  from mine;
$$;

revoke all on function public.get_my_active_restrictions() from public;
revoke all on function public.get_my_active_restrictions() from anon;
grant execute on function public.get_my_active_restrictions() to authenticated;
grant execute on function public.get_my_active_restrictions() to service_role;

create or replace function public.get_users_with_active_restriction(
  p_user_ids uuid[],
  p_restriction_key text
)
returns table(user_id uuid)
language sql
security definer
set search_path = public
stable
as $$
  select distinct umr.user_id
  from public.user_moderation_restrictions umr
  where umr.user_id = any(coalesce(p_user_ids, '{}'::uuid[]))
    and umr.restriction_key = p_restriction_key
    and umr.disabled_at is null
    and umr.enabled_at <= now()
    and umr.expires_at > now();
$$;

revoke all on function public.get_users_with_active_restriction(uuid[], text) from public;
revoke all on function public.get_users_with_active_restriction(uuid[], text) from anon;
grant execute on function public.get_users_with_active_restriction(uuid[], text) to authenticated;
grant execute on function public.get_users_with_active_restriction(uuid[], text) to service_role;

create or replace function public.admin_set_user_restriction(
  p_target_user_id uuid,
  p_restriction_key text,
  p_enabled boolean,
  p_note text default null,
  p_source text default 'manual'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_is_admin boolean := false;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_now timestamptz := now();
  v_expires_at timestamptz := now() + interval '72 hours';
  v_source text := case when lower(coalesce(p_source, 'manual')) = 'automation' then 'automation' else 'manual' end;
  v_active_flags jsonb := '{}'::jsonb;
  v_current_state text;
  v_row_count bigint := 0;
begin
  if v_actor is null then
    raise exception 'auth_required';
  end if;

  select (coalesce(p.is_admin, false) = true or lower(coalesce(p.user_role, '')) = 'admin')
  into v_is_admin
  from public.profiles p
  where p.id = v_actor;

  if coalesce(v_is_admin, false) is not true then
    raise exception 'not_authorized';
  end if;

  if p_target_user_id is null then
    raise exception 'target_user_required';
  end if;

  if p_restriction_key not in (
    'chat_disabled',
    'discovery_hidden',
    'social_posting_disabled',
    'marketplace_hidden',
    'service_disabled',
    'map_hidden',
    'map_disabled'
  ) then
    raise exception 'invalid_restriction_key';
  end if;

  if p_enabled then
    insert into public.user_moderation_restrictions(
      user_id,
      restriction_key,
      enabled_at,
      expires_at,
      enabled_by,
      source,
      note,
      metadata,
      created_at,
      updated_at
    ) values (
      p_target_user_id,
      p_restriction_key,
      v_now,
      v_expires_at,
      v_actor,
      v_source,
      v_note,
      jsonb_build_object('configured_ttl_hours', 72),
      v_now,
      v_now
    );
  else
    update public.user_moderation_restrictions
      set disabled_at = v_now,
          disabled_by = v_actor,
          updated_at = v_now
    where user_id = p_target_user_id
      and restriction_key = p_restriction_key
      and disabled_at is null
      and expires_at > v_now;
  end if;

  select coalesce(
      jsonb_object_agg(umr.restriction_key, true),
      '{}'::jsonb
    )
  into v_active_flags
  from public.user_moderation_restrictions umr
  where umr.user_id = p_target_user_id
    and umr.disabled_at is null
    and umr.enabled_at <= v_now
    and umr.expires_at > v_now;

  select um.moderation_state into v_current_state
  from public.user_moderation um
  where um.user_id = p_target_user_id;

  insert into public.user_moderation(
    user_id,
    moderation_state,
    restriction_flags,
    reason_internal,
    updated_at
  )
  values (
    p_target_user_id,
    case
      when (select count(*) from jsonb_object_keys(v_active_flags)) > 0 then 'shadow_restricted'
      else coalesce(v_current_state, 'active')
    end,
    v_active_flags,
    v_note,
    v_now
  )
  on conflict (user_id) do update
    set moderation_state = case
          when (select count(*) from jsonb_object_keys(v_active_flags)) > 0 then 'shadow_restricted'
          when public.user_moderation.moderation_state = 'shadow_restricted' then 'active'
          else public.user_moderation.moderation_state
        end,
        restriction_flags = v_active_flags,
        reason_internal = coalesce(excluded.reason_internal, public.user_moderation.reason_internal),
        updated_at = v_now;

  select count(*) into v_row_count
  from public.user_moderation_restrictions umr
  where umr.user_id = p_target_user_id
    and umr.restriction_key = p_restriction_key
    and umr.disabled_at is null
    and umr.expires_at > v_now;

  insert into public.admin_audit_logs(actor_id, action, target_user_id, notes, details)
  values (
    v_actor,
    case when p_enabled then 'reports_restriction_enabled' else 'reports_restriction_disabled' end,
    p_target_user_id,
    coalesce(v_note, case when p_enabled then 'restriction_enabled' else 'restriction_disabled' end),
    jsonb_build_object(
      'source', v_source,
      'restriction_key', p_restriction_key,
      'enabled', p_enabled,
      'enabled_at', case when p_enabled then v_now else null end,
      'expires_at', case when p_enabled then v_expires_at else null end,
      'active_flags', v_active_flags,
      'active_row_count', v_row_count
    )
  );

  return jsonb_build_object(
    'ok', true,
    'restriction_key', p_restriction_key,
    'enabled', p_enabled,
    'enabled_at', case when p_enabled then v_now else null end,
    'expires_at', case when p_enabled then v_expires_at else null end,
    'active_flags', v_active_flags,
    'active_row_count', v_row_count
  );
end;
$$;

revoke all on function public.admin_set_user_restriction(uuid, text, boolean, text, text) from public;
revoke all on function public.admin_set_user_restriction(uuid, text, boolean, text, text) from anon;
grant execute on function public.admin_set_user_restriction(uuid, text, boolean, text, text) to authenticated;
grant execute on function public.admin_set_user_restriction(uuid, text, boolean, text, text) to service_role;

create or replace function public.admin_clear_user_restrictions(
  p_target_user_id uuid,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_is_admin boolean := false;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_now timestamptz := now();
  v_disabled_count integer := 0;
begin
  if v_actor is null then
    raise exception 'auth_required';
  end if;

  select (coalesce(p.is_admin, false) = true or lower(coalesce(p.user_role, '')) = 'admin')
  into v_is_admin
  from public.profiles p
  where p.id = v_actor;

  if coalesce(v_is_admin, false) is not true then
    raise exception 'not_authorized';
  end if;

  if p_target_user_id is null then
    raise exception 'target_user_required';
  end if;

  update public.user_moderation_restrictions
    set disabled_at = v_now,
        disabled_by = v_actor,
        updated_at = v_now
  where user_id = p_target_user_id
    and disabled_at is null
    and expires_at > v_now;

  get diagnostics v_disabled_count = row_count;

  update public.user_moderation
    set restriction_flags = '{}'::jsonb,
        moderation_state = case when moderation_state = 'shadow_restricted' then 'active' else moderation_state end,
        reason_internal = coalesce(v_note, reason_internal),
        updated_at = v_now
  where user_id = p_target_user_id;

  insert into public.admin_audit_logs(actor_id, action, target_user_id, notes, details)
  values (
    v_actor,
    'reports_clear_restrictions_manual',
    p_target_user_id,
    coalesce(v_note, 'restrictions_cleared_early'),
    jsonb_build_object(
      'source', 'manual',
      'disabled_count', v_disabled_count,
      'cleared_at', v_now
    )
  );

  return jsonb_build_object('ok', true, 'disabled_count', v_disabled_count, 'cleared_at', v_now);
end;
$$;

revoke all on function public.admin_clear_user_restrictions(uuid, text) from public;
revoke all on function public.admin_clear_user_restrictions(uuid, text) from anon;
grant execute on function public.admin_clear_user_restrictions(uuid, text) to authenticated;
grant execute on function public.admin_clear_user_restrictions(uuid, text) to service_role;

alter table public.user_reports
  add column if not exists source_origin text null;

update public.user_reports
set source_origin = coalesce(source_origin, 'unknown')
where source_origin is null;

create or replace function public.process_user_report(
  p_target_id uuid,
  p_categories text[],
  p_details text default null,
  p_attachment_urls text[] default '{}'::text[],
  p_source text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reporter_id uuid := auth.uid();
  v_existing_report_id uuid;
  v_report_id uuid;
  v_final_score integer := 0;
  v_rolling_risk integer := 0;
  v_new_status text;
  v_expires_at timestamptz;
  v_immediate boolean := false;
  v_source text := lower(trim(coalesce(p_source, 'unknown')));
begin
  if v_reporter_id is null then
    raise exception 'auth_required';
  end if;

  if p_target_id is null then
    raise exception 'target_required';
  end if;

  if p_target_id = v_reporter_id then
    raise exception 'cannot_report_self';
  end if;

  if coalesce(array_length(p_categories, 1), 0) = 0 then
    raise exception 'category_required';
  end if;

  if v_source not in ('chat', 'group chat', 'social', 'map', 'maps', 'service chats', 'service', 'friends chats', 'other', 'unknown') then
    v_source := 'unknown';
  end if;

  select coalesce(sum(public.report_category_weight(cat)), 0)
  into v_final_score
  from unnest(p_categories) as cat;

  if (
    'Unsafe or harmful behavior (online or in-person)' = any(p_categories) or
    'Scams, money requests, or promotions'             = any(p_categories) or
    'Hate, discrimination, or threats'                 = any(p_categories)
  ) then
    v_immediate := true;
  end if;

  select id into v_existing_report_id
  from public.user_reports
  where reporter_id = v_reporter_id
    and target_id   = p_target_id
    and is_scored   = true
    and window_start > (now() - interval '30 days')
  limit 1;

  if v_existing_report_id is not null then
    update public.user_reports
    set
      attachment_urls = attachment_urls || coalesce(p_attachment_urls, '{}'),
      details = coalesce(details, '') || E'\n---\n' || coalesce(p_details, ''),
      source_origin = coalesce(nullif(v_source, ''), source_origin, 'unknown')
    where id = v_existing_report_id;
    return jsonb_build_object('action', 'evidence_appended', 'report_id', v_existing_report_id);
  end if;

  insert into public.user_reports
    (reporter_id, target_id, categories, score, details, attachment_urls, source_origin, is_scored, window_start)
  values
    (v_reporter_id, p_target_id, p_categories, v_final_score, p_details, coalesce(p_attachment_urls, '{}'), coalesce(nullif(v_source, ''), 'unknown'), true, now())
  returning id into v_report_id;

  select coalesce(sum(score), 0)
  into v_rolling_risk
  from public.user_reports
  where target_id  = p_target_id
    and is_scored  = true
    and window_start > (now() - interval '30 days');

  if v_immediate then
    v_new_status := 'suspended';
    v_expires_at := now() + interval '72 hours';
  elsif v_rolling_risk between 5 and 6 then
    v_new_status := 'restricted';
    v_expires_at := now() + interval '24 hours';
  elsif v_rolling_risk between 7 and 8 then
    v_new_status := 'restricted';
    v_expires_at := now() + interval '72 hours';
  elsif v_rolling_risk between 9 and 11 then
    v_new_status := 'suspended';
    v_expires_at := now() + interval '7 days';
  elsif v_rolling_risk between 12 and 14 then
    v_new_status := 'suspended';
    v_expires_at := now() + interval '30 days';
  elsif v_rolling_risk >= 15 then
    v_new_status := 'removed';
    v_expires_at := null;
  end if;

  if v_new_status is not null then
    update public.profiles
    set
      account_status = case
        when account_status = 'removed'   then 'removed'
        when account_status = 'suspended' and v_new_status = 'restricted' then 'suspended'
        else v_new_status
      end,
      restriction_expires_at = case
        when v_new_status = 'restricted' then v_expires_at
        else restriction_expires_at
      end,
      suspension_expires_at = case
        when v_new_status = 'suspended' then v_expires_at
        when v_new_status = 'removed'   then null
        else suspension_expires_at
      end
    where id = p_target_id;
  end if;

  return jsonb_build_object(
    'action',       coalesce(v_new_status::text, 'none'),
    'report_id',    v_report_id,
    'score',        v_final_score,
    'rolling_risk', v_rolling_risk,
    'source_origin', v_source
  );
end;
$$;

revoke all on function public.process_user_report(uuid, text[], text, text[], text) from public;
revoke all on function public.process_user_report(uuid, text[], text, text[], text) from anon;
grant execute on function public.process_user_report(uuid, text[], text, text[], text) to authenticated;
grant execute on function public.process_user_report(uuid, text[], text, text[], text) to service_role;

create or replace function public.create_service_chat(p_provider_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requester_id uuid := auth.uid();
  v_existing_chat_id uuid;
  v_chat_id uuid;
begin
  if v_requester_id is null then
    raise exception 'not_authenticated';
  end if;
  if p_provider_id is null then
    raise exception 'provider_required';
  end if;
  if v_requester_id = p_provider_id then
    raise exception 'cannot_create_service_chat_with_self';
  end if;

  if public.is_user_restriction_active(v_requester_id, 'service_disabled', now()) then
    raise exception 'service_access_disabled';
  end if;

  if public.is_user_restriction_active(p_provider_id, 'marketplace_hidden', now()) then
    raise exception 'provider_marketplace_hidden';
  end if;

  if not exists (select 1 from public.profiles where id = v_requester_id) then
    raise exception 'requester_profile_missing';
  end if;

  if not exists (select 1 from public.profiles where id = p_provider_id) then
    raise exception 'provider_profile_missing';
  end if;

  if not public.can_request_service_from_provider(p_provider_id) then
    raise exception 'provider_not_requestable';
  end if;

  select sc.chat_id
  into v_existing_chat_id
  from public.service_chats sc
  where sc.requester_id = v_requester_id
    and sc.provider_id = p_provider_id
    and sc.status in ('pending', 'booked', 'in_progress')
  order by sc.updated_at desc nulls last
  limit 1;

  if v_existing_chat_id is not null then
    return v_existing_chat_id;
  end if;

  insert into public.chats (type, created_by)
  values ('service', v_requester_id)
  returning id into v_chat_id;

  insert into public.chat_room_members (chat_id, user_id)
  values (v_chat_id, v_requester_id), (v_chat_id, p_provider_id);

  insert into public.service_chats (
    chat_id, requester_id, provider_id, status, request_opened_at
  )
  values (
    v_chat_id, v_requester_id, p_provider_id, 'pending', now()
  );

  return v_chat_id;
end;
$$;

create or replace function public.block_chat_message_when_restricted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_user_restriction_active(new.sender_id, 'chat_disabled', now()) then
    raise exception 'chat_disabled_restriction_active';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_block_chat_message_when_restricted on public.chat_messages;
create trigger trg_block_chat_message_when_restricted
before insert on public.chat_messages
for each row
execute function public.block_chat_message_when_restricted();

create or replace function public.block_social_post_when_restricted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
begin
  v_actor := coalesce((to_jsonb(new)->>'user_id')::uuid, auth.uid());
  if v_actor is not null and public.is_user_restriction_active(v_actor, 'social_posting_disabled', now()) then
    raise exception 'social_posting_disabled_restriction_active';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_block_thread_insert_when_restricted on public.threads;
create trigger trg_block_thread_insert_when_restricted
before insert on public.threads
for each row
execute function public.block_social_post_when_restricted();

drop trigger if exists trg_block_thread_comment_insert_when_restricted on public.thread_comments;
create trigger trg_block_thread_comment_insert_when_restricted
before insert on public.thread_comments
for each row
execute function public.block_social_post_when_restricted();

create or replace function public.block_map_alert_create_when_restricted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
begin
  v_actor := coalesce(new.creator_id, auth.uid());
  if v_actor is not null and public.is_user_restriction_active(v_actor, 'map_disabled', now()) then
    raise exception 'map_disabled_restriction_active';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_block_map_alert_create_when_restricted on public.broadcast_alerts;
create trigger trg_block_map_alert_create_when_restricted
before insert on public.broadcast_alerts
for each row
execute function public.block_map_alert_create_when_restricted();

-- Keep existing map read-model functions unchanged in this migration to avoid return-signature drift.
-- Map-hidden read filtering is handled in application read adapters in this pass.

create or replace function public.social_discovery_restricted(
  p_user_id uuid,
  p_lat double precision,
  p_lng double precision,
  p_radius_m integer,
  p_min_age integer,
  p_max_age integer,
  p_role text default null,
  p_gender text default null,
  p_species text[] default null,
  p_pet_size text default null,
  p_advanced boolean default false,
  p_height_min numeric default null,
  p_height_max numeric default null,
  p_only_waved boolean default false,
  p_active_only boolean default false
)
returns table(
  id uuid,
  display_name text,
  avatar_url text,
  is_verified boolean,
  has_car boolean,
  bio text,
  relationship_status text,
  dob date,
  location_name text,
  occupation text,
  school text,
  major text,
  gender_genre text,
  orientation text,
  height numeric,
  weight numeric,
  weight_unit text,
  tier text,
  pets jsonb,
  pet_species text[],
  pet_size text,
  social_album text[],
  show_occupation boolean,
  show_academic boolean,
  show_bio boolean,
  show_relationship_status boolean,
  show_age boolean,
  show_gender boolean,
  show_orientation boolean,
  show_height boolean,
  show_weight boolean,
  social_role text,
  score numeric
)
language sql
security definer
set search_path to 'public'
as $$
  select *
  from public.social_discovery(
    p_user_id,
    p_lat,
    p_lng,
    p_radius_m,
    p_min_age,
    p_max_age,
    p_role,
    p_gender,
    p_species,
    p_pet_size,
    p_advanced,
    p_height_min,
    p_height_max,
    p_only_waved,
    p_active_only
  )
  where not public.is_user_restriction_active(id, 'discovery_hidden', now());
$$;

revoke all on function public.social_discovery_restricted(uuid, double precision, double precision, integer, integer, integer, text, text, text[], text, boolean, numeric, numeric, boolean, boolean) from public;
revoke all on function public.social_discovery_restricted(uuid, double precision, double precision, integer, integer, integer, text, text, text[], text, boolean, numeric, numeric, boolean, boolean) from anon;
grant execute on function public.social_discovery_restricted(uuid, double precision, double precision, integer, integer, integer, text, text, text[], text, boolean, numeric, numeric, boolean, boolean) to authenticated;
grant execute on function public.social_discovery_restricted(uuid, double precision, double precision, integer, integer, integer, text, text, text[], text, boolean, numeric, numeric, boolean, boolean) to service_role;

drop view if exists public.view_admin_reports_queue;
create or replace view public.view_admin_reports_queue as
with reports as (
  select
    ur.target_id as target_user_id,
    count(*)::bigint as report_count,
    count(distinct ur.reporter_id)::bigint as unique_reporters,
    coalesce(sum(ur.score), 0)::bigint as total_score,
    max(ur.created_at) as latest_report_at,
    bool_or(cardinality(coalesce(ur.attachment_urls, '{}'::text[])) > 0) as has_attachments,
    array_remove(array_agg(distinct cat.category), null) as category_tags,
    max(ur.source_origin) filter (where ur.created_at = (select max(ur2.created_at) from public.user_reports ur2 where ur2.target_id = ur.target_id)) as latest_report_source
  from public.user_reports ur
  left join lateral unnest(ur.categories) as cat(category) on true
  group by ur.target_id
)
select
  r.target_user_id,
  tp.display_name as target_display_name,
  tp.social_id as target_social_id,
  r.report_count,
  r.unique_reporters,
  r.total_score,
  r.latest_report_at,
  r.has_attachments,
  coalesce(r.category_tags, '{}'::text[]) as category_tags,
  coalesce(r.latest_report_source, 'unknown') as latest_report_source,
  sr_latest.subject as latest_support_subject,
  sr_latest.message as latest_support_message,
  sr_latest.created_at as latest_support_created_at,
  coalesce(um.moderation_state, 'active') as moderation_state,
  coalesce(um.automation_paused, false) as automation_paused,
  coalesce(um.restriction_flags, '{}'::jsonb) as restriction_flags,
  coalesce(um.case_status, 'open') as case_status,
  latest_audit.action_source as latest_action_source,
  latest_audit.action as latest_action,
  latest_audit.created_at as latest_action_at,
  latest_audit.actor_id as latest_action_by_id,
  latest_audit.actor_display_name as latest_action_by_display_name
from reports r
left join public.profiles tp on tp.id = r.target_user_id
left join public.user_moderation um on um.user_id = r.target_user_id
left join lateral (
  select sr.subject, sr.message, sr.created_at
  from public.support_requests sr
  where sr.user_id = r.target_user_id
    and lower(coalesce(sr.category, '')) = 'user_report'
  order by sr.created_at desc nulls last
  limit 1
) sr_latest on true
left join lateral (
  select
    aal.action,
    aal.created_at,
    aal.actor_id,
    actor_profile.display_name as actor_display_name,
    case
      when lower(coalesce(aal.details->>'source', '')) = 'sentinel' then 'sentinel'
      else 'manual'
    end as action_source
  from public.admin_audit_logs aal
  left join public.profiles actor_profile on actor_profile.id = aal.actor_id
  where aal.target_user_id = r.target_user_id
    and aal.action like 'reports_%'
  order by aal.created_at desc nulls last
  limit 1
) latest_audit on true
where exists (
  select 1
  from public.profiles p
  where p.id = auth.uid()
    and (coalesce(p.is_admin, false) = true or lower(coalesce(p.user_role, '')) = 'admin')
);

drop view if exists public.view_admin_report_casefile;
create or replace view public.view_admin_report_casefile as
select
  ur.id as report_id,
  ur.target_id as target_user_id,
  ur.reporter_id as reporter_user_id,
  ur.categories,
  ur.score,
  ur.details,
  ur.attachment_urls,
  coalesce(ur.source_origin, 'unknown') as source_origin,
  ur.created_at as report_created_at,
  target_profile.display_name as target_display_name,
  target_profile.social_id as target_social_id,
  reporter_profile.display_name as reporter_display_name,
  reporter_profile.social_id as reporter_social_id,
  sr_latest.id as support_request_id,
  sr_latest.subject as support_subject,
  sr_latest.message as support_message,
  sr_latest.created_at as support_created_at,
  coalesce(um.moderation_state, 'active') as moderation_state,
  coalesce(um.automation_paused, false) as automation_paused,
  coalesce(um.restriction_flags, '{}'::jsonb) as restriction_flags,
  coalesce(um.case_status, 'open') as case_status,
  um.reason_internal as moderation_note,
  coalesce(rfp.false_report_count, 0) as reporter_false_report_count
from public.user_reports ur
left join public.profiles target_profile on target_profile.id = ur.target_id
left join public.profiles reporter_profile on reporter_profile.id = ur.reporter_id
left join public.user_moderation um on um.user_id = ur.target_id
left join public.reporter_false_report_penalties rfp on rfp.reporter_user_id = ur.reporter_id
left join lateral (
  select sr.id, sr.subject, sr.message, sr.created_at
  from public.support_requests sr
  where sr.user_id = ur.target_id
    and lower(coalesce(sr.category, '')) = 'user_report'
  order by sr.created_at desc nulls last
  limit 1
) sr_latest on true
where exists (
  select 1
  from public.profiles p
  where p.id = auth.uid()
    and (coalesce(p.is_admin, false) = true or lower(coalesce(p.user_role, '')) = 'admin')
);

revoke all on public.view_admin_reports_queue from public;
revoke all on public.view_admin_report_casefile from public;
grant select on public.view_admin_reports_queue to authenticated;
grant select on public.view_admin_report_casefile to authenticated;
grant select on public.view_admin_reports_queue to service_role;
grant select on public.view_admin_report_casefile to service_role;

commit;
