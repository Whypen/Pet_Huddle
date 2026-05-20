


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'Huddle V14 Revenue & Monetization System - Production Ready';



CREATE TYPE "public"."account_status_enum" AS ENUM (
    'active',
    'restricted',
    'suspended',
    'removed'
);


ALTER TYPE "public"."account_status_enum" OWNER TO "postgres";


CREATE TYPE "public"."tier_enum" AS ENUM (
    'free',
    'plus'
);


ALTER TYPE "public"."tier_enum" OWNER TO "postgres";


CREATE TYPE "public"."verification_status_enum" AS ENUM (
    'unverified',
    'pending',
    'verified'
);


ALTER TYPE "public"."verification_status_enum" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_qms_cycle_month_start"("p_owner_id" "uuid") RETURNS "date"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public'
    AS $$
declare
  tier text;
  anchor_day int;
  anchor_ts timestamptz;
  today date := current_date;
  base_year int := extract(year from today)::int;
  base_month int := extract(month from today)::int;
  prev date := (date_trunc('month', today) - interval '1 month')::date;
  prev_year int := extract(year from prev)::int;
  prev_month int := extract(month from prev)::int;
  last_day_this_month int := extract(day from (date_trunc('month', today) + interval '1 month - 1 day'))::int;
  last_day_prev_month int := extract(day from (date_trunc('month', prev) + interval '1 month - 1 day'))::int;
  this_anchor date;
  prev_anchor date;
begin
  tier := public._qms_effective_tier(p_owner_id);

  -- Free uses calendar month (no subscription anniversary).
  if tier not in ('plus', 'gold') then
    return date_trunc('month', today)::date;
  end if;

  select p.subscription_start
    into anchor_ts
  from public.profiles p
  where p.id = p_owner_id;

  if anchor_ts is not null then
    anchor_day := extract(day from anchor_ts at time zone 'utc')::int;
  else
    select coalesce(p.subscription_cycle_anchor_day, 1)
      into anchor_day
    from public.profiles p
    where p.id = p_owner_id;
  end if;

  if anchor_day < 1 then anchor_day := 1; end if;
  if anchor_day > 31 then anchor_day := 31; end if;

  this_anchor := make_date(base_year, base_month, least(anchor_day, last_day_this_month));
  prev_anchor := make_date(prev_year, prev_month, least(anchor_day, last_day_prev_month));

  if today >= this_anchor then
    return this_anchor;
  end if;
  return prev_anchor;
end;
$$;


ALTER FUNCTION "public"."_qms_cycle_month_start"("p_owner_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_qms_effective_tier"("p_user_id" "uuid") RETURNS "text"
    LANGUAGE "sql" STABLE
    AS $$
  -- Some environments do not have a physical profiles.effective_tier column.
  -- Use row_to_json(...) access to tolerate absence while still honoring it when present.
  select coalesce(nullif((row_to_json(p)::jsonb->>'effective_tier'), ''), p.tier, 'free')
  from public.profiles p
  where p.id = p_user_id;
$$;


ALTER FUNCTION "public"."_qms_effective_tier"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_qms_get_pool_owner"("p_user_id" "uuid") RETURNS "uuid"
    LANGUAGE "sql" STABLE
    AS $$
  select coalesce(
    (
      select fm.inviter_user_id
      from public.family_members fm
      where fm.invitee_user_id = p_user_id
        and fm.status = 'accepted'
      limit 1
    ),
    p_user_id
  );
$$;


ALTER FUNCTION "public"."_qms_get_pool_owner"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_qms_touch_row"("p_owner_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.user_quotas (user_id)
  values (p_owner_id)
  on conflict (user_id) do nothing;
end;
$$;


ALTER FUNCTION "public"."_qms_touch_row"("p_owner_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."accept_group_chat_invite"("p_chat_id" "uuid") RETURNS TABLE("joined" boolean, "joined_chat_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid := auth.uid();
  v_invite_id uuid;
  v_name text;
begin
  if v_user_id is null then
    raise exception 'auth_required';
  end if;

  if p_chat_id is null then
    raise exception 'missing_chat_id';
  end if;

  select gci.id
  into v_invite_id
  from public.group_chat_invites gci
  where gci.chat_id = p_chat_id
    and gci.invitee_user_id = v_user_id
    and gci.status = 'pending'
  order by gci.created_at desc
  limit 1;

  if v_invite_id is null then
    return query select false, p_chat_id;
    return;
  end if;

  update public.group_chat_invites gci
  set status = 'accepted',
      responded_at = now()
  where gci.id = v_invite_id
    and gci.status = 'pending';

  insert into public.chat_room_members(chat_id, user_id)
  values (p_chat_id, v_user_id)
  on conflict (chat_id, user_id) do nothing;

  select coalesce(p.display_name, 'Someone')
  into v_name
  from public.profiles p
  where p.id = v_user_id;

  insert into public.chat_messages(chat_id, sender_id, content)
  values (p_chat_id, v_user_id, coalesce(v_name, 'Someone') || ' just joined the chat.');

  return query select true, p_chat_id;
end;
$$;


ALTER FUNCTION "public"."accept_group_chat_invite"("p_chat_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."accept_group_chat_invite_by_id"("p_invite_id" "uuid") RETURNS TABLE("joined" boolean, "joined_chat_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid := auth.uid();
  v_target_chat_id uuid;
  v_name text;
begin
  if v_user_id is null then
    raise exception 'auth_required';
  end if;

  if p_invite_id is null then
    raise exception 'missing_invite_id';
  end if;

  select gci.chat_id
  into v_target_chat_id
  from public.group_chat_invites gci
  where gci.id = p_invite_id
    and gci.invitee_user_id = v_user_id
    and gci.status = 'pending'
  limit 1;

  if v_target_chat_id is null then
    return query select false, null::uuid;
    return;
  end if;

  update public.group_chat_invites gci
  set status = 'accepted',
      responded_at = now()
  where gci.id = p_invite_id
    and gci.invitee_user_id = v_user_id
    and gci.status = 'pending';

  insert into public.chat_room_members(chat_id, user_id)
  values (v_target_chat_id, v_user_id)
  on conflict (chat_id, user_id) do nothing;

  select coalesce(p.display_name, 'Someone')
  into v_name
  from public.profiles p
  where p.id = v_user_id;

  insert into public.chat_messages(chat_id, sender_id, content)
  values (v_target_chat_id, v_user_id, coalesce(v_name, 'Someone') || ' just joined the chat.');

  return query select true, v_target_chat_id;
end;
$$;


ALTER FUNCTION "public"."accept_group_chat_invite_by_id"("p_invite_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."accept_mutual_wave"("p_target_user_id" "uuid") RETURNS TABLE("mutual" boolean, "match_created" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_actor_id uuid := auth.uid();
  v_user1 uuid;
  v_user2 uuid;
  v_inserted_match_id uuid;
begin
  if v_actor_id is null then
    raise exception 'auth_required';
  end if;

  if p_target_user_id is null or p_target_user_id = v_actor_id then
    raise exception 'invalid_target_user';
  end if;

  update public.waves
  set status = 'accepted',
      responded_at = coalesce(responded_at, now())
  where (
    (sender_id = v_actor_id and receiver_id = p_target_user_id) or
    (sender_id = p_target_user_id and receiver_id = v_actor_id)
  )
  and coalesce(status, 'pending') <> 'accepted';

  select exists (
    select 1
    from public.waves w1
    join public.waves w2
      on w2.sender_id = p_target_user_id
     and w2.receiver_id = v_actor_id
    where w1.sender_id = v_actor_id
      and w1.receiver_id = p_target_user_id
      and w1.status = 'accepted'
      and w2.status = 'accepted'
  )
  into mutual;

  if not mutual then
    return query select false, false;
    return;
  end if;

  if v_actor_id < p_target_user_id then
    v_user1 := v_actor_id;
    v_user2 := p_target_user_id;
  else
    v_user1 := p_target_user_id;
    v_user2 := v_actor_id;
  end if;

  insert into public.matches (user1_id, user2_id)
  values (v_user1, v_user2)
  on conflict (user1_id, user2_id) do nothing
  returning id into v_inserted_match_id;

  return query select true, (v_inserted_match_id is not null);
end;
$$;


ALTER FUNCTION "public"."accept_mutual_wave"("p_target_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_review_verification"("p_user_id" "uuid", "p_status" "public"."verification_status_enum", "p_comment" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if p_status not in ('unverified'::public.verification_status_enum, 'pending'::public.verification_status_enum, 'verified'::public.verification_status_enum) then
    raise exception 'invalid_verification_status';
  end if;

  update public.profiles
  set
    verification_status = p_status,
    verification_comment = case when p_status = 'unverified'::public.verification_status_enum then p_comment else null end,
    is_verified = (p_status = 'verified'::public.verification_status_enum)
  where id = p_user_id;
end;
$$;


ALTER FUNCTION "public"."admin_review_verification"("p_user_id" "uuid", "p_status" "public"."verification_status_enum", "p_comment" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."archive_broadcast_alert"("p_alert_id" "uuid", "p_actor_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  perform public.delete_broadcast_alert(p_alert_id);
  return p_alert_id;
end;
$$;


ALTER FUNCTION "public"."archive_broadcast_alert"("p_alert_id" "uuid", "p_actor_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."award_sitter_vouch"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  IF NEW.status = 'completed'
     AND (OLD.status IS DISTINCT FROM 'completed')
     AND NEW.dispute_flag = FALSE
     AND NEW.escrow_release_date IS NOT NULL
     AND NEW.escrow_release_date <= NOW() THEN
    UPDATE profiles
    SET vouch_score = COALESCE(vouch_score, 0) + 1
    WHERE id = NEW.sitter_id;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."award_sitter_vouch"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."block_user"("p_blocked_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'Unauthorized';
  end if;
  if p_blocked_id is null or p_blocked_id = v_actor then
    return;
  end if;

  insert into public.user_blocks(blocker_id, blocked_id)
  values (v_actor, p_blocked_id)
  on conflict (blocker_id, blocked_id) do nothing;
end;
$$;


ALTER FUNCTION "public"."block_user"("p_blocked_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."broadcast_alerts_set_geog"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.geog := st_setsrid(st_makepoint(new.longitude, new.latitude), 4326)::geography;
  return new;
end;
$$;


ALTER FUNCTION "public"."broadcast_alerts_set_geog"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."build_aggregation_copy"("p_kind" "text", "p_actor_names" "text"[], "p_count" integer) RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
declare
  v_verb text;
  v_subject text;
  v_name1 text;
  v_name2 text;
  v_n integer;
begin
  -- Verb + subject by kind
  case p_kind
    when 'like'       then v_verb := 'liked';       v_subject := 'your post';
    when 'comment'    then v_verb := 'commented on'; v_subject := 'your post';
    when 'reply'      then v_verb := 'replied to';   v_subject := 'your comment';
    when 'alert_like' then v_verb := 'showed support for'; v_subject := 'your alert';
    else                   v_verb := 'reacted to';  v_subject := 'your post';
  end case;

  -- Names: newest actor is last element in array
  v_name1 := coalesce(p_actor_names[array_length(p_actor_names, 1)], 'Someone');
  v_name2 := case when array_length(p_actor_names, 1) >= 2
                  then p_actor_names[array_length(p_actor_names, 1) - 1]
                  else null end;
  v_n := greatest(0, coalesce(p_count, 1) - 1);

  if p_count = 1 then
    return v_name1 || ' ' || v_verb || ' ' || v_subject;
  elsif p_count = 2 then
    return v_name1 || ' and ' || coalesce(v_name2, 'someone') || ' ' || v_verb || ' ' || v_subject;
  else
    return v_name1 || ' and ' || v_n::text || ' others ' || v_verb || ' ' || v_subject;
  end if;
end;
$$;


ALTER FUNCTION "public"."build_aggregation_copy"("p_kind" "text", "p_actor_names" "text"[], "p_count" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_deliver_notification"("p_user_id" "uuid", "p_category" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_pref public.notification_preferences%rowtype;
begin
  select * into v_pref from public.notification_preferences where user_id = p_user_id;

  if not found then
    insert into public.notification_preferences(user_id) values (p_user_id)
    on conflict (user_id) do nothing;
    select * into v_pref from public.notification_preferences where user_id = p_user_id;
  end if;

  -- Push master off → no push delivery (row still written by enqueue_notification)
  if v_pref.push_enabled is false or v_pref.pause_all is true then
    return false;
  end if;

  case lower(coalesce(p_category, ''))
    when 'social'    then return coalesce(v_pref.social, true);
    when 'chats'     then return coalesce(v_pref.chats, true);
    when 'map'       then return coalesce(v_pref.map, true);
    when 'pets'      then return coalesce(v_pref.pets, true);
    when 'services'  then return coalesce(v_pref.vet, true);   -- vet column = services
    when 'vet'       then return coalesce(v_pref.vet, true);   -- backward compat alias
    when 'systems'   then return coalesce(v_pref.email, true); -- email column = systems
    when 'email'     then return coalesce(v_pref.email, true); -- backward compat alias
    when 'reminders' then return true;                         -- always deliver reminders
    when 'admin'     then return true;                         -- always deliver admin
    else return true;
  end case;
end;
$$;


ALTER FUNCTION "public"."can_deliver_notification"("p_user_id" "uuid", "p_category" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_request_service_from_provider"("p_provider_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_listed boolean := false;
begin
  if p_provider_id is null then
    return false;
  end if;

  select exists (
    select 1
    from public.pet_care_profiles pcp
    where pcp.user_id = p_provider_id
      and coalesce(pcp.listed, false) = true
  ) into v_listed;

  return coalesce(v_listed, false);
end;
$$;


ALTER FUNCTION "public"."can_request_service_from_provider"("p_provider_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_and_increment_quota"("action_type" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  u_id uuid := auth.uid();
  owner_id uuid;
  tier text;
  q public.user_quotas%rowtype;
  today date := current_date;
  wk date := date_trunc('week', now())::date;
  mo date;

  limit_threads int := 10;
  limit_discovery int := 100;
  limit_media int := 5;
  limit_stars int := 0;
begin
  if u_id is null then
    return false;
  end if;

  owner_id := public._qms_get_pool_owner(u_id);
  tier := lower(public._qms_effective_tier(owner_id));

  -- Gold pools; free/plus are per-user.
  if tier <> 'gold' then
    owner_id := u_id;
    tier := lower(public._qms_effective_tier(owner_id));
  end if;

  perform public._qms_touch_row(owner_id);
  select * into q from public.user_quotas where user_id = owner_id;
  mo := public._qms_cycle_month_start(owner_id);

  -- Window resets (idempotent)
  if q.day_start <> today then
    q.day_start := today;
    q.thread_posts_today := 0;
    q.discovery_views_today := 0;
    q.discovery_profiles_today := 0;
    q.media_usage_today := 0;
    q.ai_vet_uploads_today := 0;
  end if;

  if q.week_start <> wk then
    q.week_start := wk;
    q.broadcast_alerts_week := 0;
    q.broadcast_week_used := 0;
  end if;

  if q.month_start <> mo then
    q.month_start := mo;
    q.stars_used_cycle := 0;
    q.stars_month_used := 0;
  end if;

  -- Tier limits
  if tier = 'plus' then
    limit_threads := 30;
    limit_discovery := 250;
    limit_media := 20;
    limit_stars := 4;
  elsif tier = 'gold' then
    limit_threads := 60;
    limit_discovery := 2147483647;
    limit_media := 40;
    limit_stars := 10;
  end if;

  -- Action routing
  if action_type = 'thread_post' then
    if q.thread_posts_today < limit_threads then
      q.thread_posts_today := q.thread_posts_today + 1;
    else
      return false;
    end if;

  elsif action_type in ('discovery_profile', 'discovery_view') then
    if tier <> 'gold' then
      if q.discovery_views_today >= limit_discovery then
        return false;
      end if;
      q.discovery_views_today := q.discovery_views_today + 1;
      q.discovery_profiles_today := q.discovery_views_today;
    end if;

  elsif action_type in ('media', 'ai_vet_upload', 'thread_image', 'chat_image', 'broadcast_media', 'video_upload') then
    -- Gold video uploads are allowed; free/plus blocked.
    if action_type = 'video_upload' and tier <> 'gold' then
      return false;
    end if;

    if q.media_usage_today < limit_media then
      q.media_usage_today := q.media_usage_today + 1;
      q.ai_vet_uploads_today := q.media_usage_today;
    elsif q.extra_media_10 > 0 then
      q.extra_media_10 := q.extra_media_10 - 1;
    else
      return false;
    end if;

  elsif action_type = 'star' then
    if q.stars_used_cycle < limit_stars then
      q.stars_used_cycle := q.stars_used_cycle + 1;
      q.stars_month_used := q.stars_used_cycle;
    elsif q.extra_stars > 0 then
      q.extra_stars := q.extra_stars - 1;
    else
      return false;
    end if;

  else
    -- Broadcast quota is enforced by map-alert contract triggers.
    return true;
  end if;

  update public.user_quotas
  set
    day_start = q.day_start,
    week_start = q.week_start,
    month_start = q.month_start,
    thread_posts_today = q.thread_posts_today,
    discovery_profiles_today = q.discovery_profiles_today,
    discovery_views_today = q.discovery_views_today,
    media_usage_today = q.media_usage_today,
    ai_vet_uploads_today = q.ai_vet_uploads_today,
    stars_month_used = q.stars_month_used,
    stars_used_cycle = q.stars_used_cycle,
    broadcast_week_used = q.broadcast_week_used,
    broadcast_alerts_week = q.broadcast_alerts_week,
    extras_stars = q.extras_stars,
    extra_stars = q.extra_stars,
    extras_ai_vet_uploads = q.extras_ai_vet_uploads,
    extra_media_10 = q.extra_media_10,
    extras_broadcasts = q.extras_broadcasts,
    extra_broadcast_72h = q.extra_broadcast_72h,
    updated_at = now()
  where user_id = owner_id;

  return true;
end;
$$;


ALTER FUNCTION "public"."check_and_increment_quota"("action_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_for_match"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  reverse_wave_exists BOOLEAN;
  user1 UUID;
  user2 UUID;
BEGIN
  IF NEW.status = 'accepted' THEN
    SELECT EXISTS(
      SELECT 1 FROM public.waves
      WHERE sender_id = NEW.receiver_id
      AND receiver_id = NEW.sender_id
      AND status = 'accepted'
    ) INTO reverse_wave_exists;
    
    IF reverse_wave_exists THEN
      IF NEW.sender_id < NEW.receiver_id THEN
        user1 := NEW.sender_id;
        user2 := NEW.receiver_id;
      ELSE
        user1 := NEW.receiver_id;
        user2 := NEW.sender_id;
      END IF;
      
      INSERT INTO public.matches (user1_id, user2_id)
      VALUES (user1, user2)
      ON CONFLICT (user1_id, user2_id) DO NOTHING;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."check_for_match"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_identifier_mfa"("p_email" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
declare
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_user_id uuid;
  v_has_totp boolean := false;
  v_has_passkey boolean := false;
begin
  if v_email is null then
    return jsonb_build_object(
      'registered', false,
      'has_totp', false,
      'has_passkey', false
    );
  end if;

  select u.id
    into v_user_id
  from auth.users u
  where lower(u.email) = v_email
  limit 1;

  if v_user_id is null then
    return jsonb_build_object(
      'registered', false,
      'has_totp', false,
      'has_passkey', false
    );
  end if;

  if to_regclass('auth.mfa_factors') is not null then
    select exists(
      select 1
      from auth.mfa_factors f
      where f.user_id = v_user_id
        and lower(coalesce(f.status::text, '')) = 'verified'
        and lower(coalesce(f.factor_type::text, '')) = 'totp'
    )
    into v_has_totp;

    select exists(
      select 1
      from auth.mfa_factors f
      where f.user_id = v_user_id
        and lower(coalesce(f.status::text, '')) = 'verified'
        and lower(coalesce(f.factor_type::text, '')) in ('webauthn', 'passkey')
    )
    into v_has_passkey;
  end if;

  return jsonb_build_object(
    'registered', true,
    'has_totp', v_has_totp,
    'has_passkey', v_has_passkey
  );
end;
$$;


ALTER FUNCTION "public"."check_identifier_mfa"("p_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_identifier_registered"("p_email" "text" DEFAULT NULL::"text", "p_phone" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
  with normalized as (
    select
      nullif(lower(btrim(coalesce(p_email, ''))), '') as email,
      nullif(btrim(coalesce(p_phone, '')), '') as phone
  )
  select jsonb_build_object(
    'registered',
    exists (
      select 1
      from normalized n
      where (n.email is not null and exists (
        select 1
        from auth.users u
        where lower(u.email) = n.email
      ))
      or (n.phone is not null and exists (
        select 1
        from auth.users u
        where btrim(coalesce(u.phone, '')) = n.phone
      ))
      or (n.phone is not null and exists (
        select 1
        from public.profiles p
        where btrim(coalesce(p.phone, '')) = n.phone
      ))
    )
  );
$$;


ALTER FUNCTION "public"."check_identifier_registered"("p_email" "text", "p_phone" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_scan_rate_limit"("user_uuid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  user_tier text;
  recent_scans int;
begin
  select tier::text into user_tier
  from public.profiles
  where id = user_uuid;

  if coalesce(user_tier, 'free') in ('plus', 'gold') then
    return true;
  end if;

  select count(*) into recent_scans
  from public.scan_rate_limits
  where user_id = user_uuid
    and scan_timestamp > now() - interval '24 hours';

  return recent_scans < 3;
end;
$$;


ALTER FUNCTION "public"."check_scan_rate_limit"("user_uuid" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."check_scan_rate_limit"("user_uuid" "uuid") IS 'Validates if user can perform a scan based on tier and recent usage (3 scans per 24 hours for free tier).';



CREATE OR REPLACE FUNCTION "public"."cleanup_chat_attachments_tmp"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  delete from storage.objects o
  where o.bucket_id = 'chat_attachments'
    and split_part(o.name, '/', 2) = 'tmp'
    and o.created_at < now() - interval '7 days';
end;
$$;


ALTER FUNCTION "public"."cleanup_chat_attachments_tmp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_expired_broadcast_alerts"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_deleted integer := 0;
  v_row record;
begin
  -- Notify creators before deletion
  for v_row in
    select id, creator_id
    from public.broadcast_alerts
    where (created_at + make_interval(hours => duration_hours)) <= now()
  loop
    if v_row.creator_id is not null then
      perform public.enqueue_notification(
        v_row.creator_id,
        'map',
        'broadcast_expired',
        'Alert expired',
        'Your alert has expired and is no longer visible',
        '/map',
        jsonb_build_object('alert_id', v_row.id)
      );
    end if;
  end loop;

  delete from public.broadcast_alerts
  where (created_at + make_interval(hours => duration_hours)) <= now();

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;


ALTER FUNCTION "public"."cleanup_expired_broadcast_alerts"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."cleanup_expired_broadcast_alerts"() IS 'Deletes broadcast alerts only after expiry + 7 days so expired markers remain visible on map.';



CREATE OR REPLACE FUNCTION "public"."cleanup_expired_map_alerts"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_deleted int := 0;
begin
  delete from public.map_alerts
  where expires_at is not null
    and expires_at <= now();
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;


ALTER FUNCTION "public"."cleanup_expired_map_alerts"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_alert_thread_and_pin"("payload" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_lat double precision;
  v_lng double precision;
  v_type text;
  v_title text;
  v_description text;
  v_photo_url text;
  v_images text[];
  v_address text;
  v_thread_id uuid := null;
  v_alert_id uuid;
  v_range_meters integer;
  v_range_km numeric(6,2);
  v_duration_hours integer;
  v_expires_at timestamptz;
  v_post_to_social boolean;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  v_lat := coalesce(nullif(payload->>'lat', '')::double precision, nullif(payload->>'latitude', '')::double precision);
  v_lng := coalesce(nullif(payload->>'lng', '')::double precision, nullif(payload->>'longitude', '')::double precision);
  if v_lat is null or v_lng is null then
    raise exception 'missing_coords' using errcode = '22023';
  end if;

  v_type := coalesce(nullif(payload->>'type', ''), nullif(payload->>'alert_type', ''), 'Others');
  if v_type not in ('Stray','Lost','Caution','Others') then
    v_type := 'Others';
  end if;

  v_title := nullif(payload->>'title', '');
  v_description := nullif(payload->>'description', '');
  v_images := coalesce(
    array(
      select x
      from jsonb_array_elements_text(coalesce(payload->'images', '[]'::jsonb)) as x
      where nullif(btrim(x), '') is not null
    ),
    '{}'::text[]
  );
  v_photo_url := coalesce(v_images[1], nullif(payload->>'photo_url', ''));
  v_address := coalesce(nullif(payload->>'address', ''), 'Pinned Location');
  v_range_meters := greatest(1000, least(150000, coalesce(nullif(payload->>'range_meters', '')::integer, 10000)));
  v_range_km := round((v_range_meters::numeric / 1000.0), 2);
  v_expires_at := coalesce(nullif(payload->>'expires_at', '')::timestamptz, now() + interval '12 hours');
  v_duration_hours := greatest(1, least(72, ceil(extract(epoch from (v_expires_at - now())) / 3600.0)::int));
  v_post_to_social := coalesce(
    (payload->>'post_on_social')::boolean,
    (payload->>'post_on_threads')::boolean,
    (payload->>'posted_to_threads')::boolean,
    false
  );

  insert into public.profiles (id, display_name, legal_name, updated_at)
  select
    v_uid,
    coalesce(nullif(btrim(coalesce(u.raw_user_meta_data->>'display_name', u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1))), ''), 'Huddle User'),
    coalesce(nullif(btrim(coalesce(u.raw_user_meta_data->>'legal_name', u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1))), ''), 'Huddle User'),
    now()
  from auth.users u
  where u.id = v_uid
    and not exists (select 1 from public.profiles p where p.id = v_uid);

  if v_post_to_social then
    insert into public.threads (
      user_id, title, content, tags, hashtags, images, is_map_alert, is_public
    ) values (
      v_uid,
      coalesce(v_title, format('%s Alert: %s', v_type, v_address)),
      coalesce(v_description, ''),
      array['News', v_type]::text[],
      array[]::text[],
      v_images,
      true,
      true
    )
    returning id into v_thread_id;
  end if;

  insert into public.broadcast_alerts (
    creator_id,
    type,
    title,
    description,
    address,
    duration_hours,
    range_km,
    latitude,
    longitude,
    photo_url,
    images,
    post_on_threads,
    thread_id
  ) values (
    v_uid,
    v_type,
    v_title,
    v_description,
    v_address,
    v_duration_hours,
    v_range_km,
    v_lat,
    v_lng,
    v_photo_url,
    v_images,
    v_post_to_social,
    v_thread_id
  )
  returning id into v_alert_id;

  perform public.enqueue_broadcast_notifications(v_alert_id);

  return jsonb_build_object('alert_id', v_alert_id, 'thread_id', v_thread_id);
end;
$$;


ALTER FUNCTION "public"."create_alert_thread_and_pin"("payload" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_match_chat"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  new_chat_id UUID;
BEGIN
  INSERT INTO public.chats (type, created_by)
  VALUES ('direct', NEW.user1_id)
  RETURNING id INTO new_chat_id;
  
  INSERT INTO public.chat_participants (chat_id, user_id)
  VALUES 
    (new_chat_id, NEW.user1_id),
    (new_chat_id, NEW.user2_id);
  
  UPDATE public.matches
  SET chat_id = new_chat_id
  WHERE id = NEW.id;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."create_match_chat"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_service_chat"("p_provider_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_requester_id uuid := auth.uid();
  v_existing_chat_id uuid;
  v_chat_id uuid;
  v_requester_verified boolean := false;
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

  if not exists (select 1 from public.profiles where id = v_requester_id) then
    raise exception 'requester_profile_missing';
  end if;

  if not exists (select 1 from public.profiles where id = p_provider_id) then
    raise exception 'provider_profile_missing';
  end if;

  select coalesce(pr.is_verified, false)
  into v_requester_verified
  from public.profiles pr
  where pr.id = v_requester_id;

  if not coalesce(v_requester_verified, false) then
    raise exception 'requester_not_verified';
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


ALTER FUNCTION "public"."create_service_chat"("p_provider_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_thread_mention_notifications"("p_actor_id" "uuid", "p_thread_id" "uuid", "p_recipient_ids" "uuid"[]) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_actor uuid := auth.uid();
  v_actor_name text;
  v_inserted int := 0;
  rec record;
begin
  if v_actor is null then
    raise exception 'Unauthorized';
  end if;

  if p_actor_id is not null and p_actor_id <> v_actor then
    raise exception 'Actor mismatch';
  end if;

  select coalesce(nullif(btrim(display_name), ''), 'Someone')
  into v_actor_name
  from public.profiles
  where id = v_actor;

  for rec in
    select distinct r as user_id
    from unnest(coalesce(p_recipient_ids, '{}'::uuid[])) as r
    where r is not null
      and r <> v_actor
      and not public.is_user_blocked(v_actor, r)
  loop
    perform public.enqueue_notification(
      rec.user_id,
      'social',
      'thread_mention',
      'New mention',
      v_actor_name || ' mentioned you in a post',
      '/threads?focus=' || p_thread_id::text,
      jsonb_build_object('thread_id', p_thread_id, 'actor_id', v_actor)
    );
    v_inserted := v_inserted + 1;
  end loop;

  return coalesce(v_inserted, 0);
end;
$$;


ALTER FUNCTION "public"."create_thread_mention_notifications"("p_actor_id" "uuid", "p_thread_id" "uuid", "p_recipient_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."debug_whoami"() RETURNS TABLE("current_user_name" "text", "session_user_name" "text", "auth_uid" "uuid")
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  SELECT current_user::text, session_user::text, auth.uid();
$$;


ALTER FUNCTION "public"."debug_whoami"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_broadcast_alert"("p_alert_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_thread uuid;
  v_is_admin boolean := false;
begin
  if v_uid is null then
    raise exception 'unauthorized';
  end if;

  select creator_id, thread_id into v_owner, v_thread
  from public.broadcast_alerts
  where id = p_alert_id
  for update;

  if not found then
    return false;
  end if;

  select coalesce(is_admin, false) or lower(coalesce(role, '')) = 'admin'
  into v_is_admin
  from public.profiles
  where id = v_uid;

  if v_owner <> v_uid and coalesce(v_is_admin, false) = false then
    raise exception 'forbidden';
  end if;

  update public.broadcast_alerts
  set archived_at = now()
  where id = p_alert_id;

  if v_thread is not null then
    update public.threads
    set map_id = null
    where id = v_thread;
  end if;

  return true;
end;
$$;


ALTER FUNCTION "public"."delete_broadcast_alert"("p_alert_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_broadcast_alert"("p_alert_id" "uuid", "p_actor_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  perform public.delete_broadcast_alert(p_alert_id);
  return p_alert_id;
end;
$$;


ALTER FUNCTION "public"."delete_broadcast_alert"("p_alert_id" "uuid", "p_actor_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_user_account"("p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- 1. Handle NO ACTION FK blockers (would prevent profiles cascade)
  delete from public.chat_messages where sender_id = p_user_id;
  update public.verification_uploads set reviewed_by = null where reviewed_by = p_user_id;

  -- 2. Delete profile → cascades to all ~50 tables that reference profiles
  delete from public.profiles where id = p_user_id;

  -- 3. Delete auth user → cascades to user_blocks (references auth.users directly)
  delete from auth.users where id = p_user_id;
end;
$$;


ALTER FUNCTION "public"."delete_user_account"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."downgrade_user_tier"("p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  update public.profiles
  set
    tier = 'free',
    subscription_status = 'canceled',
    stripe_subscription_id = null,
    stars_count = 0,
    mesh_alert_count = 5,
    media_credits = 0,
    updated_at = now()
  where id = p_user_id;
end;
$$;


ALTER FUNCTION "public"."downgrade_user_tier"("p_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."downgrade_user_tier"("p_user_id" "uuid") IS 'Downgrade user to free tier - only callable by service role via webhooks';



CREATE OR REPLACE FUNCTION "public"."enforce_map_alert_contract"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  u_id uuid := auth.uid();
  owner_id uuid;
  tier text;
  q public.user_quotas%rowtype;
  today date := current_date;
  wk date := date_trunc('week', now())::date;
  mo date;

  base_range int := 10000;
  base_dur interval := interval '12 hours';
  requested_dur interval;
  wants_extended boolean := false;
  used_extra boolean := false;
  limit_broadcast_week int := 5;
begin
  if u_id is null then
    if new.creator_id is null then
      raise exception 'unauthorized';
    end if;
    u_id := new.creator_id;
  end if;

  new.location_geog := ST_SetSRID(ST_MakePoint(new.longitude, new.latitude), 4326)::geography;

  if new.description is not null and length(new.description) > 1000 then
    raise exception 'description_too_long';
  end if;

  owner_id := public._qms_get_pool_owner(u_id);
  tier := public._qms_effective_tier(owner_id);
  if tier <> 'gold' then
    owner_id := u_id;
    tier := public._qms_effective_tier(owner_id);
  end if;

  perform public._qms_touch_row(owner_id);
  select * into q from public.user_quotas where user_id = owner_id for update;
  mo := public._qms_cycle_month_start(owner_id);

  if q.day_start <> today then
    q.day_start := today;
    q.thread_posts_today := 0;
    q.discovery_views_today := 0;
    q.discovery_profiles_today := 0;
    q.media_usage_today := 0;
    q.ai_vet_uploads_today := 0;
  end if;
  if q.week_start <> wk then
    q.week_start := wk;
    q.broadcast_alerts_week := 0;
    q.broadcast_week_used := 0;
  end if;
  if q.month_start <> mo then
    q.month_start := mo;
    q.stars_used_cycle := 0;
    q.stars_month_used := 0;
  end if;

  if tier = 'premium' then
    base_range := 25000;
    base_dur := interval '24 hours';
    limit_broadcast_week := 20;
  elsif tier = 'gold' then
    base_range := 50000;
    base_dur := interval '48 hours';
    limit_broadcast_week := 20;
  end if;

  if new.range_km is not null and new.range_meters is null then
    new.range_meters := round(new.range_km * 1000.0);
  end if;

  new.range_meters := coalesce(new.range_meters, base_range);
  if new.expires_at is null then
    if new.duration_hours is not null then
      new.expires_at := now() + make_interval(hours => new.duration_hours);
    else
      new.expires_at := now() + base_dur;
    end if;
  end if;
  requested_dur := new.expires_at - now();

  wants_extended := (new.range_meters > base_range) or (requested_dur > base_dur);

  if wants_extended then
    if q.extra_broadcast_72h > 0 then
      q.extra_broadcast_72h := q.extra_broadcast_72h - 1;
      used_extra := true;
      new.range_meters := 150000;
      new.expires_at := now() + interval '72 hours';
    else
      new.range_meters := base_range;
      new.expires_at := now() + base_dur;
    end if;
  else
    if new.range_meters > base_range then
      new.range_meters := base_range;
    end if;
    if requested_dur > base_dur then
      new.expires_at := now() + base_dur;
    end if;
  end if;

  if q.broadcast_alerts_week < limit_broadcast_week then
    q.broadcast_alerts_week := q.broadcast_alerts_week + 1;
    q.broadcast_week_used := q.broadcast_alerts_week;
  else
    if used_extra then
      null;
    elsif q.extra_broadcast_72h > 0 then
      q.extra_broadcast_72h := q.extra_broadcast_72h - 1;
      null;
    else
      raise exception 'quota_exceeded';
    end if;
  end if;

  update public.user_quotas
  set
    day_start = q.day_start,
    week_start = q.week_start,
    month_start = q.month_start,
    broadcast_alerts_week = q.broadcast_alerts_week,
    broadcast_week_used = q.broadcast_week_used,
    extra_broadcast_72h = q.extra_broadcast_72h,
    updated_at = now()
  where user_id = owner_id;

  new.range_km := round((new.range_meters::numeric) / 1000.0, 2);
  new.duration_hours := greatest(1, round(extract(epoch from (new.expires_at - now())) / 3600.0));

  return new;
end;
$$;


ALTER FUNCTION "public"."enforce_map_alert_contract"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enqueue_broadcast_notifications"("p_alert_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_alert record;
  v_district text;
  v_title text;
  v_body text;
  v_count int := 0;
  v_range_meters double precision := 1000;
  rec record;
begin
  select
    b.id,
    b.creator_id,
    lower(coalesce(b.type, 'others')) as type_norm,
    b.thread_id,
    nullif(btrim(to_jsonb(b)->>'location_district'), '') as alert_district,
    nullif(btrim(b.address), '') as alert_address,
    nullif(btrim(p.location_country), '') as location_country,
    coalesce(b.geog, p.location, p.location_geog) as source_geog,
    coalesce((b.range_km)::double precision, 150.0) as range_km
  into v_alert
  from public.broadcast_alerts b
  join public.profiles p on p.id = b.creator_id
  where b.id = p_alert_id;

  if not found then
    return 0;
  end if;

  -- Respect each alert's configured radius while keeping a safe bound.
  -- 1km minimum, 150km maximum.
  v_range_meters := greatest(1000.0, least(150000.0, v_alert.range_km * 1000.0));

  v_district := coalesce(
    v_alert.alert_district,
    nullif(btrim(split_part(coalesce(v_alert.alert_address, ''), ',', 2)), ''),
    nullif(btrim(split_part(coalesce(v_alert.alert_address, ''), ',', 1)), ''),
    v_alert.location_country,
    'your area'
  );

  if v_alert.type_norm = 'stray' then
    v_title := 'Stray pet spotted nearby';
    v_body := '💡 A stray was spotted near ' || v_district || ' — keep an eye out';
  elsif v_alert.type_norm = 'lost' then
    v_title := 'Lost pet reported nearby';
    v_body := '🚨 A pet is lost near ' || v_district || ' — help bring them home';
  elsif v_alert.type_norm = 'caution' then
    v_title := 'Caution raised nearby';
    v_body := '⚠️ A caution was raised near ' || v_district || ' — tap to see what''s happening';
  else
    v_title := 'New alert nearby';
    v_body := '📍 A new alert was posted near ' || v_district || ' — tap to see what''s happening';
  end if;

  for rec in
    select p.id
    from public.profiles p
    where not public.is_user_blocked(p.id, v_alert.creator_id)
      and coalesce(p.location, p.location_geog) is not null
      and v_alert.source_geog is not null
      and st_dwithin(
        coalesce(p.location, p.location_geog),
        v_alert.source_geog,
        v_range_meters
      )
  loop
    if not exists (
      select 1
      from public.notifications n
      where n.user_id = rec.id
        and coalesce(n.data, n.metadata)->>'kind' = 'broadcast_alert'
        and coalesce(n.data, n.metadata)->>'alert_id' = v_alert.id::text
    ) then
      perform public.enqueue_notification(
        rec.id,
        'map',
        'broadcast_alert',
        v_title,
        v_body,
        '/map?alert=' || v_alert.id::text,
        jsonb_build_object(
          'alert_id', v_alert.id,
          'alert_type', v_alert.type_norm,
          'thread_id', v_alert.thread_id
        )
      );
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;


ALTER FUNCTION "public"."enqueue_broadcast_notifications"("p_alert_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enqueue_chat_notification"("p_recipient_id" "uuid", "p_kind" "text", "p_title" "text", "p_body" "text", "p_href" "text", "p_data" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_meta jsonb;
begin
  if p_recipient_id is null then return; end if;

  -- Respect chats toggle; if off, skip entirely
  if not public.can_deliver_notification(p_recipient_id, 'chats') then return; end if;

  v_meta := jsonb_build_object(
    'kind', p_kind,
    'href', p_href,
    'delivery', 'push_and_in_app',
    'skip_history', true
  ) || coalesce(p_data, '{}'::jsonb);

  insert into public.notifications (
    user_id, type, title, body, message, metadata, data, read, is_read
  ) values (
    p_recipient_id,
    'chats',
    p_title,
    p_body,
    p_body,
    v_meta,
    v_meta,
    false,
    false
  );
end;
$$;


ALTER FUNCTION "public"."enqueue_chat_notification"("p_recipient_id" "uuid", "p_kind" "text", "p_title" "text", "p_body" "text", "p_href" "text", "p_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enqueue_map_alert_notification"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.map_alert_notification_queue (alert_id, run_at)
  values (new.id, now() + interval '5 minutes')
  on conflict (alert_id) do update
    set run_at = excluded.run_at,
        processed_at = null,
        last_error = null,
        attempts = 0;
  return new;
end;
$$;


ALTER FUNCTION "public"."enqueue_map_alert_notification"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enqueue_notification"("p_user_id" "uuid", "p_category" "text", "p_kind" "text", "p_title" "text", "p_body" "text", "p_href" "text", "p_data" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  v_delivery text := 'in_app_only';
  v_id uuid;
  v_cat text := lower(coalesce(p_category, ''));
  v_type text := 'system';
  v_kind text := nullif(btrim(coalesce(p_kind, '')), '');
  v_href text := nullif(btrim(coalesce(p_href, '')), '');
  v_payload jsonb;
begin
  if p_user_id is null then
    raise exception 'missing_recipient';
  end if;

  if v_kind is null then
    raise exception 'missing_kind';
  end if;

  if v_href is null
     or left(v_href, 1) <> '/'
     or v_href !~ '^/(chats|map|social|pets|threads|chat-dialogue|verify|verify-identity|pet-details|edit-pet-profile|settings|notifications)(\?|$)'
  then
    raise exception 'invalid_href';
  end if;

  case v_cat
    when 'social' then v_type := 'social';
    when 'chats' then v_type := 'chats';
    when 'map' then v_type := 'map';
    when 'services' then v_type := 'booking';
    when 'vet' then v_type := 'booking';
    else v_type := 'system';
  end case;

  if public.can_deliver_notification(p_user_id, v_cat) then
    v_delivery := 'push_and_in_app';
  end if;

  v_payload := jsonb_strip_nulls(
    coalesce(p_data, '{}'::jsonb)
    || jsonb_build_object('kind', v_kind, 'href', v_href, 'delivery', v_delivery)
  );

  insert into public.notifications (
    user_id,
    type,
    title,
    body,
    message,
    metadata,
    data,
    read,
    is_read
  ) values (
    p_user_id,
    v_type,
    coalesce(p_title, 'Notification'),
    coalesce(p_body, ''),
    coalesce(p_body, ''),
    v_payload,
    v_payload,
    false,
    false
  )
  returning id into v_id;

  return v_id;
end;
$_$;


ALTER FUNCTION "public"."enqueue_notification"("p_user_id" "uuid", "p_category" "text", "p_kind" "text", "p_title" "text", "p_body" "text", "p_href" "text", "p_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_direct_chat_room"("p_target_user_id" "uuid", "p_target_name" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_actor_id uuid;
  v_existing_room_id uuid;
  v_room_id uuid;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'auth_required';
  end if;

  if p_target_user_id is null or p_target_user_id = v_actor_id then
    raise exception 'invalid_target_user';
  end if;

  if public.is_user_blocked(v_actor_id, p_target_user_id) then
    raise exception 'chat_blocked';
  end if;

  -- Reuse existing direct room.
  select m1.chat_id
  into v_existing_room_id
  from public.chat_room_members m1
  join public.chat_room_members m2 on m2.chat_id = m1.chat_id
  join public.chats c on c.id = m1.chat_id
  where m1.user_id = v_actor_id
    and m2.user_id = p_target_user_id
    and coalesce(c.type, 'direct') = 'direct'
  group by m1.chat_id
  having count(*) = 2
  limit 1;

  if v_existing_room_id is not null then
    return v_existing_room_id;
  end if;

  insert into public.chats (id, name, type, created_by)
  values (
    gen_random_uuid(),
    coalesce(nullif(trim(p_target_name), ''), 'Conversation'),
    'direct',
    v_actor_id
  )
  returning id into v_room_id;

  insert into public.chat_room_members (chat_id, user_id)
  values (v_room_id, v_actor_id), (v_room_id, p_target_user_id)
  on conflict do nothing;

  return v_room_id;
end;
$$;


ALTER FUNCTION "public"."ensure_direct_chat_room"("p_target_user_id" "uuid", "p_target_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_profile_for_auth_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
declare
  v_display_name text;
  v_legal_name text;
  v_phone text;
begin
  v_display_name := coalesce(
    nullif(btrim(new.raw_user_meta_data->>'display_name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'User'
  );

  v_legal_name := coalesce(
    nullif(btrim(new.raw_user_meta_data->>'legal_name'), ''),
    v_display_name
  );

  v_phone := nullif(btrim(coalesce(new.raw_user_meta_data->>'phone', new.phone, '')), '');

  insert into public.profiles (id, display_name, legal_name, phone)
  values (new.id, v_display_name, v_legal_name, v_phone)
  on conflict (id) do update
    set display_name = coalesce(excluded.display_name, public.profiles.display_name),
        legal_name = coalesce(excluded.legal_name, public.profiles.legal_name),
        phone = coalesce(excluded.phone, public.profiles.phone),
        updated_at = now();

  return new;
end;
$$;


ALTER FUNCTION "public"."ensure_profile_for_auth_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."expire_account_restrictions"() RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  update public.profiles
  set
    account_status = 'active',
    restriction_expires_at = null
  where account_status = 'restricted'
    and restriction_expires_at is not null
    and restriction_expires_at < now();

  update public.profiles
  set
    account_status = 'active',
    suspension_expires_at = null
  where account_status = 'suspended'
    and suspension_expires_at is not null
    and suspension_expires_at < now();
$$;


ALTER FUNCTION "public"."expire_account_restrictions"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."file_booking_dispute"("p_booking_id" "uuid", "p_dispute_reason" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE marketplace_bookings
  SET
    status = 'disputed',
    dispute_reason = p_dispute_reason,
    dispute_flag = TRUE,
    updated_at = NOW()
  WHERE id = p_booking_id
    AND status IN ('completed', 'payout_pending', 'paid');

  RAISE NOTICE 'Dispute filed for booking %', p_booking_id;
END;
$$;


ALTER FUNCTION "public"."file_booking_dispute"("p_booking_id" "uuid", "p_dispute_reason" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."file_booking_dispute"("p_booking_id" "uuid", "p_dispute_reason" "text") IS 'Allows client to file dispute and hold escrow release';



CREATE OR REPLACE FUNCTION "public"."file_service_dispute"("p_chat_id" "uuid", "p_category" "text", "p_description" "text", "p_evidence_urls" "text"[]) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_sc public.service_chats;
  v_dispute_id uuid;
begin
  select * into v_sc from public.service_chats where chat_id = p_chat_id;
  if not found then raise exception 'service_chat_not_found'; end if;
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if v_sc.requester_id <> v_uid and v_sc.provider_id <> v_uid then raise exception 'not_participant'; end if;

  perform public.refresh_service_chat_status(p_chat_id);
  select * into v_sc from public.service_chats where chat_id = p_chat_id;

  if v_sc.status not in ('booked', 'in_progress', 'completed') then
    raise exception 'invalid_status';
  end if;
  if v_sc.status = 'completed' and coalesce(v_sc.completed_at, now() - interval '100 years') < now() - interval '48 hours' then
    raise exception 'dispute_window_closed';
  end if;

  insert into public.service_disputes (service_chat_id, filed_by, category, description, evidence_urls)
  values (
    v_sc.id,
    v_uid,
    p_category,
    p_description,
    coalesce(p_evidence_urls, '{}'::text[])
  )
  returning id into v_dispute_id;

  update public.service_chats
  set status = 'disputed',
      disputed_at = now(),
      updated_at = now()
  where chat_id = p_chat_id;

  insert into public.chat_messages (chat_id, sender_id, content)
  values (p_chat_id, v_uid, '{"kind":"service_disputed"}');

  update public.chats set last_message_at = now() where id = p_chat_id;

  perform public.service_notify(
    v_sc.requester_id,
    'service_dispute_filed',
    'Dispute opened',
    'Dispute Opened: A dispute has been filed for this booking.',
    '/chats?tab=service&room=' || p_chat_id::text,
    jsonb_build_object('chatId', p_chat_id, 'filedBy', v_uid, 'category', p_category)
  );

  perform public.service_notify(
    v_sc.provider_id,
    'service_dispute_filed',
    'Dispute opened',
    'Dispute Opened: A dispute has been filed for this booking.',
    '/chats?tab=service&room=' || p_chat_id::text,
    jsonb_build_object('chatId', p_chat_id, 'filedBy', v_uid, 'category', p_category)
  );

  perform public.service_notify(
    v_sc.provider_id,
    'service_payment_on_hold',
    'Payment on hold',
    'We''re holding funds while we review this issue.',
    '/chats?tab=service&room=' || p_chat_id::text,
    jsonb_build_object('chatId', p_chat_id)
  );

  return v_dispute_id;
end;
$$;


ALTER FUNCTION "public"."file_service_dispute"("p_chat_id" "uuid", "p_category" "text", "p_description" "text", "p_evidence_urls" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."finalize_identity_submission"("p_doc_type" "text", "p_doc_path" "text", "p_selfie_path" "text", "p_country" "text", "p_legal_name" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_user UUID;
BEGIN
  v_user := auth.uid();
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_doc_type NOT IN ('passport', 'drivers_license', 'id_card') THEN
    RAISE EXCEPTION 'Invalid doc type';
  END IF;

  INSERT INTO public.verification_uploads
    (user_id, document_type, document_url, selfie_url, country, legal_name, status, uploaded_at)
  VALUES
    (v_user, p_doc_type, p_doc_path, p_selfie_path, p_country, p_legal_name, 'pending', NOW());

  UPDATE public.profiles AS prof
  SET
    verification_status = 'pending',
    is_verified = false,
    legal_name = COALESCE(p_legal_name, prof.legal_name),
    location_country = COALESCE(p_country, prof.location_country),
    verification_comment = NULL
  WHERE prof.id = v_user;
END;
$$;


ALTER FUNCTION "public"."finalize_identity_submission"("p_doc_type" "text", "p_doc_path" "text", "p_selfie_path" "text", "p_country" "text", "p_legal_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."find_nearby_users"("alert_lat" double precision, "alert_lng" double precision, "radius_meters" integer DEFAULT 1000, "min_vouch_score" integer DEFAULT 5) RETURNS TABLE("id" "uuid", "display_name" "text", "fcm_token" "text", "vouch_score" integer, "distance_meters" double precision)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.display_name,
    p.fcm_token,
    p.vouch_score,
    ST_Distance(
      p.location,
      ST_SetSRID(ST_MakePoint(alert_lng, alert_lat), 4326)::geography
    ) AS distance_meters
  FROM profiles p
  WHERE
    p.vouch_score >= min_vouch_score
    AND p.location IS NOT NULL
    AND p.fcm_token IS NOT NULL
    AND ST_DWithin(
      p.location,
      ST_SetSRID(ST_MakePoint(alert_lng, alert_lat), 4326)::geography,
      radius_meters
    )
  ORDER BY distance_meters;
END;
$$;


ALTER FUNCTION "public"."find_nearby_users"("alert_lat" double precision, "alert_lng" double precision, "radius_meters" integer, "min_vouch_score" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."find_nearby_users"("alert_lat" double precision, "alert_lng" double precision, "radius_meters" integer, "min_vouch_score" integer) IS 'Finds verified users within radius for Mesh-Alert notifications';



CREATE OR REPLACE FUNCTION "public"."generate_uid"("len" integer) RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
declare
  i integer;
  s text := '';
begin
  for i in 1..len loop
    s := s || floor(random()*10)::int;
  end loop;
  return s;
end;
$$;


ALTER FUNCTION "public"."generate_uid"("len" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_friend_pins_nearby"("p_lat" double precision, "p_lng" double precision, "p_radius_m" integer DEFAULT 50000) RETURNS TABLE("id" "uuid", "display_name" "text", "avatar_url" "text", "dob" "date", "relationship_status" "text", "owns_pets" boolean, "pet_species" "text"[], "location_name" "text", "last_lat" double precision, "last_lng" double precision, "location_pinned_until" timestamp with time zone, "is_invisible" boolean)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with viewer as (
    select
      nullif(btrim(p.location_country), '') as viewer_country,
      coalesce(
        ul.location,
        p.location,
        p.location_geog,
        case
          when p.last_lng is not null and p.last_lat is not null
            then st_setsrid(st_makepoint(p.last_lng, p.last_lat), 4326)::geography
          else null
        end,
        st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography
      ) as viewer_geog
    from public.profiles p
    left join public.user_locations ul
      on ul.user_id = p.id
     and ul.is_public = true
     and (ul.expires_at is null or ul.expires_at > now())
    where p.id = auth.uid()
  ),
  latest_pin as (
    select distinct on (pn.user_id)
      pn.user_id,
      pn.lat,
      pn.lng,
      pn.created_at
    from public.pins pn
    where pn.thread_id is null
      and pn.user_id is not null
    order by pn.user_id, pn.created_at desc
  ),
  pet_data as (
    select owner_id, array_remove(array_agg(distinct species), null) as pet_species
    from public.pets
    where is_active = true
    group by owner_id
  ),
  candidate_points as (
    select
      p.id as user_id,
      p.display_name,
      p.avatar_url,
      p.dob,
      p.relationship_status,
      p.owns_pets,
      p.location_name,
      p.location_country,
      p.hide_from_map,
      p.location_pinned_until,
      pd.pet_species,
      coalesce(
        ul.location,
        case
          when lp.lng is not null and lp.lat is not null
            then st_setsrid(st_makepoint(lp.lng, lp.lat), 4326)::geography
          else null
        end,
        p.location,
        p.location_geog,
        case
          when p.last_lng is not null and p.last_lat is not null
            then st_setsrid(st_makepoint(p.last_lng, p.last_lat), 4326)::geography
          else null
        end
      ) as subject_geog,
      coalesce(lp.lat, p.last_lat) as subject_lat,
      coalesce(lp.lng, p.last_lng) as subject_lng,
      coalesce(lp.created_at, p.updated_at, p.created_at) as sort_created_at
    from public.profiles p
    left join latest_pin lp on lp.user_id = p.id
    left join public.user_locations ul
      on ul.user_id = p.id
     and ul.is_public = true
     and (ul.expires_at is null or ul.expires_at > now())
    left join pet_data pd on pd.owner_id = p.id
  )
  select
    c.user_id as id,
    c.display_name,
    c.avatar_url,
    c.dob,
    c.relationship_status,
    c.owns_pets,
    c.pet_species,
    c.location_name,
    c.subject_lat as last_lat,
    c.subject_lng as last_lng,
    c.location_pinned_until,
    coalesce(c.hide_from_map, false) as is_invisible
  from candidate_points c
  left join viewer v on true
  where c.user_id <> auth.uid()
    and c.subject_lat is not null
    and c.subject_lng is not null
    and c.subject_geog is not null
    and not public.is_user_blocked(auth.uid(), c.user_id)
    and (
      (
        v.viewer_country is not null
        and nullif(btrim(c.location_country), '') is not null
        and lower(v.viewer_country) = lower(nullif(btrim(c.location_country), ''))
      )
      or (
        v.viewer_geog is not null
        and st_dwithin(
          c.subject_geog,
          v.viewer_geog,
          greatest(1, p_radius_m)
        )
      )
    )
  order by c.sort_created_at desc nulls last
  limit 200;
$$;


ALTER FUNCTION "public"."get_friend_pins_nearby"("p_lat" double precision, "p_lng" double precision, "p_radius_m" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_map_alerts_nearby"("p_lat" double precision, "p_lng" double precision, "p_radius_m" integer DEFAULT 50000) RETURNS TABLE("id" "uuid", "latitude" double precision, "longitude" double precision, "alert_type" "text", "description" "text", "photo_url" "text", "support_count" integer, "report_count" integer, "created_at" timestamp with time zone, "expires_at" timestamp with time zone, "range_meters" integer, "creator_display_name" "text", "creator_avatar_url" "text")
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  select
    a.id,
    a.latitude,
    a.longitude,
    a.alert_type,
    a.description,
    a.photo_url,
    a.support_count,
    a.report_count,
    a.created_at,
    a.expires_at,
    a.range_meters,
    p.display_name as creator_display_name,
    p.avatar_url as creator_avatar_url
  from public.map_alerts a
  join public.profiles p on p.id = a.creator_id
  where a.is_active = true
    and (a.expires_at is null or a.expires_at > now())
    and coalesce(a.report_count, 0) < 10
    and a.location_geog is not null
    and ST_DWithin(
      a.location_geog,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
      greatest(0, least(p_radius_m, 50000))
    )
  order by a.created_at desc
  limit 200;
$$;


ALTER FUNCTION "public"."get_map_alerts_nearby"("p_lat" double precision, "p_lng" double precision, "p_radius_m" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_quota_snapshot"() RETURNS TABLE("user_id" "uuid", "tier" "text", "day_start" "date", "week_start" "date", "month_start" "date", "thread_posts_today" integer, "discovery_views_today" integer, "media_usage_today" integer, "stars_used_cycle" integer, "broadcast_alerts_week" integer, "extra_stars" integer, "extra_media_10" integer, "extra_broadcast_72h" integer)
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  with me as (
    select auth.uid() as u
  ),
  owner as (
    select public._qms_get_pool_owner((select u from me)) as owner_id
  ),
  effective as (
    select
      case
        when public._qms_effective_tier((select owner_id from owner)) = 'gold'
          then (select owner_id from owner)
        else (select u from me)
      end as o
  )
  select
    uq.user_id,
    public._qms_effective_tier(uq.user_id) as tier,
    uq.day_start,
    uq.week_start,
    uq.month_start,
    uq.thread_posts_today,
    uq.discovery_views_today,
    uq.media_usage_today,
    uq.stars_used_cycle,
    uq.broadcast_alerts_week,
    uq.extra_stars,
    uq.extra_media_10,
    uq.extra_broadcast_72h
  from public.user_quotas uq
  where uq.user_id = (select o from effective);
$$;


ALTER FUNCTION "public"."get_quota_snapshot"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_service_provider_distances"("p_lat" double precision, "p_lng" double precision) RETURNS TABLE("user_id" "uuid", "distance_km" double precision)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if p_lat is null or p_lng is null then
    return;
  end if;

  return query
  with viewer as (
    select st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography as geog
  ),
  provider_geos as (
    select
      p.id as user_id,
      coalesce(
        p.location,
        p.location_geog,
        ul.location
      ) as geog
    from public.pet_care_profiles pcp
    join public.profiles p on p.id = pcp.user_id
    left join public.user_locations ul on ul.user_id = p.id
    where pcp.listed is true
  )
  select
    pg.user_id,
    round((st_distance(pg.geog, viewer.geog) / 1000.0)::numeric, 3)::double precision as distance_km
  from provider_geos pg
  cross join viewer
  where pg.geog is not null;
end;
$$;


ALTER FUNCTION "public"."get_service_provider_distances"("p_lat" double precision, "p_lng" double precision) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_social_feed"("p_viewer_id" "uuid", "p_sort" "text" DEFAULT 'Latest'::"text", "p_limit" integer DEFAULT 20, "p_cursor" "jsonb" DEFAULT NULL::"jsonb") RETURNS TABLE("id" "uuid", "user_id" "uuid", "title" "text", "content" "text", "tags" "text"[], "hashtags" "text"[], "images" "text"[], "created_at" timestamp with time zone, "like_count" integer, "support_count" integer, "comment_count" integer, "score" numeric, "author_display_name" "text", "author_avatar_url" "text", "author_verification_status" "text", "author_location_country" "text", "author_last_lat" double precision, "author_last_lng" double precision, "author_non_social" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_caller_role text := coalesce(auth.role(), '');
  v_uid uuid;
begin
  v_uid := case
    when v_caller_role = 'service_role' then coalesce(p_viewer_id, auth.uid())
    else auth.uid()
  end;

  if v_uid is null then
    raise exception 'unauthorized';
  end if;

  if v_caller_role <> 'service_role' and p_viewer_id is not null and p_viewer_id <> v_uid then
    raise exception 'forbidden';
  end if;

  return query
  with viewer as (
    select p.id, p.location_country, coalesce(p.location, p.location_geog) as geog
    from public.profiles p
    where p.id = v_uid
  ),
  support_counts as (
    select ts.thread_id, count(*)::int as cnt
    from public.thread_supports ts
    group by ts.thread_id
  ),
  base as (
    select
      t.id,
      t.user_id,
      t.title,
      t.content,
      t.tags,
      t.hashtags,
      t.images,
      t.created_at,
      coalesce(sc.cnt, 0)::int as like_count,
      coalesce(sc.cnt, 0)::int as support_count,
      (
        select count(*)::int
        from public.thread_comments tc
        where tc.thread_id = t.id
      ) as comment_count,
      p.display_name as author_display_name,
      p.avatar_url as author_avatar_url,
      p.verification_status::text as author_verification_status,
      p.location_country as author_location_country,
      p.last_lat as author_last_lat,
      p.last_lng as author_last_lng,
      coalesce(p.non_social, false) as author_non_social
    from public.threads t
    join public.profiles p on p.id = t.user_id
    left join support_counts sc on sc.thread_id = t.id
    join viewer v on true
    where coalesce(p.non_social, false) = false
      and not public.is_user_blocked(v.id, t.user_id)
      and public.is_in_scope(v.id, t.user_id)
  ),
  ranked as (
    select
      b.*,
      (
        (coalesce(b.like_count, 0) * 2)
        + (coalesce(b.comment_count, 0) * 3)
        + (coalesce(b.support_count, 0) * 1)
        - ((extract(epoch from (now() - b.created_at)) / 3600.0) * 0.10)
      )::numeric as computed_score
    from base b
    where (
      lower(coalesce(p_sort, 'latest')) <> 'trending'
      or b.created_at >= now() - interval '7 days'
    )
      and (
        p_cursor is null
        or (b.created_at, b.id) < (
          coalesce((p_cursor->>'created_at')::timestamptz, 'infinity'::timestamptz),
          coalesce((p_cursor->>'id')::uuid, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)
        )
      )
  )
  select
    r.id,
    r.user_id,
    r.title,
    r.content,
    r.tags,
    r.hashtags,
    r.images,
    r.created_at,
    r.like_count,
    r.support_count,
    r.comment_count,
    case when lower(coalesce(p_sort, 'latest')) = 'trending' then r.computed_score else null end as score,
    r.author_display_name,
    r.author_avatar_url,
    r.author_verification_status,
    r.author_location_country,
    r.author_last_lat,
    r.author_last_lng,
    r.author_non_social
  from ranked r
  order by
    case when lower(coalesce(p_sort, 'latest')) = 'trending' then r.computed_score end desc nulls last,
    r.created_at desc,
    r.id desc
  limit greatest(1, least(coalesce(p_limit, 20), 100));
end;
$$;


ALTER FUNCTION "public"."get_social_feed"("p_viewer_id" "uuid", "p_sort" "text", "p_limit" integer, "p_cursor" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_visible_broadcast_alerts"("p_lat" double precision, "p_lng" double precision) RETURNS TABLE("id" "uuid", "latitude" double precision, "longitude" double precision, "alert_type" "text", "title" "text", "description" "text", "photo_url" "text", "support_count" integer, "report_count" integer, "created_at" timestamp with time zone, "expires_at" timestamp with time zone, "duration_hours" integer, "range_meters" integer, "range_km" numeric, "creator_id" "uuid", "thread_id" "uuid", "posted_to_threads" boolean, "post_on_social" boolean, "social_post_id" "text", "social_status" "text", "social_url" "text", "media_urls" "text"[], "location_street" "text", "location_district" "text", "creator_display_name" "text", "creator_avatar_url" "text", "marker_state" "text")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with viewer as (
    select
      auth.uid() as viewer_id,
      nullif(btrim(p.location_country), '') as viewer_country,
      coalesce(p.location, p.location_geog, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography) as viewer_geog
    from public.profiles p
    where p.id = auth.uid()
  )
  select
    b.id,
    b.latitude,
    b.longitude,
    b.type as alert_type,
    b.title,
    b.description,
    coalesce(b.images[1], b.photo_url) as photo_url,
    coalesce(ai.support_count, 0)::int as support_count,
    coalesce(ai.report_count, 0)::int as report_count,
    b.created_at,
    (b.created_at + make_interval(hours => greatest(1, least(72, b.duration_hours)))) as expires_at,
    b.duration_hours,
    greatest(1, floor((b.range_km * 1000.0))::int) as range_meters,
    b.range_km,
    b.creator_id,
    b.thread_id,
    coalesce(b.post_on_threads, false) as posted_to_threads,
    coalesce(b.post_on_threads, false) as post_on_social,
    case when b.thread_id is not null then b.thread_id::text else null end as social_post_id,
    case when b.thread_id is not null then 'posted' else null end as social_status,
    case when b.thread_id is not null then '/threads?focus=' || b.thread_id::text else null end as social_url,
    case
      when coalesce(array_length(b.images, 1), 0) > 0 then b.images
      else array_remove(array[b.photo_url], null)::text[]
    end as media_urls,
    b.address as location_street,
    p.location_district,
    p.display_name as creator_display_name,
    p.avatar_url as creator_avatar_url,
    case
      when now() <= (b.created_at + make_interval(hours => greatest(1, least(72, b.duration_hours)))) then 'active'
      when now() <= (b.created_at + make_interval(hours => greatest(1, least(72, b.duration_hours))) + interval '7 days') then 'expired_dot'
      else 'hidden'
    end as marker_state
  from public.broadcast_alerts b
  join public.profiles p on p.id = b.creator_id
  left join viewer v on true
  left join lateral (
    select
      count(*) filter (where i.interaction_type = 'support') as support_count,
      count(*) filter (where i.interaction_type = 'report') as report_count
    from public.broadcast_alert_interactions i
    where i.alert_id = b.id
  ) ai on true
  where b.archived_at is null
    and now() <= (b.created_at + make_interval(hours => greatest(1, least(72, b.duration_hours))) + interval '7 days')
    -- Hide alerts that have reached 10 or more reports
    and coalesce(ai.report_count, 0) < 10
    and not public.is_user_blocked(auth.uid(), b.creator_id)
    and (
      b.creator_id = auth.uid()
      or (
        (
          v.viewer_country is not null
          and nullif(btrim(p.location_country), '') is not null
          and lower(v.viewer_country) = lower(nullif(btrim(p.location_country), ''))
        )
        or (
          v.viewer_geog is not null
          and b.geog is not null
          and st_dwithin(v.viewer_geog, b.geog, 150000)
        )
      )
    )
  order by b.created_at desc
  limit 200;
$$;


ALTER FUNCTION "public"."get_visible_broadcast_alerts"("p_lat" double precision, "p_lng" double precision) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_visible_map_alerts"("p_lat" double precision, "p_lng" double precision) RETURNS TABLE("id" "uuid", "latitude" double precision, "longitude" double precision, "alert_type" "text", "title" "text", "description" "text", "photo_url" "text", "support_count" integer, "report_count" integer, "created_at" timestamp with time zone, "expires_at" timestamp with time zone, "range_meters" integer, "creator_id" "uuid", "thread_id" "uuid", "posted_to_threads" boolean, "social_status" "text", "social_url" "text", "creator_display_name" "text", "creator_avatar_url" "text")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    a.id,
    a.latitude,
    a.longitude,
    a.alert_type,
    a.title,
    a.description,
    a.photo_url,
    coalesce(a.support_count, 0) as support_count,
    coalesce(a.report_count, 0) as report_count,
    a.created_at,
    a.expires_at,
    a.range_meters,
    a.creator_id,
    a.thread_id,
    coalesce(a.posted_to_threads, false) as posted_to_threads,
    a.social_status,
    a.social_url,
    p.display_name as creator_display_name,
    p.avatar_url as creator_avatar_url
  from public.map_alerts a
  join public.profiles p on p.id = a.creator_id
  where a.is_active = true
    and (a.expires_at is null or a.expires_at > now())
    and coalesce(a.report_count, 0) < 10
    and a.location_geog is not null
    and st_dwithin(
      a.location_geog,
      st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
      greatest(0, least(coalesce(a.range_meters, 10000), 150000))
    )
  order by a.created_at desc
  limit 200;
$$;


ALTER FUNCTION "public"."get_visible_map_alerts"("p_lat" double precision, "p_lng" double precision) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_identity_review"("p_target_user_id" "uuid", "p_action" "text", "p_notes" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_admin uuid;
  v_is_admin boolean;
  v_upload record;
  v_action text;
BEGIN
  v_admin := auth.uid();

  SELECT prof.is_admin
    INTO v_is_admin
  FROM public.profiles AS prof
  WHERE prof.id = v_admin;

  INSERT INTO public.admin_audit_logs (actor_id, action, target_user_id, notes)
  VALUES (v_admin, 'kyc_review_attempt', p_target_user_id, p_notes);

  IF v_is_admin IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT *
    INTO v_upload
  FROM public.verification_uploads AS vu
  WHERE vu.user_id = p_target_user_id
    AND vu.status = 'pending'
  ORDER BY vu.uploaded_at DESC
  LIMIT 1;

  IF v_upload IS NULL THEN
    RAISE EXCEPTION 'No pending upload';
  END IF;

  IF p_action = 'approve' THEN
    UPDATE public.profiles AS prof
      SET verification_status = 'verified',
          is_verified = true,
          verification_comment = NULL
    WHERE prof.id = p_target_user_id;

    UPDATE public.verification_uploads AS vu
      SET status = 'approved',
          reviewed_by = v_admin,
          reviewed_at = NOW(),
          rejection_reason = NULL
    WHERE vu.id = v_upload.id;

    INSERT INTO public.identity_verification_cleanup_queue (user_id, object_path, delete_after)
    VALUES (p_target_user_id, v_upload.document_url, NOW() + INTERVAL '30 days');

    IF v_upload.selfie_url IS NOT NULL THEN
      INSERT INTO public.identity_verification_cleanup_queue (user_id, object_path, delete_after)
      VALUES (p_target_user_id, v_upload.selfie_url, NOW() + INTERVAL '30 days');
    END IF;

    v_action := 'kyc_approved';

  ELSIF p_action = 'reject' THEN
    UPDATE public.profiles AS prof
      SET verification_status = 'unverified',
          is_verified = false,
          verification_comment = p_notes
    WHERE prof.id = p_target_user_id;

    UPDATE public.verification_uploads AS vu
      SET status = 'rejected',
          reviewed_by = v_admin,
          reviewed_at = NOW(),
          rejection_reason = p_notes
    WHERE vu.id = v_upload.id;

    DELETE FROM storage.objects
      WHERE bucket_id = 'identity_verification'
        AND name IN (v_upload.document_url, v_upload.selfie_url);

    v_action := 'kyc_rejected';
  ELSE
    RAISE EXCEPTION 'Invalid action';
  END IF;

  INSERT INTO public.admin_audit_logs (actor_id, action, target_user_id, notes)
  VALUES (v_admin, v_action, p_target_user_id, p_notes);
END;
$$;


ALTER FUNCTION "public"."handle_identity_review"("p_target_user_id" "uuid", "p_action" "text", "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_marketplace_payment_success"("p_payment_intent_id" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE marketplace_bookings
  SET
    status = 'confirmed',
    updated_at = NOW()
  WHERE stripe_payment_intent_id = p_payment_intent_id
    AND status = 'pending';

  RAISE NOTICE 'Booking confirmed for payment intent %', p_payment_intent_id;
END;
$$;


ALTER FUNCTION "public"."handle_marketplace_payment_success"("p_payment_intent_id" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."handle_marketplace_payment_success"("p_payment_intent_id" "text") IS 'Called by webhook when marketplace payment succeeds';



CREATE OR REPLACE FUNCTION "public"."handle_new_auth_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
begin
  -- Intentionally no profile bootstrap here.
  -- Keep auth.users insert fast and side-effect free for profile domain.
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_auth_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- Intentionally no profile bootstrap here.
  -- Keep auth.users insert fast and side-effect free for profile domain.
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_pet_care_profile_view_count"("p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    return;
  end if;

  -- Ignore self-opens.
  if v_actor = p_user_id then
    return;
  end if;

  update public.pet_care_profiles
  set view_count = coalesce(view_count, 0) + 1
  where user_id = p_user_id
    and listed is true;
end;
$$;


ALTER FUNCTION "public"."increment_pet_care_profile_view_count"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_user_credits"("p_user_id" "uuid", "p_stars" integer DEFAULT 0, "p_mesh_alerts" integer DEFAULT 0, "p_media_credits" integer DEFAULT 0, "p_family_slots" integer DEFAULT 0) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  owner_id uuid;
  tier text;
begin
  -- Preserve legacy profile counters (some UI still reads them).
  update public.profiles
  set
    stars_count = greatest(0, coalesce(stars_count, 0) + coalesce(p_stars, 0)),
    mesh_alert_count = greatest(0, coalesce(mesh_alert_count, 0) + coalesce(p_mesh_alerts, 0)),
    media_credits = greatest(0, coalesce(media_credits, 0) + coalesce(p_media_credits, 0)),
    family_slots = greatest(0, coalesce(family_slots, 0) + coalesce(p_family_slots, 0)),
    updated_at = now()
  where id = p_user_id;

  -- Gold pooling: add extras to pool owner.
  owner_id := public._qms_get_pool_owner(p_user_id);
  tier := public._qms_effective_tier(owner_id);
  if tier <> 'gold' then
    owner_id := p_user_id;
  end if;

  perform public._qms_touch_row(owner_id);

  update public.user_quotas
  set
    extra_stars = extra_stars + greatest(0, coalesce(p_stars, 0)),
    extra_media_10 = extra_media_10 + greatest(0, coalesce(p_media_credits, 0)),
    extra_broadcast_72h = extra_broadcast_72h + greatest(0, coalesce(p_mesh_alerts, 0)),
    updated_at = now()
  where user_id = owner_id;
end;
$$;


ALTER FUNCTION "public"."increment_user_credits"("p_user_id" "uuid", "p_stars" integer, "p_mesh_alerts" integer, "p_media_credits" integer, "p_family_slots" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."increment_user_credits"("p_user_id" "uuid", "p_stars" integer, "p_mesh_alerts" integer, "p_media_credits" integer, "p_family_slots" integer) IS 'Safely increment user credits - only callable by service role via webhooks';



CREATE OR REPLACE FUNCTION "public"."is_chat_member"("p_chat_id" "uuid", "p_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.chat_room_members
    where chat_id = p_chat_id and user_id = p_user_id
  );
$$;


ALTER FUNCTION "public"."is_chat_member"("p_chat_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_in_scope"("p_viewer" "uuid", "p_target" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_caller_role text := coalesce(auth.role(), '');
  v_viewer uuid;
  v_viewer_country text;
  v_target_country text;
  v_viewer_geog geography;
  v_target_geog geography;
begin
  v_viewer := case
    when v_caller_role = 'service_role' then coalesce(p_viewer, auth.uid())
    else auth.uid()
  end;

  if v_viewer is null or p_target is null then
    return false;
  end if;

  if v_viewer = p_target then
    return true;
  end if;

  select
    nullif(btrim(location_country), ''),
    coalesce(location, location_geog)
  into v_viewer_country, v_viewer_geog
  from public.profiles
  where id = v_viewer;

  select
    nullif(btrim(location_country), ''),
    coalesce(location, location_geog)
  into v_target_country, v_target_geog
  from public.profiles
  where id = p_target;

  if v_viewer_country is not null and v_target_country is not null and lower(v_viewer_country) = lower(v_target_country) then
    return true;
  end if;

  if v_viewer_geog is not null and v_target_geog is not null then
    return st_dwithin(v_viewer_geog, v_target_geog, 150000);
  end if;

  return false;
end;
$$;


ALTER FUNCTION "public"."is_in_scope"("p_viewer" "uuid", "p_target" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_social_id_taken"("p_social_id" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  v_exists boolean := false;
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'social_id'
  ) then
    return false;
  end if;

  execute $q$
    select exists (
      select 1
      from public.profiles
      where lower(social_id) = lower(trim($1))
    )
  $q$
  into v_exists
  using p_social_id;

  return coalesce(v_exists, false);
end;
$_$;


ALTER FUNCTION "public"."is_social_id_taken"("p_social_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_user_blocked"("p_a" "uuid", "p_b" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.user_blocks ub
    where (ub.blocker_id = p_a and ub.blocked_id = p_b)
       or (ub.blocker_id = p_b and ub.blocked_id = p_a)
  );
$$;


ALTER FUNCTION "public"."is_user_blocked"("p_a" "uuid", "p_b" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."map_alerts_apply_interaction_counts"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  if tg_op = 'INSERT' then
    if new.interaction_type = 'support' then
      update public.map_alerts set support_count = coalesce(support_count, 0) + 1 where id = new.alert_id;
    elsif new.interaction_type = 'report' then
      update public.map_alerts set report_count = coalesce(report_count, 0) + 1 where id = new.alert_id;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.interaction_type = 'support' then
      update public.map_alerts set support_count = greatest(0, coalesce(support_count, 0) - 1) where id = old.alert_id;
    elsif old.interaction_type = 'report' then
      update public.map_alerts set report_count = greatest(0, coalesce(report_count, 0) - 1) where id = old.alert_id;
    end if;
    return old;
  end if;

  return null;
end;
$$;


ALTER FUNCTION "public"."map_alerts_apply_interaction_counts"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."map_alerts_auto_hide_on_reports"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  if new.report_count is not null and new.report_count >= 10 then
    new.is_active := false;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."map_alerts_auto_hide_on_reports"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_booking_completed"("p_booking_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE marketplace_bookings
  SET
    status = 'completed',
    updated_at = NOW()
  WHERE id = p_booking_id
    AND status = 'in_progress'
    AND service_end_date <= NOW();
END;
$$;


ALTER FUNCTION "public"."mark_booking_completed"("p_booking_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."mark_booking_completed"("p_booking_id" "uuid") IS 'Marks booking as completed after service end date';



CREATE OR REPLACE FUNCTION "public"."mark_service_finished"("p_chat_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_sc public.service_chats;
  v_both boolean;
  v_service_type text;
  v_provider_name text;
begin
  select * into v_sc from public.service_chats where chat_id = p_chat_id;
  if not found then raise exception 'service_chat_not_found'; end if;
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if v_sc.requester_id <> v_uid and v_sc.provider_id <> v_uid then raise exception 'not_participant'; end if;

  perform public.refresh_service_chat_status(p_chat_id);
  select * into v_sc from public.service_chats where chat_id = p_chat_id;

  if v_sc.status not in ('booked', 'in_progress') then
    raise exception 'invalid_status';
  end if;

  if v_sc.requester_id = v_uid then
    update public.service_chats
    set requester_mark_finished = true, updated_at = now()
    where chat_id = p_chat_id;
  else
    update public.service_chats
    set provider_mark_finished = true, updated_at = now()
    where chat_id = p_chat_id;
  end if;

  select requester_mark_finished and provider_mark_finished
  into v_both
  from public.service_chats
  where chat_id = p_chat_id;

  if v_both then
    update public.service_chats
    set status = 'completed',
        completed_at = now(),
        payout_release_requested_at = now(),
        payout_release_attempted_at = null,
        payout_release_lock_token = null,
        payout_release_locked_at = null,
        updated_at = now()
    where chat_id = p_chat_id;

    insert into public.chat_messages (chat_id, sender_id, content)
    values (p_chat_id, v_uid, '{"kind":"service_completed"}');

    update public.chats set last_message_at = now() where id = p_chat_id;

    v_service_type := coalesce(nullif(trim(v_sc.request_card->>'serviceType'), ''), 'service');
    select coalesce(nullif(trim(display_name), ''), 'Provider')
    into v_provider_name
    from public.profiles
    where id = v_sc.provider_id;

    perform public.service_notify(
      v_sc.requester_id,
      'service_finished',
      'Service finished',
      v_provider_name || ' finished the service.',
      '/chats?tab=service&room=' || p_chat_id::text,
      jsonb_build_object('chatId', p_chat_id, 'serviceType', v_service_type)
    );

    perform public.service_notify(
      v_sc.provider_id,
      'service_finished',
      'Service complete',
      'Service marked as complete. Your payout is on the way.',
      '/chats?tab=service&room=' || p_chat_id::text,
      jsonb_build_object('chatId', p_chat_id, 'serviceType', v_service_type)
    );

    perform public.service_notify(
      v_sc.requester_id,
      'service_review_reminder',
      'Review reminder',
      'How was the service? Tap to leave ' || v_provider_name || ' a review.',
      '/chats?tab=service&room=' || p_chat_id::text,
      jsonb_build_object('chatId', p_chat_id, 'serviceType', v_service_type)
    );
  end if;
end;
$$;


ALTER FUNCTION "public"."mark_service_finished"("p_chat_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_account_status_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_body text;
begin
  if new.account_status is not distinct from old.account_status then
    return new;
  end if;

  case new.account_status
    when 'restricted' then
      v_body := 'Your account has been temporarily restricted. Some features are limited';
    when 'suspended' then
      v_body := 'Your account has been suspended. Contact support if you think this is a mistake';
    when 'removed' then
      v_body := 'Your account has been removed for violating community guidelines';
    else
      return new;
  end case;

  perform public.enqueue_notification(
    new.id,
    'systems',
    'account_' || new.account_status::text,
    'Account update',
    v_body,
    '/settings',
    jsonb_build_object('account_status', new.account_status)
  );

  return new;
end;
$$;


ALTER FUNCTION "public"."notify_account_status_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_broadcast_alert_hidden"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_report_count integer;
  v_creator_id uuid;
begin
  if new.interaction_type <> 'report' then
    return new;
  end if;

  select creator_id into v_creator_id
  from public.broadcast_alerts
  where id = new.alert_id;

  if v_creator_id is null then
    return new;
  end if;

  -- Count includes current row (AFTER INSERT trigger)
  select count(*) into v_report_count
  from public.broadcast_alert_interactions
  where alert_id = new.alert_id
    and interaction_type = 'report';

  -- Fire exactly when threshold reaches 10 (AFTER INSERT already counted this row)
  if v_report_count = 10 then
    perform public.enqueue_notification(
      v_creator_id,
      'map',
      'broadcast_hidden',
      'Alert removed',
      'Your alert was removed after too many reports',
      '/map',
      jsonb_build_object('alert_id', new.alert_id)
    );
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."notify_broadcast_alert_hidden"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_group_chat_invite_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_inviter_name text;
  v_chat_name text;
begin
  if new.status <> 'pending' then
    return new;
  end if;

  select coalesce(display_name, 'Someone')
  into v_inviter_name
  from public.profiles
  where id = new.inviter_user_id;

  v_chat_name := coalesce(nullif(new.chat_name, ''), 'Group');

  perform public.enqueue_notification(
    new.invitee_user_id,
    'chats',
    'group_invite',
    'Group invite',
    v_inviter_name || ' added you to a group 🐾',
    '/chats?tab=groups',
    jsonb_build_object(
      'chat_id', new.chat_id,
      'chat_name', v_chat_name,
      'inviter_name', v_inviter_name,
      'kind', 'group_invite'
    )
  );

  return new;
end;
$$;


ALTER FUNCTION "public"."notify_group_chat_invite_insert"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_new_chat_message"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_chat_type text;
  v_chat_name text;
  v_sender_name text;
  v_content_obj jsonb;
  v_preview text;
  v_title text;
  v_body text;
  v_kind text;
  v_recipient record;
  v_href text;
begin
  -- Get chat type and name
  select type, name into v_chat_type, v_chat_name
  from public.chats
  where id = new.chat_id;

  if not found then return new; end if;

  -- Service chats go through service_notify() — skip to avoid double-notification
  if v_chat_type = 'service' then return new; end if;

  -- Get sender display_name
  select coalesce(display_name, 'Someone') into v_sender_name
  from public.profiles
  where id = new.sender_id;

  v_href := '/chat-dialogue?room=' || new.chat_id;

  -- Parse content: detect media vs text
  begin
    v_content_obj := new.content::jsonb;
  exception when others then
    v_content_obj := null;
  end;

  -- Determine kind and preview
  if v_content_obj is not null and v_content_obj->>'kind' = 'video' then
    v_kind := 'video_received';
    v_preview := v_sender_name || ' sent you a video';
  elsif v_content_obj is not null
    and (v_content_obj->>'kind' in ('image', 'photo', 'media')
         or v_content_obj ? 'mediaUrl'
         or v_content_obj ? 'imageUrl') then
    v_kind := 'photo_received';
    v_preview := v_sender_name || ' sent you a photo';
  else
    v_preview := left(coalesce(new.content, ''), 60);
    if length(coalesce(new.content, '')) > 60 then
      v_preview := v_preview || '…';
    end if;
  end if;

  -- Build notification copy based on chat type
  if v_chat_type = 'group' then
    v_kind := coalesce(v_kind, 'group_message');
    v_title := coalesce(v_chat_name, 'Group message');
    v_body := v_sender_name || ' in ' || coalesce(v_chat_name, 'group') || ': ' || v_preview;
  else
    v_kind := coalesce(v_kind, 'new_message');
    v_title := v_sender_name;
    v_body := v_sender_name || ': ' || v_preview;
  end if;

  -- Notify all members except sender
  for v_recipient in
    select m.user_id
    from public.chat_room_members m
    where m.chat_id = new.chat_id
      and m.user_id <> new.sender_id
  loop
    perform public.enqueue_chat_notification(
      v_recipient.user_id,
      v_kind,
      v_title,
      v_body,
      v_href,
      jsonb_build_object(
        'chat_id', new.chat_id,
        'sender_id', new.sender_id,
        'message_id', new.id
      )
    );
  end loop;

  return new;
end;
$$;


ALTER FUNCTION "public"."notify_new_chat_message"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_no_stars"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if coalesce(new.stars_count, 0) = 0
     and coalesce(old.stars_count, 0) > 0 then
    perform public.enqueue_notification(
      new.id,
      'systems',
      'no_stars',
      'Stars used up',
      'You''ve used all your Stars for this month ⭐ Upgrade to Gold for more',
      '/settings',
      '{}'::jsonb
    );
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."notify_no_stars"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_on_map_alert_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $_$
declare
  has_title boolean := false;
  has_message boolean := false;
  has_body boolean := false;
  has_content boolean := false;
  has_type boolean := false;
  has_metadata boolean := false;
  cols text[] := array['user_id'];
  exprs text[] := array['p.id'];
  msg_expr text := $q$case
      when $4 = 'Lost' then 'Alert: Missing in ' || coalesce(p.location_name, 'your area') || '!'
      when $4 = 'Stray' then 'Alert: Furry friend sighting in ' || coalesce(p.location_name, 'your area') || '!'
      else 'Alert nearby in ' || coalesce(p.location_name, 'your area') || '!'
    end$q$;
  sql text;
begin
  select exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='notifications' and column_name='title'
  ) into has_title;
  select exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='notifications' and column_name='message'
  ) into has_message;
  select exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='notifications' and column_name='body'
  ) into has_body;
  select exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='notifications' and column_name='content'
  ) into has_content;
  select exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='notifications' and column_name='type'
  ) into has_type;
  select exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='notifications' and column_name='metadata'
  ) into has_metadata;

  if has_title then
    cols := cols || array['title'];
    exprs := exprs || array[quote_literal('Alert')];
  end if;

  if has_message then
    cols := cols || array['message'];
    exprs := exprs || array[msg_expr];
  end if;

  if has_body then
    cols := cols || array['body'];
    exprs := exprs || array[msg_expr];
  end if;

  if has_content then
    cols := cols || array['content'];
    exprs := exprs || array[msg_expr];
  end if;

  if has_type then
    cols := cols || array['type'];
    exprs := exprs || array[quote_literal('alert')];
  end if;

  if has_metadata then
    cols := cols || array['metadata'];
    exprs := exprs || array[$q$jsonb_build_object('alert_id', $5, 'alert_type', $4)$q$];
  end if;

  sql := format(
    'insert into public.notifications(%s) ' ||
    'select %s ' ||
    'from public.profiles p ' ||
    'where p.id <> $1 ' ||
    '  and p.location_retention_until is not null ' ||
    '  and p.location_retention_until > now() ' ||
    '  and coalesce(p.location, p.location_geog) is not null ' ||
    '  and ST_DWithin(' ||
    '    coalesce(p.location, p.location_geog), ' ||
    '    $2, ' ||
    '    greatest(0, least(coalesce($3, 10000), 150000))' ||
    '  ) ' ||
    'order by p.location_retention_until desc ' ||
    'limit 500',
    array_to_string(cols, ','),
    array_to_string(exprs, ',')
  );

  execute sql using new.creator_id, new.location_geog, new.range_meters, new.alert_type, new.id;
  return new;
end;
$_$;


ALTER FUNCTION "public"."notify_on_map_alert_insert"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_profile_verified"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- Fire when verification_status transitions to 'verified'
  if new.verification_status = 'verified'
     and (old.verification_status is distinct from 'verified') then
    perform public.enqueue_notification(
      new.id,
      'systems',
      'profile_verified',
      'Identity verified',
      'Your identity has been verified ✅ Your profile now shows a verified badge',
      '/settings',
      '{}'::jsonb
    );
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."notify_profile_verified"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_provider_listed_on_service"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if coalesce(new.listed, false) = true and coalesce(old.listed, false) = false then
    perform public.service_notify(
      new.user_id,
      'provider_profile_live',
      'Provider profile confirmed',
      'Your carer profile is now live on Service page!',
      '/chats?tab=service',
      jsonb_build_object('kind', 'provider_profile_live', 'userId', new.user_id)
    );
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."notify_provider_listed_on_service"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_thread_comment"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_thread_owner_id uuid;
  v_actor_name      text;
begin
  -- Get thread owner
  select user_id into v_thread_owner_id
  from public.threads
  where id = new.thread_id;

  if not found or v_thread_owner_id is null then return new; end if;

  -- Get actor display name
  select coalesce(display_name, 'Someone') into v_actor_name
  from public.profiles
  where id = new.user_id;

  perform public.upsert_notification_window_internal(
    v_thread_owner_id,
    new.thread_id,
    'thread',
    'comment',
    'social',
    '/social?focus=' || new.thread_id,
    new.user_id,
    coalesce(v_actor_name, 'Someone')
  );

  return new;
end;
$$;


ALTER FUNCTION "public"."notify_thread_comment"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_thread_support"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_thread_owner_id uuid;
  v_actor_name      text;
begin
  -- Get thread owner
  select user_id into v_thread_owner_id
  from public.threads
  where id = new.thread_id;

  if not found or v_thread_owner_id is null then return new; end if;

  -- Get actor display name
  select coalesce(display_name, 'Someone') into v_actor_name
  from public.profiles
  where id = new.user_id;

  perform public.upsert_notification_window_internal(
    v_thread_owner_id,
    new.thread_id,
    'thread',
    'like',
    'social',
    '/social?focus=' || new.thread_id,
    new.user_id,
    coalesce(v_actor_name, 'Someone')
  );

  return new;
end;
$$;


ALTER FUNCTION "public"."notify_thread_support"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pii_purge_identity_verification"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
begin
  delete from storage.objects o
  using public.profiles p
  where o.bucket_id = 'identity_verification'
    and o.owner = p.id
    and p.verification_status in ('approved', 'rejected')
    and p.updated_at <= now() - interval '7 days';
end;
$$;


ALTER FUNCTION "public"."pii_purge_identity_verification"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_non_admin_verification"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF (NEW.verification_status = 'verified' OR NEW.is_verified = TRUE) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true
    ) THEN
      RAISE EXCEPTION 'Only admins can verify users';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."prevent_non_admin_verification"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_sensitive_profile_updates"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  role text := (auth.jwt() ->> 'role');
begin
  -- Service role can update everything.
  if role = 'service_role' then
    return new;
  end if;

  -- Block self-upgrade / billing / verification tampering.
  if (new.tier is distinct from old.tier)
     or (new.subscription_status is distinct from old.subscription_status)
     or (new.subscription_cycle_anchor_day is distinct from old.subscription_cycle_anchor_day)
     or (new.subscription_current_period_start is distinct from old.subscription_current_period_start)
     or (new.subscription_current_period_end is distinct from old.subscription_current_period_end)
     or (new.is_verified is distinct from old.is_verified)
     or (new.verified is distinct from old.verified)
     or (new.verification_status is distinct from old.verification_status)
     or (new.verification_comment is distinct from old.verification_comment)
     or (new.family_slots is distinct from old.family_slots)
     or (new.media_credits is distinct from old.media_credits)
     or (new.stars_count is distinct from old.stars_count)
     or (new.mesh_alert_count is distinct from old.mesh_alert_count)
  then
    raise exception 'forbidden_profile_update';
  end if;

  -- Allow map_visible toggle (and other safe profile fields).
  return new;
end;
$$;


ALTER FUNCTION "public"."prevent_sensitive_profile_updates"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_due_map_alert_notifications"("p_limit" integer DEFAULT 100) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- Legacy queue path intentionally disabled; canonical path is enqueue_broadcast_notifications().
  return 0;
end;
$$;


ALTER FUNCTION "public"."process_due_map_alert_notifications"("p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_identity_cleanup"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
declare
  rec record;
begin
  for rec in select * from public.identity_verification_cleanup_queue where delete_after <= now() loop
    delete from storage.objects where bucket_id = 'identity_verification' and name = rec.object_path;
    delete from public.identity_verification_cleanup_queue where id = rec.id;
  end loop;
end;
$$;


ALTER FUNCTION "public"."process_identity_cleanup"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_notification_windows"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_win record;
  v_body text;
  v_processed int := 0;
begin
  for v_win in
    select *
    from public.notification_aggregation_windows
    where
      -- Initial emit: window closed, not yet fired
      (last_emit_at is null and window_closes_at < now())
      or
      -- Digest emit: in digest window, new activity since last emit
      (last_emit_at is not null and digest_closes_at < now() and count > last_emitted_count)
    order by window_closes_at asc
    limit 200
  loop
    v_body := public.build_aggregation_copy(v_win.kind, v_win.actor_names, v_win.count);

    perform public.enqueue_notification(
      v_win.owner_user_id,
      v_win.category,
      v_win.kind,
      v_win.kind,  -- title (not displayed; category used for routing)
      v_body,
      v_win.href,
      jsonb_build_object(
        'subject_id', v_win.subject_id,
        'subject_type', v_win.subject_type,
        'kind', v_win.kind,
        'count', v_win.count
      )
    );

    update public.notification_aggregation_windows
    set
      last_emit_at      = now(),
      digest_closes_at  = now() + interval '20 minutes',
      last_emitted_count = v_win.count
    where id = v_win.id;

    v_processed := v_processed + 1;
  end loop;

  -- Clean up fully expired windows (digest window closed, no new activity)
  delete from public.notification_aggregation_windows
  where last_emit_at is not null
    and digest_closes_at < now() - interval '1 hour'
    and count = last_emitted_count;

  return v_processed;
end;
$$;


ALTER FUNCTION "public"."process_notification_windows"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_pet_birthdays"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_row record;
  v_age integer;
  v_body text;
  v_processed int := 0;
begin
  for v_row in
    select p.id, p.owner_id, p.name, p.dob
    from public.pets p
    where p.dob is not null
      and extract(month from p.dob) = extract(month from current_date)
      and extract(day from p.dob) = extract(day from current_date)
      and p.owner_id is not null
  loop
    v_age := extract(year from age(current_date, v_row.dob))::integer;

    if v_age = 1 then
      v_body := '🎂 Happy birthday ' || coalesce(v_row.name, 'your pet') || '! They turn 1 today';
    else
      v_body := '🎂 Happy birthday ' || coalesce(v_row.name, 'your pet') || '! They turn ' || v_age || ' today';
    end if;

    perform public.enqueue_notification(
      v_row.owner_id,
      'pets',
      'pet_birthday',
      'Happy birthday!',
      v_body,
      '/pets',
      jsonb_build_object('pet_id', v_row.id, 'age', v_age)
    );

    v_processed := v_processed + 1;
  end loop;

  return v_processed;
end;
$$;


ALTER FUNCTION "public"."process_pet_birthdays"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_pet_reminders"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_row record;
  v_pet_name text;
  v_body text;
  v_processed int := 0;
begin
  for v_row in
    select r.id, r.owner_id, r.pet_id, r.kind, r.reason, r.due_date
    from public.reminders r
    where r.due_date = current_date
  loop
    select coalesce(name, 'your pet') into v_pet_name
    from public.pets
    where id = v_row.pet_id;

    v_body := coalesce(v_row.reason, v_row.kind, 'Reminder');
    v_body := v_body || ' for ' || v_pet_name || ' is due today 🐾';

    perform public.enqueue_notification(
      v_row.owner_id,
      'pets',
      'reminder',
      'Pet reminder',
      v_body,
      '/pets',
      jsonb_build_object(
        'pet_id', v_row.pet_id,
        'reminder_id', v_row.id,
        'kind', v_row.kind,
        'due_date', v_row.due_date
      )
    );

    v_processed := v_processed + 1;
  end loop;

  return v_processed;
end;
$$;


ALTER FUNCTION "public"."process_pet_reminders"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_service_booking_reminders"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  rec record;
  v_sent int := 0;
  v_service_type text;
  v_first_date text;
  v_start_time text;
  v_start_at timestamptz;
  v_minutes_to_start numeric;
begin
  for rec in
    select
      sc.chat_id,
      sc.requester_id,
      sc.provider_id,
      sc.request_card,
      sc.reminder_tomorrow_sent_at,
      sc.reminder_one_hour_sent_at
    from public.service_chats sc
    where sc.status in ('booked', 'in_progress')
      and sc.request_card is not null
  loop
    v_service_type := coalesce(nullif(trim(rec.request_card->>'serviceType'), ''), 'service');
    v_first_date := coalesce(rec.request_card->'requestedDates'->>0, '');
    v_start_time := coalesce(rec.request_card->>'startTime', '');
    if v_first_date = '' or v_start_time = '' then
      continue;
    end if;

    begin
      v_start_at := to_timestamp(v_first_date || ' ' || v_start_time, 'YYYY-MM-DD HH24:MI');
    exception
      when others then
        continue;
    end;

    if v_start_at is null then
      continue;
    end if;

    v_minutes_to_start := extract(epoch from (v_start_at - now())) / 60.0;

    if rec.reminder_tomorrow_sent_at is null
       and v_minutes_to_start <= 1440
       and v_minutes_to_start >= 1320
    then
      perform public.service_notify(
        rec.requester_id,
        'service_reminder_tomorrow',
        'Reminder',
        'Reminder: ' || v_service_type || ' starts tomorrow.',
        '/chats?tab=service&room=' || rec.chat_id::text,
        jsonb_build_object('chatId', rec.chat_id)
      );
      perform public.service_notify(
        rec.provider_id,
        'service_reminder_tomorrow',
        'Reminder',
        'Reminder: ' || v_service_type || ' starts tomorrow.',
        '/chats?tab=service&room=' || rec.chat_id::text,
        jsonb_build_object('chatId', rec.chat_id)
      );
      update public.service_chats
      set reminder_tomorrow_sent_at = now()
      where chat_id = rec.chat_id;
      v_sent := v_sent + 2;
    end if;

    if rec.reminder_one_hour_sent_at is null
       and v_minutes_to_start <= 60
       and v_minutes_to_start >= 40
    then
      perform public.service_notify(
        rec.requester_id,
        'service_reminder_1h',
        'Heads up',
        'Heads up: ' || v_service_type || ' starts in 1 hour!',
        '/chats?tab=service&room=' || rec.chat_id::text,
        jsonb_build_object('chatId', rec.chat_id)
      );
      perform public.service_notify(
        rec.provider_id,
        'service_reminder_1h',
        'Heads up',
        'Heads up: ' || v_service_type || ' starts in 1 hour!',
        '/chats?tab=service&room=' || rec.chat_id::text,
        jsonb_build_object('chatId', rec.chat_id)
      );
      update public.service_chats
      set reminder_one_hour_sent_at = now()
      where chat_id = rec.chat_id;
      v_sent := v_sent + 2;
    end if;
  end loop;

  return v_sent;
end;
$$;


ALTER FUNCTION "public"."process_service_booking_reminders"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_service_payout_releases"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  rec record;
  v_enqueued int := 0;
begin
  for rec in
    select sc.chat_id
    from public.service_chats sc
    where sc.status = 'completed'
      and sc.payout_release_requested_at is not null
      and sc.payout_released_at is null
      and (
        sc.payout_release_attempted_at is null
        or sc.payout_release_attempted_at <= now() - interval '2 minutes'
      )
  loop
    update public.service_chats
    set payout_release_attempted_at = now(),
        updated_at = now()
    where chat_id = rec.chat_id;

    perform net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/release-service-payout',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object('service_chat_id', rec.chat_id)
    );
    v_enqueued := v_enqueued + 1;
  end loop;

  return v_enqueued;
end;
$$;


ALTER FUNCTION "public"."process_service_payout_releases"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_subscription_expiring"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_row record;
  v_processed int := 0;
begin
  for v_row in
    select id, tier
    from public.profiles
    where subscription_current_period_end is not null
      and tier in ('plus', 'gold')
      -- Window: period ends in 2–4 days (cron runs daily; 3d target ± 1d)
      and subscription_current_period_end between now() + interval '2 days'
                                              and now() + interval '4 days'
      and not exists (
        select 1 from public.notification_nudge_log
        where user_id = id
          and kind = 'subscription_expiring_' || tier
          -- Reset guard after 25 days so it fires again on renewal cycle
          and sent_at > now() - interval '25 days'
      )
  loop
    perform public.enqueue_notification(
      v_row.id,
      'systems',
      'subscription_expiring',
      'Plan renewing soon',
      'Your ' || initcap(v_row.tier) || ' plan renews in 3 days — make sure your payment is up to date',
      '/settings',
      jsonb_build_object('tier', v_row.tier)
    );

    insert into public.notification_nudge_log (user_id, kind)
    values (v_row.id, 'subscription_expiring_' || v_row.tier)
    on conflict do nothing;

    v_processed := v_processed + 1;
  end loop;

  return v_processed;
end;
$$;


ALTER FUNCTION "public"."process_subscription_expiring"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_user_report"("p_target_id" "uuid", "p_categories" "text"[], "p_details" "text" DEFAULT NULL::"text", "p_attachment_urls" "text"[] DEFAULT '{}'::"text"[]) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_reporter_id        uuid := auth.uid();
  v_base_score         int;
  v_bonus              int := 0;
  v_final_score        int;
  v_rolling_risk       int;
  v_existing_report_id uuid;
  v_report_id          uuid;
  v_new_status         public.account_status_enum;
  v_expires_at         timestamptz;
  v_immediate          boolean := false;
begin
  if v_reporter_id is null then
    raise exception 'auth_required';
  end if;
  if p_target_id is null or p_target_id = v_reporter_id then
    raise exception 'invalid_target';
  end if;
  if array_length(p_categories, 1) is null then
    raise exception 'categories_required';
  end if;

  -- Base score = weight of highest-severity selected category
  select max(public.report_category_weight(c))
  into v_base_score
  from unnest(p_categories) as c;

  v_base_score := coalesce(v_base_score, 1);

  -- Bonus: +2 if attachment, +1 if details >= 20 chars
  if array_length(p_attachment_urls, 1) > 0   then v_bonus := v_bonus + 2; end if;
  if length(coalesce(p_details, '')) >= 20     then v_bonus := v_bonus + 1; end if;

  v_final_score := least(v_base_score + v_bonus, 8);

  -- Immediate action: severe category + attachment evidence
  if array_length(p_attachment_urls, 1) > 0 and (
    'Unsafe or harmful behavior (online or in-person)' = any(p_categories) or
    'Scams, money requests, or promotions'             = any(p_categories) or
    'Hate, discrimination, or threats'                 = any(p_categories)
  ) then
    v_immediate := true;
  end if;

  -- Anti-abuse: check for existing scored report from this reporter→target in last 30d
  select id into v_existing_report_id
  from public.user_reports
  where reporter_id = v_reporter_id
    and target_id   = p_target_id
    and is_scored   = true
    and window_start > (now() - interval '30 days')
  limit 1;

  if v_existing_report_id is not null then
    -- Append evidence only, do not re-score
    update public.user_reports
    set
      attachment_urls = attachment_urls || coalesce(p_attachment_urls, '{}'),
      details = coalesce(details, '') || E'\n---\n' || coalesce(p_details, '')
    where id = v_existing_report_id;
    return jsonb_build_object('action', 'evidence_appended', 'report_id', v_existing_report_id);
  end if;

  -- Insert scored report
  insert into public.user_reports
    (reporter_id, target_id, categories, score, details, attachment_urls, is_scored, window_start)
  values
    (v_reporter_id, p_target_id, p_categories, v_final_score, p_details, coalesce(p_attachment_urls, '{}'), true, now())
  returning id into v_report_id;

  -- Rolling 30-day risk for target
  select coalesce(sum(score), 0)
  into v_rolling_risk
  from public.user_reports
  where target_id  = p_target_id
    and is_scored  = true
    and window_start > (now() - interval '30 days');

  -- Determine enforcement action
  if v_immediate then
    -- Immediate: 72h suspend
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

  -- Apply to profile (only escalate, never de-escalate automatically)
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
    'rolling_risk', v_rolling_risk
  );
end;
$$;


ALTER FUNCTION "public"."process_user_report"("p_target_id" "uuid", "p_categories" "text"[], "p_details" "text", "p_attachment_urls" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_verification_nudges"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_row record;
  v_milestone text;
  v_days_old integer;
  v_processed int := 0;
begin
  for v_row in
    select id, created_at
    from public.profiles
    where coalesce(verification_status, 'unverified') <> 'verified'
      and created_at is not null
  loop
    v_days_old := extract(day from now() - v_row.created_at)::integer;

    -- Check each milestone in order; send at most once per milestone
    for v_milestone, v_days_old in
      select m.kind, v_days_old
      from (values
        ('verification_nudge_7d',  7),
        ('verification_nudge_30d', 30),
        ('verification_nudge_1yr', 365)
      ) as m(kind, threshold)
      where v_days_old >= m.threshold
        and not exists (
          select 1 from public.notification_nudge_log
          where user_id = v_row.id and kind = m.kind
        )
    loop
      perform public.enqueue_notification(
        v_row.id,
        'systems',
        'verification_nudge',
        'Verify your identity',
        'Verified profiles get more trust and visibility on Huddle — take a moment to verify yours',
        '/verify',
        jsonb_build_object('milestone', v_milestone)
      );

      insert into public.notification_nudge_log (user_id, kind)
      values (v_row.id, v_milestone)
      on conflict do nothing;

      v_processed := v_processed + 1;
    end loop;
  end loop;

  return v_processed;
end;
$$;


ALTER FUNCTION "public"."process_verification_nudges"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_monetized_fields"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Only allow service_role to modify these fields
  IF auth.jwt()->>'role' != 'service_role' THEN
    -- Restore original values if user tries to modify
    NEW.tier = OLD.tier;
    NEW.subscription_status = OLD.subscription_status;
    NEW.stars_count = OLD.stars_count;
    NEW.mesh_alert_count = OLD.mesh_alert_count;
    NEW.media_credits = OLD.media_credits;
    NEW.family_slots = OLD.family_slots;
    NEW.verified = OLD.verified;

    -- Only allow stripe_customer_id to be set once (from NULL)
    IF OLD.stripe_customer_id IS NOT NULL THEN
      NEW.stripe_customer_id = OLD.stripe_customer_id;
    END IF;

    -- Only allow stripe_subscription_id to be set once (from NULL)
    IF OLD.stripe_subscription_id IS NOT NULL THEN
      NEW.stripe_subscription_id = OLD.stripe_subscription_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."protect_monetized_fields"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."protect_monetized_fields"() IS 'Prevents users from tampering with monetized fields via browser console or direct API calls';



CREATE OR REPLACE FUNCTION "public"."purge_expired_cache"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  deleted_count INT;
BEGIN
  DELETE FROM triage_cache
  WHERE expires_at < NOW();

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;


ALTER FUNCTION "public"."purge_expired_cache"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."purge_expired_cache"() IS 'Maintenance function to remove stale cache entries (90-day TTL).';



CREATE OR REPLACE FUNCTION "public"."purge_expired_verification_docs"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
begin
  delete from storage.objects
  where bucket_id = 'identity_verification'
  and name in (
    select verification_document_url -- assuming this matches the storage name
    from public.profiles
    where verification_status in ('Approved', 'Rejected')
    and updated_at < now() - interval '7 days'
  );
end;
$$;


ALTER FUNCTION "public"."purge_expired_verification_docs"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."qms_reset_daily"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  update public.user_quotas
  set
    day_start = current_date,
    thread_posts_today = 0,
    discovery_profiles_today = 0,
    ai_vet_uploads_today = 0,
    updated_at = now()
  where day_start <> current_date;
end;
$$;


ALTER FUNCTION "public"."qms_reset_daily"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."qms_reset_monthly"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  -- Kept for backwards compatibility; monthly rollovers are applied per-user via qms_rollover_all().
  perform 1;
end;
$$;


ALTER FUNCTION "public"."qms_reset_monthly"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."qms_reset_weekly"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  wk date := date_trunc('week', now())::date;
begin
  update public.user_quotas
  set
    week_start = wk,
    broadcast_week_used = 0,
    updated_at = now()
  where week_start <> wk;
end;
$$;


ALTER FUNCTION "public"."qms_reset_weekly"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."qms_rollover_all"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  wk date := date_trunc('week', now())::date;
begin
  -- Daily counters
  update public.user_quotas
  set
    day_start = current_date,
    thread_posts_today = 0,
    discovery_profiles_today = 0,
    discovery_views_today = 0,
    media_usage_today = 0,
    ai_vet_uploads_today = 0,
    updated_at = now()
  where day_start <> current_date;

  -- Weekly counters
  update public.user_quotas
  set
    week_start = wk,
    broadcast_week_used = 0,
    broadcast_alerts_week = 0,
    updated_at = now()
  where week_start <> wk;

  -- Monthly counters (anchor-aware)
  update public.user_quotas uq
  set
    month_start = ms.cycle_start,
    stars_month_used = 0,
    stars_used_cycle = 0,
    broadcast_month_used = 0,
    priority_analyses_month_used = 0,
    updated_at = now()
  from (
    select
      user_id,
      public._qms_cycle_month_start(user_id) as cycle_start
    from public.user_quotas
  ) ms
  where uq.user_id = ms.user_id
    and uq.month_start <> ms.cycle_start;
end;
$$;


ALTER FUNCTION "public"."qms_rollover_all"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."queue_identity_cleanup"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if (new.verification_status in ('verified','unverified')) and new.verification_document_url is not null then
    insert into public.identity_verification_cleanup_queue (user_id, object_path, delete_after)
    values (new.id, new.verification_document_url, now() + interval '7 days');
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."queue_identity_cleanup"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_thread_share_click"("p_thread_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_clicks integer;
begin
  if auth.uid() is null then
    raise exception 'unauthorized';
  end if;

  update public.threads t
  set clicks = coalesce(t.clicks, 0) + 1
  where t.id = p_thread_id
  returning t.clicks into v_clicks;

  if v_clicks is null then
    raise exception 'thread_not_found';
  end if;

  return v_clicks;
end;
$$;


ALTER FUNCTION "public"."record_thread_share_click"("p_thread_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refill_ai_vet_rate_limits"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
begin
  update public.ai_vet_rate_limits
  set tokens = 50,
      last_refill = now()
  where now() - last_refill >= interval '24 hours';
end;
$$;


ALTER FUNCTION "public"."refill_ai_vet_rate_limits"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_identity_verification_status"("p_user_id" "uuid") RETURNS "public"."verification_status_enum"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_profile public.profiles%rowtype;
  v_phone_complete boolean := false;
  v_device_complete boolean := false;
  v_human_status text := 'not_started';
  v_card_status text := 'not_started';
  v_final public.verification_status_enum := 'unverified';
begin
  if p_user_id is null then
    raise exception 'missing_user_id';
  end if;

  select *
  into v_profile
  from public.profiles
  where id = p_user_id;

  if not found then
    raise exception 'profile_not_found';
  end if;

  v_human_status := coalesce(v_profile.human_verification_status, 'not_started');
  v_card_status := coalesce(v_profile.card_verification_status, 'not_started');

  select exists(
    select 1
    from public.device_fingerprint_history d
    where d.user_id = p_user_id
  )
  into v_device_complete;

  select (
    coalesce(nullif(btrim(v_profile.phone), ''), '') <> ''
    or exists (
      select 1
      from auth.users au
      where au.id = p_user_id
        and au.phone_confirmed_at is not null
    )
  )
  into v_phone_complete;

  if v_device_complete
     and v_phone_complete
     and v_human_status = 'passed'
     and v_card_status = 'passed' then
    v_final := 'verified';
  elsif v_human_status <> 'not_started'
     or v_card_status <> 'not_started' then
    v_final := 'pending';
  else
    v_final := 'unverified';
  end if;

  update public.profiles
  set verification_status = v_final,
      is_verified = (v_final = 'verified')
  where id = p_user_id;

  return v_final;
end;
$$;


ALTER FUNCTION "public"."refresh_identity_verification_status"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_service_chat_status"("p_chat_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_sc public.service_chats;
  v_effective_status text;
  v_first_date text;
  v_start_time text;
  v_start_at timestamptz;
  v_service_type text;
begin
  select * into v_sc from public.service_chats where chat_id = p_chat_id;
  if not found then
    raise exception 'service_chat_not_found';
  end if;

  v_effective_status := v_sc.status;

  if v_sc.status = 'booked' then
    v_first_date := coalesce(v_sc.request_card->'requestedDates'->>0, '');
    v_start_time := coalesce(v_sc.request_card->>'startTime', '');
    if v_first_date <> '' and v_start_time <> '' then
      begin
        v_start_at := (v_first_date || ' ' || v_start_time)::timestamptz;
      exception when others then
        v_start_at := null;
      end;

      if v_start_at is not null and now() >= v_start_at then
        update public.service_chats
        set status = 'in_progress',
            in_progress_at = coalesce(in_progress_at, now()),
            updated_at = now()
        where chat_id = p_chat_id
        returning status into v_effective_status;

        if v_sc.in_progress_at is null then
          insert into public.chat_messages (chat_id, sender_id, content)
          values (p_chat_id, v_sc.provider_id, '{"kind":"service_in_progress"}');

          update public.chats
          set last_message_at = now()
          where id = p_chat_id;

          v_service_type := coalesce(nullif(trim(v_sc.request_card->>'serviceType'), ''), 'service');
          perform public.service_notify(
            v_sc.requester_id,
            'service_started',
            'Service started',
            'Your ' || v_service_type || ' has started!',
            '/chats?tab=service&room=' || p_chat_id::text,
            jsonb_build_object('chatId', p_chat_id, 'serviceType', v_service_type)
          );
        end if;
      end if;
    end if;
  end if;

  return v_effective_status;
end;
$$;


ALTER FUNCTION "public"."refresh_service_chat_status"("p_chat_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_subscription_quotas"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update public.profiles
  set
    stars_count = case when tier::text = 'gold' then 3 else 0 end,
    mesh_alert_count = case when tier::text = 'plus' then 20 when tier::text = 'gold' then 999999 else 5 end,
    media_credits = case when tier::text = 'plus' then 10 when tier::text = 'gold' then 50 else 0 end,
    updated_at = now();
end;
$$;


ALTER FUNCTION "public"."refresh_subscription_quotas"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."release_escrow_funds"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  booking_record record;
begin
  for booking_record in
    select *
    from public.marketplace_bookings
    where status in ('confirmed','in_progress')
      and escrow_release_date <= now()
      and escrow_status = 'pending'
  loop
    update public.marketplace_bookings
    set
      status = 'completed',
      escrow_status = 'released',
      updated_at = now()
    where id = booking_record.id;
  end loop;
end;
$$;


ALTER FUNCTION "public"."release_escrow_funds"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."release_escrow_funds"() IS 'Auto-releases escrow funds 48 hours after service completion if no dispute filed';



CREATE OR REPLACE FUNCTION "public"."report_category_weight"("category" "text") RETURNS integer
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select case category
    when 'Spam or fake account'                              then 1
    when 'Inappropriate or offensive content'                then 2
    when 'Harassment or bullying'                            then 3
    when 'Impersonation or stolen photos'                    then 4
    when 'Unsafe or harmful behavior (online or in-person)'  then 5
    when 'Scams, money requests, or promotions'              then 5
    when 'Hate, discrimination, or threats'                  then 6
    when 'Other'                                             then 1
    else 1
  end;
$$;


ALTER FUNCTION "public"."report_category_weight"("category" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."send_service_quote"("p_chat_id" "uuid", "p_quote_card" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_sc public.service_chats;
  v_provider_name text;
  v_service_type text;
  v_is_revision boolean := false;
begin
  select * into v_sc from public.service_chats where chat_id = p_chat_id;
  if not found then raise exception 'service_chat_not_found'; end if;
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if v_sc.provider_id <> v_uid then raise exception 'not_provider'; end if;
  if v_sc.request_card is null then raise exception 'no_request_yet'; end if;
  if v_sc.status <> 'pending' then raise exception 'invalid_status'; end if;

  perform public.validate_service_quote_payload(p_quote_card);

  v_is_revision := v_sc.quote_sent_at is not null;
  v_service_type := coalesce(nullif(trim(v_sc.request_card->>'serviceType'), ''), 'service');

  select coalesce(nullif(trim(display_name), ''), 'Provider')
  into v_provider_name
  from public.profiles
  where id = v_uid;

  update public.service_chats
  set quote_card = p_quote_card,
      quote_sent_at = now(),
      updated_at = now()
  where chat_id = p_chat_id;

  insert into public.chat_messages (chat_id, sender_id, content)
  values (
    p_chat_id,
    v_uid,
    json_build_object(
      'kind', 'service_quote_sent',
      'currency', p_quote_card->>'currency',
      'finalPrice', p_quote_card->>'finalPrice',
      'rate', p_quote_card->>'rate'
    )::text
  );

  update public.chats set last_message_at = now() where id = p_chat_id;

  perform public.service_notify(
    v_sc.requester_id,
    case when v_is_revision then 'service_quote_revised' else 'service_quote_sent' end,
    case when v_is_revision then 'Quote updated' else 'Quote sent' end,
    case
      when v_is_revision then 'Quote Updated: ' || v_provider_name || ' sent a revised quote.'
      else 'New Quote: ' || v_provider_name || ' is ready for ' || v_service_type || '!'
    end,
    '/chats?tab=service&room=' || p_chat_id::text,
    jsonb_build_object('chatId', p_chat_id, 'providerId', v_uid, 'serviceType', v_service_type)
  );
end;
$$;


ALTER FUNCTION "public"."send_service_quote"("p_chat_id" "uuid", "p_quote_card" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."send_service_request"("p_chat_id" "uuid", "p_request_card" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_sc public.service_chats;
  v_service_type text;
  v_requester_name text;
  v_is_update boolean := false;
begin
  select * into v_sc from public.service_chats where chat_id = p_chat_id;
  if not found then raise exception 'service_chat_not_found'; end if;
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if v_sc.requester_id <> v_uid then raise exception 'not_requester'; end if;
  if v_sc.status <> 'pending' then raise exception 'invalid_status'; end if;

  perform public.validate_service_request_payload(p_request_card);

  v_is_update := v_sc.request_sent_at is not null;
  v_service_type := coalesce(nullif(trim(p_request_card->>'serviceType'), ''), 'service');

  select coalesce(nullif(trim(display_name), ''), 'Someone')
  into v_requester_name
  from public.profiles
  where id = v_uid;

  update public.service_chats
  set request_card = p_request_card,
      request_sent_at = now(),
      quote_card = null,
      quote_sent_at = null,
      requester_mark_finished = false,
      provider_mark_finished = false,
      updated_at = now()
  where chat_id = p_chat_id;

  insert into public.chat_messages (chat_id, sender_id, content)
  values (
    p_chat_id,
    v_uid,
    json_build_object(
      'kind', case when v_is_update then 'service_request_updated' else 'service_request_sent' end,
      'serviceType', v_service_type
    )::text
  );

  update public.chats set last_message_at = now() where id = p_chat_id;

  if v_is_update then
    perform public.service_notify(
      v_sc.provider_id,
      'service_request_updated',
      'Request updated',
      v_requester_name || ' changed their request details.',
      '/chats?tab=service&room=' || p_chat_id::text,
      jsonb_build_object('chatId', p_chat_id, 'serviceType', v_service_type, 'requesterId', v_uid)
    );
  end if;
end;
$$;


ALTER FUNCTION "public"."send_service_request"("p_chat_id" "uuid", "p_request_card" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."service_notify"("p_user_id" "uuid", "p_kind" "text", "p_title" "text", "p_body" "text", "p_href" "text", "p_data" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  return public.enqueue_notification(
    p_user_id,
    'services',
    p_kind,
    p_title,
    p_body,
    p_href,
    coalesce(p_data, '{}'::jsonb)
  );
end;
$$;


ALTER FUNCTION "public"."service_notify"("p_user_id" "uuid", "p_kind" "text", "p_title" "text", "p_body" "text", "p_href" "text", "p_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_escrow_release_date"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.status = 'completed' AND NEW.escrow_release_date IS NULL THEN
    NEW.escrow_release_date = NEW.service_end_date + INTERVAL '48 hours';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_escrow_release_date"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_profiles_user_id"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if new.user_id is null or length(new.user_id) = 0 then
    new.user_id := public.generate_uid(10);
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."set_profiles_user_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_user_location"("p_lat" double precision, "p_lng" double precision, "p_pin_hours" integer DEFAULT 2, "p_retention_hours" integer DEFAULT 24, "p_address" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_point geography := st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography;
  v_pin_until timestamptz := now() + (p_pin_hours || ' hours')::interval;
  v_has_pin_address boolean := false;
  v_profile_district text := null;
  v_profile_country text := null;
  v_profile_location_name text := null;
  v_resolved_location_name text := null;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select
    nullif(btrim(location_district), ''),
    nullif(btrim(location_country), ''),
    nullif(btrim(location_name), '')
  into
    v_profile_district,
    v_profile_country,
    v_profile_location_name
  from public.profiles
  where id = v_uid;

  v_resolved_location_name := coalesce(
    nullif(btrim(p_address), ''),
    case
      when v_profile_district is not null and v_profile_country is not null then v_profile_district || ', ' || v_profile_country
      when v_profile_district is not null then v_profile_district
      when v_profile_country is not null then v_profile_country
      else null
    end,
    v_profile_location_name
  );

  update public.profiles
  set
    last_lat = p_lat,
    last_lng = p_lng,
    location = v_point,
    location_geog = v_point,
    location_pinned_until = v_pin_until,
    location_retention_until = now() + (p_retention_hours || ' hours')::interval,
    hide_from_map = false,
    updated_at = now()
  where id = v_uid;

  insert into public.user_locations (
    user_id,
    location,
    location_name,
    is_public,
    expires_at,
    updated_at
  )
  values (
    v_uid,
    v_point,
    v_resolved_location_name,
    true,
    v_pin_until,
    now()
  )
  on conflict (user_id) do update
    set
      location = excluded.location,
      location_name = coalesce(excluded.location_name, public.user_locations.location_name),
      expires_at = excluded.expires_at,
      updated_at = now(),
      is_public = true;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'pins'
      and column_name = 'address'
  )
  into v_has_pin_address;

  if v_has_pin_address then
    update public.pins
    set
      lat = p_lat,
      lng = p_lng,
      address = coalesce(v_resolved_location_name, address),
      is_invisible = false,
      created_at = now()
    where user_id = v_uid
      and thread_id is null;
  else
    update public.pins
    set
      lat = p_lat,
      lng = p_lng,
      is_invisible = false,
      created_at = now()
    where user_id = v_uid
      and thread_id is null;
  end if;

  if not found then
    if v_has_pin_address then
      insert into public.pins (
        user_id,
        lat,
        lng,
        address,
        is_invisible,
        thread_id,
        created_at
      )
      values (
        v_uid,
        p_lat,
        p_lng,
        v_resolved_location_name,
        false,
        null,
        now()
      );
    else
      insert into public.pins (
        user_id,
        lat,
        lng,
        is_invisible,
        thread_id,
        created_at
      )
      values (
        v_uid,
        p_lat,
        p_lng,
        false,
        null,
        now()
      );
    end if;
  end if;
end;
$$;


ALTER FUNCTION "public"."set_user_location"("p_lat" double precision, "p_lng" double precision, "p_pin_hours" integer, "p_retention_hours" integer, "p_address" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."social_discovery"("p_user_id" "uuid", "p_lat" double precision, "p_lng" double precision, "p_radius_m" integer, "p_min_age" integer, "p_max_age" integer, "p_role" "text" DEFAULT NULL::"text", "p_gender" "text" DEFAULT NULL::"text", "p_species" "text"[] DEFAULT NULL::"text"[], "p_pet_size" "text" DEFAULT NULL::"text", "p_advanced" boolean DEFAULT false, "p_height_min" numeric DEFAULT NULL::numeric, "p_height_max" numeric DEFAULT NULL::numeric, "p_only_waved" boolean DEFAULT false, "p_active_only" boolean DEFAULT false) RETURNS TABLE("id" "uuid", "display_name" "text", "avatar_url" "text", "is_verified" boolean, "has_car" boolean, "bio" "text", "relationship_status" "text", "dob" "date", "location_name" "text", "occupation" "text", "school" "text", "major" "text", "gender_genre" "text", "orientation" "text", "height" numeric, "weight" numeric, "weight_unit" "text", "tier" "text", "pets" "jsonb", "pet_species" "text"[], "pet_size" "text", "social_album" "text"[], "show_occupation" boolean, "show_academic" boolean, "show_bio" boolean, "show_relationship_status" boolean, "show_age" boolean, "show_gender" boolean, "show_orientation" boolean, "show_height" boolean, "show_weight" boolean, "social_role" "text", "score" numeric)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with viewer as (
    select
      p.id,
      nullif(btrim(p.location_country), '') as viewer_country,
      coalesce(
        ul.location,
        p.location,
        p.location_geog,
        case
          when p.last_lng is not null and p.last_lat is not null
            then st_setsrid(st_makepoint(p.last_lng, p.last_lat), 4326)::geography
          else null
        end,
        st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography
      ) as viewer_geog,
      coalesce(nullif((row_to_json(p)::jsonb->>'effective_tier'), ''), p.tier::text, 'free'::text) as effective_tier
    from public.profiles p
    left join public.user_locations ul
      on ul.user_id = p.id
      and coalesce(ul.is_public, false) = true
      and (ul.expires_at is null or ul.expires_at > now())
    where p.id = p_user_id
  ),
  pet_data as (
    select
      owner_id,
      jsonb_agg(
        jsonb_build_object(
          'id', id,
          'name', name,
          'species', species,
          'breed', breed,
          'photo_url', photo_url,
          'weight', weight,
          'weight_unit', weight_unit
        )
      ) as pets,
      array_remove(array_agg(distinct species), null) as pet_species,
      max(
        case
          when weight is null then null
          when weight_unit = 'lb' then weight * 0.453592
          else weight
        end
      ) as max_weight_kg
    from public.pets
    where is_active = true
    group by owner_id
  ),
  candidate_location as (
    select distinct on (ul.user_id)
      ul.user_id,
      ul.location
    from public.user_locations ul
    where coalesce(ul.is_public, false) = true
      and (ul.expires_at is null or ul.expires_at > now())
    order by ul.user_id, ul.updated_at desc
  ),
  base as (
    select
      p.*,
      pd.pets,
      pd.pet_species,
      pd.max_weight_kg,
      coalesce(
        cl.location,
        p.location,
        p.location_geog,
        case
          when p.last_lng is not null and p.last_lat is not null
            then st_setsrid(st_makepoint(p.last_lng, p.last_lat), 4326)::geography
          else null
        end
      ) as candidate_geog,
      coalesce(p.last_active_at, p.updated_at, p.created_at) as effective_last_active_at,
      case
        when sp.user_id  is not null then 'nannies'
        when pcp.user_id is not null then 'nannies'
        when p.owns_pets             then 'playdates'
        else 'animal-lovers'
      end as social_role
    from public.profiles p
    left join public.sitter_profiles sp on sp.user_id = p.id
    left join public.pet_care_profiles pcp on pcp.user_id = p.id and pcp.listed = true
    left join pet_data pd on pd.owner_id = p.id
    left join candidate_location cl on cl.user_id = p.id
    where p.id <> p_user_id
      and coalesce(p.non_social, false) = false
      and not exists (
        select 1
        from public.matches m
        where (m.user1_id = p_user_id and m.user2_id = p.id)
           or (m.user1_id = p.id and m.user2_id = p_user_id)
      )
      and not exists (
        select 1
        from public.user_blocks ub
        where (ub.blocker_id = p_user_id and ub.blocked_id = p.id)
           or (ub.blocker_id = p.id and ub.blocked_id = p_user_id)
      )
  ),
  filtered as (
    select
      b.*,
      case
        when b.max_weight_kg is null then null
        when b.max_weight_kg <= 9 then 'Small'
        when b.max_weight_kg <= 22 then 'Medium'
        else 'Large'
      end as pet_size,
      array(
        select distinct btrim(s)
        from unnest(coalesce(b.pet_experience, '{}'::text[]) || coalesce(b.pet_species, '{}'::text[])) as s
        where s is not null and btrim(s) <> ''
      ) as combined_species
    from base b
  )
  select
    f.id,
    f.display_name,
    f.avatar_url,
    (lower(coalesce(f.verification_status::text, '')) = 'verified') as is_verified,
    f.has_car,
    f.bio,
    f.relationship_status,
    f.dob,
    f.location_name,
    f.occupation,
    f.school,
    f.major,
    f.gender_genre,
    f.orientation,
    f.height,
    f.weight,
    f.weight_unit,
    f.tier::text,
    f.pets,
    f.combined_species as pet_species,
    f.pet_size,
    f.social_album,
    f.show_occupation,
    f.show_academic,
    f.show_bio,
    f.show_relationship_status,
    f.show_age,
    f.show_gender,
    f.show_orientation,
    f.show_height,
    f.show_weight,
    f.social_role,
    (
      case when p_species is not null and array_length(p_species, 1) > 0 and f.combined_species && p_species then 100 else 0 end +
      case when lower(coalesce(f.verification_status::text, '')) = 'verified' then 25 else 0 end +
      case when f.has_car then 10 else 0 end +
      case when f.effective_last_active_at >= now() - interval '30 days' then 15 else 0 end
    )::numeric as score
  from filtered f
  cross join viewer v
  where f.dob is not null
    and extract(year from age(current_date, f.dob)) between p_min_age and p_max_age
    and (p_gender is null or p_gender = '' or p_gender = 'Any' or f.gender_genre = p_gender)
    and (
      p_role is null or p_role = ''
      or (p_role = 'nannies'       and f.social_role = 'nannies')
      or (p_role = 'playdates'     and (f.social_role = 'playdates' or coalesce(f.owns_pets, false) = true))
      or (p_role = 'animal-lovers' and f.social_role = 'animal-lovers')
    )
    and (
      p_species is null
      or array_length(p_species, 1) = 0
      or (
        (
          array_length(array_remove(p_species, 'None'), 1) > 0
          and f.combined_species && array_remove(p_species, 'None')
        )
        or (
          'None' = any(p_species)
          and (f.combined_species is null or array_length(f.combined_species, 1) = 0 or 'None' = any(f.combined_species))
        )
      )
    )
    and (p_pet_size is null or p_pet_size = '' or p_pet_size = 'Any' or f.pet_size = p_pet_size)
    and (p_height_min is null or f.height >= p_height_min)
    and (p_height_max is null or f.height <= p_height_max)
    and coalesce(f.hide_from_map, false) = false
    and (
      (p_active_only and f.effective_last_active_at >= now() - interval '7 days')
      or (not p_active_only and f.effective_last_active_at >= now() - interval '30 days')
    )
    and (
      not p_only_waved
      or exists (
        select 1
        from public.waves w
        where coalesce(w.to_user_id, w.receiver_id) = p_user_id
          and coalesce(w.from_user_id, w.sender_id) = f.id
      )
    )
    and (
      (
        f.candidate_geog is not null
        and v.viewer_geog is not null
        and st_dwithin(f.candidate_geog, v.viewer_geog, greatest(1, p_radius_m))
      )
      or (
        nullif(btrim(f.location_country), '') is not null
        and v.viewer_country is not null
        and lower(v.viewer_country) = lower(nullif(btrim(f.location_country), ''))
      )
    )
  order by score desc nulls last, f.effective_last_active_at desc nulls last, f.created_at desc
  limit (select case when effective_tier in ('plus', 'gold') then 200 else 60 end from viewer);
$$;


ALTER FUNCTION "public"."social_discovery"("p_user_id" "uuid", "p_lat" double precision, "p_lng" double precision, "p_radius_m" integer, "p_min_age" integer, "p_max_age" integer, "p_role" "text", "p_gender" "text", "p_species" "text"[], "p_pet_size" "text", "p_advanced" boolean, "p_height_min" numeric, "p_height_max" numeric, "p_only_waved" boolean, "p_active_only" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."social_discovery_legacy"("p_user_id" "uuid", "p_lat" double precision, "p_lng" double precision, "p_radius_m" integer, "p_min_age" integer, "p_max_age" integer) RETURNS TABLE("id" "uuid", "display_name" "text", "avatar_url" "text", "is_verified" boolean, "has_car" boolean, "bio" "text", "last_lat" double precision, "last_lng" double precision)
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  SELECT
    p.id,
    p.display_name,
    p.avatar_url,
    p.is_verified,
    p.has_car,
    p.bio,
    p.last_lat,
    p.last_lng
  FROM public.profiles p
  WHERE p.id <> p_user_id
    AND p.dob IS NOT NULL
    AND (EXTRACT(YEAR FROM age(current_date, p.dob)) BETWEEN p_min_age AND p_max_age)
    AND p.location_geog IS NOT NULL
    AND ST_DWithin(
      p.location_geog,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
      p_radius_m
    )
  ORDER BY p.is_verified DESC, p.created_at DESC
  LIMIT 50;
$$;


ALTER FUNCTION "public"."social_discovery_legacy"("p_user_id" "uuid", "p_lat" double precision, "p_lng" double precision, "p_radius_m" integer, "p_min_age" integer, "p_max_age" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."start_service_now"("p_chat_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_sc public.service_chats;
  v_service_type text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_sc
  from public.service_chats
  where chat_id = p_chat_id;

  if not found then
    raise exception 'service_chat_not_found';
  end if;
  if v_sc.provider_id <> v_uid then
    raise exception 'not_provider';
  end if;

  perform public.refresh_service_chat_status(p_chat_id);
  select * into v_sc
  from public.service_chats
  where chat_id = p_chat_id;

  if v_sc.status = 'in_progress' then
    return;
  end if;

  if v_sc.status <> 'booked' then
    raise exception 'invalid_status';
  end if;

  update public.service_chats
  set status = 'in_progress',
      in_progress_at = coalesce(in_progress_at, now()),
      updated_at = now()
  where chat_id = p_chat_id;

  insert into public.chat_messages (chat_id, sender_id, content)
  values (p_chat_id, v_uid, '{"kind":"service_in_progress"}');

  update public.chats
  set last_message_at = now()
  where id = p_chat_id;

  v_service_type := coalesce(nullif(trim(v_sc.request_card->>'serviceType'), ''), 'service');
  perform public.service_notify(
    v_sc.requester_id,
    'service_started',
    'Service started',
    'Your ' || v_service_type || ' has started!',
    '/chats?tab=service&room=' || p_chat_id::text,
    jsonb_build_object('chatId', p_chat_id, 'serviceType', v_service_type)
  );
end;
$$;


ALTER FUNCTION "public"."start_service_now"("p_chat_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_service_review"("p_chat_id" "uuid", "p_rating" integer, "p_tags" "text"[], "p_review_text" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_sc public.service_chats;
  v_reviewer_name text;
  v_inserted_id uuid;
begin
  select * into v_sc from public.service_chats where chat_id = p_chat_id;
  if not found then raise exception 'service_chat_not_found'; end if;
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if v_sc.requester_id <> v_uid then raise exception 'not_requester'; end if;
  if v_sc.status <> 'completed' then raise exception 'not_completed'; end if;
  if p_rating < 1 or p_rating > 5 then raise exception 'invalid_rating'; end if;

  insert into public.service_reviews (service_chat_id, reviewer_id, provider_id, rating, tags, review_text)
  values (
    v_sc.id,
    v_uid,
    v_sc.provider_id,
    p_rating,
    coalesce(p_tags, '{}'::text[]),
    nullif(trim(coalesce(p_review_text, '')), '')
  )
  on conflict (service_chat_id, reviewer_id) do nothing
  returning id into v_inserted_id;

  if v_inserted_id is not null then
    update public.pet_care_profiles pcp
    set review_count = rollup.review_count,
        rating_avg = rollup.rating_avg,
        updated_at = now()
    from (
      select
        provider_id,
        count(*)::int as review_count,
        round(avg(rating)::numeric, 2) as rating_avg
      from public.service_reviews
      where provider_id = v_sc.provider_id
      group by provider_id
    ) as rollup
    where pcp.user_id = rollup.provider_id;

    select coalesce(nullif(trim(display_name), ''), 'Someone')
    into v_reviewer_name
    from public.profiles
    where id = v_uid;

    perform public.service_notify(
      v_sc.provider_id,
      'service_review_received',
      'Review received',
      'New Feedback: ' || v_reviewer_name || ' left you a review.',
      '/chats?tab=service&room=' || p_chat_id::text,
      jsonb_build_object('chatId', p_chat_id, 'rating', p_rating)
    );
  end if;
end;
$$;


ALTER FUNCTION "public"."submit_service_review"("p_chat_id" "uuid", "p_rating" integer, "p_tags" "text"[], "p_review_text" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_thread_comment_content"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  -- Keep legacy column and new column in sync.
  if new.content is null or new.content = '' then
    new.content := coalesce(new.text, '');
  end if;
  if new.text is null or new.text = '' then
    new.text := new.content;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."sync_thread_comment_content"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_profile_activity"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  update public.profiles
  set
    last_active_at = now(),
    updated_at = now()
  where id = v_uid;
end;
$$;


ALTER FUNCTION "public"."touch_profile_activity"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."unblock_user"("p_blocked_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'Unauthorized';
  end if;
  delete from public.user_blocks
  where blocker_id = v_actor
    and blocked_id = p_blocked_id;
end;
$$;


ALTER FUNCTION "public"."unblock_user"("p_blocked_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."unmatch_and_delete_direct_chat"("p_other_user_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_me uuid := auth.uid();
  v_user1 uuid;
  v_user2 uuid;
  v_chat_id uuid;
begin
  if v_me is null then
    raise exception 'Not authenticated';
  end if;
  if p_other_user_id is null or p_other_user_id = v_me then
    raise exception 'Invalid target user';
  end if;

  if v_me < p_other_user_id then
    v_user1 := v_me;
    v_user2 := p_other_user_id;
  else
    v_user1 := p_other_user_id;
    v_user2 := v_me;
  end if;

  delete from public.matches m
  where m.user1_id = v_user1
    and m.user2_id = v_user2
  returning m.chat_id into v_chat_id;

  if v_chat_id is null then
    select c.id
    into v_chat_id
    from public.chats c
    join public.chat_room_members m1 on m1.chat_id = c.id and m1.user_id = v_me
    join public.chat_room_members m2 on m2.chat_id = c.id and m2.user_id = p_other_user_id
    where c.type = 'direct'
    order by c.created_at desc
    limit 1;
  end if;

  if v_chat_id is not null then
    delete from public.chat_room_members where chat_id = v_chat_id;
    delete from public.chats where id = v_chat_id and type = 'direct';
  end if;

  return v_chat_id;
end;
$$;


ALTER FUNCTION "public"."unmatch_and_delete_direct_chat"("p_other_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."unmatch_user_one_sided"("p_other_user_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_me uuid;
  v_chat_id uuid;
begin
  v_me := auth.uid();
  if v_me is null then
    raise exception 'auth_required';
  end if;

  if p_other_user_id is null or p_other_user_id = v_me then
    raise exception 'invalid_target_user';
  end if;

  select c.id
  into v_chat_id
  from public.chats c
  join public.chat_room_members m1 on m1.chat_id = c.id and m1.user_id = v_me
  join public.chat_room_members m2 on m2.chat_id = c.id and m2.user_id = p_other_user_id
  where coalesce(c.type, 'direct') = 'direct'
  order by c.created_at desc
  limit 1;

  insert into public.user_unmatches(actor_id, target_id, chat_id, created_at)
  values (v_me, p_other_user_id, v_chat_id, now())
  on conflict (actor_id, target_id)
  do update set
    chat_id = excluded.chat_id,
    created_at = excluded.created_at;

  delete from public.matches m
  where (m.user1_id = v_me and m.user2_id = p_other_user_id)
     or (m.user1_id = p_other_user_id and m.user2_id = v_me);

  if v_chat_id is not null then
    delete from public.chat_room_members
    where chat_id = v_chat_id
      and user_id = v_me;
  end if;

  return v_chat_id;
end;
$$;


ALTER FUNCTION "public"."unmatch_user_one_sided"("p_other_user_id" "uuid") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."broadcast_alerts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "creator_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "title" "text",
    "description" "text",
    "address" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "duration_hours" integer NOT NULL,
    "range_km" numeric(6,2) NOT NULL,
    "latitude" double precision NOT NULL,
    "longitude" double precision NOT NULL,
    "geog" "public"."geography"(Point,4326),
    "photo_url" "text",
    "post_on_threads" boolean DEFAULT false NOT NULL,
    "thread_id" "uuid",
    "archived_at" timestamp with time zone,
    "images" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    CONSTRAINT "broadcast_alerts_duration_hours_check" CHECK ((("duration_hours" > 0) AND ("duration_hours" <= 72))),
    CONSTRAINT "broadcast_alerts_latitude_check" CHECK ((("latitude" >= ('-90'::integer)::double precision) AND ("latitude" <= (90)::double precision))),
    CONSTRAINT "broadcast_alerts_longitude_check" CHECK ((("longitude" >= ('-180'::integer)::double precision) AND ("longitude" <= (180)::double precision))),
    CONSTRAINT "broadcast_alerts_range_km_check" CHECK ((("range_km" > (0)::numeric) AND ("range_km" <= (100)::numeric))),
    CONSTRAINT "broadcast_alerts_type_check" CHECK (("type" = ANY (ARRAY['Stray'::"text", 'Lost'::"text", 'Caution'::"text", 'Others'::"text"])))
);


ALTER TABLE "public"."broadcast_alerts" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_broadcast_alert"("p_alert_id" "uuid", "p_patch" "jsonb") RETURNS "public"."broadcast_alerts"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
        when array_position(coalesce(tags, '{}'::text[]), 'News') is null then coalesce(tags, '{}'::text[]) || 'News'
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
$$;


ALTER FUNCTION "public"."update_broadcast_alert"("p_alert_id" "uuid", "p_patch" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_broadcast_alert"("p_alert_id" "uuid", "p_title" "text", "p_description" "text", "p_actor_id" "uuid") RETURNS "public"."broadcast_alerts"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.update_broadcast_alert(
    p_alert_id,
    jsonb_build_object('title', p_title, 'description', p_description)
  );
$$;


ALTER FUNCTION "public"."update_broadcast_alert"("p_alert_id" "uuid", "p_title" "text", "p_description" "text", "p_actor_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_chat_last_message"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE public.chats
  SET last_message_at = NEW.created_at
  WHERE id = NEW.chat_id;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_chat_last_message"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_threads_scores"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
begin
  update public.threads t
  set score = (
    -- time boost: older = higher per spec
    (extract(epoch from (now() - t.created_at)) / 86400.0) * 10
    +
    -- relationship weight: care circle or family membership
    case
      when (
        (p.care_circle is not null and array_length(p.care_circle, 1) > 0)
        or exists (
          select 1
          from public.family_members fm
          where fm.status = 'accepted'
            and (fm.inviter_user_id = p.id or fm.invitee_user_id = p.id)
        )
      ) then 20
      else 0
    end
    +
    -- badge/role weight
    case when p.is_verified then 50 else 0 end
    +
    case when p.tier = 'gold' then 30 else 0 end
    +
    -- engagement
    ((select count(*) from public.thread_comments c where c.thread_id = t.id) * 5)
    + (coalesce(t.likes, 0) * 3)
    + (coalesce(t.clicks, 0) * 1)
    -
    -- decay
    (ln(extract(day from (now() - t.created_at)) + 1) * 5)
  )
  from public.profiles p
  where p.id = t.user_id;
end;
$$;


ALTER FUNCTION "public"."update_threads_scores"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upgrade_user_tier"("p_user_id" "uuid", "p_tier" "text", "p_subscription_status" "text", "p_stripe_subscription_id" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  update public.profiles
  set
    tier = p_tier,
    subscription_status = p_subscription_status,
    stripe_subscription_id = p_stripe_subscription_id,
    subscription_start = coalesce(subscription_start, now()),
    subscription_cycle_anchor_day = coalesce(subscription_cycle_anchor_day, extract(day from now())::int),
    updated_at = now()
  where id = p_user_id;
end;
$$;


ALTER FUNCTION "public"."upgrade_user_tier"("p_user_id" "uuid", "p_tier" "text", "p_subscription_status" "text", "p_stripe_subscription_id" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."upgrade_user_tier"("p_user_id" "uuid", "p_tier" "text", "p_subscription_status" "text", "p_stripe_subscription_id" "text") IS 'Upgrade user subscription tier - only callable by service role via webhooks';



CREATE OR REPLACE FUNCTION "public"."upsert_notification_window"("p_owner_user_id" "uuid", "p_subject_id" "uuid", "p_subject_type" "text", "p_kind" "text", "p_category" "text", "p_href" "text", "p_actor_id" "uuid", "p_actor_name" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_actor uuid := auth.uid();
  v_win record;
begin
  -- Auth check: caller must be the actor
  if v_actor is null or v_actor <> p_actor_id then
    raise exception 'Unauthorized';
  end if;

  -- Do not notify yourself
  if p_owner_user_id = p_actor_id then
    return;
  end if;

  -- Block check
  if public.is_user_blocked(p_owner_user_id, p_actor_id) then
    return;
  end if;

  -- Find an active window: initial (not yet emitted) OR digest (within 20min)
  select * into v_win
  from public.notification_aggregation_windows
  where owner_user_id = p_owner_user_id
    and subject_id = p_subject_id
    and kind = p_kind
    and (
      last_emit_at is null                                  -- initial window not fired yet
      or (last_emit_at is not null and digest_closes_at > now())  -- within digest window
    )
  order by created_at desc
  limit 1;

  if found then
    -- Skip if actor already in this window
    if p_actor_id = any(v_win.actor_ids) then
      return;
    end if;

    update public.notification_aggregation_windows
    set
      actor_ids   = actor_ids || p_actor_id,
      actor_names = actor_names || p_actor_name,
      count       = count + 1
    where id = v_win.id;
  else
    -- Create new window (closes in 60 seconds — pg_cron fires every minute)
    insert into public.notification_aggregation_windows (
      owner_user_id, subject_id, subject_type, kind, category, href,
      actor_ids, actor_names, count, window_closes_at
    ) values (
      p_owner_user_id, p_subject_id, p_subject_type, p_kind, p_category, p_href,
      array[p_actor_id], array[p_actor_name], 1,
      now() + interval '60 seconds'
    );
  end if;
end;
$$;


ALTER FUNCTION "public"."upsert_notification_window"("p_owner_user_id" "uuid", "p_subject_id" "uuid", "p_subject_type" "text", "p_kind" "text", "p_category" "text", "p_href" "text", "p_actor_id" "uuid", "p_actor_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_notification_window_internal"("p_owner_user_id" "uuid", "p_subject_id" "uuid", "p_subject_type" "text", "p_kind" "text", "p_category" "text", "p_href" "text", "p_actor_id" "uuid", "p_actor_name" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_win record;
begin
  -- Do not notify yourself
  if p_owner_user_id = p_actor_id then return; end if;

  -- Block check
  if public.is_user_blocked(p_owner_user_id, p_actor_id) then return; end if;

  -- Find active window (initial or digest)
  select * into v_win
  from public.notification_aggregation_windows
  where owner_user_id = p_owner_user_id
    and subject_id    = p_subject_id
    and kind          = p_kind
    and (
      last_emit_at is null
      or (last_emit_at is not null and digest_closes_at > now())
    )
  order by created_at desc
  limit 1;

  if found then
    -- Skip if this actor is already in the window (dedup)
    if p_actor_id = any(v_win.actor_ids) then return; end if;

    update public.notification_aggregation_windows
    set
      actor_ids   = actor_ids   || p_actor_id,
      actor_names = actor_names || p_actor_name,
      count       = count + 1
    where id = v_win.id;
  else
    insert into public.notification_aggregation_windows (
      owner_user_id, subject_id, subject_type, kind, category, href,
      actor_ids, actor_names, count, window_closes_at
    ) values (
      p_owner_user_id, p_subject_id, p_subject_type, p_kind, p_category, p_href,
      array[p_actor_id], array[p_actor_name], 1,
      now() + interval '60 seconds'
    );
  end if;
end;
$$;


ALTER FUNCTION "public"."upsert_notification_window_internal"("p_owner_user_id" "uuid", "p_subject_id" "uuid", "p_subject_type" "text", "p_kind" "text", "p_category" "text", "p_href" "text", "p_actor_id" "uuid", "p_actor_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_service_quote_payload"("p_quote_card" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if p_quote_card is null or jsonb_typeof(p_quote_card) <> 'object' then
    raise exception 'invalid_quote_payload';
  end if;

  if coalesce(length(trim(p_quote_card->>'currency')) > 0, false) is not true then
    raise exception 'quote_currency_required';
  end if;
  if coalesce(length(trim(p_quote_card->>'finalPrice')) > 0, false) is not true then
    raise exception 'quote_price_required';
  end if;
  if coalesce(length(trim(p_quote_card->>'rate')) > 0, false) is not true then
    raise exception 'quote_rate_required';
  end if;
end;
$$;


ALTER FUNCTION "public"."validate_service_quote_payload"("p_quote_card" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_service_request_payload"("p_request_card" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_dates jsonb := coalesce(p_request_card->'requestedDates', '[]'::jsonb);
  v_has_required boolean;
begin
  if p_request_card is null or jsonb_typeof(p_request_card) <> 'object' then
    raise exception 'invalid_request_payload';
  end if;

  v_has_required :=
    coalesce(length(trim(p_request_card->>'serviceType')) > 0, false)
    and coalesce(length(trim(p_request_card->>'petId')) > 0, false)
    and coalesce(length(trim(p_request_card->>'petType')) > 0, false)
    and coalesce(length(trim(p_request_card->>'startTime')) > 0, false)
    and coalesce(length(trim(p_request_card->>'endTime')) > 0, false)
    and coalesce(length(trim(p_request_card->>'locationArea')) > 0, false);

  if not v_has_required then
    raise exception 'request_fields_required';
  end if;

  if jsonb_typeof(v_dates) <> 'array' or jsonb_array_length(v_dates) = 0 then
    raise exception 'requested_dates_required';
  end if;
end;
$$;


ALTER FUNCTION "public"."validate_service_request_payload"("p_request_card" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_vaccination_dates"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  d date;
begin
  if new.vaccination_dates is not null then
    foreach d in array new.vaccination_dates loop
      if d > current_date then
        raise exception 'Vaccination dates must be <= current date';
      end if;
    end loop;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."validate_vaccination_dates"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."withdraw_service_quote"("p_chat_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_sc public.service_chats;
  v_provider_name text;
begin
  select * into v_sc from public.service_chats where chat_id = p_chat_id;
  if not found then raise exception 'service_chat_not_found'; end if;
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if v_sc.provider_id <> v_uid then raise exception 'not_provider'; end if;
  if v_sc.status <> 'pending' then raise exception 'invalid_status'; end if;

  select coalesce(nullif(trim(display_name), ''), 'Provider')
  into v_provider_name
  from public.profiles
  where id = v_uid;

  update public.service_chats
  set quote_card = null,
      quote_sent_at = null,
      updated_at = now()
  where chat_id = p_chat_id;

  perform public.service_notify(
    v_sc.requester_id,
    'service_quote_withdrawn',
    'Quote withdrawn',
    v_provider_name || ' withdrew their quote. You can update your request to receive a new one.',
    '/chats?tab=service&room=' || p_chat_id::text,
    jsonb_build_object('chatId', p_chat_id, 'providerId', v_uid)
  );
end;
$$;


ALTER FUNCTION "public"."withdraw_service_quote"("p_chat_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."withdraw_service_request"("p_chat_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_sc public.service_chats;
  v_requester_name text;
begin
  select * into v_sc from public.service_chats where chat_id = p_chat_id;
  if not found then raise exception 'service_chat_not_found'; end if;
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if v_sc.requester_id <> v_uid then raise exception 'not_requester'; end if;
  if v_sc.status <> 'pending' then raise exception 'invalid_status'; end if;

  select coalesce(nullif(trim(display_name), ''), 'Someone')
  into v_requester_name
  from public.profiles
  where id = v_uid;

  update public.service_chats
  set request_card = null,
      quote_card = null,
      request_sent_at = null,
      quote_sent_at = null,
      requester_mark_finished = false,
      provider_mark_finished = false,
      updated_at = now()
  where chat_id = p_chat_id;

  insert into public.chat_messages (chat_id, sender_id, content)
  values (
    p_chat_id,
    v_uid,
    json_build_object('kind', 'service_request_withdrawn', 'text', 'You withdrew the request.')::text
  );

  update public.chats set last_message_at = now() where id = p_chat_id;

  perform public.service_notify(
    v_sc.provider_id,
    'service_request_withdrawn',
    'Request withdrawn',
    v_requester_name || ' cancelled this request.',
    '/chats?tab=service&room=' || p_chat_id::text,
    jsonb_build_object('chatId', p_chat_id, 'requesterId', v_uid)
  );
end;
$$;


ALTER FUNCTION "public"."withdraw_service_request"("p_chat_id" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."admin_audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "actor_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "target_user_id" "uuid",
    "notes" "text",
    "details" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."admin_audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_vet_conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "pet_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "title" "text"
);


ALTER TABLE "public"."ai_vet_conversations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_vet_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "content" "text" NOT NULL,
    "media_url" "text",
    "media_analysis" "jsonb",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "ai_vet_messages_role_check" CHECK (("role" = ANY (ARRAY['user'::"text", 'assistant'::"text"])))
);


ALTER TABLE "public"."ai_vet_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_vet_rate_limits" (
    "user_id" "uuid" NOT NULL,
    "tokens" integer DEFAULT 50 NOT NULL,
    "last_refill" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ai_vet_rate_limits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_vet_usage" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "month" "text" NOT NULL,
    "conversation_count" integer DEFAULT 0,
    "message_count" integer DEFAULT 0,
    "image_analysis_count" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."ai_vet_usage" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."alert_interactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "alert_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "interaction_type" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "alert_interactions_interaction_type_check" CHECK (("interaction_type" = ANY (ARRAY['support'::"text", 'report'::"text", 'hide'::"text", 'block_user'::"text"])))
);


ALTER TABLE "public"."alert_interactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."broadcast_alert_interactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "alert_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "interaction_type" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "broadcast_alert_interactions_interaction_type_check" CHECK (("interaction_type" = ANY (ARRAY['support'::"text", 'report'::"text", 'hide'::"text", 'block_user'::"text"])))
);


ALTER TABLE "public"."broadcast_alert_interactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "chat_id" "uuid" NOT NULL
);


ALTER TABLE "public"."chat_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_participants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "chat_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'member'::"text",
    "joined_at" timestamp with time zone DEFAULT "now"(),
    "last_read_at" timestamp with time zone DEFAULT "now"(),
    "is_muted" boolean DEFAULT false,
    CONSTRAINT "chat_participants_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'member'::"text"])))
);


ALTER TABLE "public"."chat_participants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_room_members" (
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "chat_id" "uuid" NOT NULL
);


ALTER TABLE "public"."chat_room_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chats" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "type" "text" NOT NULL,
    "name" "text",
    "avatar_url" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "last_message_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "chats_type_check" CHECK (("type" = ANY (ARRAY['direct'::"text", 'group'::"text", 'service'::"text"])))
);


ALTER TABLE "public"."chats" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."consent_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "consent_type" "text" NOT NULL,
    "consent_version" "text" DEFAULT 'v2.0'::"text" NOT NULL,
    "accepted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "consent_logs_consent_type_check" CHECK (("consent_type" = 'terms_privacy'::"text"))
);


ALTER TABLE "public"."consent_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."device_fingerprint_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "visitor_id" "text" NOT NULL,
    "first_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "matched_banned_user_id" "uuid",
    "risk_flag" boolean DEFAULT false NOT NULL,
    "review_flag" boolean DEFAULT false NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."device_fingerprint_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."discover_match_seen" (
    "viewer_id" "uuid" NOT NULL,
    "matched_user_id" "uuid" NOT NULL,
    "seen_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."discover_match_seen" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."emergency_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "alert_id" "uuid",
    "event_type" "text" NOT NULL,
    "status" "text" NOT NULL,
    "recipients_count" integer DEFAULT 0,
    "success_count" integer DEFAULT 0,
    "failure_count" integer DEFAULT 0,
    "error_message" "text",
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "emergency_logs_event_type_check" CHECK (("event_type" = ANY (ARRAY['ALERT_CREATED'::"text", 'FCM_SENT'::"text", 'MOCK_SENT'::"text", 'ALERT_RESOLVED'::"text"]))),
    CONSTRAINT "emergency_logs_status_check" CHECK (("status" = ANY (ARRAY['SUCCESS'::"text", 'FAILURE'::"text", 'PENDING'::"text"])))
);


ALTER TABLE "public"."emergency_logs" OWNER TO "postgres";


COMMENT ON TABLE "public"."emergency_logs" IS 'Emergency event logs for mesh-alert system. Includes MOCK_SENT entries for testing when FCM keys are not configured.';



CREATE TABLE IF NOT EXISTS "public"."family_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "inviter_user_id" "uuid" NOT NULL,
    "invitee_user_id" "uuid" NOT NULL,
    "status" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "family_members_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'declined'::"text"])))
);


ALTER TABLE "public"."family_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."group_chat_invites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "chat_id" "uuid" NOT NULL,
    "inviter_user_id" "uuid" NOT NULL,
    "invitee_user_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "responded_at" timestamp with time zone,
    "chat_name" "text",
    CONSTRAINT "group_chat_invites_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'declined'::"text"])))
);


ALTER TABLE "public"."group_chat_invites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."hazard_identifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "pet_id" "uuid",
    "image_url" "text" NOT NULL,
    "object_identified" "text",
    "is_hazard" boolean,
    "hazard_type" "text",
    "toxicity_level" "text",
    "ingested" boolean DEFAULT false,
    "immediate_action" "text",
    "ai_response" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "hazard_identifications_hazard_type_check" CHECK (("hazard_type" = ANY (ARRAY['TOXIC_PLANT'::"text", 'TOXIC_FOOD'::"text", 'CHEMICAL'::"text", 'INERT'::"text"]))),
    CONSTRAINT "hazard_identifications_toxicity_level_check" CHECK (("toxicity_level" = ANY (ARRAY['LOW'::"text", 'MODERATE'::"text", 'HIGH'::"text", 'SEVERE'::"text"])))
);


ALTER TABLE "public"."hazard_identifications" OWNER TO "postgres";


COMMENT ON TABLE "public"."hazard_identifications" IS 'AI-powered hazard identification records';



CREATE TABLE IF NOT EXISTS "public"."human_verification_attempts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "challenge_token" "text" NOT NULL,
    "challenge_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'not_started'::"text" NOT NULL,
    "score" numeric(5,2),
    "result_payload" "jsonb" DEFAULT '{}'::"jsonb",
    "evidence_path" "text",
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "human_verification_attempts_status_check" CHECK (("status" = ANY (ARRAY['not_started'::"text", 'pending'::"text", 'passed'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."human_verification_attempts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."identity_card_verifications" (
    "user_id" "uuid" NOT NULL,
    "stripe_customer_id" "text",
    "stripe_setup_intent_id" "text",
    "card_verification_status" "text" DEFAULT 'not_started'::"text" NOT NULL,
    "card_verified" boolean DEFAULT false NOT NULL,
    "card_verified_at" timestamp with time zone,
    "card_brand" "text",
    "card_last4" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "identity_card_verifications_card_verification_status_check" CHECK (("card_verification_status" = ANY (ARRAY['not_started'::"text", 'pending'::"text", 'passed'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."identity_card_verifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."identity_verification_cleanup_queue" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "object_path" "text" NOT NULL,
    "delete_after" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."identity_verification_cleanup_queue" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."location_reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "location_name" "text" NOT NULL,
    "location_type" "text",
    "location" "public"."geography"(Point,4326),
    "reviewer_id" "uuid" NOT NULL,
    "rating" integer,
    "pet_friendly_score" integer,
    "safety_score" integer,
    "review" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "location_reviews_pet_friendly_score_check" CHECK ((("pet_friendly_score" >= 1) AND ("pet_friendly_score" <= 5))),
    CONSTRAINT "location_reviews_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5))),
    CONSTRAINT "location_reviews_safety_score_check" CHECK ((("safety_score" >= 1) AND ("safety_score" <= 5)))
);


ALTER TABLE "public"."location_reviews" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lost_pet_alerts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "pet_id" "uuid",
    "latitude" double precision NOT NULL,
    "longitude" double precision NOT NULL,
    "description" "text",
    "photo_url" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "lost_pet_alerts_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'found'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."lost_pet_alerts" OWNER TO "postgres";


COMMENT ON TABLE "public"."lost_pet_alerts" IS 'Lost pet alerts for Mesh-Alert system';



CREATE TABLE IF NOT EXISTS "public"."map_alert_notification_queue" (
    "alert_id" "uuid" NOT NULL,
    "run_at" timestamp with time zone NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "processed_at" timestamp with time zone,
    "last_error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."map_alert_notification_queue" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."map_alerts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "creator_id" "uuid" NOT NULL,
    "latitude" double precision NOT NULL,
    "longitude" double precision NOT NULL,
    "alert_type" "text" NOT NULL,
    "description" "text",
    "photo_url" "text",
    "is_active" boolean DEFAULT true,
    "support_count" integer DEFAULT 0,
    "report_count" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "location_geog" "public"."geography"(Point,4326),
    "range_meters" integer,
    "expires_at" timestamp with time zone,
    "address" "text",
    "title" "text",
    "thread_id" "uuid",
    "posted_to_threads" boolean DEFAULT false NOT NULL,
    "social_status" "text",
    "social_url" "text",
    "media_urls" "text"[],
    "location_street" "text",
    "location_district" "text",
    "duration_hours" integer,
    "range_km" numeric(6,2),
    "post_on_social" boolean DEFAULT false NOT NULL,
    "social_post_id" "text",
    CONSTRAINT "map_alerts_alert_type_check" CHECK (("alert_type" = ANY (ARRAY['Stray'::"text", 'Lost'::"text", 'Found'::"text", 'Others'::"text"])))
);


ALTER TABLE "public"."map_alerts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."map_checkins" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "location" "public"."geography"(Point,4326) NOT NULL,
    "location_name" "text",
    "location_type" "text",
    "pet_ids" "uuid"[] DEFAULT '{}'::"uuid"[],
    "is_public" boolean DEFAULT true,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "expires_at" timestamp with time zone DEFAULT ("now"() + '24:00:00'::interval)
);


ALTER TABLE "public"."map_checkins" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."marketplace_bookings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "sitter_id" "uuid" NOT NULL,
    "stripe_payment_intent_id" "text" NOT NULL,
    "stripe_transfer_id" "text",
    "amount" integer NOT NULL,
    "platform_fee" integer NOT NULL,
    "sitter_payout" integer NOT NULL,
    "service_start_date" timestamp with time zone NOT NULL,
    "service_end_date" timestamp with time zone NOT NULL,
    "status" "text" DEFAULT 'pending'::"text",
    "escrow_release_date" timestamp with time zone,
    "dispute_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "escrow_status" "text" DEFAULT 'pending'::"text",
    "paid_at" timestamp with time zone,
    "dispute_flag" boolean DEFAULT false,
    "stripe_charge_id" "text",
    "location_name" "text",
    CONSTRAINT "marketplace_bookings_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'confirmed'::"text", 'in_progress'::"text", 'completed'::"text", 'disputed'::"text", 'refunded'::"text"])))
);


ALTER TABLE "public"."marketplace_bookings" OWNER TO "postgres";


COMMENT ON TABLE "public"."marketplace_bookings" IS 'Pet sitter marketplace bookings with escrow management';



COMMENT ON COLUMN "public"."marketplace_bookings"."escrow_release_date" IS 'Auto-release funds 48 hours after service_end_date if no dispute';



CREATE TABLE IF NOT EXISTS "public"."match_preferences" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "looking_for" "text"[] DEFAULT '{}'::"text"[],
    "species_preference" "text"[] DEFAULT '{}'::"text"[],
    "distance_km" integer DEFAULT 5,
    "age_min" integer,
    "age_max" integer,
    "requires_car" boolean DEFAULT false,
    "requires_verification" boolean DEFAULT false,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."match_preferences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."matches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user1_id" "uuid" NOT NULL,
    "user2_id" "uuid" NOT NULL,
    "chat_id" "uuid",
    "matched_at" timestamp with time zone DEFAULT "now"(),
    "last_interaction_at" timestamp with time zone DEFAULT "now"(),
    "is_active" boolean DEFAULT true,
    CONSTRAINT "unique_match" CHECK (("user1_id" < "user2_id"))
);


ALTER TABLE "public"."matches" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."message_reads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "message_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "read_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."message_reads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "chat_id" "uuid" NOT NULL,
    "sender_id" "uuid",
    "content" "text",
    "message_type" "text" DEFAULT 'text'::"text",
    "media_url" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "is_deleted" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "messages_message_type_check" CHECK (("message_type" = ANY (ARRAY['text'::"text", 'image'::"text", 'voice'::"text", 'location'::"text", 'system'::"text"])))
);


ALTER TABLE "public"."messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notice_board" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "author_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "category" "text" NOT NULL,
    "image_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "notice_board_category_check" CHECK (("category" = ANY (ARRAY['Social'::"text", 'Charity'::"text", 'Help'::"text", 'Donations'::"text", 'Neighborhood News'::"text"])))
);


ALTER TABLE "public"."notice_board" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notification_aggregation_windows" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_user_id" "uuid" NOT NULL,
    "subject_id" "uuid" NOT NULL,
    "subject_type" "text" NOT NULL,
    "kind" "text" NOT NULL,
    "category" "text" NOT NULL,
    "href" "text" DEFAULT '/social'::"text" NOT NULL,
    "actor_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "actor_names" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "count" integer DEFAULT 1 NOT NULL,
    "window_closes_at" timestamp with time zone NOT NULL,
    "last_emit_at" timestamp with time zone,
    "digest_closes_at" timestamp with time zone,
    "last_emitted_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."notification_aggregation_windows" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notification_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "alert_id" "uuid",
    "notification_type" "text" NOT NULL,
    "recipients_count" integer DEFAULT 0 NOT NULL,
    "success_count" integer DEFAULT 0 NOT NULL,
    "failure_count" integer DEFAULT 0 NOT NULL,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "notification_logs_notification_type_check" CHECK (("notification_type" = ANY (ARRAY['mesh_alert'::"text", 'emergency'::"text", 'system'::"text"])))
);


ALTER TABLE "public"."notification_logs" OWNER TO "postgres";


COMMENT ON TABLE "public"."notification_logs" IS 'Tracks mesh-alert and emergency notification delivery for analytics and debugging';



CREATE TABLE IF NOT EXISTS "public"."notification_nudge_log" (
    "user_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."notification_nudge_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notification_preferences" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "push_enabled" boolean DEFAULT true,
    "email_enabled" boolean DEFAULT true,
    "new_matches" boolean DEFAULT true,
    "new_messages" boolean DEFAULT true,
    "ai_vet_responses" boolean DEFAULT true,
    "map_alerts" boolean DEFAULT true,
    "notice_board" boolean DEFAULT true,
    "marketing" boolean DEFAULT false,
    "quiet_hours_start" time without time zone,
    "quiet_hours_end" time without time zone,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "pause_all" boolean DEFAULT false NOT NULL,
    "social" boolean DEFAULT true NOT NULL,
    "chats" boolean DEFAULT true NOT NULL,
    "map" boolean DEFAULT true NOT NULL,
    "vet" boolean DEFAULT true NOT NULL,
    "email" boolean DEFAULT true NOT NULL,
    "push_news" boolean DEFAULT true NOT NULL,
    "pets" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."notification_preferences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "message" "text" NOT NULL,
    "type" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "read" boolean DEFAULT false NOT NULL,
    "title" "text" DEFAULT 'Alert'::"text" NOT NULL,
    "body" "text" NOT NULL,
    "data" "jsonb" DEFAULT '{}'::"jsonb",
    "is_read" boolean DEFAULT false,
    "sent_at" timestamp with time zone,
    CONSTRAINT "notifications_type_check" CHECK (("type" = ANY (ARRAY['wave'::"text", 'star'::"text", 'match'::"text", 'message'::"text", 'group_invite'::"text", 'broadcast'::"text", 'mention'::"text", 'thread_reply'::"text", 'booking'::"text", 'system'::"text", 'family_invite'::"text", 'chats'::"text", 'map'::"text", 'social'::"text"])))
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "subscription_id" "uuid",
    "amount" numeric(10,2) NOT NULL,
    "currency" "text" DEFAULT 'HKD'::"text",
    "status" "text" NOT NULL,
    "payment_method" "text",
    "provider_payment_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "payments_status_check" CHECK (("status" = ANY (ARRAY['succeeded'::"text", 'pending'::"text", 'failed'::"text", 'refunded'::"text"])))
);


ALTER TABLE "public"."payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pet_care_profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "story" "text",
    "skills" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "proof_metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "vet_license_found" boolean,
    "days" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "time_blocks" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "other_time_from" "text",
    "other_time_to" "text",
    "emergency_readiness" boolean,
    "min_notice_value" integer,
    "min_notice_unit" "text",
    "location_styles" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "specify_area" boolean DEFAULT false NOT NULL,
    "area_name" "text",
    "area_lat" double precision,
    "area_lng" double precision,
    "completed" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "services_offered" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "services_other" "text",
    "pet_types" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "pet_types_other" "text",
    "dog_sizes" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "currency" "text",
    "starting_price" numeric(12,2),
    "rates" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "stripe_account_id" "text",
    "stripe_payout_status" "text",
    "agreement_accepted" boolean DEFAULT false NOT NULL,
    "agreement_accepted_at" timestamp with time zone,
    "agreement_version" "text",
    "listed" boolean DEFAULT false NOT NULL,
    "view_count" integer DEFAULT 0 NOT NULL,
    "rating_avg" numeric(3,2) DEFAULT 0 NOT NULL,
    "review_count" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "pet_care_profiles_min_notice_unit_check" CHECK (("min_notice_unit" = ANY (ARRAY['hours'::"text", 'days'::"text"]))),
    CONSTRAINT "pet_care_profiles_stripe_payout_status_check" CHECK (("stripe_payout_status" = ANY (ARRAY['pending'::"text", 'complete'::"text"])))
);


ALTER TABLE "public"."pet_care_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "photo_url" "text",
    "name" "text" NOT NULL,
    "species" "text" NOT NULL,
    "breed" "text",
    "gender" "text",
    "weight" numeric,
    "weight_unit" "text" DEFAULT 'kg'::"text",
    "dob" "date",
    "vaccinations" "jsonb" DEFAULT '[]'::"jsonb",
    "medications" "jsonb" DEFAULT '[]'::"jsonb",
    "routine" "text",
    "temperament" "text"[] DEFAULT '{}'::"text"[],
    "vet_contact" "text",
    "microchip_id" "text",
    "bio" "text",
    "is_public" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "is_active" boolean DEFAULT true,
    "neutered_spayed" boolean DEFAULT false,
    "vaccination_dates" "text"[] DEFAULT ARRAY[]::"text"[],
    "next_vaccination_reminder" "date",
    "clinic_name" "text",
    "preferred_vet" "text",
    "phone_no" "text",
    "vet_visit_records" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "set_reminder" "jsonb",
    CONSTRAINT "pets_next_vaccination_future" CHECK ((("next_vaccination_reminder" IS NULL) OR ("next_vaccination_reminder" > CURRENT_DATE))),
    CONSTRAINT "pets_next_vaccination_future_chk" CHECK ((("next_vaccination_reminder" IS NULL) OR ("next_vaccination_reminder" > CURRENT_DATE))),
    CONSTRAINT "pets_weight_lt_100" CHECK ((("weight" IS NULL) OR ("weight" < (100)::numeric)))
);


ALTER TABLE "public"."pets" OWNER TO "postgres";


COMMENT ON COLUMN "public"."pets"."neutered_spayed" IS 'Whether pet has been neutered or spayed';



COMMENT ON COLUMN "public"."pets"."vaccination_dates" IS 'Vaccination dates stored as MM-YYYY format strings';



COMMENT ON COLUMN "public"."pets"."next_vaccination_reminder" IS 'Next scheduled vaccination reminder date';



CREATE TABLE IF NOT EXISTS "public"."pins" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "lat" double precision,
    "lng" double precision,
    "is_invisible" boolean DEFAULT false NOT NULL,
    "thread_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone,
    "is_public" boolean DEFAULT false NOT NULL,
    "address" "text"
);


ALTER TABLE "public"."pins" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."poi_locations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "osm_id" "text" NOT NULL,
    "poi_type" "text" NOT NULL,
    "name" "text" NOT NULL,
    "latitude" double precision NOT NULL,
    "longitude" double precision NOT NULL,
    "address" "text",
    "phone" "text",
    "opening_hours" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "last_harvested_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "poi_locations_poi_type_check" CHECK (("poi_type" = ANY (ARRAY['veterinary'::"text", 'pet_shop'::"text", 'pet_grooming'::"text"])))
);


ALTER TABLE "public"."poi_locations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."post_mentions" (
    "post_id" "uuid" NOT NULL,
    "mentioned_user_id" "uuid" NOT NULL,
    "start_idx" integer NOT NULL,
    "end_idx" integer NOT NULL,
    "social_id_at_time" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "post_mentions_check" CHECK (("end_idx" > "start_idx")),
    CONSTRAINT "post_mentions_start_idx_check" CHECK (("start_idx" >= 0))
);


ALTER TABLE "public"."post_mentions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "display_name" "text",
    "legal_name" "text",
    "phone" "text",
    "gender_genre" "text",
    "dob" "date",
    "height" integer,
    "weight" numeric,
    "weight_unit" "text" DEFAULT 'kg'::"text",
    "degree" "text",
    "school" "text",
    "affiliation" "text",
    "pet_experience" "text"[] DEFAULT '{}'::"text"[],
    "experience_years" numeric DEFAULT 0,
    "relationship_status" "text",
    "has_car" boolean DEFAULT false,
    "languages" "text"[] DEFAULT '{}'::"text"[],
    "location_name" "text",
    "user_role" "text" DEFAULT 'free'::"text",
    "is_verified" boolean DEFAULT false,
    "bio" "text",
    "avatar_url" "text",
    "onboarding_completed" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "major" "text",
    "owns_pets" boolean DEFAULT false,
    "social_availability" boolean DEFAULT false,
    "availability_status" "text"[] DEFAULT '{}'::"text"[],
    "show_gender" boolean DEFAULT true,
    "show_age" boolean DEFAULT true,
    "show_height" boolean DEFAULT true,
    "show_weight" boolean DEFAULT true,
    "show_academic" boolean DEFAULT true,
    "show_affiliation" boolean DEFAULT true,
    "show_bio" boolean DEFAULT true,
    "vouch_score" integer DEFAULT 0,
    "fcm_token" "text",
    "emergency_mode" boolean DEFAULT false,
    "care_circle" "uuid"[] DEFAULT '{}'::"uuid"[],
    "latitude" double precision,
    "longitude" double precision,
    "location" "public"."geography"(Point,4326),
    "verification_document_url" "text",
    "subscription_status" "text" DEFAULT 'free'::"text",
    "payment_method" "text",
    "last_payment_date" timestamp with time zone,
    "orientation" "text",
    "occupation" "text",
    "show_orientation" boolean DEFAULT true,
    "show_occupation" boolean DEFAULT true,
    "tier" "text" DEFAULT 'free'::"text",
    "stripe_customer_id" "text",
    "stripe_subscription_id" "text",
    "stars_count" integer DEFAULT 0,
    "mesh_alert_count" integer DEFAULT 0,
    "media_credits" integer DEFAULT 0,
    "family_slots" integer DEFAULT 0,
    "verified" boolean DEFAULT false,
    "last_lat" double precision,
    "last_lng" double precision,
    "verification_comment" "text",
    "verification_status" "public"."verification_status_enum" DEFAULT 'unverified'::"public"."verification_status_enum",
    "location_country" "text",
    "location_district" "text",
    "user_id" "text",
    "social_album" "text"[] DEFAULT '{}'::"text"[],
    "location_geog" "public"."geography"(Point,4326),
    "role" "text" DEFAULT 'user'::"text",
    "show_relationship_status" boolean DEFAULT true,
    "location_pinned_until" timestamp with time zone,
    "location_retention_until" timestamp with time zone,
    "subscription_cycle_anchor_day" integer,
    "subscription_current_period_start" timestamp with time zone,
    "subscription_current_period_end" timestamp with time zone,
    "last_login" timestamp with time zone DEFAULT "now"(),
    "map_visible" boolean DEFAULT false NOT NULL,
    "subscription_start" timestamp with time zone,
    "prefs" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "email" "text",
    "full_name" "text",
    "posted_to_threads" boolean DEFAULT false NOT NULL,
    "is_admin" boolean DEFAULT false,
    "effective_tier" "public"."tier_enum",
    "non_social" boolean DEFAULT false,
    "hide_from_map" boolean DEFAULT false,
    "last_active_at" timestamp with time zone,
    "human_verification_status" "text" DEFAULT 'not_started'::"text" NOT NULL,
    "human_verified_at" timestamp with time zone,
    "card_verification_status" "text" DEFAULT 'not_started'::"text" NOT NULL,
    "card_verified" boolean DEFAULT false NOT NULL,
    "card_verified_at" timestamp with time zone,
    "card_brand" "text",
    "card_last4" "text",
    "stripe_setup_intent_id" "text",
    "social_id" "text",
    "account_status" "public"."account_status_enum" DEFAULT 'active'::"public"."account_status_enum" NOT NULL,
    "restriction_expires_at" timestamp with time zone,
    "suspension_expires_at" timestamp with time zone,
    CONSTRAINT "profiles_card_verification_status_check" CHECK (("card_verification_status" = ANY (ARRAY['not_started'::"text", 'pending'::"text", 'passed'::"text", 'failed'::"text"]))),
    CONSTRAINT "profiles_family_slots_check" CHECK (("family_slots" >= 0)),
    CONSTRAINT "profiles_human_verification_status_check" CHECK (("human_verification_status" = ANY (ARRAY['not_started'::"text", 'pending'::"text", 'passed'::"text", 'failed'::"text"]))),
    CONSTRAINT "profiles_media_credits_check" CHECK (("media_credits" >= 0)),
    CONSTRAINT "profiles_mesh_alert_count_check" CHECK (("mesh_alert_count" >= 0)),
    CONSTRAINT "profiles_min_age" CHECK (("dob" < (CURRENT_DATE - '13 years'::interval))),
    CONSTRAINT "profiles_stars_count_check" CHECK (("stars_count" >= 0)),
    CONSTRAINT "profiles_subscription_status_check" CHECK (("subscription_status" = ANY (ARRAY['free'::"text", 'premium_pending'::"text", 'premium_active'::"text", 'premium_cancelled'::"text"]))),
    CONSTRAINT "profiles_tier_check" CHECK (("tier" = ANY (ARRAY['free'::"text", 'premium'::"text", 'gold'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON TABLE "public"."profiles" IS 'Truncated for Sprint 1 - Fresh testing slate';



COMMENT ON COLUMN "public"."profiles"."has_car" IS 'Pet driver capability - can transport pets';



COMMENT ON COLUMN "public"."profiles"."languages" IS 'Languages spoken by user for social matching';



COMMENT ON COLUMN "public"."profiles"."is_verified" IS 'Gold badge - only true after manual admin approval';



COMMENT ON COLUMN "public"."profiles"."vouch_score" IS 'Community trust score (0-100)';



COMMENT ON COLUMN "public"."profiles"."emergency_mode" IS 'Break-Glass Privacy emergency mode toggle';



COMMENT ON COLUMN "public"."profiles"."care_circle" IS 'Trusted user IDs for emergency location sharing';



COMMENT ON COLUMN "public"."profiles"."location" IS 'User location as geography(POINT, 4326) for efficient spatial queries. Protected by Break-Glass Privacy RLS.';



COMMENT ON COLUMN "public"."profiles"."subscription_status" IS 'Stripe subscription status';



COMMENT ON COLUMN "public"."profiles"."orientation" IS 'Sexual orientation separate from gender identity';



COMMENT ON COLUMN "public"."profiles"."occupation" IS 'Current job title or occupation';



COMMENT ON COLUMN "public"."profiles"."show_orientation" IS 'Privacy toggle for sexual orientation';



COMMENT ON COLUMN "public"."profiles"."show_occupation" IS 'Privacy toggle for occupation';



COMMENT ON COLUMN "public"."profiles"."tier" IS 'User subscription tier: free, premium, gold';



COMMENT ON COLUMN "public"."profiles"."stripe_customer_id" IS 'Stripe Customer ID (unique)';



COMMENT ON COLUMN "public"."profiles"."stripe_subscription_id" IS 'Active Stripe Subscription ID';



COMMENT ON COLUMN "public"."profiles"."stars_count" IS 'Boost/Star credits for social features';



COMMENT ON COLUMN "public"."profiles"."mesh_alert_count" IS 'Emergency mesh alert credits';



COMMENT ON COLUMN "public"."profiles"."media_credits" IS 'AI Vet media upload credits';



COMMENT ON COLUMN "public"."profiles"."family_slots" IS 'Additional family member slots';



COMMENT ON COLUMN "public"."profiles"."verified" IS 'ID verification status (separate from premium)';



COMMENT ON COLUMN "public"."profiles"."verification_comment" IS 'Admin review comment for verification (pending/approved/rejected).';



COMMENT ON COLUMN "public"."profiles"."subscription_cycle_anchor_day" IS 'Day-of-month (1-31) used as billing cycle anchor for monthly quota resets (Stripe billing_cycle_anchor-derived).';



COMMENT ON COLUMN "public"."profiles"."subscription_current_period_start" IS 'Stripe subscription current_period_start (UTC) for auditing and support.';



COMMENT ON COLUMN "public"."profiles"."subscription_current_period_end" IS 'Stripe subscription current_period_end (UTC) for auditing and support.';



COMMENT ON COLUMN "public"."profiles"."map_visible" IS 'Contract v2.0 Map: when true, user allows their pinned location to be visible to others while location_pinned_until > now().';



COMMENT ON COLUMN "public"."profiles"."subscription_start" IS 'Subscription start timestamp used to anchor monthly quota cycle resets (anniversary-based).';



COMMENT ON COLUMN "public"."profiles"."prefs" IS 'User preferences JSON. Keys include push_notifications_enabled and email_notifications_enabled.';



CREATE OR REPLACE VIEW "public"."profiles_public" AS
 SELECT "id",
    "display_name",
    "avatar_url",
        CASE
            WHEN "show_bio" THEN "bio"
            ELSE NULL::"text"
        END AS "bio",
        CASE
            WHEN "show_gender" THEN "gender_genre"
            ELSE NULL::"text"
        END AS "gender_genre",
        CASE
            WHEN "show_age" THEN "dob"
            ELSE NULL::"date"
        END AS "dob",
        CASE
            WHEN "show_height" THEN "height"
            ELSE NULL::integer
        END AS "height",
        CASE
            WHEN "show_weight" THEN "weight"
            ELSE (NULL::integer)::numeric
        END AS "weight",
    "weight_unit",
        CASE
            WHEN "show_academic" THEN "degree"
            ELSE NULL::"text"
        END AS "degree",
        CASE
            WHEN "show_academic" THEN "school"
            ELSE NULL::"text"
        END AS "school",
        CASE
            WHEN "show_academic" THEN "major"
            ELSE NULL::"text"
        END AS "major",
        CASE
            WHEN "show_affiliation" THEN "affiliation"
            ELSE NULL::"text"
        END AS "affiliation",
    "location_name",
    "is_verified",
    "has_car",
    "user_role",
    "pet_experience",
    "experience_years",
    "languages",
    "relationship_status",
    "owns_pets",
    "social_availability",
    "availability_status",
    "created_at"
   FROM "public"."profiles";


ALTER VIEW "public"."profiles_public" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."push_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "token" "text" NOT NULL,
    "platform" "text" NOT NULL,
    "device_id" "text",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "last_used_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "push_tokens_platform_check" CHECK (("platform" = ANY (ARRAY['ios'::"text", 'android'::"text", 'web'::"text"])))
);


ALTER TABLE "public"."push_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reminders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "pet_id" "uuid" NOT NULL,
    "kind" "text",
    "reason" "text",
    "due_date" "date" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."reminders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reply_mentions" (
    "reply_id" "uuid" NOT NULL,
    "mentioned_user_id" "uuid" NOT NULL,
    "start_idx" integer NOT NULL,
    "end_idx" integer NOT NULL,
    "social_id_at_time" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "reply_mentions_check" CHECK (("end_idx" > "start_idx")),
    CONSTRAINT "reply_mentions_start_idx_check" CHECK (("start_idx" >= 0))
);


ALTER TABLE "public"."reply_mentions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."scan_rate_limits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "scan_timestamp" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."scan_rate_limits" OWNER TO "postgres";


COMMENT ON TABLE "public"."scan_rate_limits" IS 'Rate limiting for free-tier users (3 scans/hour). Premium users bypass this table.';



CREATE TABLE IF NOT EXISTS "public"."service_bookmarks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "provider_user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."service_bookmarks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."service_chats" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "chat_id" "uuid" NOT NULL,
    "requester_id" "uuid" NOT NULL,
    "provider_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "request_card" "jsonb",
    "quote_card" "jsonb",
    "request_sent_at" timestamp with time zone,
    "quote_sent_at" timestamp with time zone,
    "booked_at" timestamp with time zone,
    "in_progress_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "disputed_at" timestamp with time zone,
    "stripe_payment_intent_id" "text",
    "stripe_checkout_session_id" "text",
    "payout_released_at" timestamp with time zone,
    "requester_mark_finished" boolean DEFAULT false NOT NULL,
    "provider_mark_finished" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "request_opened_at" timestamp with time zone,
    "quote_opened_at" timestamp with time zone,
    "payout_hold_until" timestamp with time zone,
    "reminder_tomorrow_sent_at" timestamp with time zone,
    "reminder_one_hour_sent_at" timestamp with time zone,
    "payout_release_requested_at" timestamp with time zone,
    "payout_release_attempted_at" timestamp with time zone,
    "payout_release_lock_token" "text",
    "payout_release_locked_at" timestamp with time zone,
    CONSTRAINT "service_chats_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'booked'::"text", 'in_progress'::"text", 'completed'::"text", 'disputed'::"text"])))
);


ALTER TABLE "public"."service_chats" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."service_disputes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "service_chat_id" "uuid" NOT NULL,
    "filed_by" "uuid" NOT NULL,
    "category" "text" NOT NULL,
    "description" "text" NOT NULL,
    "evidence_urls" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "admin_notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "service_disputes_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'resolved'::"text", 'closed'::"text"])))
);


ALTER TABLE "public"."service_disputes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."service_reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "service_chat_id" "uuid" NOT NULL,
    "reviewer_id" "uuid" NOT NULL,
    "provider_id" "uuid" NOT NULL,
    "rating" integer NOT NULL,
    "tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "review_text" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "service_reviews_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5)))
);


ALTER TABLE "public"."service_reviews" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sitter_profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "stripe_connect_account_id" "text" NOT NULL,
    "onboarding_complete" boolean DEFAULT false,
    "payouts_enabled" boolean DEFAULT false,
    "charges_enabled" boolean DEFAULT false,
    "hourly_rate" integer,
    "bio" "text",
    "services" "jsonb" DEFAULT '[]'::"jsonb",
    "availability" "jsonb" DEFAULT '{}'::"jsonb",
    "rating" numeric(3,2) DEFAULT 0.00,
    "total_bookings" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."sitter_profiles" OWNER TO "postgres";


COMMENT ON TABLE "public"."sitter_profiles" IS 'Pet sitter marketplace profiles with Stripe Connect integration';



CREATE TABLE IF NOT EXISTS "public"."social_interactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "target_id" "uuid" NOT NULL,
    "interaction_type" "text" NOT NULL,
    "reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "social_interactions_interaction_type_check" CHECK (("interaction_type" = ANY (ARRAY['pass'::"text", 'hide'::"text", 'block'::"text", 'report'::"text"])))
);


ALTER TABLE "public"."social_interactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "plan_type" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text",
    "payment_provider" "text",
    "provider_subscription_id" "text",
    "current_period_start" timestamp with time zone NOT NULL,
    "current_period_end" timestamp with time zone NOT NULL,
    "cancel_at" timestamp with time zone,
    "cancelled_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "subscriptions_plan_type_check" CHECK (("plan_type" = ANY (ARRAY['monthly'::"text", 'yearly'::"text"]))),
    CONSTRAINT "subscriptions_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'cancelled'::"text", 'expired'::"text", 'past_due'::"text"])))
);


ALTER TABLE "public"."subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."support_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "subject" "text",
    "message" "text" NOT NULL,
    "email" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "category" "text",
    "contact_method" "text",
    CONSTRAINT "support_requests_contact_method_check" CHECK (("contact_method" = ANY (ARRAY['email'::"text", 'phone'::"text"])))
);


ALTER TABLE "public"."support_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."thread_comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "thread_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "text" "text" NOT NULL,
    "images" "text"[] DEFAULT '{}'::"text"[],
    "created_at" timestamp with time zone DEFAULT "now"(),
    "content" "text" DEFAULT ''::"text" NOT NULL
);


ALTER TABLE "public"."thread_comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."thread_supports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "thread_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."thread_supports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."threads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "tags" "text"[] DEFAULT '{}'::"text"[],
    "hashtags" "text"[] DEFAULT '{}'::"text"[],
    "content" "text" NOT NULL,
    "images" "text"[] DEFAULT '{}'::"text"[],
    "created_at" timestamp with time zone DEFAULT "now"(),
    "likes" integer DEFAULT 0,
    "clicks" integer DEFAULT 0,
    "score" double precision DEFAULT 0,
    "is_map_alert" boolean DEFAULT false NOT NULL,
    "map_id" "uuid",
    "is_public" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."threads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "stripe_event_id" "text" NOT NULL,
    "stripe_session_id" "text",
    "type" "text" NOT NULL,
    "amount" integer,
    "currency" "text" DEFAULT 'usd'::"text",
    "status" "text" DEFAULT 'pending'::"text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "escrow_status" "text",
    "idempotency_key" "text",
    CONSTRAINT "transactions_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'completed'::"text", 'failed'::"text", 'refunded'::"text"]))),
    CONSTRAINT "transactions_type_check" CHECK (("type" = ANY (ARRAY['subscription'::"text", 'star_pack'::"text", 'emergency_alert'::"text", 'vet_media'::"text", 'family_slot'::"text", '5_media_pack'::"text", '7_day_extension'::"text", 'verified_badge'::"text", 'marketplace_booking'::"text", 'card_verification'::"text"])))
);


ALTER TABLE "public"."transactions" OWNER TO "postgres";


COMMENT ON TABLE "public"."transactions" IS 'Full audit trail of all payment events from Stripe webhooks';



COMMENT ON COLUMN "public"."transactions"."stripe_event_id" IS 'Stripe Event ID - ensures idempotency (unique constraint prevents double-processing)';



CREATE TABLE IF NOT EXISTS "public"."triage_cache" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "image_hash" "text" NOT NULL,
    "object_identified" "text" NOT NULL,
    "is_hazard" boolean NOT NULL,
    "hazard_type" "text",
    "toxicity_level" "text",
    "immediate_action" "text",
    "ai_response" "jsonb",
    "hit_count" integer DEFAULT 1,
    "first_cached_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_accessed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '90 days'::interval),
    CONSTRAINT "triage_cache_hazard_type_check" CHECK (("hazard_type" = ANY (ARRAY['TOXIC_PLANT'::"text", 'TOXIC_FOOD'::"text", 'CHEMICAL'::"text", 'INERT'::"text"]))),
    CONSTRAINT "triage_cache_toxicity_level_check" CHECK (("toxicity_level" = ANY (ARRAY['LOW'::"text", 'MODERATE'::"text", 'HIGH'::"text", 'SEVERE'::"text"])))
);


ALTER TABLE "public"."triage_cache" OWNER TO "postgres";


COMMENT ON TABLE "public"."triage_cache" IS 'AI classification cache to reduce GPT-4o-mini API costs. Shared across users for common items (chocolate, grapes, etc).';



CREATE TABLE IF NOT EXISTS "public"."typing_indicators" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "chat_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."typing_indicators" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_blocks" (
    "blocker_id" "uuid" NOT NULL,
    "blocked_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_blocks_blocker_not_self" CHECK (("blocker_id" <> "blocked_id"))
);


ALTER TABLE "public"."user_blocks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_locations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "location" "public"."geography"(Point,4326) NOT NULL,
    "location_name" "text",
    "accuracy_meters" double precision,
    "is_public" boolean DEFAULT false,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "expires_at" timestamp with time zone
);


ALTER TABLE "public"."user_locations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_quotas" (
    "user_id" "uuid" NOT NULL,
    "day_start" "date" DEFAULT CURRENT_DATE NOT NULL,
    "week_start" "date" DEFAULT ("date_trunc"('week'::"text", "now"()))::"date" NOT NULL,
    "month_start" "date" DEFAULT ("date_trunc"('month'::"text", "now"()))::"date" NOT NULL,
    "thread_posts_today" integer DEFAULT 0 NOT NULL,
    "discovery_profiles_today" integer DEFAULT 0 NOT NULL,
    "ai_vet_uploads_today" integer DEFAULT 0 NOT NULL,
    "stars_month_used" integer DEFAULT 0 NOT NULL,
    "broadcast_week_used" integer DEFAULT 0 NOT NULL,
    "broadcast_month_used" integer DEFAULT 0 NOT NULL,
    "priority_analyses_month_used" integer DEFAULT 0 NOT NULL,
    "extras_stars" integer DEFAULT 0 NOT NULL,
    "extras_ai_vet_uploads" integer DEFAULT 0 NOT NULL,
    "extras_broadcasts" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "discovery_views_today" integer DEFAULT 0 NOT NULL,
    "media_usage_today" integer DEFAULT 0 NOT NULL,
    "stars_used_cycle" integer DEFAULT 0 NOT NULL,
    "broadcast_alerts_week" integer DEFAULT 0 NOT NULL,
    "extra_stars" integer DEFAULT 0 NOT NULL,
    "extra_media_10" integer DEFAULT 0 NOT NULL,
    "extra_broadcast_72h" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."user_quotas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_quotas_legacy_20260208" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "day" "date" DEFAULT CURRENT_DATE NOT NULL,
    "ai_images" integer DEFAULT 0 NOT NULL,
    "chat_images" integer DEFAULT 0 NOT NULL,
    "thread_posts" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_quotas_legacy_20260208" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "reporter_id" "uuid" NOT NULL,
    "target_id" "uuid" NOT NULL,
    "categories" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "score" integer DEFAULT 0 NOT NULL,
    "details" "text",
    "attachment_urls" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "is_scored" boolean DEFAULT true NOT NULL,
    "window_start" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_unmatches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "actor_id" "uuid" NOT NULL,
    "target_id" "uuid" NOT NULL,
    "chat_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_unmatches_actor_not_target" CHECK (("actor_id" <> "target_id"))
);


ALTER TABLE "public"."user_unmatches" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."verification_audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "verification_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "performed_by" "uuid",
    "details" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."verification_audit_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."verification_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "request_type" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text",
    "provider" "text",
    "provider_request_id" "text",
    "document_type" "text",
    "document_number_hash" "text",
    "submitted_data" "jsonb",
    "verification_result" "jsonb",
    "reviewed_by" "uuid",
    "rejection_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "expires_at" timestamp with time zone,
    CONSTRAINT "verification_requests_request_type_check" CHECK (("request_type" = ANY (ARRAY['id'::"text", 'biometric'::"text", 'phone'::"text"]))),
    CONSTRAINT "verification_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'approved'::"text", 'rejected'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."verification_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."verification_uploads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "document_type" "text" NOT NULL,
    "document_url" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "rejection_reason" "text",
    "uploaded_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reviewed_at" timestamp with time zone,
    "reviewed_by" "uuid",
    "selfie_url" "text",
    "country" "text",
    "legal_name" "text",
    CONSTRAINT "verification_uploads_document_type_check" CHECK (("document_type" = ANY (ARRAY['passport'::"text", 'id_card'::"text", 'drivers_license'::"text"]))),
    CONSTRAINT "verification_uploads_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."verification_uploads" OWNER TO "postgres";


COMMENT ON TABLE "public"."verification_uploads" IS 'Stores ID and passport verification documents';



CREATE TABLE IF NOT EXISTS "public"."waves" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "from_user_id" "uuid",
    "to_user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "message" "text",
    "receiver_id" "uuid" NOT NULL,
    "responded_at" timestamp with time zone,
    "sender_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text",
    "wave_type" "text" DEFAULT 'standard'::"text",
    CONSTRAINT "waves_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'rejected'::"text", 'expired'::"text"]))),
    CONSTRAINT "waves_wave_type_check" CHECK (("wave_type" = ANY (ARRAY['standard'::"text", 'super'::"text"])))
);


ALTER TABLE "public"."waves" OWNER TO "postgres";


ALTER TABLE ONLY "public"."admin_audit_logs"
    ADD CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_vet_conversations"
    ADD CONSTRAINT "ai_vet_conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_vet_messages"
    ADD CONSTRAINT "ai_vet_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_vet_rate_limits"
    ADD CONSTRAINT "ai_vet_rate_limits_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."ai_vet_usage"
    ADD CONSTRAINT "ai_vet_usage_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_vet_usage"
    ADD CONSTRAINT "ai_vet_usage_user_id_month_key" UNIQUE ("user_id", "month");



ALTER TABLE ONLY "public"."alert_interactions"
    ADD CONSTRAINT "alert_interactions_alert_id_user_id_interaction_type_key" UNIQUE ("alert_id", "user_id", "interaction_type");



ALTER TABLE ONLY "public"."alert_interactions"
    ADD CONSTRAINT "alert_interactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."broadcast_alert_interactions"
    ADD CONSTRAINT "broadcast_alert_interactions_alert_id_user_id_interaction_t_key" UNIQUE ("alert_id", "user_id", "interaction_type");



ALTER TABLE ONLY "public"."broadcast_alert_interactions"
    ADD CONSTRAINT "broadcast_alert_interactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."broadcast_alerts"
    ADD CONSTRAINT "broadcast_alerts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_participants"
    ADD CONSTRAINT "chat_participants_chat_id_user_id_key" UNIQUE ("chat_id", "user_id");



ALTER TABLE ONLY "public"."chat_participants"
    ADD CONSTRAINT "chat_participants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_room_members"
    ADD CONSTRAINT "chat_room_members_pkey" PRIMARY KEY ("chat_id", "user_id");



ALTER TABLE ONLY "public"."chats"
    ADD CONSTRAINT "chats_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."consent_logs"
    ADD CONSTRAINT "consent_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."device_fingerprint_history"
    ADD CONSTRAINT "device_fingerprint_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."device_fingerprint_history"
    ADD CONSTRAINT "device_fingerprint_history_user_id_visitor_id_key" UNIQUE ("user_id", "visitor_id");



ALTER TABLE ONLY "public"."discover_match_seen"
    ADD CONSTRAINT "discover_match_seen_pkey" PRIMARY KEY ("viewer_id", "matched_user_id");



ALTER TABLE ONLY "public"."emergency_logs"
    ADD CONSTRAINT "emergency_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."family_members"
    ADD CONSTRAINT "family_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."group_chat_invites"
    ADD CONSTRAINT "group_chat_invites_chat_id_invitee_user_id_key" UNIQUE ("chat_id", "invitee_user_id");



ALTER TABLE ONLY "public"."group_chat_invites"
    ADD CONSTRAINT "group_chat_invites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hazard_identifications"
    ADD CONSTRAINT "hazard_identifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."human_verification_attempts"
    ADD CONSTRAINT "human_verification_attempts_challenge_token_key" UNIQUE ("challenge_token");



ALTER TABLE ONLY "public"."human_verification_attempts"
    ADD CONSTRAINT "human_verification_attempts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."identity_card_verifications"
    ADD CONSTRAINT "identity_card_verifications_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."identity_verification_cleanup_queue"
    ADD CONSTRAINT "identity_verification_cleanup_queue_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."location_reviews"
    ADD CONSTRAINT "location_reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lost_pet_alerts"
    ADD CONSTRAINT "lost_pet_alerts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."map_alert_notification_queue"
    ADD CONSTRAINT "map_alert_notification_queue_pkey" PRIMARY KEY ("alert_id");



ALTER TABLE ONLY "public"."map_alerts"
    ADD CONSTRAINT "map_alerts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."map_checkins"
    ADD CONSTRAINT "map_checkins_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."marketplace_bookings"
    ADD CONSTRAINT "marketplace_bookings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."marketplace_bookings"
    ADD CONSTRAINT "marketplace_bookings_stripe_payment_intent_id_key" UNIQUE ("stripe_payment_intent_id");



ALTER TABLE ONLY "public"."match_preferences"
    ADD CONSTRAINT "match_preferences_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."match_preferences"
    ADD CONSTRAINT "match_preferences_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_user1_id_user2_id_key" UNIQUE ("user1_id", "user2_id");



ALTER TABLE ONLY "public"."message_reads"
    ADD CONSTRAINT "message_reads_message_id_user_id_key" UNIQUE ("message_id", "user_id");



ALTER TABLE ONLY "public"."message_reads"
    ADD CONSTRAINT "message_reads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notice_board"
    ADD CONSTRAINT "notice_board_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_aggregation_windows"
    ADD CONSTRAINT "notification_aggregation_windows_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_logs"
    ADD CONSTRAINT "notification_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_nudge_log"
    ADD CONSTRAINT "notification_nudge_log_pkey" PRIMARY KEY ("user_id", "kind");



ALTER TABLE ONLY "public"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pet_care_profiles"
    ADD CONSTRAINT "pet_care_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pet_care_profiles"
    ADD CONSTRAINT "pet_care_profiles_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."pets"
    ADD CONSTRAINT "pets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pins"
    ADD CONSTRAINT "pins_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."poi_locations"
    ADD CONSTRAINT "poi_locations_osm_id_key" UNIQUE ("osm_id");



ALTER TABLE ONLY "public"."poi_locations"
    ADD CONSTRAINT "poi_locations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."post_mentions"
    ADD CONSTRAINT "post_mentions_unique" UNIQUE ("post_id", "mentioned_user_id", "start_idx", "end_idx");



ALTER TABLE "public"."profiles"
    ADD CONSTRAINT "profiles_display_name_required" CHECK ((("display_name" IS NOT NULL) AND ("btrim"("display_name") <> ''::"text"))) NOT VALID;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_email_key" UNIQUE ("email");



ALTER TABLE "public"."profiles"
    ADD CONSTRAINT "profiles_phone_e164_like" CHECK (("phone" ~ '^\+[0-9]{7,15}$'::"text")) NOT VALID;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_stripe_customer_id_key" UNIQUE ("stripe_customer_id");



ALTER TABLE "public"."profiles"
    ADD CONSTRAINT "profiles_user_id_len" CHECK (("char_length"("user_id") = 10)) NOT VALID;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_user_id_unique" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."push_tokens"
    ADD CONSTRAINT "push_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_tokens"
    ADD CONSTRAINT "push_tokens_user_id_token_key" UNIQUE ("user_id", "token");



ALTER TABLE ONLY "public"."reminders"
    ADD CONSTRAINT "reminders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reply_mentions"
    ADD CONSTRAINT "reply_mentions_unique" UNIQUE ("reply_id", "mentioned_user_id", "start_idx", "end_idx");



ALTER TABLE ONLY "public"."scan_rate_limits"
    ADD CONSTRAINT "scan_rate_limits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."service_bookmarks"
    ADD CONSTRAINT "service_bookmarks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."service_bookmarks"
    ADD CONSTRAINT "service_bookmarks_user_provider_key" UNIQUE ("user_id", "provider_user_id");



ALTER TABLE ONLY "public"."service_chats"
    ADD CONSTRAINT "service_chats_chat_id_key" UNIQUE ("chat_id");



ALTER TABLE ONLY "public"."service_chats"
    ADD CONSTRAINT "service_chats_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."service_disputes"
    ADD CONSTRAINT "service_disputes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."service_reviews"
    ADD CONSTRAINT "service_reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."service_reviews"
    ADD CONSTRAINT "service_reviews_service_chat_id_reviewer_id_key" UNIQUE ("service_chat_id", "reviewer_id");



ALTER TABLE ONLY "public"."sitter_profiles"
    ADD CONSTRAINT "sitter_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sitter_profiles"
    ADD CONSTRAINT "sitter_profiles_stripe_connect_account_id_key" UNIQUE ("stripe_connect_account_id");



ALTER TABLE ONLY "public"."sitter_profiles"
    ADD CONSTRAINT "sitter_profiles_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."social_interactions"
    ADD CONSTRAINT "social_interactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."social_interactions"
    ADD CONSTRAINT "social_interactions_user_id_target_id_interaction_type_key" UNIQUE ("user_id", "target_id", "interaction_type");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."support_requests"
    ADD CONSTRAINT "support_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."thread_comments"
    ADD CONSTRAINT "thread_comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."thread_supports"
    ADD CONSTRAINT "thread_supports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."thread_supports"
    ADD CONSTRAINT "thread_supports_thread_id_user_id_key" UNIQUE ("thread_id", "user_id");



ALTER TABLE ONLY "public"."threads"
    ADD CONSTRAINT "threads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_idempotency_unique" UNIQUE ("idempotency_key");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_stripe_event_id_key" UNIQUE ("stripe_event_id");



ALTER TABLE ONLY "public"."triage_cache"
    ADD CONSTRAINT "triage_cache_image_hash_key" UNIQUE ("image_hash");



ALTER TABLE ONLY "public"."triage_cache"
    ADD CONSTRAINT "triage_cache_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."typing_indicators"
    ADD CONSTRAINT "typing_indicators_chat_id_user_id_key" UNIQUE ("chat_id", "user_id");



ALTER TABLE ONLY "public"."typing_indicators"
    ADD CONSTRAINT "typing_indicators_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_blocks"
    ADD CONSTRAINT "user_blocks_pkey" PRIMARY KEY ("blocker_id", "blocked_id");



ALTER TABLE ONLY "public"."user_locations"
    ADD CONSTRAINT "user_locations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_locations"
    ADD CONSTRAINT "user_locations_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."user_quotas_legacy_20260208"
    ADD CONSTRAINT "user_quotas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_quotas"
    ADD CONSTRAINT "user_quotas_pkey1" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."user_quotas_legacy_20260208"
    ADD CONSTRAINT "user_quotas_user_id_day_key" UNIQUE ("user_id", "day");



ALTER TABLE ONLY "public"."user_reports"
    ADD CONSTRAINT "user_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_unmatches"
    ADD CONSTRAINT "user_unmatches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_unmatches"
    ADD CONSTRAINT "user_unmatches_unique_pair" UNIQUE ("actor_id", "target_id");



ALTER TABLE ONLY "public"."verification_audit_log"
    ADD CONSTRAINT "verification_audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."verification_requests"
    ADD CONSTRAINT "verification_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."verification_uploads"
    ADD CONSTRAINT "verification_uploads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."waves"
    ADD CONSTRAINT "waves_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."waves"
    ADD CONSTRAINT "waves_sender_id_receiver_id_key" UNIQUE ("sender_id", "receiver_id");



CREATE INDEX "idx_ai_vet_conversations_user_id" ON "public"."ai_vet_conversations" USING "btree" ("user_id");



CREATE INDEX "idx_ai_vet_messages_conversation_id" ON "public"."ai_vet_messages" USING "btree" ("conversation_id");



CREATE INDEX "idx_ai_vet_usage_user_id" ON "public"."ai_vet_usage" USING "btree" ("user_id");



CREATE INDEX "idx_bookings_client" ON "public"."marketplace_bookings" USING "btree" ("client_id");



CREATE INDEX "idx_bookings_escrow_release" ON "public"."marketplace_bookings" USING "btree" ("escrow_release_date") WHERE ("status" = 'completed'::"text");



CREATE INDEX "idx_bookings_sitter" ON "public"."marketplace_bookings" USING "btree" ("sitter_id");



CREATE INDEX "idx_bookings_status" ON "public"."marketplace_bookings" USING "btree" ("status");



CREATE INDEX "idx_broadcast_alert_interactions_alert_id" ON "public"."broadcast_alert_interactions" USING "btree" ("alert_id");



CREATE INDEX "idx_broadcast_alert_interactions_user_id" ON "public"."broadcast_alert_interactions" USING "btree" ("user_id");



CREATE INDEX "idx_broadcast_alerts_archived_at" ON "public"."broadcast_alerts" USING "btree" ("archived_at");



CREATE INDEX "idx_broadcast_alerts_created_at" ON "public"."broadcast_alerts" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_broadcast_alerts_creator_id" ON "public"."broadcast_alerts" USING "btree" ("creator_id");



CREATE INDEX "idx_broadcast_alerts_geog" ON "public"."broadcast_alerts" USING "gist" ("geog");



CREATE INDEX "idx_chat_messages_chat_id_created_at" ON "public"."chat_messages" USING "btree" ("chat_id", "created_at" DESC);



CREATE INDEX "idx_chat_participants_chat_id" ON "public"."chat_participants" USING "btree" ("chat_id");



CREATE INDEX "idx_chat_participants_user_id" ON "public"."chat_participants" USING "btree" ("user_id");



CREATE INDEX "idx_chat_room_members_chat_id" ON "public"."chat_room_members" USING "btree" ("chat_id");



CREATE INDEX "idx_consent_logs_user_id" ON "public"."consent_logs" USING "btree" ("user_id", "accepted_at" DESC);



CREATE INDEX "idx_device_fingerprint_history_matched_banned" ON "public"."device_fingerprint_history" USING "btree" ("matched_banned_user_id");



CREATE INDEX "idx_device_fingerprint_history_user_id" ON "public"."device_fingerprint_history" USING "btree" ("user_id");



CREATE INDEX "idx_device_fingerprint_history_visitor_id" ON "public"."device_fingerprint_history" USING "btree" ("visitor_id");



CREATE INDEX "idx_emergency_logs_alert_id" ON "public"."emergency_logs" USING "btree" ("alert_id");



CREATE INDEX "idx_emergency_logs_created_at" ON "public"."emergency_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_emergency_logs_event_type" ON "public"."emergency_logs" USING "btree" ("event_type");



CREATE INDEX "idx_group_chat_invites_chat_pending" ON "public"."group_chat_invites" USING "btree" ("chat_id", "status", "created_at" DESC);



CREATE INDEX "idx_group_chat_invites_invitee_pending" ON "public"."group_chat_invites" USING "btree" ("invitee_user_id", "status", "created_at" DESC);



CREATE INDEX "idx_hazard_created_at" ON "public"."hazard_identifications" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_hazard_user_id" ON "public"."hazard_identifications" USING "btree" ("user_id");



CREATE INDEX "idx_human_verification_attempts_created" ON "public"."human_verification_attempts" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_human_verification_attempts_user_id" ON "public"."human_verification_attempts" USING "btree" ("user_id");



CREATE INDEX "idx_human_verification_attempts_user_status" ON "public"."human_verification_attempts" USING "btree" ("user_id", "status");



CREATE INDEX "idx_identity_card_verifications_status" ON "public"."identity_card_verifications" USING "btree" ("card_verification_status");



CREATE INDEX "idx_location_reviews_reviewer_id" ON "public"."location_reviews" USING "btree" ("reviewer_id");



CREATE INDEX "idx_lost_pet_location" ON "public"."lost_pet_alerts" USING "gist" ("public"."st_setsrid"("public"."st_makepoint"("longitude", "latitude"), 4326));



CREATE INDEX "idx_map_alerts_active_expires" ON "public"."map_alerts" USING "btree" ("is_active", "expires_at" DESC);



CREATE INDEX "idx_map_alerts_creator_id" ON "public"."map_alerts" USING "btree" ("creator_id");



CREATE INDEX "idx_map_alerts_is_active" ON "public"."map_alerts" USING "btree" ("is_active");



CREATE INDEX "idx_map_alerts_location_geog" ON "public"."map_alerts" USING "gist" ("location_geog");



CREATE INDEX "idx_map_alerts_location_gist" ON "public"."map_alerts" USING "gist" ("location_geog");



CREATE INDEX "idx_map_checkins_user_id" ON "public"."map_checkins" USING "btree" ("user_id");



CREATE INDEX "idx_matches_user1_id" ON "public"."matches" USING "btree" ("user1_id");



CREATE INDEX "idx_matches_user2_id" ON "public"."matches" USING "btree" ("user2_id");



CREATE INDEX "idx_message_reads_message_id" ON "public"."message_reads" USING "btree" ("message_id");



CREATE INDEX "idx_message_reads_user_id" ON "public"."message_reads" USING "btree" ("user_id");



CREATE INDEX "idx_messages_chat_id" ON "public"."messages" USING "btree" ("chat_id", "created_at" DESC);



CREATE INDEX "idx_messages_sender_id" ON "public"."messages" USING "btree" ("sender_id");



CREATE INDEX "idx_notification_logs_alert_id" ON "public"."notification_logs" USING "btree" ("alert_id");



CREATE INDEX "idx_notification_logs_created_at" ON "public"."notification_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_notifications_is_read" ON "public"."notifications" USING "btree" ("user_id", "is_read");



CREATE INDEX "idx_notifications_unread" ON "public"."notifications" USING "btree" ("user_id", "read") WHERE ("read" = false);



CREATE INDEX "idx_notifications_user" ON "public"."notifications" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_notifications_user_id" ON "public"."notifications" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_payments_user_id" ON "public"."payments" USING "btree" ("user_id");



CREATE INDEX "idx_pet_care_profiles_listed_updated_at_desc" ON "public"."pet_care_profiles" USING "btree" ("listed", "updated_at" DESC);



CREATE INDEX "idx_pet_care_profiles_listed_view_count_desc" ON "public"."pet_care_profiles" USING "btree" ("listed", "view_count" DESC);



CREATE INDEX "idx_pets_species" ON "public"."pets" USING "btree" ("species");



CREATE INDEX "idx_poi_locations_osm_id" ON "public"."poi_locations" USING "btree" ("osm_id");



CREATE INDEX "idx_poi_locations_type_active" ON "public"."poi_locations" USING "btree" ("poi_type", "is_active") WHERE ("is_active" = true);



CREATE INDEX "idx_profiles_last_login" ON "public"."profiles" USING "btree" ("last_login" DESC);



CREATE INDEX "idx_profiles_location" ON "public"."profiles" USING "gist" ("public"."st_setsrid"("public"."st_makepoint"("longitude", "latitude"), 4326));



CREATE INDEX "idx_profiles_location_geography" ON "public"."profiles" USING "gist" ("location");



CREATE INDEX "idx_profiles_location_gist" ON "public"."profiles" USING "gist" ("location");



CREATE INDEX "idx_profiles_social_availability" ON "public"."profiles" USING "btree" ("social_availability") WHERE ("social_availability" = true);



CREATE INDEX "idx_profiles_stripe_customer" ON "public"."profiles" USING "btree" ("stripe_customer_id");



CREATE INDEX "idx_profiles_subscription_status" ON "public"."profiles" USING "btree" ("subscription_status");



CREATE INDEX "idx_profiles_tier" ON "public"."profiles" USING "btree" ("tier");



CREATE INDEX "idx_reminders_owner_due" ON "public"."reminders" USING "btree" ("owner_id", "due_date");



CREATE INDEX "idx_reminders_pet_due" ON "public"."reminders" USING "btree" ("pet_id", "due_date");



CREATE INDEX "idx_scan_rate_limits_user_time" ON "public"."scan_rate_limits" USING "btree" ("user_id", "scan_timestamp" DESC);



CREATE INDEX "idx_service_bookmarks_provider_user_id" ON "public"."service_bookmarks" USING "btree" ("provider_user_id");



CREATE INDEX "idx_service_bookmarks_user_id" ON "public"."service_bookmarks" USING "btree" ("user_id");



CREATE INDEX "idx_sitter_rating" ON "public"."sitter_profiles" USING "btree" ("rating" DESC);



CREATE INDEX "idx_sitter_stripe_connect" ON "public"."sitter_profiles" USING "btree" ("stripe_connect_account_id");



CREATE INDEX "idx_sitter_user" ON "public"."sitter_profiles" USING "btree" ("user_id");



CREATE INDEX "idx_social_interactions_target_id" ON "public"."social_interactions" USING "btree" ("target_id");



CREATE INDEX "idx_social_interactions_user_id" ON "public"."social_interactions" USING "btree" ("user_id");



CREATE INDEX "idx_thread_supports_thread_id" ON "public"."thread_supports" USING "btree" ("thread_id");



CREATE INDEX "idx_thread_supports_user_id" ON "public"."thread_supports" USING "btree" ("user_id");



CREATE INDEX "idx_transactions_created" ON "public"."transactions" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_transactions_stripe_event" ON "public"."transactions" USING "btree" ("stripe_event_id");



CREATE INDEX "idx_transactions_type" ON "public"."transactions" USING "btree" ("type");



CREATE INDEX "idx_transactions_user" ON "public"."transactions" USING "btree" ("user_id");



CREATE INDEX "idx_triage_cache_expiry" ON "public"."triage_cache" USING "btree" ("expires_at");



CREATE INDEX "idx_triage_cache_hash" ON "public"."triage_cache" USING "btree" ("image_hash");



CREATE INDEX "idx_user_blocks_blocked_id" ON "public"."user_blocks" USING "btree" ("blocked_id");



CREATE INDEX "idx_user_locations_geography" ON "public"."user_locations" USING "gist" ("location");



CREATE INDEX "idx_user_quotas_day" ON "public"."user_quotas" USING "btree" ("day_start");



CREATE INDEX "idx_user_unmatches_actor" ON "public"."user_unmatches" USING "btree" ("actor_id", "created_at" DESC);



CREATE INDEX "idx_user_unmatches_chat" ON "public"."user_unmatches" USING "btree" ("chat_id");



CREATE INDEX "idx_user_unmatches_target" ON "public"."user_unmatches" USING "btree" ("target_id", "created_at" DESC);



CREATE INDEX "idx_verification_audit_log_performed_by" ON "public"."verification_audit_log" USING "btree" ("performed_by");



CREATE INDEX "idx_verification_requests_user_id" ON "public"."verification_requests" USING "btree" ("user_id");



CREATE INDEX "idx_verification_uploads_status" ON "public"."verification_uploads" USING "btree" ("status");



CREATE INDEX "idx_verification_uploads_user_id" ON "public"."verification_uploads" USING "btree" ("user_id");



CREATE INDEX "idx_waves_from" ON "public"."waves" USING "btree" ("from_user_id", "created_at" DESC);



CREATE INDEX "idx_waves_receiver_id" ON "public"."waves" USING "btree" ("receiver_id");



CREATE INDEX "idx_waves_sender_id" ON "public"."waves" USING "btree" ("sender_id");



CREATE INDEX "idx_waves_status" ON "public"."waves" USING "btree" ("status");



CREATE INDEX "idx_waves_to" ON "public"."waves" USING "btree" ("to_user_id", "created_at" DESC);



CREATE INDEX "notif_agg_windows_lookup" ON "public"."notification_aggregation_windows" USING "btree" ("owner_user_id", "subject_id", "kind") WHERE ("last_emit_at" IS NULL);



CREATE UNIQUE INDEX "pins_one_active_self_pin" ON "public"."pins" USING "btree" ("user_id") WHERE (("thread_id" IS NULL) AND ("user_id" IS NOT NULL));



CREATE INDEX "pins_user_id_created_at_idx" ON "public"."pins" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "post_mentions_mentioned_user_id_idx" ON "public"."post_mentions" USING "btree" ("mentioned_user_id");



CREATE INDEX "post_mentions_post_id_idx" ON "public"."post_mentions" USING "btree" ("post_id");



CREATE INDEX "profiles_location_geog_gix" ON "public"."profiles" USING "gist" ("location_geog");



CREATE INDEX "profiles_location_idx" ON "public"."profiles" USING "gist" ("location");



CREATE UNIQUE INDEX "profiles_social_id_unique_idx" ON "public"."profiles" USING "btree" ("lower"("social_id")) WHERE ("social_id" IS NOT NULL);



CREATE INDEX "reply_mentions_mentioned_user_id_idx" ON "public"."reply_mentions" USING "btree" ("mentioned_user_id");



CREATE INDEX "reply_mentions_reply_id_idx" ON "public"."reply_mentions" USING "btree" ("reply_id");



CREATE INDEX "service_chats_provider_idx" ON "public"."service_chats" USING "btree" ("provider_id");



CREATE INDEX "service_chats_requester_idx" ON "public"."service_chats" USING "btree" ("requester_id");



CREATE INDEX "service_chats_status_idx" ON "public"."service_chats" USING "btree" ("status");



CREATE INDEX "user_reports_reporter_target_idx" ON "public"."user_reports" USING "btree" ("reporter_id", "target_id", "window_start" DESC) WHERE ("is_scored" = true);



CREATE UNIQUE INDEX "waves_from_to_unique" ON "public"."waves" USING "btree" ("from_user_id", "to_user_id");



CREATE OR REPLACE TRIGGER "award_sitter_vouch_trigger" AFTER UPDATE ON "public"."marketplace_bookings" FOR EACH ROW EXECUTE FUNCTION "public"."award_sitter_vouch"();



CREATE OR REPLACE TRIGGER "on_new_match" AFTER INSERT ON "public"."matches" FOR EACH ROW EXECUTE FUNCTION "public"."create_match_chat"();



CREATE OR REPLACE TRIGGER "on_new_message" AFTER INSERT ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."update_chat_last_message"();



CREATE OR REPLACE TRIGGER "on_wave_accepted" AFTER UPDATE ON "public"."waves" FOR EACH ROW EXECUTE FUNCTION "public"."check_for_match"();



CREATE OR REPLACE TRIGGER "protect_profiles_monetization" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."protect_monetized_fields"();



CREATE OR REPLACE TRIGGER "set_booking_escrow_release" BEFORE INSERT OR UPDATE ON "public"."marketplace_bookings" FOR EACH ROW EXECUTE FUNCTION "public"."set_escrow_release_date"();



CREATE OR REPLACE TRIGGER "set_pet_care_profiles_updated_at" BEFORE UPDATE ON "public"."pet_care_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_alert_interactions_counts_del" AFTER DELETE ON "public"."alert_interactions" FOR EACH ROW EXECUTE FUNCTION "public"."map_alerts_apply_interaction_counts"();



CREATE OR REPLACE TRIGGER "trg_alert_interactions_counts_ins" AFTER INSERT ON "public"."alert_interactions" FOR EACH ROW EXECUTE FUNCTION "public"."map_alerts_apply_interaction_counts"();



CREATE OR REPLACE TRIGGER "trg_broadcast_alert_report_notify" AFTER INSERT ON "public"."broadcast_alert_interactions" FOR EACH ROW EXECUTE FUNCTION "public"."notify_broadcast_alert_hidden"();



CREATE OR REPLACE TRIGGER "trg_broadcast_alerts_set_geog" BEFORE INSERT OR UPDATE OF "latitude", "longitude" ON "public"."broadcast_alerts" FOR EACH ROW EXECUTE FUNCTION "public"."broadcast_alerts_set_geog"();



CREATE OR REPLACE TRIGGER "trg_map_alerts_auto_hide" BEFORE UPDATE OF "report_count" ON "public"."map_alerts" FOR EACH ROW EXECUTE FUNCTION "public"."map_alerts_auto_hide_on_reports"();



CREATE OR REPLACE TRIGGER "trg_map_alerts_contract" BEFORE INSERT ON "public"."map_alerts" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_map_alert_contract"();



CREATE OR REPLACE TRIGGER "trg_notify_account_status" AFTER UPDATE OF "account_status" ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."notify_account_status_change"();



CREATE OR REPLACE TRIGGER "trg_notify_group_chat_invite_insert" AFTER INSERT ON "public"."group_chat_invites" FOR EACH ROW EXECUTE FUNCTION "public"."notify_group_chat_invite_insert"();



CREATE OR REPLACE TRIGGER "trg_notify_new_chat_message" AFTER INSERT ON "public"."chat_messages" FOR EACH ROW EXECUTE FUNCTION "public"."notify_new_chat_message"();



CREATE OR REPLACE TRIGGER "trg_notify_no_stars" AFTER UPDATE OF "stars_count" ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."notify_no_stars"();



CREATE OR REPLACE TRIGGER "trg_notify_on_map_alert_insert" AFTER INSERT ON "public"."map_alerts" FOR EACH ROW EXECUTE FUNCTION "public"."enqueue_map_alert_notification"();



CREATE OR REPLACE TRIGGER "trg_notify_profile_verified" AFTER UPDATE OF "verification_status" ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."notify_profile_verified"();



CREATE OR REPLACE TRIGGER "trg_notify_provider_listed_on_service" AFTER UPDATE OF "listed" ON "public"."pet_care_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."notify_provider_listed_on_service"();



CREATE OR REPLACE TRIGGER "trg_notify_thread_comment" AFTER INSERT ON "public"."thread_comments" FOR EACH ROW EXECUTE FUNCTION "public"."notify_thread_comment"();



CREATE OR REPLACE TRIGGER "trg_notify_thread_support" AFTER INSERT ON "public"."thread_supports" FOR EACH ROW EXECUTE FUNCTION "public"."notify_thread_support"();



CREATE OR REPLACE TRIGGER "trg_prevent_non_admin_verification" BEFORE UPDATE OF "verification_status", "is_verified" ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_non_admin_verification"();



CREATE OR REPLACE TRIGGER "trg_prevent_sensitive_profile_updates" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_sensitive_profile_updates"();



CREATE OR REPLACE TRIGGER "trg_queue_identity_cleanup" AFTER UPDATE OF "verification_status" ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."queue_identity_cleanup"();



CREATE OR REPLACE TRIGGER "trg_reminders_updated_at" BEFORE UPDATE ON "public"."reminders" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_set_profiles_user_id" BEFORE INSERT ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_profiles_user_id"();



CREATE OR REPLACE TRIGGER "trg_sync_thread_comment_content" BEFORE INSERT OR UPDATE ON "public"."thread_comments" FOR EACH ROW EXECUTE FUNCTION "public"."sync_thread_comment_content"();



CREATE OR REPLACE TRIGGER "trg_validate_vaccination_dates" BEFORE INSERT OR UPDATE ON "public"."pets" FOR EACH ROW EXECUTE FUNCTION "public"."validate_vaccination_dates"();



CREATE OR REPLACE TRIGGER "update_ai_vet_conversations_updated_at" BEFORE UPDATE ON "public"."ai_vet_conversations" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_bookings_updated_at" BEFORE UPDATE ON "public"."marketplace_bookings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_chats_updated_at" BEFORE UPDATE ON "public"."chats" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_messages_updated_at" BEFORE UPDATE ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_pets_updated_at" BEFORE UPDATE ON "public"."pets" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_sitter_profiles_updated_at" BEFORE UPDATE ON "public"."sitter_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_transactions_updated_at" BEFORE UPDATE ON "public"."transactions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."admin_audit_logs"
    ADD CONSTRAINT "admin_audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_vet_conversations"
    ADD CONSTRAINT "ai_vet_conversations_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ai_vet_conversations"
    ADD CONSTRAINT "ai_vet_conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_vet_messages"
    ADD CONSTRAINT "ai_vet_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."ai_vet_conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_vet_rate_limits"
    ADD CONSTRAINT "ai_vet_rate_limits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_vet_usage"
    ADD CONSTRAINT "ai_vet_usage_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."alert_interactions"
    ADD CONSTRAINT "alert_interactions_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "public"."map_alerts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."alert_interactions"
    ADD CONSTRAINT "alert_interactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."broadcast_alert_interactions"
    ADD CONSTRAINT "broadcast_alert_interactions_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "public"."broadcast_alerts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."broadcast_alert_interactions"
    ADD CONSTRAINT "broadcast_alert_interactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."broadcast_alerts"
    ADD CONSTRAINT "broadcast_alerts_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."chat_participants"
    ADD CONSTRAINT "chat_participants_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_participants"
    ADD CONSTRAINT "chat_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_room_members"
    ADD CONSTRAINT "chat_room_members_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_room_members"
    ADD CONSTRAINT "chat_room_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chats"
    ADD CONSTRAINT "chats_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."consent_logs"
    ADD CONSTRAINT "consent_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."device_fingerprint_history"
    ADD CONSTRAINT "device_fingerprint_history_matched_banned_user_id_fkey" FOREIGN KEY ("matched_banned_user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."device_fingerprint_history"
    ADD CONSTRAINT "device_fingerprint_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."discover_match_seen"
    ADD CONSTRAINT "discover_match_seen_matched_user_id_fkey" FOREIGN KEY ("matched_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."discover_match_seen"
    ADD CONSTRAINT "discover_match_seen_viewer_id_fkey" FOREIGN KEY ("viewer_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."emergency_logs"
    ADD CONSTRAINT "emergency_logs_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "public"."lost_pet_alerts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."family_members"
    ADD CONSTRAINT "family_members_invitee_user_id_fkey" FOREIGN KEY ("invitee_user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."family_members"
    ADD CONSTRAINT "family_members_inviter_user_id_fkey" FOREIGN KEY ("inviter_user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_chat_invites"
    ADD CONSTRAINT "group_chat_invites_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_chat_invites"
    ADD CONSTRAINT "group_chat_invites_invitee_user_id_fkey" FOREIGN KEY ("invitee_user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_chat_invites"
    ADD CONSTRAINT "group_chat_invites_inviter_user_id_fkey" FOREIGN KEY ("inviter_user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."hazard_identifications"
    ADD CONSTRAINT "hazard_identifications_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."hazard_identifications"
    ADD CONSTRAINT "hazard_identifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."human_verification_attempts"
    ADD CONSTRAINT "human_verification_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."identity_card_verifications"
    ADD CONSTRAINT "identity_card_verifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."location_reviews"
    ADD CONSTRAINT "location_reviews_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lost_pet_alerts"
    ADD CONSTRAINT "lost_pet_alerts_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lost_pet_alerts"
    ADD CONSTRAINT "lost_pet_alerts_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."map_alert_notification_queue"
    ADD CONSTRAINT "map_alert_notification_queue_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "public"."map_alerts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."map_alerts"
    ADD CONSTRAINT "map_alerts_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."map_alerts"
    ADD CONSTRAINT "map_alerts_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."map_checkins"
    ADD CONSTRAINT "map_checkins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."marketplace_bookings"
    ADD CONSTRAINT "marketplace_bookings_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."marketplace_bookings"
    ADD CONSTRAINT "marketplace_bookings_sitter_id_fkey" FOREIGN KEY ("sitter_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."match_preferences"
    ADD CONSTRAINT "match_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_user1_id_fkey" FOREIGN KEY ("user1_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_user2_id_fkey" FOREIGN KEY ("user2_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_reads"
    ADD CONSTRAINT "message_reads_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."chat_messages"("id") ON DELETE CASCADE NOT VALID;



ALTER TABLE ONLY "public"."message_reads"
    ADD CONSTRAINT "message_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notice_board"
    ADD CONSTRAINT "notice_board_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_aggregation_windows"
    ADD CONSTRAINT "notification_aggregation_windows_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_logs"
    ADD CONSTRAINT "notification_logs_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "public"."lost_pet_alerts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_nudge_log"
    ADD CONSTRAINT "notification_nudge_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pet_care_profiles"
    ADD CONSTRAINT "pet_care_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pets"
    ADD CONSTRAINT "pets_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."post_mentions"
    ADD CONSTRAINT "post_mentions_mentioned_user_id_fkey" FOREIGN KEY ("mentioned_user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."post_mentions"
    ADD CONSTRAINT "post_mentions_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."threads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."push_tokens"
    ADD CONSTRAINT "push_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reminders"
    ADD CONSTRAINT "reminders_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reminders"
    ADD CONSTRAINT "reminders_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reply_mentions"
    ADD CONSTRAINT "reply_mentions_mentioned_user_id_fkey" FOREIGN KEY ("mentioned_user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reply_mentions"
    ADD CONSTRAINT "reply_mentions_reply_id_fkey" FOREIGN KEY ("reply_id") REFERENCES "public"."thread_comments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."scan_rate_limits"
    ADD CONSTRAINT "scan_rate_limits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."service_bookmarks"
    ADD CONSTRAINT "service_bookmarks_provider_user_id_fkey" FOREIGN KEY ("provider_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."service_bookmarks"
    ADD CONSTRAINT "service_bookmarks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."service_chats"
    ADD CONSTRAINT "service_chats_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."service_chats"
    ADD CONSTRAINT "service_chats_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."service_chats"
    ADD CONSTRAINT "service_chats_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."service_disputes"
    ADD CONSTRAINT "service_disputes_filed_by_fkey" FOREIGN KEY ("filed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."service_disputes"
    ADD CONSTRAINT "service_disputes_service_chat_id_fkey" FOREIGN KEY ("service_chat_id") REFERENCES "public"."service_chats"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."service_reviews"
    ADD CONSTRAINT "service_reviews_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."service_reviews"
    ADD CONSTRAINT "service_reviews_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."service_reviews"
    ADD CONSTRAINT "service_reviews_service_chat_id_fkey" FOREIGN KEY ("service_chat_id") REFERENCES "public"."service_chats"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sitter_profiles"
    ADD CONSTRAINT "sitter_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."social_interactions"
    ADD CONSTRAINT "social_interactions_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."social_interactions"
    ADD CONSTRAINT "social_interactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."support_requests"
    ADD CONSTRAINT "support_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."thread_comments"
    ADD CONSTRAINT "thread_comments_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."thread_comments"
    ADD CONSTRAINT "thread_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."thread_supports"
    ADD CONSTRAINT "thread_supports_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."thread_supports"
    ADD CONSTRAINT "thread_supports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."threads"
    ADD CONSTRAINT "threads_map_id_fkey" FOREIGN KEY ("map_id") REFERENCES "public"."map_alerts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."threads"
    ADD CONSTRAINT "threads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."typing_indicators"
    ADD CONSTRAINT "typing_indicators_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."typing_indicators"
    ADD CONSTRAINT "typing_indicators_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_blocks"
    ADD CONSTRAINT "user_blocks_blocked_id_fkey" FOREIGN KEY ("blocked_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_blocks"
    ADD CONSTRAINT "user_blocks_blocker_id_fkey" FOREIGN KEY ("blocker_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_locations"
    ADD CONSTRAINT "user_locations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_quotas"
    ADD CONSTRAINT "user_quotas_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_reports"
    ADD CONSTRAINT "user_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_reports"
    ADD CONSTRAINT "user_reports_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_unmatches"
    ADD CONSTRAINT "user_unmatches_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_unmatches"
    ADD CONSTRAINT "user_unmatches_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_unmatches"
    ADD CONSTRAINT "user_unmatches_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."verification_audit_log"
    ADD CONSTRAINT "verification_audit_log_performed_by_fkey" FOREIGN KEY ("performed_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."verification_audit_log"
    ADD CONSTRAINT "verification_audit_log_verification_id_fkey" FOREIGN KEY ("verification_id") REFERENCES "public"."verification_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."verification_requests"
    ADD CONSTRAINT "verification_requests_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."verification_requests"
    ADD CONSTRAINT "verification_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."verification_uploads"
    ADD CONSTRAINT "verification_uploads_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."verification_uploads"
    ADD CONSTRAINT "verification_uploads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."waves"
    ADD CONSTRAINT "waves_from_user_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."waves"
    ADD CONSTRAINT "waves_receiver_id_fkey" FOREIGN KEY ("receiver_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."waves"
    ADD CONSTRAINT "waves_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."waves"
    ADD CONSTRAINT "waves_to_user_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



CREATE POLICY "Admins can update all bookings" ON "public"."marketplace_bookings" FOR UPDATE USING ((("auth"."jwt"() ->> 'role'::"text") = 'admin'::"text"));



CREATE POLICY "Admins can update verification status" ON "public"."verification_uploads" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."is_admin" = true)))));



CREATE POLICY "Admins can view audit logs" ON "public"."admin_audit_logs" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."is_admin" = true)))));



CREATE POLICY "Admins can view verification uploads" ON "public"."verification_uploads" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."is_admin" = true)))));



CREATE POLICY "Anon can read active poi_locations" ON "public"."poi_locations" FOR SELECT TO "anon" USING (("is_active" = true));



CREATE POLICY "Anyone can read active poi_locations" ON "public"."poi_locations" FOR SELECT USING (("is_active" = true));



CREATE POLICY "Anyone can view active lost pet alerts" ON "public"."lost_pet_alerts" FOR SELECT USING (("status" = 'active'::"text"));



CREATE POLICY "Anyone can view notices" ON "public"."notice_board" FOR SELECT USING (true);



CREATE POLICY "Anyone can view public pets" ON "public"."pets" FOR SELECT USING ((("is_public" = true) OR ("owner_id" = "auth"."uid"())));



CREATE POLICY "Anyone can view sitter profiles" ON "public"."sitter_profiles" FOR SELECT USING (true);



CREATE POLICY "Audit logs insert by actor" ON "public"."admin_audit_logs" FOR INSERT WITH CHECK (("actor_id" = "auth"."uid"()));



CREATE POLICY "Authenticated users can insert alerts" ON "public"."map_alerts" FOR INSERT WITH CHECK (("creator_id" = "auth"."uid"()));



CREATE POLICY "Authenticated users can insert notices" ON "public"."notice_board" FOR INSERT WITH CHECK (("author_id" = "auth"."uid"()));



CREATE POLICY "Service role full access poi_locations" ON "public"."poi_locations" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role has full access to bookings" ON "public"."marketplace_bookings" USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));



CREATE POLICY "Service role has full access to sitter profiles" ON "public"."sitter_profiles" USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));



CREATE POLICY "Service role has full access to transactions" ON "public"."transactions" USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));



CREATE POLICY "Service role manages quotas" ON "public"."user_quotas_legacy_20260208" USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text")) WITH CHECK ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));



CREATE POLICY "User can read own quotas" ON "public"."user_quotas_legacy_20260208" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can create AI conversations" ON "public"."ai_vet_conversations" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can create bookings as client" ON "public"."marketplace_bookings" FOR INSERT WITH CHECK (("auth"."uid"() = "client_id"));



CREATE POLICY "Users can create hazard scans" ON "public"."hazard_identifications" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can create their own alerts" ON "public"."lost_pet_alerts" FOR INSERT WITH CHECK (("auth"."uid"() = "owner_id"));



CREATE POLICY "Users can delete own alerts" ON "public"."map_alerts" FOR DELETE USING (("creator_id" = "auth"."uid"()));



CREATE POLICY "Users can delete own interactions" ON "public"."alert_interactions" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can delete own notices" ON "public"."notice_board" FOR DELETE USING (("author_id" = "auth"."uid"()));



CREATE POLICY "Users can delete own pets" ON "public"."pets" FOR DELETE USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "Users can insert interactions" ON "public"."alert_interactions" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can insert own location" ON "public"."user_locations" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can insert own pet_care_profile" ON "public"."pet_care_profiles" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can insert own pets" ON "public"."pets" FOR INSERT WITH CHECK (("owner_id" = "auth"."uid"()));



CREATE POLICY "Users can read own pet_care_profile" ON "public"."pet_care_profiles" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can send messages in their chats" ON "public"."messages" FOR INSERT WITH CHECK ((("sender_id" = "auth"."uid"()) AND ("chat_id" IN ( SELECT "chat_participants"."chat_id"
   FROM "public"."chat_participants"
  WHERE ("chat_participants"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can send waves" ON "public"."waves" FOR INSERT WITH CHECK (("sender_id" = "auth"."uid"()));



CREATE POLICY "Users can update own alerts" ON "public"."map_alerts" FOR UPDATE USING (("creator_id" = "auth"."uid"()));



CREATE POLICY "Users can update own location" ON "public"."user_locations" FOR UPDATE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can update own notices" ON "public"."notice_board" FOR UPDATE USING (("author_id" = "auth"."uid"()));



CREATE POLICY "Users can update own notifications" ON "public"."notifications" FOR UPDATE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can update own pet_care_profile" ON "public"."pet_care_profiles" FOR UPDATE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can update own pets" ON "public"."pets" FOR UPDATE USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "Users can update own sitter profile" ON "public"."sitter_profiles" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own alerts" ON "public"."lost_pet_alerts" FOR UPDATE USING (("auth"."uid"() = "owner_id"));



CREATE POLICY "Users can update waves they received" ON "public"."waves" FOR UPDATE USING (("receiver_id" = "auth"."uid"()));



CREATE POLICY "Users can upload verification documents" ON "public"."verification_uploads" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view messages in own conversations" ON "public"."ai_vet_messages" FOR SELECT USING (("conversation_id" IN ( SELECT "ai_vet_conversations"."id"
   FROM "public"."ai_vet_conversations"
  WHERE ("ai_vet_conversations"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can view messages in their chats" ON "public"."messages" FOR SELECT USING (("chat_id" IN ( SELECT "chat_participants"."chat_id"
   FROM "public"."chat_participants"
  WHERE ("chat_participants"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can view own AI conversations" ON "public"."ai_vet_conversations" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can view own bookings" ON "public"."marketplace_bookings" FOR SELECT USING ((("auth"."uid"() = "client_id") OR ("auth"."uid"() = "sitter_id")));



CREATE POLICY "Users can view own interactions" ON "public"."alert_interactions" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can view own notifications" ON "public"."notifications" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can view own subscriptions" ON "public"."subscriptions" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can view own transactions" ON "public"."transactions" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own verification uploads" ON "public"."verification_uploads" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view public locations or own location" ON "public"."user_locations" FOR SELECT USING ((("is_public" = true) OR ("user_id" = "auth"."uid"())));



CREATE POLICY "Users can view their matches" ON "public"."matches" FOR SELECT USING ((("user1_id" = "auth"."uid"()) OR ("user2_id" = "auth"."uid"())));



CREATE POLICY "Users can view their own hazard scans" ON "public"."hazard_identifications" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view waves sent to them or by them" ON "public"."waves" FOR SELECT USING ((("sender_id" = "auth"."uid"()) OR ("receiver_id" = "auth"."uid"())));



ALTER TABLE "public"."admin_audit_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_vet_conversations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ai_vet_conversations_owner_insert" ON "public"."ai_vet_conversations" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "ai_vet_conversations_owner_select" ON "public"."ai_vet_conversations" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "ai_vet_conversations_owner_update" ON "public"."ai_vet_conversations" FOR UPDATE USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."ai_vet_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_vet_rate_limits" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ai_vet_rate_limits_owner_select" ON "public"."ai_vet_rate_limits" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "ai_vet_rate_limits_owner_upsert" ON "public"."ai_vet_rate_limits" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."ai_vet_usage" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ai_vet_usage delete own" ON "public"."ai_vet_usage" FOR DELETE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "ai_vet_usage insert own" ON "public"."ai_vet_usage" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "ai_vet_usage select own" ON "public"."ai_vet_usage" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "ai_vet_usage update own" ON "public"."ai_vet_usage" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."alert_interactions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "authenticated_users_read_cache" ON "public"."triage_cache" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "authenticated_users_update_cache_hits" ON "public"."triage_cache" FOR UPDATE USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "authenticated_users_write_cache" ON "public"."triage_cache" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



COMMENT ON POLICY "authenticated_users_write_cache" ON "public"."triage_cache" IS 'Allows client-side cache population after AI scans to reduce API costs';



ALTER TABLE "public"."broadcast_alert_interactions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "broadcast_alert_interactions_delete_own" ON "public"."broadcast_alert_interactions" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "broadcast_alert_interactions_insert_own" ON "public"."broadcast_alert_interactions" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "broadcast_alert_interactions_select_authenticated" ON "public"."broadcast_alert_interactions" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."broadcast_alerts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "broadcast_alerts_blocked_select_guard" ON "public"."broadcast_alerts" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((NOT "public"."is_user_blocked"("auth"."uid"(), "creator_id")));



CREATE POLICY "broadcast_alerts_delete_own" ON "public"."broadcast_alerts" FOR DELETE TO "authenticated" USING (("creator_id" = "auth"."uid"()));



CREATE POLICY "broadcast_alerts_insert_own" ON "public"."broadcast_alerts" FOR INSERT TO "authenticated" WITH CHECK (("creator_id" = "auth"."uid"()));



CREATE POLICY "broadcast_alerts_update_own" ON "public"."broadcast_alerts" FOR UPDATE TO "authenticated" USING (("creator_id" = "auth"."uid"())) WITH CHECK (("creator_id" = "auth"."uid"()));



ALTER TABLE "public"."chat_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "chat_messages_blocked_insert_guard" ON "public"."chat_messages" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((("sender_id" = "auth"."uid"()) AND (NOT (EXISTS ( SELECT 1
   FROM "public"."chat_room_members" "m"
  WHERE (("m"."chat_id" = "chat_messages"."chat_id") AND ("m"."user_id" <> "auth"."uid"()) AND "public"."is_user_blocked"("auth"."uid"(), "m"."user_id")))))));



CREATE POLICY "chat_messages_insert" ON "public"."chat_messages" FOR INSERT TO "authenticated" WITH CHECK ((("sender_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."chat_room_members" "m"
  WHERE (("m"."chat_id" = "chat_messages"."chat_id") AND ("m"."user_id" = "auth"."uid"()))))));



CREATE POLICY "chat_messages_select" ON "public"."chat_messages" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."chat_room_members" "m"
  WHERE (("m"."chat_id" = "chat_messages"."chat_id") AND ("m"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."chat_participants" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "chat_participants_select_by_membership" ON "public"."chat_participants" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."chat_room_members" "m"
  WHERE (("m"."chat_id" = "chat_participants"."chat_id") AND ("m"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."chat_room_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "chat_room_members_blocked_insert_guard" ON "public"."chat_room_members" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((NOT "public"."is_user_blocked"("auth"."uid"(), "user_id")));



CREATE POLICY "chat_room_members_delete" ON "public"."chat_room_members" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "chat_room_members_insert" ON "public"."chat_room_members" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."chats" "c"
  WHERE (("c"."id" = "chat_room_members"."chat_id") AND ("c"."created_by" = "auth"."uid"()))))));



CREATE POLICY "chat_room_members_select" ON "public"."chat_room_members" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."is_chat_member"("chat_id", "auth"."uid"())));



ALTER TABLE "public"."chats" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "chats_insert_own" ON "public"."chats" FOR INSERT TO "authenticated" WITH CHECK (("created_by" = "auth"."uid"()));



CREATE POLICY "chats_select_by_creator" ON "public"."chats" FOR SELECT TO "authenticated" USING (("created_by" = "auth"."uid"()));



CREATE POLICY "chats_select_by_membership" ON "public"."chats" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."chat_room_members" "m"
  WHERE (("m"."chat_id" = "chats"."id") AND ("m"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."consent_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "consent_logs_insert_own" ON "public"."consent_logs" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "consent_logs_read_own" ON "public"."consent_logs" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "consent_logs_service_role_all" ON "public"."consent_logs" USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text")) WITH CHECK ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));



ALTER TABLE "public"."device_fingerprint_history" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "device_fingerprint_history_select_own" ON "public"."device_fingerprint_history" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."discover_match_seen" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "discover_match_seen_insert_own" ON "public"."discover_match_seen" FOR INSERT TO "authenticated" WITH CHECK (("viewer_id" = "auth"."uid"()));



CREATE POLICY "discover_match_seen_select_own" ON "public"."discover_match_seen" FOR SELECT TO "authenticated" USING (("viewer_id" = "auth"."uid"()));



ALTER TABLE "public"."emergency_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."family_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "family_members_owner_insert" ON "public"."family_members" FOR INSERT WITH CHECK (("auth"."uid"() = "inviter_user_id"));



CREATE POLICY "family_members_owner_select" ON "public"."family_members" FOR SELECT USING ((("auth"."uid"() = "inviter_user_id") OR ("auth"."uid"() = "invitee_user_id")));



CREATE POLICY "family_members_owner_update" ON "public"."family_members" FOR UPDATE USING ((("auth"."uid"() = "inviter_user_id") OR ("auth"."uid"() = "invitee_user_id")));



ALTER TABLE "public"."group_chat_invites" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "group_chat_invites_delete_creator" ON "public"."group_chat_invites" FOR DELETE TO "authenticated" USING ((("inviter_user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."chats" "c"
  WHERE (("c"."id" = "group_chat_invites"."chat_id") AND ("c"."created_by" = "auth"."uid"()))))));



CREATE POLICY "group_chat_invites_insert_creator" ON "public"."group_chat_invites" FOR INSERT TO "authenticated" WITH CHECK ((("inviter_user_id" = "auth"."uid"()) AND ("invitee_user_id" <> "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."chats" "c"
  WHERE (("c"."id" = "group_chat_invites"."chat_id") AND ("c"."created_by" = "auth"."uid"()) AND (COALESCE("c"."type", ''::"text") = 'group'::"text"))))));



CREATE POLICY "group_chat_invites_select_own_or_creator" ON "public"."group_chat_invites" FOR SELECT TO "authenticated" USING ((("invitee_user_id" = "auth"."uid"()) OR ("inviter_user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."chats" "c"
  WHERE (("c"."id" = "group_chat_invites"."chat_id") AND ("c"."created_by" = "auth"."uid"()))))));



CREATE POLICY "group_chat_invites_update_invitee_or_creator" ON "public"."group_chat_invites" FOR UPDATE TO "authenticated" USING ((("invitee_user_id" = "auth"."uid"()) OR ("inviter_user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."chats" "c"
  WHERE (("c"."id" = "group_chat_invites"."chat_id") AND ("c"."created_by" = "auth"."uid"())))))) WITH CHECK ((("invitee_user_id" = "auth"."uid"()) OR ("inviter_user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."chats" "c"
  WHERE (("c"."id" = "group_chat_invites"."chat_id") AND ("c"."created_by" = "auth"."uid"()))))));



ALTER TABLE "public"."hazard_identifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."human_verification_attempts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "human_verification_attempts_select_own" ON "public"."human_verification_attempts" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."identity_card_verifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "identity_card_verifications_select_own" ON "public"."identity_card_verifications" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."identity_verification_cleanup_queue" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "identity_verification_cleanup_queue deny all" ON "public"."identity_verification_cleanup_queue" TO "authenticated" USING (false) WITH CHECK (false);



ALTER TABLE "public"."location_reviews" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "location_reviews delete own" ON "public"."location_reviews" FOR DELETE TO "authenticated" USING (("reviewer_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "location_reviews insert own" ON "public"."location_reviews" FOR INSERT TO "authenticated" WITH CHECK (("reviewer_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "location_reviews read authenticated" ON "public"."location_reviews" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "location_reviews update own" ON "public"."location_reviews" FOR UPDATE TO "authenticated" USING (("reviewer_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("reviewer_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."lost_pet_alerts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."map_alert_notification_queue" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "map_alert_notification_queue deny all" ON "public"."map_alert_notification_queue" TO "authenticated" USING (false) WITH CHECK (false);



ALTER TABLE "public"."map_alerts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "map_alerts_insert_auth" ON "public"."map_alerts" FOR INSERT TO "authenticated" WITH CHECK (("creator_id" = "auth"."uid"()));



CREATE POLICY "map_alerts_insert_auth_only" ON "public"."map_alerts" FOR INSERT TO "authenticated" WITH CHECK (("creator_id" = "auth"."uid"()));



CREATE POLICY "map_alerts_insert_own" ON "public"."map_alerts" FOR INSERT TO "authenticated" WITH CHECK (("creator_id" = "auth"."uid"()));



ALTER TABLE "public"."map_checkins" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "map_checkins delete own" ON "public"."map_checkins" FOR DELETE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "map_checkins insert own" ON "public"."map_checkins" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "map_checkins select public or own" ON "public"."map_checkins" FOR SELECT TO "authenticated" USING ((("is_public" = true) OR ("user_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "map_checkins update own" ON "public"."map_checkins" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."marketplace_bookings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."match_preferences" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "match_preferences delete own" ON "public"."match_preferences" FOR DELETE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "match_preferences insert own" ON "public"."match_preferences" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "match_preferences select own" ON "public"."match_preferences" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "match_preferences update own" ON "public"."match_preferences" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."matches" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."message_reads" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "message_reads delete own" ON "public"."message_reads" FOR DELETE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "message_reads insert own" ON "public"."message_reads" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "message_reads select chat member" ON "public"."message_reads" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."chat_messages" "cm"
     JOIN "public"."chat_room_members" "crm" ON (("crm"."chat_id" = "cm"."chat_id")))
  WHERE (("cm"."id" = "message_reads"."message_id") AND ("crm"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "message_reads select own" ON "public"."message_reads" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "message_reads update own" ON "public"."message_reads" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notice_board" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notification_aggregation_windows" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notification_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notification_nudge_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notification_preferences" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notification_preferences_insert_own" ON "public"."notification_preferences" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "notification_preferences_select_own" ON "public"."notification_preferences" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "notification_preferences_update_own" ON "public"."notification_preferences" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notifications_blocked_select_guard" ON "public"."notifications" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) AND (NOT "public"."is_user_blocked"("auth"."uid"(), (NULLIF(COALESCE(("data" ->> 'actor_id'::"text"), ("metadata" ->> 'actor_id'::"text")), ''::"text"))::"uuid"))));



CREATE POLICY "notifications_delete_service_role" ON "public"."notifications" FOR DELETE USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));



CREATE POLICY "notifications_insert_service_role" ON "public"."notifications" FOR INSERT WITH CHECK ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));



CREATE POLICY "notifications_select_own" ON "public"."notifications" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "notifications_update_own" ON "public"."notifications" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payments select own" ON "public"."payments" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."pet_care_profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pet_care_profiles_public_listed_read" ON "public"."pet_care_profiles" FOR SELECT USING (("listed" IS TRUE));



ALTER TABLE "public"."pets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pins" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pins_blocked_select_guard" ON "public"."pins" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((("user_id" IS NULL) OR (NOT "public"."is_user_blocked"("auth"."uid"(), "user_id"))));



CREATE POLICY "pins_delete_own" ON "public"."pins" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "pins_insert_own" ON "public"."pins" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "pins_select_own_or_visible" ON "public"."pins" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR (COALESCE("is_invisible", false) = false)));



CREATE POLICY "pins_update_own" ON "public"."pins" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."poi_locations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."post_mentions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "post_mentions_insert_owner" ON "public"."post_mentions" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."threads" "t"
  WHERE (("t"."id" = "post_mentions"."post_id") AND ("t"."user_id" = "auth"."uid"())))));



CREATE POLICY "post_mentions_select_authenticated" ON "public"."post_mentions" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_blocked_select_guard" ON "public"."profiles" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((("id" = "auth"."uid"()) OR (NOT "public"."is_user_blocked"("auth"."uid"(), "id"))));



CREATE POLICY "profiles_insert_own" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK (("id" = "auth"."uid"()));



CREATE POLICY "profiles_select_self_or_public" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "id") OR ((COALESCE("non_social", false) = false) AND (NOT "public"."is_user_blocked"("auth"."uid"(), "id")) AND "public"."is_in_scope"("auth"."uid"(), "id"))));



CREATE POLICY "profiles_update_own" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("id" = "auth"."uid"())) WITH CHECK (("id" = "auth"."uid"()));



CREATE POLICY "profiles_update_self_strict" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



ALTER TABLE "public"."push_tokens" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "push_tokens delete own" ON "public"."push_tokens" FOR DELETE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "push_tokens insert own" ON "public"."push_tokens" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "push_tokens select own" ON "public"."push_tokens" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "push_tokens update own" ON "public"."push_tokens" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."reminders" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "reminders_delete_own" ON "public"."reminders" FOR DELETE USING (("auth"."uid"() = "owner_id"));



CREATE POLICY "reminders_insert_own" ON "public"."reminders" FOR INSERT WITH CHECK (("auth"."uid"() = "owner_id"));



CREATE POLICY "reminders_select_own" ON "public"."reminders" FOR SELECT USING (("auth"."uid"() = "owner_id"));



CREATE POLICY "reminders_update_own" ON "public"."reminders" FOR UPDATE USING (("auth"."uid"() = "owner_id")) WITH CHECK (("auth"."uid"() = "owner_id"));



ALTER TABLE "public"."reply_mentions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "reply_mentions_insert_owner" ON "public"."reply_mentions" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."thread_comments" "tc"
  WHERE (("tc"."id" = "reply_mentions"."reply_id") AND ("tc"."user_id" = "auth"."uid"())))));



CREATE POLICY "reply_mentions_select_authenticated" ON "public"."reply_mentions" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."scan_rate_limits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."service_bookmarks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "service_bookmarks_delete_own" ON "public"."service_bookmarks" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "service_bookmarks_insert_own" ON "public"."service_bookmarks" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "service_bookmarks_select_own" ON "public"."service_bookmarks" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "service_bookmarks_update_own" ON "public"."service_bookmarks" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."service_chats" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "service_chats_select" ON "public"."service_chats" FOR SELECT USING ((("requester_id" = "auth"."uid"()) OR ("provider_id" = "auth"."uid"())));



ALTER TABLE "public"."service_disputes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "service_disputes_select" ON "public"."service_disputes" FOR SELECT USING ((("filed_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."service_chats" "sc"
  WHERE (("sc"."id" = "service_disputes"."service_chat_id") AND (("sc"."requester_id" = "auth"."uid"()) OR ("sc"."provider_id" = "auth"."uid"())))))));



ALTER TABLE "public"."service_reviews" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "service_reviews_insert" ON "public"."service_reviews" FOR INSERT WITH CHECK (("reviewer_id" = "auth"."uid"()));



CREATE POLICY "service_reviews_select" ON "public"."service_reviews" FOR SELECT USING (true);



CREATE POLICY "service_role_full_access_cache" ON "public"."triage_cache" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "service_role_insert_emergency_logs" ON "public"."emergency_logs" FOR INSERT WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "service_role_insert_notification_logs" ON "public"."notification_logs" FOR INSERT WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "service_role_update_emergency_logs" ON "public"."emergency_logs" FOR UPDATE USING (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."sitter_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."social_interactions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "social_interactions delete own" ON "public"."social_interactions" FOR DELETE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "social_interactions insert own" ON "public"."social_interactions" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "social_interactions select own_or_target" ON "public"."social_interactions" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("target_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "social_interactions update own" ON "public"."social_interactions" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."support_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "support_requests_admin_select" ON "public"."support_requests" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND (COALESCE("p"."is_admin", false) = true)))));



CREATE POLICY "support_requests_insert" ON "public"."support_requests" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "support_requests_select_own" ON "public"."support_requests" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."thread_comments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "thread_comments_blocked_insert_guard" ON "public"."thread_comments" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK (((NOT "public"."is_user_blocked"("auth"."uid"(), "user_id")) AND (NOT (EXISTS ( SELECT 1
   FROM "public"."threads" "t"
  WHERE (("t"."id" = "thread_comments"."thread_id") AND "public"."is_user_blocked"("auth"."uid"(), "t"."user_id")))))));



CREATE POLICY "thread_comments_blocked_select_guard" ON "public"."thread_comments" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((NOT "public"."is_user_blocked"("auth"."uid"(), "user_id")));



CREATE POLICY "thread_comments_owner_delete" ON "public"."thread_comments" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "thread_comments_owner_insert" ON "public"."thread_comments" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "thread_comments_owner_update" ON "public"."thread_comments" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "thread_comments_public_visible_with_scope" ON "public"."thread_comments" FOR SELECT TO "authenticated" USING ((("auth"."uid"() IS NOT NULL) AND (NOT "public"."is_user_blocked"("auth"."uid"(), "user_id")) AND (EXISTS ( SELECT 1
   FROM ("public"."threads" "t"
     JOIN "public"."profiles" "p" ON (("p"."id" = "t"."user_id")))
  WHERE (("t"."id" = "thread_comments"."thread_id") AND (NOT "public"."is_user_blocked"("auth"."uid"(), "t"."user_id")) AND (COALESCE("p"."non_social", false) = false) AND "public"."is_in_scope"("auth"."uid"(), "p"."id"))))));



ALTER TABLE "public"."thread_supports" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "thread_supports_delete_own" ON "public"."thread_supports" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "thread_supports_insert_own" ON "public"."thread_supports" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "thread_supports_select_authenticated" ON "public"."thread_supports" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."threads" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "threads_owner_delete" ON "public"."threads" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "threads_owner_insert" ON "public"."threads" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "threads_owner_update" ON "public"."threads" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "threads_public_visible_with_scope" ON "public"."threads" FOR SELECT TO "authenticated" USING ((("auth"."uid"() IS NOT NULL) AND (NOT "public"."is_user_blocked"("auth"."uid"(), "user_id")) AND (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "threads"."user_id") AND (COALESCE("p"."non_social", false) = false) AND "public"."is_in_scope"("auth"."uid"(), "p"."id"))))));



ALTER TABLE "public"."transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."triage_cache" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."typing_indicators" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "typing_indicators delete self_chat_member" ON "public"."typing_indicators" FOR DELETE TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM "public"."chat_room_members" "crm"
  WHERE (("crm"."chat_id" = "typing_indicators"."chat_id") AND ("crm"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "typing_indicators insert self_chat_member" ON "public"."typing_indicators" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM "public"."chat_room_members" "crm"
  WHERE (("crm"."chat_id" = "typing_indicators"."chat_id") AND ("crm"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "typing_indicators select chat_member" ON "public"."typing_indicators" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."chat_room_members" "crm"
  WHERE (("crm"."chat_id" = "typing_indicators"."chat_id") AND ("crm"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "typing_indicators update self_chat_member" ON "public"."typing_indicators" FOR UPDATE TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM "public"."chat_room_members" "crm"
  WHERE (("crm"."chat_id" = "typing_indicators"."chat_id") AND ("crm"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))))) WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM "public"."chat_room_members" "crm"
  WHERE (("crm"."chat_id" = "typing_indicators"."chat_id") AND ("crm"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));



ALTER TABLE "public"."user_blocks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_blocks_delete_own" ON "public"."user_blocks" FOR DELETE TO "authenticated" USING (("blocker_id" = "auth"."uid"()));



CREATE POLICY "user_blocks_insert_own" ON "public"."user_blocks" FOR INSERT TO "authenticated" WITH CHECK (("blocker_id" = "auth"."uid"()));



CREATE POLICY "user_blocks_select_own" ON "public"."user_blocks" FOR SELECT TO "authenticated" USING ((("blocker_id" = "auth"."uid"()) OR ("blocked_id" = "auth"."uid"())));



ALTER TABLE "public"."user_locations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_locations_blocked_select_guard" ON "public"."user_locations" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((NOT "public"."is_user_blocked"("auth"."uid"(), "user_id")));



ALTER TABLE "public"."user_quotas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_quotas_legacy_20260208" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_quotas_read_own" ON "public"."user_quotas" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "user_quotas_service_role_all" ON "public"."user_quotas" USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text")) WITH CHECK ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));



ALTER TABLE "public"."user_reports" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_reports_insert" ON "public"."user_reports" FOR INSERT TO "authenticated" WITH CHECK (("reporter_id" = "auth"."uid"()));



CREATE POLICY "user_reports_select_own" ON "public"."user_reports" FOR SELECT TO "authenticated" USING (("reporter_id" = "auth"."uid"()));



ALTER TABLE "public"."user_unmatches" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_unmatches_delete_actor" ON "public"."user_unmatches" FOR DELETE TO "authenticated" USING (("actor_id" = "auth"."uid"()));



CREATE POLICY "user_unmatches_insert_actor" ON "public"."user_unmatches" FOR INSERT TO "authenticated" WITH CHECK (("actor_id" = "auth"."uid"()));



CREATE POLICY "user_unmatches_select_actor_or_target" ON "public"."user_unmatches" FOR SELECT TO "authenticated" USING ((("actor_id" = "auth"."uid"()) OR ("target_id" = "auth"."uid"())));



CREATE POLICY "users_insert_own_rate_limits" ON "public"."scan_rate_limits" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "users_view_own_emergency_logs" ON "public"."emergency_logs" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."lost_pet_alerts"
  WHERE (("lost_pet_alerts"."id" = "emergency_logs"."alert_id") AND ("lost_pet_alerts"."owner_id" = "auth"."uid"())))));



CREATE POLICY "users_view_own_notification_logs" ON "public"."notification_logs" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."lost_pet_alerts"
  WHERE (("lost_pet_alerts"."id" = "notification_logs"."alert_id") AND ("lost_pet_alerts"."owner_id" = "auth"."uid"())))));



CREATE POLICY "users_view_own_rate_limits" ON "public"."scan_rate_limits" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."verification_audit_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "verification_audit_log deny all" ON "public"."verification_audit_log" TO "authenticated" USING (false) WITH CHECK (false);



ALTER TABLE "public"."verification_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "verification_requests insert own" ON "public"."verification_requests" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "verification_requests select own" ON "public"."verification_requests" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "verification_requests update own" ON "public"."verification_requests" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."verification_uploads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."waves" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "waves_delete_from_user" ON "public"."waves" FOR DELETE USING (("auth"."uid"() = "from_user_id"));



CREATE POLICY "waves_insert_from_user" ON "public"."waves" FOR INSERT WITH CHECK (("auth"."uid"() = "from_user_id"));



CREATE POLICY "waves_select_involving_user" ON "public"."waves" FOR SELECT USING ((("auth"."uid"() = "from_user_id") OR ("auth"."uid"() = "to_user_id")));



CREATE POLICY "waves_service_role_all" ON "public"."waves" USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text")) WITH CHECK ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."_qms_cycle_month_start"("p_owner_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."_qms_cycle_month_start"("p_owner_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_qms_cycle_month_start"("p_owner_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."_qms_effective_tier"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."_qms_effective_tier"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_qms_effective_tier"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."_qms_get_pool_owner"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."_qms_get_pool_owner"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_qms_get_pool_owner"("p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."_qms_touch_row"("p_owner_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_qms_touch_row"("p_owner_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_qms_touch_row"("p_owner_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."accept_group_chat_invite"("p_chat_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."accept_group_chat_invite"("p_chat_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_group_chat_invite"("p_chat_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."accept_group_chat_invite_by_id"("p_invite_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."accept_group_chat_invite_by_id"("p_invite_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_group_chat_invite_by_id"("p_invite_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."accept_mutual_wave"("p_target_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."accept_mutual_wave"("p_target_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_mutual_wave"("p_target_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_review_verification"("p_user_id" "uuid", "p_status" "public"."verification_status_enum", "p_comment" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_review_verification"("p_user_id" "uuid", "p_status" "public"."verification_status_enum", "p_comment" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_review_verification"("p_user_id" "uuid", "p_status" "public"."verification_status_enum", "p_comment" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."archive_broadcast_alert"("p_alert_id" "uuid", "p_actor_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."archive_broadcast_alert"("p_alert_id" "uuid", "p_actor_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."archive_broadcast_alert"("p_alert_id" "uuid", "p_actor_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."award_sitter_vouch"() TO "anon";
GRANT ALL ON FUNCTION "public"."award_sitter_vouch"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."award_sitter_vouch"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."block_user"("p_blocked_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."block_user"("p_blocked_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."block_user"("p_blocked_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."broadcast_alerts_set_geog"() TO "anon";
GRANT ALL ON FUNCTION "public"."broadcast_alerts_set_geog"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."broadcast_alerts_set_geog"() TO "service_role";



GRANT ALL ON FUNCTION "public"."build_aggregation_copy"("p_kind" "text", "p_actor_names" "text"[], "p_count" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."build_aggregation_copy"("p_kind" "text", "p_actor_names" "text"[], "p_count" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."build_aggregation_copy"("p_kind" "text", "p_actor_names" "text"[], "p_count" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_deliver_notification"("p_user_id" "uuid", "p_category" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_deliver_notification"("p_user_id" "uuid", "p_category" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_deliver_notification"("p_user_id" "uuid", "p_category" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_request_service_from_provider"("p_provider_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_request_service_from_provider"("p_provider_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_request_service_from_provider"("p_provider_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_and_increment_quota"("action_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."check_and_increment_quota"("action_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_and_increment_quota"("action_type" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_for_match"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_for_match"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_for_match"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."check_identifier_mfa"("p_email" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."check_identifier_mfa"("p_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."check_identifier_mfa"("p_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_identifier_mfa"("p_email" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."check_identifier_registered"("p_email" "text", "p_phone" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."check_identifier_registered"("p_email" "text", "p_phone" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."check_identifier_registered"("p_email" "text", "p_phone" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_identifier_registered"("p_email" "text", "p_phone" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_scan_rate_limit"("user_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."check_scan_rate_limit"("user_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_scan_rate_limit"("user_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_chat_attachments_tmp"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_chat_attachments_tmp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_chat_attachments_tmp"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_expired_broadcast_alerts"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_expired_broadcast_alerts"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_expired_broadcast_alerts"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_expired_map_alerts"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_expired_map_alerts"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_expired_map_alerts"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_alert_thread_and_pin"("payload" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_alert_thread_and_pin"("payload" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_alert_thread_and_pin"("payload" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_match_chat"() TO "anon";
GRANT ALL ON FUNCTION "public"."create_match_chat"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_match_chat"() TO "service_role";



GRANT ALL ON FUNCTION "public"."create_service_chat"("p_provider_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."create_service_chat"("p_provider_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_service_chat"("p_provider_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_thread_mention_notifications"("p_actor_id" "uuid", "p_thread_id" "uuid", "p_recipient_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_thread_mention_notifications"("p_actor_id" "uuid", "p_thread_id" "uuid", "p_recipient_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_thread_mention_notifications"("p_actor_id" "uuid", "p_thread_id" "uuid", "p_recipient_ids" "uuid"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."debug_whoami"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."debug_whoami"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."debug_whoami"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_broadcast_alert"("p_alert_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_broadcast_alert"("p_alert_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_broadcast_alert"("p_alert_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_broadcast_alert"("p_alert_id" "uuid", "p_actor_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_broadcast_alert"("p_alert_id" "uuid", "p_actor_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_broadcast_alert"("p_alert_id" "uuid", "p_actor_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_user_account"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_user_account"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."downgrade_user_tier"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."downgrade_user_tier"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."downgrade_user_tier"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_map_alert_contract"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_map_alert_contract"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_map_alert_contract"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."enqueue_broadcast_notifications"("p_alert_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enqueue_broadcast_notifications"("p_alert_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."enqueue_broadcast_notifications"("p_alert_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."enqueue_chat_notification"("p_recipient_id" "uuid", "p_kind" "text", "p_title" "text", "p_body" "text", "p_href" "text", "p_data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."enqueue_chat_notification"("p_recipient_id" "uuid", "p_kind" "text", "p_title" "text", "p_body" "text", "p_href" "text", "p_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."enqueue_chat_notification"("p_recipient_id" "uuid", "p_kind" "text", "p_title" "text", "p_body" "text", "p_href" "text", "p_data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."enqueue_map_alert_notification"() TO "anon";
GRANT ALL ON FUNCTION "public"."enqueue_map_alert_notification"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enqueue_map_alert_notification"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."enqueue_notification"("p_user_id" "uuid", "p_category" "text", "p_kind" "text", "p_title" "text", "p_body" "text", "p_href" "text", "p_data" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enqueue_notification"("p_user_id" "uuid", "p_category" "text", "p_kind" "text", "p_title" "text", "p_body" "text", "p_href" "text", "p_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."enqueue_notification"("p_user_id" "uuid", "p_category" "text", "p_kind" "text", "p_title" "text", "p_body" "text", "p_href" "text", "p_data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_direct_chat_room"("p_target_user_id" "uuid", "p_target_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_direct_chat_room"("p_target_user_id" "uuid", "p_target_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_direct_chat_room"("p_target_user_id" "uuid", "p_target_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_profile_for_auth_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_profile_for_auth_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_profile_for_auth_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."expire_account_restrictions"() TO "anon";
GRANT ALL ON FUNCTION "public"."expire_account_restrictions"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."expire_account_restrictions"() TO "service_role";



GRANT ALL ON FUNCTION "public"."file_booking_dispute"("p_booking_id" "uuid", "p_dispute_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."file_booking_dispute"("p_booking_id" "uuid", "p_dispute_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."file_booking_dispute"("p_booking_id" "uuid", "p_dispute_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."file_service_dispute"("p_chat_id" "uuid", "p_category" "text", "p_description" "text", "p_evidence_urls" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."file_service_dispute"("p_chat_id" "uuid", "p_category" "text", "p_description" "text", "p_evidence_urls" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."file_service_dispute"("p_chat_id" "uuid", "p_category" "text", "p_description" "text", "p_evidence_urls" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."finalize_identity_submission"("p_doc_type" "text", "p_doc_path" "text", "p_selfie_path" "text", "p_country" "text", "p_legal_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."finalize_identity_submission"("p_doc_type" "text", "p_doc_path" "text", "p_selfie_path" "text", "p_country" "text", "p_legal_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."finalize_identity_submission"("p_doc_type" "text", "p_doc_path" "text", "p_selfie_path" "text", "p_country" "text", "p_legal_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."find_nearby_users"("alert_lat" double precision, "alert_lng" double precision, "radius_meters" integer, "min_vouch_score" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."find_nearby_users"("alert_lat" double precision, "alert_lng" double precision, "radius_meters" integer, "min_vouch_score" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."find_nearby_users"("alert_lat" double precision, "alert_lng" double precision, "radius_meters" integer, "min_vouch_score" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_uid"("len" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."generate_uid"("len" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_uid"("len" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_friend_pins_nearby"("p_lat" double precision, "p_lng" double precision, "p_radius_m" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_friend_pins_nearby"("p_lat" double precision, "p_lng" double precision, "p_radius_m" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_friend_pins_nearby"("p_lat" double precision, "p_lng" double precision, "p_radius_m" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_map_alerts_nearby"("p_lat" double precision, "p_lng" double precision, "p_radius_m" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_map_alerts_nearby"("p_lat" double precision, "p_lng" double precision, "p_radius_m" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_quota_snapshot"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_quota_snapshot"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_service_provider_distances"("p_lat" double precision, "p_lng" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."get_service_provider_distances"("p_lat" double precision, "p_lng" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_service_provider_distances"("p_lat" double precision, "p_lng" double precision) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_social_feed"("p_viewer_id" "uuid", "p_sort" "text", "p_limit" integer, "p_cursor" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_social_feed"("p_viewer_id" "uuid", "p_sort" "text", "p_limit" integer, "p_cursor" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_social_feed"("p_viewer_id" "uuid", "p_sort" "text", "p_limit" integer, "p_cursor" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_visible_broadcast_alerts"("p_lat" double precision, "p_lng" double precision) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_visible_broadcast_alerts"("p_lat" double precision, "p_lng" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_visible_broadcast_alerts"("p_lat" double precision, "p_lng" double precision) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_visible_map_alerts"("p_lat" double precision, "p_lng" double precision) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_visible_map_alerts"("p_lat" double precision, "p_lng" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_visible_map_alerts"("p_lat" double precision, "p_lng" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_identity_review"("p_target_user_id" "uuid", "p_action" "text", "p_notes" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."handle_identity_review"("p_target_user_id" "uuid", "p_action" "text", "p_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_identity_review"("p_target_user_id" "uuid", "p_action" "text", "p_notes" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_marketplace_payment_success"("p_payment_intent_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."handle_marketplace_payment_success"("p_payment_intent_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_marketplace_payment_success"("p_payment_intent_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_auth_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_auth_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_auth_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."increment_pet_care_profile_view_count"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."increment_pet_care_profile_view_count"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_pet_care_profile_view_count"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_user_credits"("p_user_id" "uuid", "p_stars" integer, "p_mesh_alerts" integer, "p_media_credits" integer, "p_family_slots" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."increment_user_credits"("p_user_id" "uuid", "p_stars" integer, "p_mesh_alerts" integer, "p_media_credits" integer, "p_family_slots" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_user_credits"("p_user_id" "uuid", "p_stars" integer, "p_mesh_alerts" integer, "p_media_credits" integer, "p_family_slots" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."is_chat_member"("p_chat_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_chat_member"("p_chat_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_chat_member"("p_chat_id" "uuid", "p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_in_scope"("p_viewer" "uuid", "p_target" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_in_scope"("p_viewer" "uuid", "p_target" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_in_scope"("p_viewer" "uuid", "p_target" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_social_id_taken"("p_social_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_social_id_taken"("p_social_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_social_id_taken"("p_social_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_social_id_taken"("p_social_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_user_blocked"("p_a" "uuid", "p_b" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_user_blocked"("p_a" "uuid", "p_b" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_user_blocked"("p_a" "uuid", "p_b" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."map_alerts_apply_interaction_counts"() TO "anon";
GRANT ALL ON FUNCTION "public"."map_alerts_apply_interaction_counts"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."map_alerts_apply_interaction_counts"() TO "service_role";



GRANT ALL ON FUNCTION "public"."map_alerts_auto_hide_on_reports"() TO "anon";
GRANT ALL ON FUNCTION "public"."map_alerts_auto_hide_on_reports"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."map_alerts_auto_hide_on_reports"() TO "service_role";



GRANT ALL ON FUNCTION "public"."mark_booking_completed"("p_booking_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."mark_booking_completed"("p_booking_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_booking_completed"("p_booking_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."mark_service_finished"("p_chat_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."mark_service_finished"("p_chat_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_service_finished"("p_chat_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_account_status_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_account_status_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_account_status_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_broadcast_alert_hidden"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_broadcast_alert_hidden"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_broadcast_alert_hidden"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_group_chat_invite_insert"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_group_chat_invite_insert"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_group_chat_invite_insert"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_new_chat_message"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_new_chat_message"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_new_chat_message"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_no_stars"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_no_stars"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_no_stars"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_on_map_alert_insert"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_on_map_alert_insert"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_on_map_alert_insert"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_profile_verified"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_profile_verified"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_profile_verified"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_provider_listed_on_service"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_provider_listed_on_service"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_provider_listed_on_service"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_thread_comment"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_thread_comment"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_thread_comment"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_thread_support"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_thread_support"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_thread_support"() TO "service_role";



GRANT ALL ON FUNCTION "public"."pii_purge_identity_verification"() TO "anon";
GRANT ALL ON FUNCTION "public"."pii_purge_identity_verification"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."pii_purge_identity_verification"() TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_non_admin_verification"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_non_admin_verification"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_non_admin_verification"() TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_sensitive_profile_updates"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_sensitive_profile_updates"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_sensitive_profile_updates"() TO "service_role";



GRANT ALL ON FUNCTION "public"."process_due_map_alert_notifications"("p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."process_due_map_alert_notifications"("p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_due_map_alert_notifications"("p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."process_identity_cleanup"() TO "anon";
GRANT ALL ON FUNCTION "public"."process_identity_cleanup"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_identity_cleanup"() TO "service_role";



GRANT ALL ON FUNCTION "public"."process_notification_windows"() TO "anon";
GRANT ALL ON FUNCTION "public"."process_notification_windows"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_notification_windows"() TO "service_role";



GRANT ALL ON FUNCTION "public"."process_pet_birthdays"() TO "anon";
GRANT ALL ON FUNCTION "public"."process_pet_birthdays"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_pet_birthdays"() TO "service_role";



GRANT ALL ON FUNCTION "public"."process_pet_reminders"() TO "anon";
GRANT ALL ON FUNCTION "public"."process_pet_reminders"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_pet_reminders"() TO "service_role";



GRANT ALL ON FUNCTION "public"."process_service_booking_reminders"() TO "anon";
GRANT ALL ON FUNCTION "public"."process_service_booking_reminders"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_service_booking_reminders"() TO "service_role";



GRANT ALL ON FUNCTION "public"."process_service_payout_releases"() TO "anon";
GRANT ALL ON FUNCTION "public"."process_service_payout_releases"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_service_payout_releases"() TO "service_role";



GRANT ALL ON FUNCTION "public"."process_subscription_expiring"() TO "anon";
GRANT ALL ON FUNCTION "public"."process_subscription_expiring"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_subscription_expiring"() TO "service_role";



GRANT ALL ON FUNCTION "public"."process_user_report"("p_target_id" "uuid", "p_categories" "text"[], "p_details" "text", "p_attachment_urls" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."process_user_report"("p_target_id" "uuid", "p_categories" "text"[], "p_details" "text", "p_attachment_urls" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_user_report"("p_target_id" "uuid", "p_categories" "text"[], "p_details" "text", "p_attachment_urls" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."process_verification_nudges"() TO "anon";
GRANT ALL ON FUNCTION "public"."process_verification_nudges"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_verification_nudges"() TO "service_role";



GRANT ALL ON FUNCTION "public"."protect_monetized_fields"() TO "anon";
GRANT ALL ON FUNCTION "public"."protect_monetized_fields"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."protect_monetized_fields"() TO "service_role";



GRANT ALL ON FUNCTION "public"."purge_expired_cache"() TO "anon";
GRANT ALL ON FUNCTION "public"."purge_expired_cache"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."purge_expired_cache"() TO "service_role";



GRANT ALL ON FUNCTION "public"."purge_expired_verification_docs"() TO "anon";
GRANT ALL ON FUNCTION "public"."purge_expired_verification_docs"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."purge_expired_verification_docs"() TO "service_role";



GRANT ALL ON FUNCTION "public"."qms_reset_daily"() TO "anon";
GRANT ALL ON FUNCTION "public"."qms_reset_daily"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."qms_reset_daily"() TO "service_role";



GRANT ALL ON FUNCTION "public"."qms_reset_monthly"() TO "anon";
GRANT ALL ON FUNCTION "public"."qms_reset_monthly"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."qms_reset_monthly"() TO "service_role";



GRANT ALL ON FUNCTION "public"."qms_reset_weekly"() TO "anon";
GRANT ALL ON FUNCTION "public"."qms_reset_weekly"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."qms_reset_weekly"() TO "service_role";



GRANT ALL ON FUNCTION "public"."qms_rollover_all"() TO "anon";
GRANT ALL ON FUNCTION "public"."qms_rollover_all"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."qms_rollover_all"() TO "service_role";



GRANT ALL ON FUNCTION "public"."queue_identity_cleanup"() TO "anon";
GRANT ALL ON FUNCTION "public"."queue_identity_cleanup"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."queue_identity_cleanup"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_thread_share_click"("p_thread_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_thread_share_click"("p_thread_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_thread_share_click"("p_thread_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."refill_ai_vet_rate_limits"() TO "anon";
GRANT ALL ON FUNCTION "public"."refill_ai_vet_rate_limits"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."refill_ai_vet_rate_limits"() TO "service_role";



GRANT ALL ON FUNCTION "public"."refresh_identity_verification_status"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."refresh_identity_verification_status"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_identity_verification_status"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."refresh_service_chat_status"("p_chat_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."refresh_service_chat_status"("p_chat_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_service_chat_status"("p_chat_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."refresh_subscription_quotas"() TO "anon";
GRANT ALL ON FUNCTION "public"."refresh_subscription_quotas"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_subscription_quotas"() TO "service_role";



GRANT ALL ON FUNCTION "public"."release_escrow_funds"() TO "anon";
GRANT ALL ON FUNCTION "public"."release_escrow_funds"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."release_escrow_funds"() TO "service_role";



GRANT ALL ON FUNCTION "public"."report_category_weight"("category" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."report_category_weight"("category" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."report_category_weight"("category" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."send_service_quote"("p_chat_id" "uuid", "p_quote_card" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."send_service_quote"("p_chat_id" "uuid", "p_quote_card" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."send_service_quote"("p_chat_id" "uuid", "p_quote_card" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."send_service_request"("p_chat_id" "uuid", "p_request_card" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."send_service_request"("p_chat_id" "uuid", "p_request_card" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."send_service_request"("p_chat_id" "uuid", "p_request_card" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."service_notify"("p_user_id" "uuid", "p_kind" "text", "p_title" "text", "p_body" "text", "p_href" "text", "p_data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."service_notify"("p_user_id" "uuid", "p_kind" "text", "p_title" "text", "p_body" "text", "p_href" "text", "p_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."service_notify"("p_user_id" "uuid", "p_kind" "text", "p_title" "text", "p_body" "text", "p_href" "text", "p_data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_escrow_release_date"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_escrow_release_date"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_escrow_release_date"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_profiles_user_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_profiles_user_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_profiles_user_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_user_location"("p_lat" double precision, "p_lng" double precision, "p_pin_hours" integer, "p_retention_hours" integer, "p_address" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_user_location"("p_lat" double precision, "p_lng" double precision, "p_pin_hours" integer, "p_retention_hours" integer, "p_address" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_user_location"("p_lat" double precision, "p_lng" double precision, "p_pin_hours" integer, "p_retention_hours" integer, "p_address" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."social_discovery"("p_user_id" "uuid", "p_lat" double precision, "p_lng" double precision, "p_radius_m" integer, "p_min_age" integer, "p_max_age" integer, "p_role" "text", "p_gender" "text", "p_species" "text"[], "p_pet_size" "text", "p_advanced" boolean, "p_height_min" numeric, "p_height_max" numeric, "p_only_waved" boolean, "p_active_only" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."social_discovery"("p_user_id" "uuid", "p_lat" double precision, "p_lng" double precision, "p_radius_m" integer, "p_min_age" integer, "p_max_age" integer, "p_role" "text", "p_gender" "text", "p_species" "text"[], "p_pet_size" "text", "p_advanced" boolean, "p_height_min" numeric, "p_height_max" numeric, "p_only_waved" boolean, "p_active_only" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."social_discovery"("p_user_id" "uuid", "p_lat" double precision, "p_lng" double precision, "p_radius_m" integer, "p_min_age" integer, "p_max_age" integer, "p_role" "text", "p_gender" "text", "p_species" "text"[], "p_pet_size" "text", "p_advanced" boolean, "p_height_min" numeric, "p_height_max" numeric, "p_only_waved" boolean, "p_active_only" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."social_discovery_legacy"("p_user_id" "uuid", "p_lat" double precision, "p_lng" double precision, "p_radius_m" integer, "p_min_age" integer, "p_max_age" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."social_discovery_legacy"("p_user_id" "uuid", "p_lat" double precision, "p_lng" double precision, "p_radius_m" integer, "p_min_age" integer, "p_max_age" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."start_service_now"("p_chat_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."start_service_now"("p_chat_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."start_service_now"("p_chat_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."submit_service_review"("p_chat_id" "uuid", "p_rating" integer, "p_tags" "text"[], "p_review_text" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."submit_service_review"("p_chat_id" "uuid", "p_rating" integer, "p_tags" "text"[], "p_review_text" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_service_review"("p_chat_id" "uuid", "p_rating" integer, "p_tags" "text"[], "p_review_text" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_thread_comment_content"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_thread_comment_content"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_thread_comment_content"() TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_profile_activity"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_profile_activity"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_profile_activity"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."unblock_user"("p_blocked_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."unblock_user"("p_blocked_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unblock_user"("p_blocked_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."unmatch_and_delete_direct_chat"("p_other_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."unmatch_and_delete_direct_chat"("p_other_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unmatch_and_delete_direct_chat"("p_other_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."unmatch_user_one_sided"("p_other_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."unmatch_user_one_sided"("p_other_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unmatch_user_one_sided"("p_other_user_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."broadcast_alerts" TO "service_role";
GRANT INSERT ON TABLE "public"."broadcast_alerts" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."update_broadcast_alert"("p_alert_id" "uuid", "p_patch" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_broadcast_alert"("p_alert_id" "uuid", "p_patch" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_broadcast_alert"("p_alert_id" "uuid", "p_patch" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_broadcast_alert"("p_alert_id" "uuid", "p_title" "text", "p_description" "text", "p_actor_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_broadcast_alert"("p_alert_id" "uuid", "p_title" "text", "p_description" "text", "p_actor_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_broadcast_alert"("p_alert_id" "uuid", "p_title" "text", "p_description" "text", "p_actor_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_chat_last_message"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_chat_last_message"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_chat_last_message"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_threads_scores"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_threads_scores"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_threads_scores"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."upgrade_user_tier"("p_user_id" "uuid", "p_tier" "text", "p_subscription_status" "text", "p_stripe_subscription_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."upgrade_user_tier"("p_user_id" "uuid", "p_tier" "text", "p_subscription_status" "text", "p_stripe_subscription_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."upgrade_user_tier"("p_user_id" "uuid", "p_tier" "text", "p_subscription_status" "text", "p_stripe_subscription_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."upsert_notification_window"("p_owner_user_id" "uuid", "p_subject_id" "uuid", "p_subject_type" "text", "p_kind" "text", "p_category" "text", "p_href" "text", "p_actor_id" "uuid", "p_actor_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."upsert_notification_window"("p_owner_user_id" "uuid", "p_subject_id" "uuid", "p_subject_type" "text", "p_kind" "text", "p_category" "text", "p_href" "text", "p_actor_id" "uuid", "p_actor_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_notification_window"("p_owner_user_id" "uuid", "p_subject_id" "uuid", "p_subject_type" "text", "p_kind" "text", "p_category" "text", "p_href" "text", "p_actor_id" "uuid", "p_actor_name" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."upsert_notification_window_internal"("p_owner_user_id" "uuid", "p_subject_id" "uuid", "p_subject_type" "text", "p_kind" "text", "p_category" "text", "p_href" "text", "p_actor_id" "uuid", "p_actor_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."upsert_notification_window_internal"("p_owner_user_id" "uuid", "p_subject_id" "uuid", "p_subject_type" "text", "p_kind" "text", "p_category" "text", "p_href" "text", "p_actor_id" "uuid", "p_actor_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_service_quote_payload"("p_quote_card" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."validate_service_quote_payload"("p_quote_card" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_service_quote_payload"("p_quote_card" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_service_request_payload"("p_request_card" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."validate_service_request_payload"("p_request_card" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_service_request_payload"("p_request_card" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_vaccination_dates"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_vaccination_dates"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_vaccination_dates"() TO "service_role";



GRANT ALL ON FUNCTION "public"."withdraw_service_quote"("p_chat_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."withdraw_service_quote"("p_chat_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."withdraw_service_quote"("p_chat_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."withdraw_service_request"("p_chat_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."withdraw_service_request"("p_chat_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."withdraw_service_request"("p_chat_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."admin_audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."admin_audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."ai_vet_conversations" TO "anon";
GRANT ALL ON TABLE "public"."ai_vet_conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_vet_conversations" TO "service_role";



GRANT ALL ON TABLE "public"."ai_vet_messages" TO "anon";
GRANT ALL ON TABLE "public"."ai_vet_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_vet_messages" TO "service_role";



GRANT ALL ON TABLE "public"."ai_vet_rate_limits" TO "anon";
GRANT ALL ON TABLE "public"."ai_vet_rate_limits" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_vet_rate_limits" TO "service_role";



GRANT ALL ON TABLE "public"."ai_vet_usage" TO "anon";
GRANT ALL ON TABLE "public"."ai_vet_usage" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_vet_usage" TO "service_role";



GRANT ALL ON TABLE "public"."alert_interactions" TO "anon";
GRANT ALL ON TABLE "public"."alert_interactions" TO "authenticated";
GRANT ALL ON TABLE "public"."alert_interactions" TO "service_role";



GRANT ALL ON TABLE "public"."broadcast_alert_interactions" TO "anon";
GRANT ALL ON TABLE "public"."broadcast_alert_interactions" TO "authenticated";
GRANT ALL ON TABLE "public"."broadcast_alert_interactions" TO "service_role";



GRANT ALL ON TABLE "public"."chat_messages" TO "anon";
GRANT ALL ON TABLE "public"."chat_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_messages" TO "service_role";



GRANT ALL ON TABLE "public"."chat_participants" TO "anon";
GRANT ALL ON TABLE "public"."chat_participants" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_participants" TO "service_role";



GRANT ALL ON TABLE "public"."chat_room_members" TO "anon";
GRANT ALL ON TABLE "public"."chat_room_members" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_room_members" TO "service_role";



GRANT ALL ON TABLE "public"."chats" TO "anon";
GRANT ALL ON TABLE "public"."chats" TO "authenticated";
GRANT ALL ON TABLE "public"."chats" TO "service_role";



GRANT ALL ON TABLE "public"."consent_logs" TO "anon";
GRANT ALL ON TABLE "public"."consent_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."consent_logs" TO "service_role";



GRANT ALL ON TABLE "public"."device_fingerprint_history" TO "anon";
GRANT ALL ON TABLE "public"."device_fingerprint_history" TO "authenticated";
GRANT ALL ON TABLE "public"."device_fingerprint_history" TO "service_role";



GRANT ALL ON TABLE "public"."discover_match_seen" TO "anon";
GRANT ALL ON TABLE "public"."discover_match_seen" TO "authenticated";
GRANT ALL ON TABLE "public"."discover_match_seen" TO "service_role";



GRANT ALL ON TABLE "public"."emergency_logs" TO "anon";
GRANT ALL ON TABLE "public"."emergency_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."emergency_logs" TO "service_role";



GRANT ALL ON TABLE "public"."family_members" TO "anon";
GRANT ALL ON TABLE "public"."family_members" TO "authenticated";
GRANT ALL ON TABLE "public"."family_members" TO "service_role";



GRANT ALL ON TABLE "public"."group_chat_invites" TO "anon";
GRANT ALL ON TABLE "public"."group_chat_invites" TO "authenticated";
GRANT ALL ON TABLE "public"."group_chat_invites" TO "service_role";



GRANT ALL ON TABLE "public"."hazard_identifications" TO "anon";
GRANT ALL ON TABLE "public"."hazard_identifications" TO "authenticated";
GRANT ALL ON TABLE "public"."hazard_identifications" TO "service_role";



GRANT ALL ON TABLE "public"."human_verification_attempts" TO "anon";
GRANT ALL ON TABLE "public"."human_verification_attempts" TO "authenticated";
GRANT ALL ON TABLE "public"."human_verification_attempts" TO "service_role";



GRANT ALL ON TABLE "public"."identity_card_verifications" TO "anon";
GRANT ALL ON TABLE "public"."identity_card_verifications" TO "authenticated";
GRANT ALL ON TABLE "public"."identity_card_verifications" TO "service_role";



GRANT ALL ON TABLE "public"."identity_verification_cleanup_queue" TO "service_role";



GRANT ALL ON TABLE "public"."location_reviews" TO "anon";
GRANT ALL ON TABLE "public"."location_reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."location_reviews" TO "service_role";



GRANT ALL ON TABLE "public"."lost_pet_alerts" TO "anon";
GRANT ALL ON TABLE "public"."lost_pet_alerts" TO "authenticated";
GRANT ALL ON TABLE "public"."lost_pet_alerts" TO "service_role";



GRANT ALL ON TABLE "public"."map_alert_notification_queue" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."map_alerts" TO "anon";
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."map_alerts" TO "authenticated";
GRANT ALL ON TABLE "public"."map_alerts" TO "service_role";



GRANT ALL ON TABLE "public"."map_checkins" TO "anon";
GRANT ALL ON TABLE "public"."map_checkins" TO "authenticated";
GRANT ALL ON TABLE "public"."map_checkins" TO "service_role";



GRANT ALL ON TABLE "public"."marketplace_bookings" TO "service_role";
GRANT SELECT ON TABLE "public"."marketplace_bookings" TO "authenticated";



GRANT ALL ON TABLE "public"."match_preferences" TO "anon";
GRANT ALL ON TABLE "public"."match_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."match_preferences" TO "service_role";



GRANT ALL ON TABLE "public"."matches" TO "anon";
GRANT ALL ON TABLE "public"."matches" TO "authenticated";
GRANT ALL ON TABLE "public"."matches" TO "service_role";



GRANT ALL ON TABLE "public"."message_reads" TO "anon";
GRANT ALL ON TABLE "public"."message_reads" TO "authenticated";
GRANT ALL ON TABLE "public"."message_reads" TO "service_role";



GRANT ALL ON TABLE "public"."messages" TO "anon";
GRANT ALL ON TABLE "public"."messages" TO "authenticated";
GRANT ALL ON TABLE "public"."messages" TO "service_role";



GRANT ALL ON TABLE "public"."notice_board" TO "anon";
GRANT ALL ON TABLE "public"."notice_board" TO "authenticated";
GRANT ALL ON TABLE "public"."notice_board" TO "service_role";



GRANT ALL ON TABLE "public"."notification_aggregation_windows" TO "anon";
GRANT ALL ON TABLE "public"."notification_aggregation_windows" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_aggregation_windows" TO "service_role";



GRANT ALL ON TABLE "public"."notification_logs" TO "anon";
GRANT ALL ON TABLE "public"."notification_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_logs" TO "service_role";



GRANT ALL ON TABLE "public"."notification_nudge_log" TO "anon";
GRANT ALL ON TABLE "public"."notification_nudge_log" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_nudge_log" TO "service_role";



GRANT ALL ON TABLE "public"."notification_preferences" TO "anon";
GRANT ALL ON TABLE "public"."notification_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_preferences" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."payments" TO "anon";
GRANT ALL ON TABLE "public"."payments" TO "authenticated";
GRANT ALL ON TABLE "public"."payments" TO "service_role";



GRANT ALL ON TABLE "public"."pet_care_profiles" TO "anon";
GRANT ALL ON TABLE "public"."pet_care_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."pet_care_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."pets" TO "anon";
GRANT ALL ON TABLE "public"."pets" TO "authenticated";
GRANT ALL ON TABLE "public"."pets" TO "service_role";



GRANT ALL ON TABLE "public"."pins" TO "anon";
GRANT ALL ON TABLE "public"."pins" TO "authenticated";
GRANT ALL ON TABLE "public"."pins" TO "service_role";



GRANT ALL ON TABLE "public"."poi_locations" TO "anon";
GRANT ALL ON TABLE "public"."poi_locations" TO "authenticated";
GRANT ALL ON TABLE "public"."poi_locations" TO "service_role";



GRANT ALL ON TABLE "public"."post_mentions" TO "anon";
GRANT ALL ON TABLE "public"."post_mentions" TO "authenticated";
GRANT ALL ON TABLE "public"."post_mentions" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."profiles_public" TO "anon";
GRANT ALL ON TABLE "public"."profiles_public" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles_public" TO "service_role";



GRANT ALL ON TABLE "public"."push_tokens" TO "anon";
GRANT ALL ON TABLE "public"."push_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."push_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."reminders" TO "anon";
GRANT ALL ON TABLE "public"."reminders" TO "authenticated";
GRANT ALL ON TABLE "public"."reminders" TO "service_role";



GRANT ALL ON TABLE "public"."reply_mentions" TO "anon";
GRANT ALL ON TABLE "public"."reply_mentions" TO "authenticated";
GRANT ALL ON TABLE "public"."reply_mentions" TO "service_role";



GRANT ALL ON TABLE "public"."scan_rate_limits" TO "anon";
GRANT ALL ON TABLE "public"."scan_rate_limits" TO "authenticated";
GRANT ALL ON TABLE "public"."scan_rate_limits" TO "service_role";



GRANT ALL ON TABLE "public"."service_bookmarks" TO "anon";
GRANT ALL ON TABLE "public"."service_bookmarks" TO "authenticated";
GRANT ALL ON TABLE "public"."service_bookmarks" TO "service_role";



GRANT ALL ON TABLE "public"."service_chats" TO "anon";
GRANT ALL ON TABLE "public"."service_chats" TO "authenticated";
GRANT ALL ON TABLE "public"."service_chats" TO "service_role";



GRANT ALL ON TABLE "public"."service_disputes" TO "anon";
GRANT ALL ON TABLE "public"."service_disputes" TO "authenticated";
GRANT ALL ON TABLE "public"."service_disputes" TO "service_role";



GRANT ALL ON TABLE "public"."service_reviews" TO "anon";
GRANT ALL ON TABLE "public"."service_reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."service_reviews" TO "service_role";



GRANT ALL ON TABLE "public"."sitter_profiles" TO "anon";
GRANT ALL ON TABLE "public"."sitter_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."sitter_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."social_interactions" TO "anon";
GRANT ALL ON TABLE "public"."social_interactions" TO "authenticated";
GRANT ALL ON TABLE "public"."social_interactions" TO "service_role";



GRANT ALL ON TABLE "public"."subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."support_requests" TO "anon";
GRANT ALL ON TABLE "public"."support_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."support_requests" TO "service_role";



GRANT ALL ON TABLE "public"."thread_comments" TO "anon";
GRANT ALL ON TABLE "public"."thread_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."thread_comments" TO "service_role";



GRANT ALL ON TABLE "public"."thread_supports" TO "anon";
GRANT ALL ON TABLE "public"."thread_supports" TO "authenticated";
GRANT ALL ON TABLE "public"."thread_supports" TO "service_role";



GRANT ALL ON TABLE "public"."threads" TO "anon";
GRANT ALL ON TABLE "public"."threads" TO "authenticated";
GRANT ALL ON TABLE "public"."threads" TO "service_role";



GRANT ALL ON TABLE "public"."transactions" TO "anon";
GRANT ALL ON TABLE "public"."transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."transactions" TO "service_role";



GRANT ALL ON TABLE "public"."triage_cache" TO "anon";
GRANT ALL ON TABLE "public"."triage_cache" TO "authenticated";
GRANT ALL ON TABLE "public"."triage_cache" TO "service_role";



GRANT ALL ON TABLE "public"."typing_indicators" TO "anon";
GRANT ALL ON TABLE "public"."typing_indicators" TO "authenticated";
GRANT ALL ON TABLE "public"."typing_indicators" TO "service_role";



GRANT ALL ON TABLE "public"."user_blocks" TO "anon";
GRANT ALL ON TABLE "public"."user_blocks" TO "authenticated";
GRANT ALL ON TABLE "public"."user_blocks" TO "service_role";



GRANT ALL ON TABLE "public"."user_locations" TO "anon";
GRANT ALL ON TABLE "public"."user_locations" TO "authenticated";
GRANT ALL ON TABLE "public"."user_locations" TO "service_role";



GRANT ALL ON TABLE "public"."user_quotas" TO "anon";
GRANT ALL ON TABLE "public"."user_quotas" TO "authenticated";
GRANT ALL ON TABLE "public"."user_quotas" TO "service_role";



GRANT ALL ON TABLE "public"."user_quotas_legacy_20260208" TO "anon";
GRANT ALL ON TABLE "public"."user_quotas_legacy_20260208" TO "authenticated";
GRANT ALL ON TABLE "public"."user_quotas_legacy_20260208" TO "service_role";



GRANT ALL ON TABLE "public"."user_reports" TO "anon";
GRANT ALL ON TABLE "public"."user_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."user_reports" TO "service_role";



GRANT ALL ON TABLE "public"."user_unmatches" TO "anon";
GRANT ALL ON TABLE "public"."user_unmatches" TO "authenticated";
GRANT ALL ON TABLE "public"."user_unmatches" TO "service_role";



GRANT ALL ON TABLE "public"."verification_audit_log" TO "service_role";



GRANT ALL ON TABLE "public"."verification_requests" TO "anon";
GRANT ALL ON TABLE "public"."verification_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."verification_requests" TO "service_role";



GRANT ALL ON TABLE "public"."verification_uploads" TO "anon";
GRANT ALL ON TABLE "public"."verification_uploads" TO "authenticated";
GRANT ALL ON TABLE "public"."verification_uploads" TO "service_role";



GRANT ALL ON TABLE "public"."waves" TO "anon";
GRANT ALL ON TABLE "public"."waves" TO "authenticated";
GRANT ALL ON TABLE "public"."waves" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







