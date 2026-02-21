


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



CREATE TYPE "public"."verification_status_enum" AS ENUM (
    'not_submitted',
    'pending',
    'approved',
    'rejected'
);


ALTER TYPE "public"."verification_status_enum" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_qms_cycle_month_start"("p_owner_id" "uuid") RETURNS "date"
    LANGUAGE "plpgsql" STABLE
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
  last_day_this_month int := extract(
    day from (date_trunc('month', today) + interval '1 month - 1 day')
  )::int;
  last_day_prev_month int := extract(
    day from (date_trunc('month', prev) + interval '1 month - 1 day')
  )::int;
  this_anchor date;
  prev_anchor date;
begin
  tier := public._qms_effective_tier(p_owner_id);

  -- Free uses calendar month (no subscription anniversary).
  if tier not in ('premium', 'gold') then
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
BEGIN
  INSERT INTO public.profiles (id, created_at)
  VALUES (p_owner_id, now())
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_quotas (user_id)
  VALUES (p_owner_id)
  ON CONFLICT (user_id) DO NOTHING;
END;
$$;


ALTER FUNCTION "public"."_qms_touch_row"("p_owner_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_review_verification"("p_user_id" "uuid", "p_status" "public"."verification_status_enum", "p_comment" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE public.profiles
  SET
    verification_status = p_status,
    verification_comment = p_comment,
    is_verified = (p_status = 'approved')
  WHERE id = p_user_id;
END;
$$;


ALTER FUNCTION "public"."admin_review_verification"("p_user_id" "uuid", "p_status" "public"."verification_status_enum", "p_comment" "text") OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "public"."broadcast_alerts_set_geog"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.geog := st_setsrid(st_makepoint(new.longitude, new.latitude), 4326)::geography;
  return new;
end;
$$;


ALTER FUNCTION "public"."broadcast_alerts_set_geog"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_and_increment_quota"("action_type" "text") RETURNS boolean
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

  limit_threads int := 1;
  limit_discovery int := 40;
  limit_media int := 0;
  limit_stars int := 0;
  limit_broadcast_week int := 5;
begin
  if u_id is null then
    return false;
  end if;

  owner_id := public._qms_get_pool_owner(u_id);
  tier := public._qms_effective_tier(owner_id);

  -- Gold pools; others are per-user.
  if tier <> 'gold' then
    owner_id := u_id;
    tier := public._qms_effective_tier(owner_id);
  end if;

  perform public._qms_touch_row(owner_id);
  select * into q from public.user_quotas where user_id = owner_id;
  mo := public._qms_cycle_month_start(owner_id);

  -- Period resets (idempotent).
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

  -- Tier limits (v1.9)
  if tier = 'premium' then
    limit_threads := 5;
    limit_discovery := 2147483647;
    limit_media := 10;
    limit_stars := 0;
    limit_broadcast_week := 20;
  elsif tier = 'gold' then
    limit_threads := 20;
    limit_discovery := 2147483647;
    limit_media := 50;
    limit_stars := 3;
    limit_broadcast_week := 20;
  else
    -- free defaults already set
  end if;

  -- Apply action rules
  if action_type = 'thread_post' then
    if q.thread_posts_today < limit_threads then
      q.thread_posts_today := q.thread_posts_today + 1;
    else
      return false;
    end if;

  elsif action_type in ('discovery_profile', 'discovery_view') then
    if tier in ('premium','gold') then
      null; -- unlimited
    else
      if q.discovery_views_today >= limit_discovery then
        return false;
      end if;
      q.discovery_views_today := q.discovery_views_today + 1;
      q.discovery_profiles_today := q.discovery_views_today;
    end if;

  elsif action_type in ('media', 'ai_vet_upload', 'thread_image', 'chat_image', 'broadcast_media', 'video_upload') then
    -- v1.9: Media quota applies to images across AI Vet/Chats/Threads/Broadcast.
    -- Gold video uploads are allowed; others are blocked.
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
    -- Broadcast quotas are enforced by map_alerts trigger (needs access to extension token semantics).
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


CREATE OR REPLACE FUNCTION "public"."check_scan_rate_limit"("user_uuid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  user_tier TEXT;
  recent_scans INT;
BEGIN
  SELECT tier INTO user_tier
  FROM profiles
  WHERE id = user_uuid;

  IF user_tier IN ('premium', 'gold') THEN
    RETURN TRUE;
  END IF;

  SELECT COUNT(*) INTO recent_scans
  FROM scan_rate_limits
  WHERE user_id = user_uuid
    AND scan_timestamp > NOW() - INTERVAL '24 hours';

  RETURN recent_scans < 3;
END;
$$;


ALTER FUNCTION "public"."check_scan_rate_limit"("user_uuid" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."check_scan_rate_limit"("user_uuid" "uuid") IS 'Validates if user can perform a scan based on tier and recent usage (3 scans per 24 hours for free tier).';



CREATE OR REPLACE FUNCTION "public"."cleanup_expired_broadcast_alerts"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_deleted integer := 0;
begin
  delete from public.broadcast_alerts
  where (created_at + make_interval(hours => duration_hours)) <= now();

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;


ALTER FUNCTION "public"."cleanup_expired_broadcast_alerts"() OWNER TO "postgres";


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
  v_display_name text;
  v_legal_name text;
  v_phone text;
  v_lat double precision;
  v_lng double precision;
  v_type text;
  v_title text;
  v_description text;
  v_photo_url text;
  v_range_meters integer;
  v_expires_at timestamptz;
  v_address text;
  v_thread_id uuid := null;
  v_alert_id uuid;
  v_post_to_threads boolean;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  v_lat := coalesce(nullif(payload->>'lat', '')::double precision, nullif(payload->>'latitude', '')::double precision);
  v_lng := coalesce(nullif(payload->>'lng', '')::double precision, nullif(payload->>'longitude', '')::double precision);
  if v_lat is null or v_lng is null then
    raise exception 'missing_coords' using errcode = '22023';
  end if;

  v_type := coalesce(nullif(payload->>'type', ''), nullif(payload->>'alert_type', ''), 'Alert');
  v_title := nullif(payload->>'title', '');
  v_description := nullif(payload->>'description', '');
  v_photo_url := nullif(payload->>'photo_url', '');
  v_range_meters := coalesce(nullif(payload->>'range_meters', '')::integer, 10000);
  v_expires_at := coalesce(nullif(payload->>'expires_at', '')::timestamptz, now() + interval '12 hours');
  v_address := nullif(payload->>'address', '');
  v_post_to_threads := coalesce((payload->>'post_on_threads')::boolean, (payload->>'posted_to_threads')::boolean, false);

  select
    coalesce(
      nullif(btrim(coalesce(
        u.raw_user_meta_data->>'display_name',
        u.raw_user_meta_data->>'full_name',
        split_part(u.email, '@', 1),
        'Huddle User'
      )), ''),
      'Huddle User'
    ),
    coalesce(
      nullif(btrim(coalesce(
        u.raw_user_meta_data->>'legal_name',
        u.raw_user_meta_data->>'full_name',
        u.raw_user_meta_data->>'display_name',
        split_part(u.email, '@', 1),
        'Huddle User'
      )), ''),
      'Huddle User'
    ),
    nullif(btrim(coalesce(
      u.raw_user_meta_data->>'phone',
      u.phone,
      ''
    )), '')
  into v_display_name, v_legal_name, v_phone
  from auth.users u
  where u.id = v_uid;

  insert into public.profiles (id, display_name, legal_name, phone, updated_at)
  select v_uid, v_display_name, v_legal_name, v_phone, now()
  where not exists (
    select 1 from public.profiles p where p.id = v_uid
  );

  if v_post_to_threads then
    insert into public.threads (
      user_id,
      title,
      content,
      tags,
      hashtags,
      images,
      is_map_alert,
      is_public
    ) values (
      v_uid,
      coalesce(v_title, format('%s Alert: %s', v_type, coalesce(v_address, 'Pinned Location'))),
      coalesce(v_description, ''),
      array['News']::text[],
      array[]::text[],
      array_remove(array[v_photo_url], null),
      true,
      coalesce((payload->>'is_public')::boolean, true)
    )
    returning id into v_thread_id;
  end if;

  insert into public.map_alerts (
    creator_id,
    latitude,
    longitude,
    alert_type,
    title,
    description,
    photo_url,
    range_meters,
    expires_at,
    address,
    thread_id,
    posted_to_threads
  ) values (
    v_uid,
    v_lat,
    v_lng,
    v_type,
    v_title,
    v_description,
    v_photo_url,
    v_range_meters,
    v_expires_at,
    coalesce(v_address, 'Pinned Location'),
    v_thread_id,
    v_post_to_threads
  )
  returning id into v_alert_id;

  if v_thread_id is not null then
    update public.threads
    set map_id = v_alert_id
    where id = v_thread_id;
  end if;

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


CREATE OR REPLACE FUNCTION "public"."debug_whoami"() RETURNS TABLE("current_user_name" "text", "session_user_name" "text", "auth_uid" "uuid")
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  SELECT current_user::text, session_user::text, auth.uid();
$$;


ALTER FUNCTION "public"."debug_whoami"() OWNER TO "postgres";


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



CREATE OR REPLACE FUNCTION "public"."finalize_identity_submission"("doc_type" "text", "doc_path" "text", "selfie_path" "text", "country" "text", "legal_name" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_user UUID := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF doc_type NOT IN ('passport', 'drivers_license', 'id_card') THEN
    RAISE EXCEPTION 'Invalid doc type';
  END IF;

  INSERT INTO public.verification_uploads
    (user_id, document_type, document_url, selfie_url, country, legal_name, status, uploaded_at)
  VALUES
    (v_user, doc_type, doc_path, selfie_path, country, legal_name, 'pending', NOW());

  UPDATE public.profiles
    SET verification_status = 'pending',
        is_verified = false,
        legal_name = COALESCE(legal_name, public.profiles.legal_name),
        location_country = COALESCE(country, public.profiles.location_country),
        verification_comment = NULL
  WHERE id = v_user;

  INSERT INTO public.admin_audit_logs
    (actor_id, action, target_user_id, details)
  VALUES
    (v_user, 'kyc_submitted', v_user, jsonb_build_object(
      'doc_type', doc_type,
      'doc_path', doc_path,
      'selfie_path', selfie_path,
      'country', country,
      'legal_name', legal_name
    ));
END;
$$;


ALTER FUNCTION "public"."finalize_identity_submission"("doc_type" "text", "doc_path" "text", "selfie_path" "text", "country" "text", "legal_name" "text") OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "public"."get_friend_pins_nearby"("p_lat" double precision, "p_lng" double precision, "p_radius_m" integer DEFAULT 50000) RETURNS TABLE("id" "uuid", "display_name" "text", "avatar_url" "text", "dob" "date", "relationship_status" "text", "owns_pets" boolean, "pet_species" "text"[], "location_name" "text", "last_lat" double precision, "last_lng" double precision, "location_pinned_until" timestamp with time zone)
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  with pet_data as (
    select owner_id, array_remove(array_agg(distinct species), null) as pet_species
    from public.pets
    where is_active = true
    group by owner_id
  )
  select
    p.id,
    p.display_name,
    p.avatar_url,
    p.dob,
    p.relationship_status,
    p.owns_pets,
    pd.pet_species,
    p.location_name,
    p.last_lat,
    p.last_lng,
    p.location_pinned_until
  from public.profiles p
  left join pet_data pd on pd.owner_id = p.id
  where p.id <> auth.uid()
    and p.map_visible = true
    and p.location_pinned_until is not null
    and p.location_pinned_until > now()
    and coalesce(p.location, p.location_geog) is not null
    and ST_DWithin(
      coalesce(p.location, p.location_geog),
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
      greatest(0, least(p_radius_m, 50000))
    )
  order by p.location_pinned_until desc
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


CREATE OR REPLACE FUNCTION "public"."get_visible_broadcast_alerts"("p_lat" double precision, "p_lng" double precision) RETURNS TABLE("id" "uuid", "latitude" double precision, "longitude" double precision, "alert_type" "text", "title" "text", "description" "text", "photo_url" "text", "support_count" integer, "report_count" integer, "created_at" timestamp with time zone, "expires_at" timestamp with time zone, "duration_hours" integer, "range_meters" integer, "range_km" numeric, "creator_id" "uuid", "thread_id" "uuid", "posted_to_threads" boolean, "post_on_social" boolean, "social_post_id" "text", "social_status" "text", "social_url" "text", "media_urls" "text"[], "location_street" "text", "location_district" "text", "creator_display_name" "text", "creator_avatar_url" "text")
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
    a.duration_hours,
    a.range_meters,
    coalesce(a.range_km, a.range_meters / 1000.0) as range_km,
    a.creator_id,
    a.thread_id,
    coalesce(a.posted_to_threads, false) as posted_to_threads,
    coalesce(a.post_on_social, false) as post_on_social,
    a.social_post_id,
    a.social_status,
    a.social_url,
    a.media_urls,
    a.location_street,
    a.location_district,
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
      greatest(0, least(coalesce(a.range_km, a.range_meters / 1000.0, 10) * 1000.0, 150000.0))
    )
  order by a.created_at desc
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


CREATE OR REPLACE FUNCTION "public"."handle_identity_review"("target_user_id" "uuid", "action" "text", "notes" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_admin UUID := auth.uid();
  v_is_admin BOOLEAN;
  v_upload RECORD;
  v_action TEXT;
BEGIN
  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = v_admin;

  INSERT INTO public.admin_audit_logs (actor_id, action, target_user_id, notes)
  VALUES (v_admin, 'kyc_review_attempt', target_user_id, notes);

  IF v_is_admin IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT *
  INTO v_upload
  FROM public.verification_uploads
  WHERE user_id = target_user_id AND status = 'pending'
  ORDER BY uploaded_at DESC
  LIMIT 1;

  IF v_upload IS NULL THEN
    RAISE EXCEPTION 'No pending upload';
  END IF;

  IF action = 'approve' THEN
    UPDATE public.profiles
      SET verification_status = 'verified',
          is_verified = true,
          verification_comment = NULL
    WHERE id = target_user_id;

    UPDATE public.verification_uploads
      SET status = 'approved',
          reviewed_by = v_admin,
          reviewed_at = NOW(),
          rejection_reason = NULL
    WHERE id = v_upload.id;

    INSERT INTO public.identity_verification_cleanup_queue (user_id, object_path, delete_after)
    VALUES (target_user_id, v_upload.document_url, NOW() + INTERVAL '30 days');

    IF v_upload.selfie_url IS NOT NULL THEN
      INSERT INTO public.identity_verification_cleanup_queue (user_id, object_path, delete_after)
      VALUES (target_user_id, v_upload.selfie_url, NOW() + INTERVAL '30 days');
    END IF;

    v_action := 'kyc_approved';
  ELSIF action = 'reject' THEN
    UPDATE public.profiles
      SET verification_status = 'unverified',
          is_verified = false,
          verification_comment = notes
    WHERE id = target_user_id;

    UPDATE public.verification_uploads
      SET status = 'rejected',
          reviewed_by = v_admin,
          reviewed_at = NOW(),
          rejection_reason = notes
    WHERE id = v_upload.id;

    DELETE FROM storage.objects
      WHERE bucket_id = 'identity_verification'
        AND name IN (v_upload.document_url, v_upload.selfie_url);

    v_action := 'kyc_rejected';
  ELSE
    RAISE EXCEPTION 'Invalid action';
  END IF;

  INSERT INTO public.admin_audit_logs (actor_id, action, target_user_id, notes)
  VALUES (v_admin, v_action, target_user_id, notes);
END;
$$;


ALTER FUNCTION "public"."handle_identity_review"("target_user_id" "uuid", "action" "text", "notes" "text") OWNER TO "postgres";


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
declare
  v_display_name text;
  v_legal_name text;
  v_phone text;
begin
  v_display_name := nullif(
    btrim(coalesce(
      new.raw_user_meta_data->>'display_name',
      new.raw_user_meta_data->>'name',
      new.raw_user_meta_data->>'full_name',
      split_part(new.email, '@', 1),
      'Huddle User'
    )),
    ''
  );
  if v_display_name is null then
    v_display_name := 'Huddle User';
  end if;

  v_legal_name := nullif(
    btrim(coalesce(
      new.raw_user_meta_data->>'legal_name',
      new.raw_user_meta_data->>'full_name',
      v_display_name
    )),
    ''
  );
  if v_legal_name is null then
    v_legal_name := v_display_name;
  end if;

  v_phone := nullif(btrim(coalesce(new.raw_user_meta_data->>'phone', new.phone, '')), '');

  insert into public.profiles (id, display_name, legal_name, phone, updated_at)
  values (new.id, v_display_name, v_legal_name, v_phone, now())
  on conflict (id) do nothing;

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_auth_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_display_name text;
  v_legal_name text;
  v_phone text;
  v_social_id text;
BEGIN
  IF NEW.raw_user_meta_data IS NULL THEN
    RAISE EXCEPTION 'Missing signup metadata';
  END IF;

  v_display_name := COALESCE(
    NULLIF(BTRIM(NEW.raw_user_meta_data->>'display_name'), ''),
    NULLIF(SPLIT_PART(COALESCE(NEW.email, ''), '@', 1), ''),
    'User'
  );

  v_legal_name := COALESCE(
    NULLIF(BTRIM(NEW.raw_user_meta_data->>'legal_name'), ''),
    v_display_name
  );

  v_phone := NULLIF(BTRIM(COALESCE(NEW.raw_user_meta_data->>'phone', NEW.phone, '')), '');

  -- REQUIRED: social_id must never be NULL
  v_social_id := NULLIF(BTRIM(LOWER(COALESCE(NEW.raw_user_meta_data->>'social_id', ''))), '');
  IF v_social_id IS NULL THEN
    v_social_id := 'u' || SUBSTR(REPLACE(NEW.id::TEXT, '-', ''), 1, 10);
  END IF;

  INSERT INTO public.profiles (
    id,
    display_name,
    legal_name,
    phone,
    dob,
    social_id,
    verification_status,
    is_verified,
    onboarding_completed
  )
  VALUES (
    NEW.id,
    v_display_name,
    v_legal_name,
    v_phone,
    (NEW.raw_user_meta_data->>'dob')::date,
    v_social_id,
    'not_submitted',
    false,
    false
  )
  ON CONFLICT (id) DO UPDATE
    SET display_name = EXCLUDED.display_name,
        legal_name = EXCLUDED.legal_name,
        phone = EXCLUDED.phone,
        dob = EXCLUDED.dob;
    -- NOTE: social_id is NOT updated on conflict to prevent overwrites

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


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



CREATE OR REPLACE FUNCTION "public"."is_social_id_taken"("candidate" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Normalize to lowercase
  -- Check if exists for any user OTHER than current user
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE LOWER(social_id) = LOWER(candidate)
      AND id <> COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::UUID)
  );
END;
$$;


ALTER FUNCTION "public"."is_social_id_taken"("candidate" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."is_social_id_taken"("candidate" "text") IS 'Check if a social_id is already taken by another user (case-insensitive)';



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
declare
  v_processed int := 0;
  v_row record;
begin
  for v_row in
    select q.alert_id
    from public.map_alert_notification_queue q
    where q.processed_at is null
      and q.run_at <= now()
    order by q.run_at asc
    limit greatest(1, least(p_limit, 500))
  loop
    begin
      insert into public.notifications(user_id, message, type, metadata)
      select
        p.id,
        case
          when a.alert_type = 'Lost' then 'Alert: Missing in ' || coalesce(p.location_name, 'your area') || '!'
          when a.alert_type = 'Stray' then 'Alert: Furry friend sighting in ' || coalesce(p.location_name, 'your area') || '!'
          else 'Alert nearby in ' || coalesce(p.location_name, 'your area') || '!'
        end,
        'alert',
        jsonb_build_object('alert_id', a.id, 'alert_type', a.alert_type)
      from public.map_alerts a
      join public.profiles p on true
      where a.id = v_row.alert_id
        and p.id <> a.creator_id
        and p.location_retention_until is not null
        and p.location_retention_until > now()
        and coalesce(p.location, p.location_geog) is not null
        and a.location_geog is not null
        and st_dwithin(
          coalesce(p.location, p.location_geog),
          a.location_geog,
          greatest(0, least(coalesce(a.range_meters, 10000), 150000))
        )
      order by p.location_retention_until desc
      limit 500;

      update public.map_alert_notification_queue
      set processed_at = now()
      where alert_id = v_row.alert_id;

      v_processed := v_processed + 1;
    exception when others then
      update public.map_alert_notification_queue
      set attempts = attempts + 1,
          last_error = left(sqlerrm, 500)
      where alert_id = v_row.alert_id;
    end;
  end loop;

  return v_processed;
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
    ai_vet_uploads_today = 0,
    updated_at = now()
  where day_start <> current_date;

  -- Weekly counters (Free broadcast weekly)
  update public.user_quotas
  set
    week_start = wk,
    broadcast_week_used = 0,
    updated_at = now()
  where week_start <> wk;

  -- Monthly counters (anniversary-based for premium/gold; calendar month for free)
  update public.user_quotas uq
  set
    month_start = ms.cycle_start,
    stars_month_used = 0,
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
  if (new.verification_status in ('approved','rejected')) and new.verification_document_url is not null then
    insert into public.identity_verification_cleanup_queue (user_id, object_path, delete_after)
    values (new.id, new.verification_document_url, now() + interval '7 days');
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."queue_identity_cleanup"() OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "public"."refresh_subscription_quotas"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  update public.profiles
  set
    stars_count = case when tier = 'gold' then 3 else 0 end,
    mesh_alert_count = case when tier = 'premium' then 20 when tier = 'gold' then 999999 else 5 end,
    media_credits = case when tier = 'premium' then 10 when tier = 'gold' then 50 else 0 end,
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
  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_user_location"("p_lat" double precision, "p_lng" double precision, "p_pin_hours" integer DEFAULT 2, "p_retention_hours" integer DEFAULT 24) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  update public.profiles
  set
    last_lat = p_lat,
    last_lng = p_lng,
    location = ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
    location_geog = ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
    location_pinned_until = now() + (p_pin_hours || ' hours')::interval,
    location_retention_until = now() + (p_retention_hours || ' hours')::interval,
    updated_at = now()
  where id = auth.uid();
end;
$$;


ALTER FUNCTION "public"."set_user_location"("p_lat" double precision, "p_lng" double precision, "p_pin_hours" integer, "p_retention_hours" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."social_discovery"("p_user_id" "uuid", "p_lat" double precision, "p_lng" double precision, "p_radius_m" integer, "p_min_age" integer, "p_max_age" integer) RETURNS TABLE("id" "uuid", "display_name" "text", "avatar_url" "text", "is_verified" boolean, "has_car" boolean, "bio" "text", "last_lat" double precision, "last_lng" double precision)
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


ALTER FUNCTION "public"."social_discovery"("p_user_id" "uuid", "p_lat" double precision, "p_lng" double precision, "p_radius_m" integer, "p_min_age" integer, "p_max_age" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."social_discovery"("p_user_id" "uuid", "p_lat" double precision, "p_lng" double precision, "p_radius_m" integer, "p_min_age" integer, "p_max_age" integer, "p_role" "text" DEFAULT NULL::"text", "p_gender" "text" DEFAULT NULL::"text", "p_species" "text"[] DEFAULT NULL::"text"[], "p_pet_size" "text" DEFAULT NULL::"text", "p_advanced" boolean DEFAULT false, "p_height_min" numeric DEFAULT NULL::numeric, "p_height_max" numeric DEFAULT NULL::numeric, "p_only_waved" boolean DEFAULT false, "p_active_only" boolean DEFAULT false) RETURNS TABLE("id" "uuid", "display_name" "text", "avatar_url" "text", "is_verified" boolean, "has_car" boolean, "bio" "text", "relationship_status" "text", "dob" "date", "location_name" "text", "occupation" "text", "school" "text", "major" "text", "gender_genre" "text", "orientation" "text", "height" numeric, "weight" numeric, "weight_unit" "text", "tier" "text", "pets" "jsonb", "pet_species" "text"[], "pet_size" "text", "social_album" "text"[], "show_occupation" boolean, "show_academic" boolean, "show_bio" boolean, "show_relationship_status" boolean, "show_age" boolean, "show_gender" boolean, "show_orientation" boolean, "show_height" boolean, "show_weight" boolean, "social_role" "text", "score" numeric)
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  with viewer_base as (
    select
      p.id,
      p.relationship_status,
      p.care_circle,
      coalesce(nullif((row_to_json(p)::jsonb->>'effective_tier'), ''), p.tier, 'free') as tier_raw,
      p.last_login
    from public.profiles p
    where p.id = p_user_id
  ),
  viewer as (
    select
      vb.*,
      -- Gold family pooling/inheritance for discovery tier checks.
      coalesce(
        (
          select coalesce(inv.tier, 'free')
          from public.family_members fm
          join public.profiles inv on inv.id = fm.inviter_user_id
          where fm.invitee_user_id = vb.id
            and fm.status = 'accepted'
          limit 1
        ),
        vb.tier_raw
      ) as effective_tier
    from viewer_base vb
  ),
  flags as (
    select
      v.*,
      (v.effective_tier in ('premium','gold')) as adv_allowed,
      (v.effective_tier = 'gold') as gold_allowed,
      case when v.effective_tier in ('premium','gold') then 200 else 40 end as max_rows
    from viewer v
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
  base as (
    select
      p.*,
      pd.pets,
      pd.pet_species,
      pd.max_weight_kg,
      case
        when sp.user_id is not null then 'nannies'
        when p.owns_pets then 'playdates'
        else 'animal-lovers'
      end as social_role
    from public.profiles p
    left join public.sitter_profiles sp on sp.user_id = p.id
    left join pet_data pd on pd.owner_id = p.id
    where p.id <> p_user_id
  ),
  filtered as (
    select
      b.*,
      case
        when b.max_weight_kg is null then null
        when b.max_weight_kg <= 9 then 'Small'
        when b.max_weight_kg <= 22 then 'Medium'
        else 'Large'
      end as pet_size
    from base b
  ),
  scored as (
    select
      f.*,
      (
        case
          when p_species is not null
            and array_length(p_species, 1) > 0
            and f.pet_species && p_species then 100
          else 0
        end
        + case when (p_advanced and fl.adv_allowed) and f.is_verified then 50 else 0 end
        + case when (p_advanced and fl.adv_allowed) and fl.relationship_status is not null and f.relationship_status = fl.relationship_status then 30 else 0 end
        + case when (p_advanced and fl.adv_allowed) and (f.has_car or coalesce(f.experience_years, 0) > 0 or array_length(f.pet_experience, 1) > 0) then 30 else 0 end
        + case when (p_advanced and fl.adv_allowed) and (f.social_availability = true or array_length(f.availability_status, 1) > 0) then 20 else 0 end
        + case when (p_advanced and fl.adv_allowed) and (
            f.id = any(fl.care_circle)
            or exists (
              select 1 from public.family_members fm
              where fm.status = 'accepted'
                and (
                  (fm.inviter_user_id = fl.id and fm.invitee_user_id = f.id)
                  or (fm.inviter_user_id = f.id and fm.invitee_user_id = fl.id)
                )
            )
          ) then 20 else 0 end
      ) as score,
      case
        when f.tier = 'gold' then 3
        when f.tier = 'premium' then 2
        else 1
      end as membership_priority
    from filtered f
    cross join flags fl
    where f.dob is not null
      and (extract(year from age(current_date, f.dob)) between p_min_age and p_max_age)
      and (p_gender is null or p_gender = '' or p_gender = 'Any' or f.gender_genre = p_gender)
      and (p_role is null or p_role = '' or f.social_role = p_role)
      and (p_species is null or array_length(p_species, 1) = 0 or f.pet_species && p_species)
      and (p_pet_size is null or p_pet_size = '' or p_pet_size = 'Any' or f.pet_size = p_pet_size)
      and (p_height_min is null or f.height >= p_height_min)
      and (p_height_max is null or f.height <= p_height_max)
      and (coalesce(f.location, f.location_geog) is not null)
      and ST_DWithin(
        coalesce(f.location, f.location_geog),
        ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
        p_radius_m
      )
      and (f.location_retention_until is null or f.location_retention_until > now())
      and (
        -- Gold-only filters
        fl.gold_allowed is false
        or p_only_waved is false
        or exists (
          select 1 from public.waves w
          where w.to_user_id = fl.id
            and w.from_user_id = f.id
        )
      )
      and (
        fl.gold_allowed is false
        or p_active_only is false
        or (f.last_login is not null and f.last_login > (now() - interval '24 hours'))
      )
  )
  select
    id,
    display_name,
    avatar_url,
    is_verified,
    has_car,
    bio,
    relationship_status,
    dob,
    location_name,
    occupation,
    school,
    major,
    gender_genre,
    orientation,
    height,
    weight,
    weight_unit,
    tier,
    pets,
    pet_species,
    pet_size,
    social_album,
    show_occupation,
    show_academic,
    show_bio,
    show_relationship_status,
    show_age,
    show_gender,
    show_orientation,
    show_height,
    show_weight,
    social_role,
    score
  from scored
  order by membership_priority desc, score desc nulls last, created_at desc
  limit (select max_rows from flags);
$$;


ALTER FUNCTION "public"."social_discovery"("p_user_id" "uuid", "p_lat" double precision, "p_lng" double precision, "p_radius_m" integer, "p_min_age" integer, "p_max_age" integer, "p_role" "text", "p_gender" "text", "p_species" "text"[], "p_pet_size" "text", "p_advanced" boolean, "p_height_min" numeric, "p_height_max" numeric, "p_only_waved" boolean, "p_active_only" boolean) OWNER TO "postgres";


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

SET default_tablespace = '';

SET default_table_access_method = "heap";


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
    CONSTRAINT "broadcast_alerts_duration_hours_check" CHECK ((("duration_hours" > 0) AND ("duration_hours" <= 72))),
    CONSTRAINT "broadcast_alerts_latitude_check" CHECK ((("latitude" >= ('-90'::integer)::double precision) AND ("latitude" <= (90)::double precision))),
    CONSTRAINT "broadcast_alerts_longitude_check" CHECK ((("longitude" >= ('-180'::integer)::double precision) AND ("longitude" <= (180)::double precision))),
    CONSTRAINT "broadcast_alerts_range_km_check" CHECK ((("range_km" > (0)::numeric) AND ("range_km" <= (100)::numeric))),
    CONSTRAINT "broadcast_alerts_type_check" CHECK (("type" = ANY (ARRAY['Stray'::"text", 'Lost'::"text", 'Others'::"text"])))
);


ALTER TABLE "public"."broadcast_alerts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "room_id" "text" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
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
    "room_id" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
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
    CONSTRAINT "chats_type_check" CHECK (("type" = ANY (ARRAY['direct'::"text", 'group'::"text"])))
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
    "updated_at" timestamp with time zone DEFAULT "now"()
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
    CONSTRAINT "notifications_type_check" CHECK (("type" = ANY (ARRAY['alert'::"text", 'admin'::"text"])))
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


CREATE TABLE IF NOT EXISTS "public"."pets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "photo_url" "text",
    "name" "text" NOT NULL,
    "species" "text" NOT NULL,
    "breed" "text",
    "gender" "text",
    "weight" integer,
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
    CONSTRAINT "pets_next_vaccination_future" CHECK ((("next_vaccination_reminder" IS NULL) OR ("next_vaccination_reminder" > CURRENT_DATE))),
    CONSTRAINT "pets_next_vaccination_future_chk" CHECK ((("next_vaccination_reminder" IS NULL) OR ("next_vaccination_reminder" > CURRENT_DATE))),
    CONSTRAINT "pets_weight_lt_100" CHECK ((("weight" IS NULL) OR ("weight" < 100)))
);


ALTER TABLE "public"."pets" OWNER TO "postgres";


COMMENT ON COLUMN "public"."pets"."neutered_spayed" IS 'Whether pet has been neutered or spayed';



COMMENT ON COLUMN "public"."pets"."vaccination_dates" IS 'Vaccination dates stored as MM-YYYY format strings';



COMMENT ON COLUMN "public"."pets"."next_vaccination_reminder" IS 'Next scheduled vaccination reminder date';



CREATE TABLE IF NOT EXISTS "public"."pins" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid",
    "lat" double precision,
    "lng" double precision,
    "address" "text",
    "is_invisible" boolean DEFAULT false,
    "thread_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
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


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "display_name" "text",
    "legal_name" "text",
    "phone" "text",
    "gender_genre" "text",
    "dob" "date",
    "height" integer,
    "weight" integer,
    "weight_unit" "text" DEFAULT 'kg'::"text",
    "degree" "text",
    "school" "text",
    "affiliation" "text",
    "pet_experience" "text"[] DEFAULT '{}'::"text"[],
    "experience_years" integer DEFAULT 0,
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
    "verification_status" "public"."verification_status_enum" DEFAULT 'pending'::"public"."verification_status_enum",
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
    "social_id" "text" NOT NULL,
    CONSTRAINT "profiles_family_slots_check" CHECK (("family_slots" >= 0)),
    CONSTRAINT "profiles_media_credits_check" CHECK (("media_credits" >= 0)),
    CONSTRAINT "profiles_mesh_alert_count_check" CHECK (("mesh_alert_count" >= 0)),
    CONSTRAINT "profiles_min_age" CHECK (("dob" < (CURRENT_DATE - '13 years'::interval))),
    CONSTRAINT "profiles_stars_count_check" CHECK (("stars_count" >= 0)),
    CONSTRAINT "profiles_subscription_status_check" CHECK (("subscription_status" = ANY (ARRAY['free'::"text", 'premium_pending'::"text", 'premium_active'::"text", 'premium_cancelled'::"text"]))),
    CONSTRAINT "profiles_tier_check" CHECK (("tier" = ANY (ARRAY['free'::"text", 'premium'::"text", 'gold'::"text"]))),
    CONSTRAINT "social_id_format" CHECK (("social_id" ~ '^[a-z0-9._]+$'::"text")),
    CONSTRAINT "social_id_length" CHECK ((("length"("social_id") >= 6) AND ("length"("social_id") <= 20)))
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
            ELSE NULL::integer
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


CREATE TABLE IF NOT EXISTS "public"."scan_rate_limits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "scan_timestamp" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."scan_rate_limits" OWNER TO "postgres";


COMMENT ON TABLE "public"."scan_rate_limits" IS 'Rate limiting for free-tier users (3 scans/hour). Premium users bypass this table.';



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
    "created_at" timestamp with time zone DEFAULT "now"()
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
    CONSTRAINT "transactions_type_check" CHECK (("type" = ANY (ARRAY['subscription'::"text", 'star_pack'::"text", 'emergency_alert'::"text", 'vet_media'::"text", 'family_slot'::"text", '5_media_pack'::"text", '7_day_extension'::"text", 'verified_badge'::"text", 'marketplace_booking'::"text"])))
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



ALTER TABLE ONLY "public"."broadcast_alerts"
    ADD CONSTRAINT "broadcast_alerts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_participants"
    ADD CONSTRAINT "chat_participants_chat_id_user_id_key" UNIQUE ("chat_id", "user_id");



ALTER TABLE ONLY "public"."chat_participants"
    ADD CONSTRAINT "chat_participants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_room_members"
    ADD CONSTRAINT "chat_room_members_pkey" PRIMARY KEY ("room_id", "user_id");



ALTER TABLE ONLY "public"."chats"
    ADD CONSTRAINT "chats_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."consent_logs"
    ADD CONSTRAINT "consent_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."emergency_logs"
    ADD CONSTRAINT "emergency_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."family_members"
    ADD CONSTRAINT "family_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hazard_identifications"
    ADD CONSTRAINT "hazard_identifications_pkey" PRIMARY KEY ("id");



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



ALTER TABLE ONLY "public"."notification_logs"
    ADD CONSTRAINT "notification_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pets"
    ADD CONSTRAINT "pets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pins"
    ADD CONSTRAINT "pins_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."poi_locations"
    ADD CONSTRAINT "poi_locations_osm_id_key" UNIQUE ("osm_id");



ALTER TABLE ONLY "public"."poi_locations"
    ADD CONSTRAINT "poi_locations_pkey" PRIMARY KEY ("id");



ALTER TABLE "public"."profiles"
    ADD CONSTRAINT "profiles_display_name_required" CHECK ((("display_name" IS NOT NULL) AND ("btrim"("display_name") <> ''::"text"))) NOT VALID;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_email_key" UNIQUE ("email");



ALTER TABLE "public"."profiles"
    ADD CONSTRAINT "profiles_legal_name_required" CHECK ((("legal_name" IS NOT NULL) AND ("btrim"("legal_name") <> ''::"text"))) NOT VALID;



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



ALTER TABLE ONLY "public"."scan_rate_limits"
    ADD CONSTRAINT "scan_rate_limits_pkey" PRIMARY KEY ("id");



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



CREATE INDEX "idx_bookings_client" ON "public"."marketplace_bookings" USING "btree" ("client_id");



CREATE INDEX "idx_bookings_escrow_release" ON "public"."marketplace_bookings" USING "btree" ("escrow_release_date") WHERE ("status" = 'completed'::"text");



CREATE INDEX "idx_bookings_sitter" ON "public"."marketplace_bookings" USING "btree" ("sitter_id");



CREATE INDEX "idx_bookings_status" ON "public"."marketplace_bookings" USING "btree" ("status");



CREATE INDEX "idx_broadcast_alerts_created_at" ON "public"."broadcast_alerts" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_broadcast_alerts_creator_id" ON "public"."broadcast_alerts" USING "btree" ("creator_id");



CREATE INDEX "idx_broadcast_alerts_geog" ON "public"."broadcast_alerts" USING "gist" ("geog");



CREATE INDEX "idx_chat_participants_chat_id" ON "public"."chat_participants" USING "btree" ("chat_id");



CREATE INDEX "idx_chat_participants_user_id" ON "public"."chat_participants" USING "btree" ("user_id");



CREATE INDEX "idx_consent_logs_user_id" ON "public"."consent_logs" USING "btree" ("user_id", "accepted_at" DESC);



CREATE INDEX "idx_emergency_logs_alert_id" ON "public"."emergency_logs" USING "btree" ("alert_id");



CREATE INDEX "idx_emergency_logs_created_at" ON "public"."emergency_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_emergency_logs_event_type" ON "public"."emergency_logs" USING "btree" ("event_type");



CREATE INDEX "idx_hazard_created_at" ON "public"."hazard_identifications" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_hazard_user_id" ON "public"."hazard_identifications" USING "btree" ("user_id");



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



CREATE INDEX "idx_messages_chat_id" ON "public"."messages" USING "btree" ("chat_id", "created_at" DESC);



CREATE INDEX "idx_messages_sender_id" ON "public"."messages" USING "btree" ("sender_id");



CREATE INDEX "idx_notification_logs_alert_id" ON "public"."notification_logs" USING "btree" ("alert_id");



CREATE INDEX "idx_notification_logs_created_at" ON "public"."notification_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_notifications_is_read" ON "public"."notifications" USING "btree" ("user_id", "is_read");



CREATE INDEX "idx_notifications_unread" ON "public"."notifications" USING "btree" ("user_id", "read") WHERE ("read" = false);



CREATE INDEX "idx_notifications_user" ON "public"."notifications" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_notifications_user_id" ON "public"."notifications" USING "btree" ("user_id", "created_at" DESC);



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



CREATE INDEX "idx_sitter_rating" ON "public"."sitter_profiles" USING "btree" ("rating" DESC);



CREATE INDEX "idx_sitter_stripe_connect" ON "public"."sitter_profiles" USING "btree" ("stripe_connect_account_id");



CREATE INDEX "idx_sitter_user" ON "public"."sitter_profiles" USING "btree" ("user_id");



CREATE INDEX "idx_social_interactions_target_id" ON "public"."social_interactions" USING "btree" ("target_id");



CREATE INDEX "idx_social_interactions_user_id" ON "public"."social_interactions" USING "btree" ("user_id");



CREATE INDEX "idx_transactions_created" ON "public"."transactions" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_transactions_stripe_event" ON "public"."transactions" USING "btree" ("stripe_event_id");



CREATE INDEX "idx_transactions_type" ON "public"."transactions" USING "btree" ("type");



CREATE INDEX "idx_transactions_user" ON "public"."transactions" USING "btree" ("user_id");



CREATE INDEX "idx_triage_cache_expiry" ON "public"."triage_cache" USING "btree" ("expires_at");



CREATE INDEX "idx_triage_cache_hash" ON "public"."triage_cache" USING "btree" ("image_hash");



CREATE INDEX "idx_user_locations_geography" ON "public"."user_locations" USING "gist" ("location");



CREATE INDEX "idx_user_quotas_day" ON "public"."user_quotas" USING "btree" ("day_start");



CREATE INDEX "idx_verification_uploads_status" ON "public"."verification_uploads" USING "btree" ("status");



CREATE INDEX "idx_verification_uploads_user_id" ON "public"."verification_uploads" USING "btree" ("user_id");



CREATE INDEX "idx_waves_from" ON "public"."waves" USING "btree" ("from_user_id", "created_at" DESC);



CREATE INDEX "idx_waves_receiver_id" ON "public"."waves" USING "btree" ("receiver_id");



CREATE INDEX "idx_waves_sender_id" ON "public"."waves" USING "btree" ("sender_id");



CREATE INDEX "idx_waves_status" ON "public"."waves" USING "btree" ("status");



CREATE INDEX "idx_waves_to" ON "public"."waves" USING "btree" ("to_user_id", "created_at" DESC);



CREATE INDEX "profiles_location_geog_gix" ON "public"."profiles" USING "gist" ("location_geog");



CREATE INDEX "profiles_location_idx" ON "public"."profiles" USING "gist" ("location");



CREATE UNIQUE INDEX "profiles_social_id_unique_idx" ON "public"."profiles" USING "btree" ("lower"("social_id"));



CREATE UNIQUE INDEX "waves_from_to_unique" ON "public"."waves" USING "btree" ("from_user_id", "to_user_id");



CREATE OR REPLACE TRIGGER "award_sitter_vouch_trigger" AFTER UPDATE ON "public"."marketplace_bookings" FOR EACH ROW EXECUTE FUNCTION "public"."award_sitter_vouch"();



CREATE OR REPLACE TRIGGER "on_new_match" AFTER INSERT ON "public"."matches" FOR EACH ROW EXECUTE FUNCTION "public"."create_match_chat"();



CREATE OR REPLACE TRIGGER "on_new_message" AFTER INSERT ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."update_chat_last_message"();



CREATE OR REPLACE TRIGGER "on_wave_accepted" AFTER UPDATE ON "public"."waves" FOR EACH ROW EXECUTE FUNCTION "public"."check_for_match"();



CREATE OR REPLACE TRIGGER "protect_profiles_monetization" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."protect_monetized_fields"();



CREATE OR REPLACE TRIGGER "set_booking_escrow_release" BEFORE INSERT OR UPDATE ON "public"."marketplace_bookings" FOR EACH ROW EXECUTE FUNCTION "public"."set_escrow_release_date"();



CREATE OR REPLACE TRIGGER "trg_alert_interactions_counts_del" AFTER DELETE ON "public"."alert_interactions" FOR EACH ROW EXECUTE FUNCTION "public"."map_alerts_apply_interaction_counts"();



CREATE OR REPLACE TRIGGER "trg_alert_interactions_counts_ins" AFTER INSERT ON "public"."alert_interactions" FOR EACH ROW EXECUTE FUNCTION "public"."map_alerts_apply_interaction_counts"();



CREATE OR REPLACE TRIGGER "trg_broadcast_alerts_set_geog" BEFORE INSERT OR UPDATE OF "latitude", "longitude" ON "public"."broadcast_alerts" FOR EACH ROW EXECUTE FUNCTION "public"."broadcast_alerts_set_geog"();



CREATE OR REPLACE TRIGGER "trg_map_alerts_auto_hide" BEFORE UPDATE OF "report_count" ON "public"."map_alerts" FOR EACH ROW EXECUTE FUNCTION "public"."map_alerts_auto_hide_on_reports"();



CREATE OR REPLACE TRIGGER "trg_map_alerts_contract" BEFORE INSERT ON "public"."map_alerts" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_map_alert_contract"();



CREATE OR REPLACE TRIGGER "trg_notify_on_map_alert_insert" AFTER INSERT ON "public"."map_alerts" FOR EACH ROW EXECUTE FUNCTION "public"."enqueue_map_alert_notification"();



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



ALTER TABLE ONLY "public"."broadcast_alerts"
    ADD CONSTRAINT "broadcast_alerts_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."chat_participants"
    ADD CONSTRAINT "chat_participants_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_participants"
    ADD CONSTRAINT "chat_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_room_members"
    ADD CONSTRAINT "chat_room_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chats"
    ADD CONSTRAINT "chats_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."consent_logs"
    ADD CONSTRAINT "consent_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."emergency_logs"
    ADD CONSTRAINT "emergency_logs_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "public"."lost_pet_alerts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."family_members"
    ADD CONSTRAINT "family_members_invitee_user_id_fkey" FOREIGN KEY ("invitee_user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."family_members"
    ADD CONSTRAINT "family_members_inviter_user_id_fkey" FOREIGN KEY ("inviter_user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."hazard_identifications"
    ADD CONSTRAINT "hazard_identifications_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."hazard_identifications"
    ADD CONSTRAINT "hazard_identifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



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
    ADD CONSTRAINT "message_reads_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_reads"
    ADD CONSTRAINT "message_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notice_board"
    ADD CONSTRAINT "notice_board_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_logs"
    ADD CONSTRAINT "notification_logs_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "public"."lost_pet_alerts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pets"
    ADD CONSTRAINT "pets_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pins"
    ADD CONSTRAINT "pins_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pins"
    ADD CONSTRAINT "pins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."push_tokens"
    ADD CONSTRAINT "push_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reminders"
    ADD CONSTRAINT "reminders_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reminders"
    ADD CONSTRAINT "reminders_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."scan_rate_limits"
    ADD CONSTRAINT "scan_rate_limits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



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



ALTER TABLE ONLY "public"."user_locations"
    ADD CONSTRAINT "user_locations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_quotas"
    ADD CONSTRAINT "user_quotas_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



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



CREATE POLICY "Users can insert own pets" ON "public"."pets" FOR INSERT WITH CHECK (("owner_id" = "auth"."uid"()));



CREATE POLICY "Users can send messages in their chats" ON "public"."messages" FOR INSERT WITH CHECK ((("sender_id" = "auth"."uid"()) AND ("chat_id" IN ( SELECT "chat_participants"."chat_id"
   FROM "public"."chat_participants"
  WHERE ("chat_participants"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can send waves" ON "public"."waves" FOR INSERT WITH CHECK (("sender_id" = "auth"."uid"()));



CREATE POLICY "Users can update own alerts" ON "public"."map_alerts" FOR UPDATE USING (("creator_id" = "auth"."uid"()));



CREATE POLICY "Users can update own location" ON "public"."user_locations" FOR UPDATE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can update own notices" ON "public"."notice_board" FOR UPDATE USING (("author_id" = "auth"."uid"()));



CREATE POLICY "Users can update own notifications" ON "public"."notifications" FOR UPDATE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can update own pets" ON "public"."pets" FOR UPDATE USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "Users can update own sitter profile" ON "public"."sitter_profiles" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own alerts" ON "public"."lost_pet_alerts" FOR UPDATE USING (("auth"."uid"() = "owner_id"));



CREATE POLICY "Users can update waves they received" ON "public"."waves" FOR UPDATE USING (("receiver_id" = "auth"."uid"()));



CREATE POLICY "Users can upload verification documents" ON "public"."verification_uploads" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view chats they participate in" ON "public"."chats" FOR SELECT USING (("id" IN ( SELECT "chat_participants"."chat_id"
   FROM "public"."chat_participants"
  WHERE ("chat_participants"."user_id" = "auth"."uid"()))));



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



CREATE POLICY "Users can view participants of their chats" ON "public"."chat_participants" FOR SELECT USING (("chat_id" IN ( SELECT "chat_participants_1"."chat_id"
   FROM "public"."chat_participants" "chat_participants_1"
  WHERE ("chat_participants_1"."user_id" = "auth"."uid"()))));



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


ALTER TABLE "public"."alert_interactions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "authenticated_users_read_cache" ON "public"."triage_cache" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "authenticated_users_update_cache_hits" ON "public"."triage_cache" FOR UPDATE USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "authenticated_users_write_cache" ON "public"."triage_cache" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



COMMENT ON POLICY "authenticated_users_write_cache" ON "public"."triage_cache" IS 'Allows client-side cache population after AI scans to reduce API costs';



ALTER TABLE "public"."broadcast_alerts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "broadcast_alerts_delete_own" ON "public"."broadcast_alerts" FOR DELETE TO "authenticated" USING (("creator_id" = "auth"."uid"()));



CREATE POLICY "broadcast_alerts_insert_own" ON "public"."broadcast_alerts" FOR INSERT TO "authenticated" WITH CHECK (("creator_id" = "auth"."uid"()));



CREATE POLICY "broadcast_alerts_update_own" ON "public"."broadcast_alerts" FOR UPDATE TO "authenticated" USING (("creator_id" = "auth"."uid"())) WITH CHECK (("creator_id" = "auth"."uid"()));



ALTER TABLE "public"."chat_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "chat_messages_insert" ON "public"."chat_messages" FOR INSERT WITH CHECK ((("sender_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."chat_room_members" "m"
  WHERE (("m"."room_id" = "chat_messages"."room_id") AND ("m"."user_id" = "auth"."uid"()))))));



CREATE POLICY "chat_messages_select" ON "public"."chat_messages" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."chat_room_members" "m"
  WHERE (("m"."room_id" = "chat_messages"."room_id") AND ("m"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."chat_participants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chat_room_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "chat_room_members_delete" ON "public"."chat_room_members" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "chat_room_members_insert" ON "public"."chat_room_members" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "chat_room_members_select" ON "public"."chat_room_members" FOR SELECT USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."chats" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."consent_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "consent_logs_insert_own" ON "public"."consent_logs" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "consent_logs_read_own" ON "public"."consent_logs" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "consent_logs_service_role_all" ON "public"."consent_logs" USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text")) WITH CHECK ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));



ALTER TABLE "public"."emergency_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."family_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "family_members_owner_insert" ON "public"."family_members" FOR INSERT WITH CHECK (("auth"."uid"() = "inviter_user_id"));



CREATE POLICY "family_members_owner_select" ON "public"."family_members" FOR SELECT USING ((("auth"."uid"() = "inviter_user_id") OR ("auth"."uid"() = "invitee_user_id")));



CREATE POLICY "family_members_owner_update" ON "public"."family_members" FOR UPDATE USING ((("auth"."uid"() = "inviter_user_id") OR ("auth"."uid"() = "invitee_user_id")));



ALTER TABLE "public"."hazard_identifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."location_reviews" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lost_pet_alerts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."map_alerts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "map_alerts_insert_auth" ON "public"."map_alerts" FOR INSERT TO "authenticated" WITH CHECK (("creator_id" = "auth"."uid"()));



CREATE POLICY "map_alerts_insert_auth_only" ON "public"."map_alerts" FOR INSERT TO "authenticated" WITH CHECK (("creator_id" = "auth"."uid"()));



CREATE POLICY "map_alerts_insert_own" ON "public"."map_alerts" FOR INSERT TO "authenticated" WITH CHECK (("creator_id" = "auth"."uid"()));



ALTER TABLE "public"."map_checkins" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."marketplace_bookings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."match_preferences" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."matches" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."message_reads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notice_board" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notification_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notification_preferences" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notifications_delete_service_role" ON "public"."notifications" FOR DELETE USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));



CREATE POLICY "notifications_insert_service_role" ON "public"."notifications" FOR INSERT WITH CHECK ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));



CREATE POLICY "notifications_select_own" ON "public"."notifications" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "notifications_update_own" ON "public"."notifications" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."poi_locations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_insert_own" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK (("id" = "auth"."uid"()));



CREATE POLICY "profiles_select_own" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("id" = "auth"."uid"()));



CREATE POLICY "profiles_update_own" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("id" = "auth"."uid"())) WITH CHECK (("id" = "auth"."uid"()));



CREATE POLICY "profiles_update_self_strict" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



ALTER TABLE "public"."push_tokens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reminders" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "reminders_delete_own" ON "public"."reminders" FOR DELETE USING (("auth"."uid"() = "owner_id"));



CREATE POLICY "reminders_insert_own" ON "public"."reminders" FOR INSERT WITH CHECK (("auth"."uid"() = "owner_id"));



CREATE POLICY "reminders_select_own" ON "public"."reminders" FOR SELECT USING (("auth"."uid"() = "owner_id"));



CREATE POLICY "reminders_update_own" ON "public"."reminders" FOR UPDATE USING (("auth"."uid"() = "owner_id")) WITH CHECK (("auth"."uid"() = "owner_id"));



ALTER TABLE "public"."scan_rate_limits" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "service_role_full_access_cache" ON "public"."triage_cache" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "service_role_insert_emergency_logs" ON "public"."emergency_logs" FOR INSERT WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "service_role_insert_notification_logs" ON "public"."notification_logs" FOR INSERT WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "service_role_update_emergency_logs" ON "public"."emergency_logs" FOR UPDATE USING (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."sitter_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."social_interactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."support_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "support_requests_admin_select" ON "public"."support_requests" FOR SELECT USING ((("auth"."jwt"() ->> 'role'::"text") = 'admin'::"text"));



CREATE POLICY "support_requests_insert" ON "public"."support_requests" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."thread_comments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "thread_comments_owner_delete" ON "public"."thread_comments" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "thread_comments_owner_insert" ON "public"."thread_comments" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "thread_comments_owner_select" ON "public"."thread_comments" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "thread_comments_owner_update" ON "public"."thread_comments" FOR UPDATE USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."threads" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "threads_owner_delete" ON "public"."threads" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "threads_owner_insert" ON "public"."threads" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "threads_owner_select" ON "public"."threads" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "threads_owner_update" ON "public"."threads" FOR UPDATE USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."triage_cache" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."typing_indicators" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_locations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_quotas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_quotas_legacy_20260208" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_quotas_read_own" ON "public"."user_quotas" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "user_quotas_service_role_all" ON "public"."user_quotas" USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text")) WITH CHECK ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));



CREATE POLICY "users_insert_own_rate_limits" ON "public"."scan_rate_limits" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "users_view_own_emergency_logs" ON "public"."emergency_logs" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."lost_pet_alerts"
  WHERE (("lost_pet_alerts"."id" = "emergency_logs"."alert_id") AND ("lost_pet_alerts"."owner_id" = "auth"."uid"())))));



CREATE POLICY "users_view_own_notification_logs" ON "public"."notification_logs" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."lost_pet_alerts"
  WHERE (("lost_pet_alerts"."id" = "notification_logs"."alert_id") AND ("lost_pet_alerts"."owner_id" = "auth"."uid"())))));



CREATE POLICY "users_view_own_rate_limits" ON "public"."scan_rate_limits" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."verification_audit_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."verification_requests" ENABLE ROW LEVEL SECURITY;


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



GRANT ALL ON FUNCTION "public"."admin_review_verification"("p_user_id" "uuid", "p_status" "public"."verification_status_enum", "p_comment" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_review_verification"("p_user_id" "uuid", "p_status" "public"."verification_status_enum", "p_comment" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_review_verification"("p_user_id" "uuid", "p_status" "public"."verification_status_enum", "p_comment" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."award_sitter_vouch"() TO "anon";
GRANT ALL ON FUNCTION "public"."award_sitter_vouch"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."award_sitter_vouch"() TO "service_role";



GRANT ALL ON FUNCTION "public"."broadcast_alerts_set_geog"() TO "anon";
GRANT ALL ON FUNCTION "public"."broadcast_alerts_set_geog"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."broadcast_alerts_set_geog"() TO "service_role";



GRANT ALL ON FUNCTION "public"."check_and_increment_quota"("action_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."check_and_increment_quota"("action_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_and_increment_quota"("action_type" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_for_match"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_for_match"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_for_match"() TO "service_role";



GRANT ALL ON FUNCTION "public"."check_scan_rate_limit"("user_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."check_scan_rate_limit"("user_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_scan_rate_limit"("user_uuid" "uuid") TO "service_role";



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



REVOKE ALL ON FUNCTION "public"."debug_whoami"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."debug_whoami"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."debug_whoami"() TO "service_role";



GRANT ALL ON FUNCTION "public"."downgrade_user_tier"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."downgrade_user_tier"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."downgrade_user_tier"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_map_alert_contract"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_map_alert_contract"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_map_alert_contract"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enqueue_map_alert_notification"() TO "anon";
GRANT ALL ON FUNCTION "public"."enqueue_map_alert_notification"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enqueue_map_alert_notification"() TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_profile_for_auth_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_profile_for_auth_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_profile_for_auth_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."file_booking_dispute"("p_booking_id" "uuid", "p_dispute_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."file_booking_dispute"("p_booking_id" "uuid", "p_dispute_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."file_booking_dispute"("p_booking_id" "uuid", "p_dispute_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."finalize_identity_submission"("doc_type" "text", "doc_path" "text", "selfie_path" "text", "country" "text", "legal_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."finalize_identity_submission"("doc_type" "text", "doc_path" "text", "selfie_path" "text", "country" "text", "legal_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."finalize_identity_submission"("doc_type" "text", "doc_path" "text", "selfie_path" "text", "country" "text", "legal_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."find_nearby_users"("alert_lat" double precision, "alert_lng" double precision, "radius_meters" integer, "min_vouch_score" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."find_nearby_users"("alert_lat" double precision, "alert_lng" double precision, "radius_meters" integer, "min_vouch_score" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."find_nearby_users"("alert_lat" double precision, "alert_lng" double precision, "radius_meters" integer, "min_vouch_score" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_uid"("len" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."generate_uid"("len" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_uid"("len" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_friend_pins_nearby"("p_lat" double precision, "p_lng" double precision, "p_radius_m" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_friend_pins_nearby"("p_lat" double precision, "p_lng" double precision, "p_radius_m" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_map_alerts_nearby"("p_lat" double precision, "p_lng" double precision, "p_radius_m" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_map_alerts_nearby"("p_lat" double precision, "p_lng" double precision, "p_radius_m" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_quota_snapshot"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_quota_snapshot"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_visible_broadcast_alerts"("p_lat" double precision, "p_lng" double precision) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_visible_broadcast_alerts"("p_lat" double precision, "p_lng" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_visible_broadcast_alerts"("p_lat" double precision, "p_lng" double precision) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_visible_map_alerts"("p_lat" double precision, "p_lng" double precision) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_visible_map_alerts"("p_lat" double precision, "p_lng" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_visible_map_alerts"("p_lat" double precision, "p_lng" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_identity_review"("target_user_id" "uuid", "action" "text", "notes" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."handle_identity_review"("target_user_id" "uuid", "action" "text", "notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_identity_review"("target_user_id" "uuid", "action" "text", "notes" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_marketplace_payment_success"("p_payment_intent_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."handle_marketplace_payment_success"("p_payment_intent_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_marketplace_payment_success"("p_payment_intent_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_auth_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_auth_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_auth_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_user_credits"("p_user_id" "uuid", "p_stars" integer, "p_mesh_alerts" integer, "p_media_credits" integer, "p_family_slots" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."increment_user_credits"("p_user_id" "uuid", "p_stars" integer, "p_mesh_alerts" integer, "p_media_credits" integer, "p_family_slots" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_user_credits"("p_user_id" "uuid", "p_stars" integer, "p_mesh_alerts" integer, "p_media_credits" integer, "p_family_slots" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."is_social_id_taken"("candidate" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_social_id_taken"("candidate" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_social_id_taken"("candidate" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."map_alerts_apply_interaction_counts"() TO "anon";
GRANT ALL ON FUNCTION "public"."map_alerts_apply_interaction_counts"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."map_alerts_apply_interaction_counts"() TO "service_role";



GRANT ALL ON FUNCTION "public"."map_alerts_auto_hide_on_reports"() TO "anon";
GRANT ALL ON FUNCTION "public"."map_alerts_auto_hide_on_reports"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."map_alerts_auto_hide_on_reports"() TO "service_role";



GRANT ALL ON FUNCTION "public"."mark_booking_completed"("p_booking_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."mark_booking_completed"("p_booking_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_booking_completed"("p_booking_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_on_map_alert_insert"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_on_map_alert_insert"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_on_map_alert_insert"() TO "service_role";



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



GRANT ALL ON FUNCTION "public"."refill_ai_vet_rate_limits"() TO "anon";
GRANT ALL ON FUNCTION "public"."refill_ai_vet_rate_limits"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."refill_ai_vet_rate_limits"() TO "service_role";



GRANT ALL ON FUNCTION "public"."refresh_subscription_quotas"() TO "anon";
GRANT ALL ON FUNCTION "public"."refresh_subscription_quotas"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_subscription_quotas"() TO "service_role";



GRANT ALL ON FUNCTION "public"."release_escrow_funds"() TO "anon";
GRANT ALL ON FUNCTION "public"."release_escrow_funds"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."release_escrow_funds"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_escrow_release_date"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_escrow_release_date"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_escrow_release_date"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_profiles_user_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_profiles_user_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_profiles_user_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_user_location"("p_lat" double precision, "p_lng" double precision, "p_pin_hours" integer, "p_retention_hours" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."set_user_location"("p_lat" double precision, "p_lng" double precision, "p_pin_hours" integer, "p_retention_hours" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_user_location"("p_lat" double precision, "p_lng" double precision, "p_pin_hours" integer, "p_retention_hours" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."social_discovery"("p_user_id" "uuid", "p_lat" double precision, "p_lng" double precision, "p_radius_m" integer, "p_min_age" integer, "p_max_age" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."social_discovery"("p_user_id" "uuid", "p_lat" double precision, "p_lng" double precision, "p_radius_m" integer, "p_min_age" integer, "p_max_age" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."social_discovery"("p_user_id" "uuid", "p_lat" double precision, "p_lng" double precision, "p_radius_m" integer, "p_min_age" integer, "p_max_age" integer, "p_role" "text", "p_gender" "text", "p_species" "text"[], "p_pet_size" "text", "p_advanced" boolean, "p_height_min" numeric, "p_height_max" numeric, "p_only_waved" boolean, "p_active_only" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."social_discovery"("p_user_id" "uuid", "p_lat" double precision, "p_lng" double precision, "p_radius_m" integer, "p_min_age" integer, "p_max_age" integer, "p_role" "text", "p_gender" "text", "p_species" "text"[], "p_pet_size" "text", "p_advanced" boolean, "p_height_min" numeric, "p_height_max" numeric, "p_only_waved" boolean, "p_active_only" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_thread_comment_content"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_thread_comment_content"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_thread_comment_content"() TO "service_role";



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



GRANT ALL ON FUNCTION "public"."validate_vaccination_dates"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_vaccination_dates"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_vaccination_dates"() TO "service_role";



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



GRANT ALL ON TABLE "public"."broadcast_alerts" TO "service_role";
GRANT INSERT ON TABLE "public"."broadcast_alerts" TO "authenticated";



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



GRANT ALL ON TABLE "public"."emergency_logs" TO "anon";
GRANT ALL ON TABLE "public"."emergency_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."emergency_logs" TO "service_role";



GRANT ALL ON TABLE "public"."family_members" TO "anon";
GRANT ALL ON TABLE "public"."family_members" TO "authenticated";
GRANT ALL ON TABLE "public"."family_members" TO "service_role";



GRANT ALL ON TABLE "public"."hazard_identifications" TO "anon";
GRANT ALL ON TABLE "public"."hazard_identifications" TO "authenticated";
GRANT ALL ON TABLE "public"."hazard_identifications" TO "service_role";



GRANT ALL ON TABLE "public"."identity_verification_cleanup_queue" TO "anon";
GRANT ALL ON TABLE "public"."identity_verification_cleanup_queue" TO "authenticated";
GRANT ALL ON TABLE "public"."identity_verification_cleanup_queue" TO "service_role";



GRANT ALL ON TABLE "public"."location_reviews" TO "anon";
GRANT ALL ON TABLE "public"."location_reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."location_reviews" TO "service_role";



GRANT ALL ON TABLE "public"."lost_pet_alerts" TO "anon";
GRANT ALL ON TABLE "public"."lost_pet_alerts" TO "authenticated";
GRANT ALL ON TABLE "public"."lost_pet_alerts" TO "service_role";



GRANT ALL ON TABLE "public"."map_alert_notification_queue" TO "anon";
GRANT ALL ON TABLE "public"."map_alert_notification_queue" TO "authenticated";
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



GRANT ALL ON TABLE "public"."notification_logs" TO "anon";
GRANT ALL ON TABLE "public"."notification_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_logs" TO "service_role";



GRANT ALL ON TABLE "public"."notification_preferences" TO "anon";
GRANT ALL ON TABLE "public"."notification_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_preferences" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."payments" TO "anon";
GRANT ALL ON TABLE "public"."payments" TO "authenticated";
GRANT ALL ON TABLE "public"."payments" TO "service_role";



GRANT ALL ON TABLE "public"."pets" TO "anon";
GRANT ALL ON TABLE "public"."pets" TO "authenticated";
GRANT ALL ON TABLE "public"."pets" TO "service_role";



GRANT ALL ON TABLE "public"."pins" TO "anon";
GRANT ALL ON TABLE "public"."pins" TO "authenticated";
GRANT ALL ON TABLE "public"."pins" TO "service_role";



GRANT ALL ON TABLE "public"."poi_locations" TO "anon";
GRANT ALL ON TABLE "public"."poi_locations" TO "authenticated";
GRANT ALL ON TABLE "public"."poi_locations" TO "service_role";



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



GRANT ALL ON TABLE "public"."scan_rate_limits" TO "anon";
GRANT ALL ON TABLE "public"."scan_rate_limits" TO "authenticated";
GRANT ALL ON TABLE "public"."scan_rate_limits" TO "service_role";



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



GRANT ALL ON TABLE "public"."user_locations" TO "anon";
GRANT ALL ON TABLE "public"."user_locations" TO "authenticated";
GRANT ALL ON TABLE "public"."user_locations" TO "service_role";



GRANT ALL ON TABLE "public"."user_quotas" TO "anon";
GRANT ALL ON TABLE "public"."user_quotas" TO "authenticated";
GRANT ALL ON TABLE "public"."user_quotas" TO "service_role";



GRANT ALL ON TABLE "public"."user_quotas_legacy_20260208" TO "anon";
GRANT ALL ON TABLE "public"."user_quotas_legacy_20260208" TO "authenticated";
GRANT ALL ON TABLE "public"."user_quotas_legacy_20260208" TO "service_role";



GRANT ALL ON TABLE "public"."verification_audit_log" TO "anon";
GRANT ALL ON TABLE "public"."verification_audit_log" TO "authenticated";
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







