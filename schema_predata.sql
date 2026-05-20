--
-- PostgreSQL database dump
--

\restrict QntI1Kd56Vinda7XcibqqMU7YgUb5UJGF8NhtRQKSPuc9VDn5vsoDMrZL2XL3Rq

-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.1

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'Huddle V14 Revenue & Monetization System - Production Ready';


--
-- Name: tier_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.tier_enum AS ENUM (
    'free',
    'plus',
    'gold'
);


--
-- Name: verification_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.verification_status_enum AS ENUM (
    'unverified',
    'pending',
    'verified'
);


--
-- Name: _qms_cycle_month_start(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._qms_cycle_month_start(p_owner_id uuid) RETURNS date
    LANGUAGE plpgsql STABLE
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


--
-- Name: _qms_effective_tier(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._qms_effective_tier(p_user_id uuid) RETURNS text
    LANGUAGE sql STABLE
    AS $$
  select coalesce(nullif(p.effective_tier::text, ''), nullif(p.tier::text, ''), 'free')
  from public.profiles p
  where p.id = p_user_id;
$$;


--
-- Name: _qms_get_pool_owner(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._qms_get_pool_owner(p_user_id uuid) RETURNS uuid
    LANGUAGE sql STABLE
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


--
-- Name: _qms_touch_row(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._qms_touch_row(p_owner_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  insert into public.user_quotas (user_id)
  values (p_owner_id)
  on conflict (user_id) do nothing;
END;
$$;


--
-- Name: admin_set_verification_status(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_set_verification_status(p_user_id uuid, p_decision text, p_comment text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_is_admin boolean;
  v_role text;
  v_action text;
  v_actor_social_id text;
  v_target_social_id text;
  v_upload record;
BEGIN
  SELECT is_admin, role, social_id
    INTO v_is_admin, v_role, v_actor_social_id
  FROM public.profiles
  WHERE id = auth.uid();

  IF NOT (v_is_admin IS TRUE OR v_role = 'admin') THEN
    RAISE EXCEPTION 'not_admin';
  END IF;

  SELECT social_id
    INTO v_target_social_id
  FROM public.profiles
  WHERE id = p_user_id;

  IF p_decision NOT IN ('verified', 'unverified') THEN
    RAISE EXCEPTION 'invalid_decision';
  END IF;

  SELECT *
    INTO v_upload
  FROM public.verification_uploads
  WHERE user_id = p_user_id
  ORDER BY uploaded_at DESC
  LIMIT 1;

  IF p_decision = 'verified' THEN
    UPDATE public.profiles
    SET
      verification_status = 'verified'::public.verification_status_enum,
      verification_comment = p_comment
    WHERE id = p_user_id;
    v_action := 'kyc_verified';
  ELSE
    UPDATE public.profiles
    SET
      verification_status = 'unverified'::public.verification_status_enum,
      verification_comment = p_comment
    WHERE id = p_user_id;
    v_action := 'kyc_unverified';
  END IF;

  IF v_upload.id IS NOT NULL THEN
    IF p_decision = 'verified' THEN
      UPDATE public.verification_uploads
      SET
        status = 'verified',
        reviewed_by = auth.uid(),
        reviewed_at = now(),
        rejection_reason = NULL,
        archived_at = NULL,
        archived_by = NULL
      WHERE id = v_upload.id;
    ELSE
      UPDATE public.verification_uploads
      SET
        status = 'unverified',
        reviewed_by = auth.uid(),
        reviewed_at = now(),
        rejection_reason = p_comment,
        archived_at = NULL,
        archived_by = NULL
      WHERE id = v_upload.id;
    END IF;

    IF v_upload.document_url IS NOT NULL THEN
      INSERT INTO public.identity_verification_cleanup_queue (user_id, object_path, delete_after)
      VALUES (p_user_id, v_upload.document_url, now() + interval '7 days');
    END IF;

    IF v_upload.selfie_url IS NOT NULL THEN
      INSERT INTO public.identity_verification_cleanup_queue (user_id, object_path, delete_after)
      VALUES (p_user_id, v_upload.selfie_url, now() + interval '7 days');
    END IF;
  END IF;

  INSERT INTO public.admin_audit_logs (
    actor_id,
    target_user_id,
    action,
    notes,
    created_at,
    actor_social_id,
    target_social_id
  )
  VALUES (
    auth.uid(),
    p_user_id,
    v_action,
    p_comment,
    now(),
    v_actor_social_id,
    v_target_social_id
  );

  RETURN jsonb_build_object('ok', true, 'user_id', p_user_id, 'decision', p_decision);
END;
$$;


--
-- Name: award_sitter_vouch(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.award_sitter_vouch() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
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


--
-- Name: broadcast_alerts_set_geog(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.broadcast_alerts_set_geog() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.geog := st_setsrid(st_makepoint(new.longitude, new.latitude), 4326)::geography;
  return new;
end;
$$;


--
-- Name: check_and_increment_quota(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_and_increment_quota(action_type text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
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
  limit_broadcast_week int := 10;
begin
  if u_id is null then
    return false;
  end if;

  owner_id := public._qms_get_pool_owner(u_id);
  tier := public._qms_effective_tier(owner_id);

  if tier <> 'gold' then
    owner_id := u_id;
    tier := public._qms_effective_tier(owner_id);
  end if;

  perform public._qms_touch_row(owner_id);
  select * into q from public.user_quotas where user_id = owner_id;
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

  if tier = 'plus' then
    limit_threads := 30;
    limit_discovery := 250;
    limit_media := 20;
    limit_stars := 4;
    limit_broadcast_week := 40;
  elsif tier = 'gold' then
    limit_threads := 60;
    limit_discovery := 2147483647;
    limit_media := 40;
    limit_stars := 10;
    limit_broadcast_week := 80;
  end if;

  if action_type in ('thread_post', 'thread_create') then
    if q.thread_posts_today >= limit_threads then
      return false;
    end if;
    q.thread_posts_today := q.thread_posts_today + 1;

  elsif action_type in ('discovery_view', 'discover_view') then
    if q.discovery_views_today >= limit_discovery then
      return false;
    end if;
    q.discovery_views_today := q.discovery_views_today + 1;
    q.discovery_profiles_today := q.discovery_views_today;

  elsif action_type in ('media', 'ai_vet_upload', 'thread_image', 'chat_image', 'broadcast_media', 'video_upload') then
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


--
-- Name: check_for_match(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_for_match() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
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


--
-- Name: check_identifier_registered(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_identifier_registered(p_email text, p_phone text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_email_exists BOOLEAN := false;
  v_phone_exists BOOLEAN := false;
  v_field TEXT := null;
BEGIN
  -- Check email in auth.users
  IF p_email IS NOT NULL AND p_email != '' THEN
    SELECT EXISTS (
      SELECT 1 FROM auth.users WHERE email = p_email
    ) INTO v_email_exists;
  END IF;

  -- Check phone in auth.users
  IF p_phone IS NOT NULL AND p_phone != '' THEN
    SELECT EXISTS (
      SELECT 1 FROM auth.users WHERE phone = p_phone
    ) INTO v_phone_exists;
  END IF;

  -- Determine which field is registered (prioritize email if both)
  IF v_email_exists THEN
    v_field := 'email';
  ELSIF v_phone_exists THEN
    v_field := 'phone';
  END IF;

  RETURN jsonb_build_object(
    'registered', (v_email_exists OR v_phone_exists),
    'field', v_field
  );
END;
$$;


--
-- Name: FUNCTION check_identifier_registered(p_email text, p_phone text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.check_identifier_registered(p_email text, p_phone text) IS 'Checks if email or phone is already registered. Returns {registered: boolean, field: "email"|"phone"|null}';


--
-- Name: check_scan_rate_limit(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_scan_rate_limit(user_uuid uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
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


--
-- Name: FUNCTION check_scan_rate_limit(user_uuid uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.check_scan_rate_limit(user_uuid uuid) IS 'Validates if user can perform a scan based on tier and recent usage (3 scans per 24 hours for free tier).';


--
-- Name: cleanup_expired_broadcast_alerts(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_expired_broadcast_alerts() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: cleanup_expired_map_alerts(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_expired_map_alerts() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: create_alert_thread_and_pin(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_alert_thread_and_pin(payload jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth'
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


--
-- Name: create_match_chat(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_match_chat() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
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


--
-- Name: debug_whoami(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.debug_whoami() RETURNS TABLE(current_user_name text, session_user_name text, auth_uid uuid)
    LANGUAGE sql SECURITY DEFINER
    AS $$
  SELECT current_user::text, session_user::text, auth.uid();
$$;


--
-- Name: downgrade_user_tier(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.downgrade_user_tier(p_user_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
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


--
-- Name: FUNCTION downgrade_user_tier(p_user_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.downgrade_user_tier(p_user_id uuid) IS 'Downgrade user to free tier - only callable by service role via webhooks';


--
-- Name: enforce_map_alert_contract(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_map_alert_contract() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
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
  monthly_quota int := 10;
  active_slots int := 7;
  active_count int := 0;
  allow_slot_overflow boolean := false;
begin
  if u_id is null then
    if new.creator_id is null then
      raise exception 'unauthorized';
    end if;
    u_id := new.creator_id;
  end if;

  new.location_geog := st_setsrid(st_makepoint(new.longitude, new.latitude), 4326)::geography;

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
    q.broadcast_month_used := 0;
  end if;

  if tier = 'plus' then
    base_range := 25000;
    base_dur := interval '24 hours';
    monthly_quota := 40;
  elsif tier = 'gold' then
    base_range := 50000;
    base_dur := interval '48 hours';
    monthly_quota := 80;
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
      allow_slot_overflow := true;
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

  select count(*) into active_count
  from public.map_alerts
  where creator_id = owner_id
    and is_active = true
    and (expires_at is null or expires_at > now());

  if active_count >= active_slots and not allow_slot_overflow then
    raise exception 'active_slots_full';
  end if;

  if q.broadcast_month_used < monthly_quota then
    q.broadcast_month_used := q.broadcast_month_used + 1;
  else
    if used_extra then
      null;
    elsif q.extra_broadcast_72h > 0 then
      q.extra_broadcast_72h := q.extra_broadcast_72h - 1;
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
    broadcast_month_used = q.broadcast_month_used,
    extra_broadcast_72h = q.extra_broadcast_72h,
    updated_at = now()
  where user_id = owner_id;

  new.range_km := round((new.range_meters::numeric) / 1000.0, 2);
  new.duration_hours := greatest(1, round(extract(epoch from (new.expires_at - now())) / 3600.0));

  return new;
end;
$$;


--
-- Name: enqueue_map_alert_notification(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enqueue_map_alert_notification() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: ensure_profile_for_auth_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ensure_profile_for_auth_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth'
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


--
-- Name: file_booking_dispute(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.file_booking_dispute(p_booking_id uuid, p_dispute_reason text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
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


--
-- Name: FUNCTION file_booking_dispute(p_booking_id uuid, p_dispute_reason text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.file_booking_dispute(p_booking_id uuid, p_dispute_reason text) IS 'Allows client to file dispute and hold escrow release';


--
-- Name: finalize_identity_submission(text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.finalize_identity_submission(p_doc_type text, p_doc_path text, p_selfie_path text, p_country text, p_legal_name text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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
    verification_status = 'pending'::public.verification_status_enum,
    legal_name = COALESCE(p_legal_name, prof.legal_name)
  WHERE prof.id = v_user;
END;
$$;


--
-- Name: find_nearby_users(double precision, double precision, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.find_nearby_users(alert_lat double precision, alert_lng double precision, radius_meters integer DEFAULT 1000, min_vouch_score integer DEFAULT 5) RETURNS TABLE(id uuid, display_name text, fcm_token text, vouch_score integer, distance_meters double precision)
    LANGUAGE plpgsql SECURITY DEFINER
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


--
-- Name: FUNCTION find_nearby_users(alert_lat double precision, alert_lng double precision, radius_meters integer, min_vouch_score integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.find_nearby_users(alert_lat double precision, alert_lng double precision, radius_meters integer, min_vouch_score integer) IS 'Finds verified users within radius for Mesh-Alert notifications';


--
-- Name: generate_uid(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_uid(len integer) RETURNS text
    LANGUAGE plpgsql
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


--
-- Name: get_friend_pins_nearby(double precision, double precision, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_friend_pins_nearby(p_lat double precision, p_lng double precision, p_radius_m integer DEFAULT 50000) RETURNS TABLE(id uuid, display_name text, avatar_url text, dob date, relationship_status text, owns_pets boolean, pet_species text[], location_name text, last_lat double precision, last_lng double precision, location_pinned_until timestamp with time zone)
    LANGUAGE sql SECURITY DEFINER
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


--
-- Name: get_map_alerts_nearby(double precision, double precision, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_map_alerts_nearby(p_lat double precision, p_lng double precision, p_radius_m integer DEFAULT 50000) RETURNS TABLE(id uuid, latitude double precision, longitude double precision, alert_type text, description text, photo_url text, support_count integer, report_count integer, created_at timestamp with time zone, expires_at timestamp with time zone, range_meters integer, creator_display_name text, creator_avatar_url text)
    LANGUAGE sql SECURITY DEFINER
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


--
-- Name: get_quota_snapshot(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_quota_snapshot() RETURNS TABLE(user_id uuid, tier text, day_start date, week_start date, month_start date, thread_posts_today integer, discovery_views_today integer, media_usage_today integer, stars_used_cycle integer, broadcast_alerts_week integer, broadcast_month_used integer, extra_stars integer, extra_media_10 integer, extra_broadcast_72h integer)
    LANGUAGE sql SECURITY DEFINER
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
    uq.broadcast_month_used,
    uq.extra_stars,
    uq.extra_media_10,
    uq.extra_broadcast_72h
  from public.user_quotas uq
  where uq.user_id = (select o from effective);
$$;


--
-- Name: get_visible_broadcast_alerts(double precision, double precision); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_visible_broadcast_alerts(p_lat double precision, p_lng double precision) RETURNS TABLE(id uuid, latitude double precision, longitude double precision, alert_type text, title text, description text, photo_url text, support_count integer, report_count integer, created_at timestamp with time zone, expires_at timestamp with time zone, duration_hours integer, range_meters integer, range_km numeric, creator_id uuid, thread_id uuid, posted_to_threads boolean, post_on_social boolean, social_post_id text, social_status text, social_url text, media_urls text[], location_street text, location_district text, creator_display_name text, creator_avatar_url text)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: get_visible_map_alerts(double precision, double precision); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_visible_map_alerts(p_lat double precision, p_lng double precision) RETURNS TABLE(id uuid, latitude double precision, longitude double precision, alert_type text, title text, description text, photo_url text, support_count integer, report_count integer, created_at timestamp with time zone, expires_at timestamp with time zone, range_meters integer, creator_id uuid, thread_id uuid, posted_to_threads boolean, social_status text, social_url text, creator_display_name text, creator_avatar_url text)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: handle_identity_review(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_identity_review(target_user_id uuid, action text, notes text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_admin uuid;
  v_is_admin boolean;
  v_upload record;
  v_action text;
  v_decision text;
BEGIN
  v_admin := auth.uid();

  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = v_admin;

  INSERT INTO public.admin_audit_logs (actor_id, action, target_user_id, notes)
  VALUES (v_admin, 'kyc_review_attempt', target_user_id, notes);

  IF v_is_admin IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF action IN ('verify', 'verified') THEN
    v_decision := 'verified';
  ELSIF action IN ('unverify', 'unverified') THEN
    v_decision := 'unverified';
  ELSE
    RAISE EXCEPTION 'Invalid action: %', action;
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

  IF v_decision = 'verified' THEN
    UPDATE public.profiles AS prof
      SET verification_status = 'verified'::public.verification_status_enum,
          verification_comment = NULL
    WHERE prof.id = target_user_id;

    UPDATE public.verification_uploads AS vu
      SET status = 'verified',
          reviewed_by = v_admin,
          reviewed_at = now(),
          rejection_reason = NULL
    WHERE vu.id = v_upload.id;

    INSERT INTO public.identity_verification_cleanup_queue (user_id, object_path, delete_after)
    VALUES (target_user_id, v_upload.document_url, now() + interval '7 days');

    IF v_upload.selfie_url IS NOT NULL THEN
      INSERT INTO public.identity_verification_cleanup_queue (user_id, object_path, delete_after)
      VALUES (target_user_id, v_upload.selfie_url, now() + interval '7 days');
    END IF;

    v_action := 'kyc_verified';
  ELSE
    UPDATE public.profiles AS prof
      SET verification_status = 'unverified'::public.verification_status_enum,
          verification_comment = notes
    WHERE prof.id = target_user_id;

    UPDATE public.verification_uploads AS vu
      SET status = 'unverified',
          reviewed_by = v_admin,
          reviewed_at = now(),
          rejection_reason = notes
    WHERE vu.id = v_upload.id;

    v_action := 'kyc_unverified';
  END IF;

  INSERT INTO public.admin_audit_logs (actor_id, action, target_user_id, notes)
  VALUES (v_admin, v_action, target_user_id, notes);
END;
$$;


--
-- Name: handle_marketplace_payment_success(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_marketplace_payment_success(p_payment_intent_id text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
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


--
-- Name: FUNCTION handle_marketplace_payment_success(p_payment_intent_id text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.handle_marketplace_payment_success(p_payment_intent_id text) IS 'Called by webhook when marketplace payment succeeds';


--
-- Name: handle_new_auth_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_auth_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth'
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


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_display_name text;
  v_legal_name text;
  v_phone text;
  v_social_id text;
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
  if v_phone is null then
    v_phone := '+0000000000';
  end if;

  v_social_id := nullif(btrim(lower(coalesce(new.raw_user_meta_data->>'social_id', ''))), '');
  if v_social_id is null then
    v_social_id := 'u' || substr(replace(new.id::text, '-', ''), 1, 10);
  end if;

  insert into public.profiles (
    id,
    display_name,
    legal_name,
    phone,
    dob,
    social_id,
    verification_status,
    tier,
    effective_tier,
    onboarding_completed
  )
  values (
    new.id,
    v_display_name,
    v_legal_name,
    v_phone,
    (new.raw_user_meta_data->>'dob')::date,
    v_social_id,
    'unverified'::public.verification_status_enum,
    'free'::public.tier_enum,
    'free'::public.tier_enum,
    false
  )
  on conflict (id) do nothing;

  return new;
end;
$$;


--
-- Name: increment_user_credits(uuid, integer, integer, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.increment_user_credits(p_user_id uuid, p_stars integer DEFAULT 0, p_mesh_alerts integer DEFAULT 0, p_media_credits integer DEFAULT 0, p_family_slots integer DEFAULT 0) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
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


--
-- Name: FUNCTION increment_user_credits(p_user_id uuid, p_stars integer, p_mesh_alerts integer, p_media_credits integer, p_family_slots integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.increment_user_credits(p_user_id uuid, p_stars integer, p_mesh_alerts integer, p_media_credits integer, p_family_slots integer) IS 'Safely increment user credits - only callable by service role via webhooks';


--
-- Name: is_social_id_taken(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_social_id_taken(candidate text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: FUNCTION is_social_id_taken(candidate text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.is_social_id_taken(candidate text) IS 'Check if a social_id is already taken by another user (case-insensitive)';


--
-- Name: map_alerts_apply_interaction_counts(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.map_alerts_apply_interaction_counts() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
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


--
-- Name: map_alerts_auto_hide_on_reports(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.map_alerts_auto_hide_on_reports() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
begin
  if new.report_count is not null and new.report_count >= 10 then
    new.is_active := false;
  end if;
  return new;
end;
$$;


--
-- Name: map_alerts_sync_location(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.map_alerts_sync_location() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if new.location is null and new.latitude is not null and new.longitude is not null then
    new.location := st_setsrid(st_makepoint(new.longitude, new.latitude), 4326)::geography;
  end if;
  if new.radius_in_meters is null and new.range_meters is not null then
    new.radius_in_meters := new.range_meters;
  end if;
  if new.message is null and new.description is not null then
    new.message := new.description;
  end if;
  return new;
end $$;


--
-- Name: mark_booking_completed(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_booking_completed(p_booking_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
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


--
-- Name: FUNCTION mark_booking_completed(p_booking_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.mark_booking_completed(p_booking_id uuid) IS 'Marks booking as completed after service end date';


--
-- Name: notify_on_map_alert_insert(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_on_map_alert_insert() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
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


--
-- Name: pii_purge_identity_verification(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pii_purge_identity_verification() RETURNS void
    LANGUAGE plpgsql
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


--
-- Name: prevent_non_admin_verification(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_non_admin_verification() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF NEW.verification_status = 'verified' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true
    ) THEN
      RAISE EXCEPTION 'Only admins can verify users';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: prevent_sensitive_profile_updates(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_sensitive_profile_updates() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  jwt_role text := coalesce(auth.jwt() ->> 'role', 'authenticated');
  app_role text := coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '');
  is_admin boolean := jwt_role in ('admin', 'service_role') or app_role = 'admin';
  allowed_kyc_transition boolean := false;
  admin_verification_transition boolean := false;
begin
  if jwt_role = 'service_role' then
    return new;
  end if;

  allowed_kyc_transition :=
    (old.verification_status is null or old.verification_status = 'unverified'::public.verification_status_enum)
    and (new.verification_status = 'pending'::public.verification_status_enum);

  admin_verification_transition :=
    is_admin
    and new.verification_status is distinct from old.verification_status
    and new.verification_status in (
      'verified'::public.verification_status_enum,
      'unverified'::public.verification_status_enum
    );

  if new.verification_status = 'verified'::public.verification_status_enum and not is_admin then
    raise exception 'forbidden_profile_update';
  end if;

  if (new.legal_name is distinct from old.legal_name) and not allowed_kyc_transition then
    raise exception 'forbidden_profile_update';
  end if;

  if (new.tier is distinct from old.tier)
     or (new.subscription_status is distinct from old.subscription_status)
     or (new.subscription_cycle_anchor_day is distinct from old.subscription_cycle_anchor_day)
     or (new.subscription_current_period_start is distinct from old.subscription_current_period_start)
     or (new.subscription_current_period_end is distinct from old.subscription_current_period_end)
     or ((new.verification_comment is distinct from old.verification_comment) and not admin_verification_transition)
     or (new.family_slots is distinct from old.family_slots)
     or (new.media_credits is distinct from old.media_credits)
     or (new.stars_count is distinct from old.stars_count)
     or (new.mesh_alert_count is distinct from old.mesh_alert_count)
     or ((new.verification_status is distinct from old.verification_status)
         and not allowed_kyc_transition
         and not admin_verification_transition)
  then
    raise exception 'forbidden_profile_update';
  end if;

  return new;
end;
$$;


--
-- Name: process_due_map_alert_notifications(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.process_due_map_alert_notifications(p_limit integer DEFAULT 100) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: process_identity_cleanup(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.process_identity_cleanup() RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT *
    FROM public.identity_verification_cleanup_queue
    WHERE delete_after <= now()
  LOOP
    DELETE FROM storage.objects
    WHERE bucket_id = 'identity_verification'
      AND name = rec.object_path;

    DELETE FROM public.identity_verification_cleanup_queue
    WHERE id = rec.id;
  END LOOP;
END;
$$;


--
-- Name: protect_monetized_fields(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.protect_monetized_fields() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  -- Only allow service_role to modify monetized fields directly
  if coalesce(auth.jwt()->>'role', 'authenticated') != 'service_role' then
    new.tier = old.tier;
    new.subscription_status = old.subscription_status;
    new.stars_count = old.stars_count;
    new.mesh_alert_count = old.mesh_alert_count;
    new.media_credits = old.media_credits;
    new.family_slots = old.family_slots;

    -- Only allow stripe_customer_id to be set once (from NULL)
    if old.stripe_customer_id is not null then
      new.stripe_customer_id = old.stripe_customer_id;
    end if;

    -- Only allow stripe_subscription_id to be set once (from NULL)
    if old.stripe_subscription_id is not null then
      new.stripe_subscription_id = old.stripe_subscription_id;
    end if;
  end if;

  return new;
end;
$$;


--
-- Name: FUNCTION protect_monetized_fields(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.protect_monetized_fields() IS 'Prevents users from tampering with monetized fields via browser console or direct API calls';


--
-- Name: purge_expired_cache(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.purge_expired_cache() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
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


--
-- Name: FUNCTION purge_expired_cache(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.purge_expired_cache() IS 'Maintenance function to remove stale cache entries (90-day TTL).';


--
-- Name: purge_expired_verification_docs(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.purge_expired_verification_docs() RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  DELETE FROM storage.objects
  WHERE bucket_id = 'identity_verification'
  AND name IN (
    SELECT verification_document_url
    FROM public.profiles
    WHERE verification_status IN ('verified', 'unverified')
    AND updated_at < now() - interval '7 days'
  );
END;
$$;


--
-- Name: qms_reset_daily(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.qms_reset_daily() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
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


--
-- Name: qms_reset_monthly(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.qms_reset_monthly() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
begin
  -- Kept for backwards compatibility; monthly rollovers are applied per-user via qms_rollover_all().
  perform 1;
end;
$$;


--
-- Name: qms_reset_weekly(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.qms_reset_weekly() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
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


--
-- Name: qms_rollover_all(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.qms_rollover_all() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
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


--
-- Name: queue_identity_cleanup(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.queue_identity_cleanup() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF (old.verification_status = 'pending'::public.verification_status_enum)
     AND (new.verification_status IN ('verified'::public.verification_status_enum, 'unverified'::public.verification_status_enum))
     AND new.verification_document_url IS NOT NULL
  THEN
    INSERT INTO public.identity_verification_cleanup_queue (user_id, object_path, delete_after)
    VALUES (new.id, new.verification_document_url, now() + interval '7 days');
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: refill_ai_vet_rate_limits(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refill_ai_vet_rate_limits() RETURNS void
    LANGUAGE plpgsql
    AS $$
begin
  update public.ai_vet_rate_limits
  set tokens = 50,
      last_refill = now()
  where now() - last_refill >= interval '24 hours';
end;
$$;


--
-- Name: refresh_subscription_quotas(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refresh_subscription_quotas() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
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


--
-- Name: release_escrow_funds(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.release_escrow_funds() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
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


--
-- Name: FUNCTION release_escrow_funds(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.release_escrow_funds() IS 'Auto-releases escrow funds 48 hours after service completion if no dispute filed';


--
-- Name: set_escrow_release_date(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_escrow_release_date() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.status = 'completed' AND NEW.escrow_release_date IS NULL THEN
    NEW.escrow_release_date = NEW.service_end_date + INTERVAL '48 hours';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: set_profiles_user_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_profiles_user_id() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if new.user_id is null or length(new.user_id) = 0 then
    new.user_id := public.generate_uid(10);
  end if;
  return new;
end;
$$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


--
-- Name: set_user_location(double precision, double precision, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_user_location(p_lat double precision, p_lng double precision, p_pin_hours integer DEFAULT 2, p_retention_hours integer DEFAULT 24) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
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


--
-- Name: social_discovery(uuid, double precision, double precision, integer, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.social_discovery(p_user_id uuid, p_lat double precision, p_lng double precision, p_radius_m integer, p_min_age integer, p_max_age integer) RETURNS TABLE(id uuid, display_name text, avatar_url text, verification_status text, has_car boolean, bio text, last_lat double precision, last_lng double precision, tier text, effective_tier text)
    LANGUAGE sql SECURITY DEFINER
    AS $$
  SELECT
    p.id,
    p.display_name,
    p.avatar_url,
    p.verification_status::text,
    p.has_car,
    p.bio,
    p.last_lat,
    p.last_lng,
    p.tier::text,
    p.effective_tier::text
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
  ORDER BY (p.verification_status = 'verified') DESC, p.created_at DESC
  LIMIT 50;
$$;


--
-- Name: social_discovery(uuid, double precision, double precision, integer, integer, integer, text, text, text[], text, boolean, numeric, numeric, boolean, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.social_discovery(p_user_id uuid, p_lat double precision, p_lng double precision, p_radius_m integer, p_min_age integer, p_max_age integer, p_role text DEFAULT NULL::text, p_gender text DEFAULT NULL::text, p_species text[] DEFAULT NULL::text[], p_pet_size text DEFAULT NULL::text, p_advanced boolean DEFAULT false, p_height_min numeric DEFAULT NULL::numeric, p_height_max numeric DEFAULT NULL::numeric, p_only_waved boolean DEFAULT false, p_recently_active boolean DEFAULT false) RETURNS TABLE(id uuid, display_name text, avatar_url text, verification_status text, has_car boolean, bio text, relationship_status text, dob date, location_name text, occupation text, school text, major text, gender_genre text, orientation text, height numeric, weight numeric, weight_unit text, tier text, effective_tier text, pets jsonb, pet_species text[], pet_size text, social_album text[], show_occupation boolean, show_academic boolean, show_bio boolean, show_relationship_status boolean, show_age boolean, show_gender boolean, show_orientation boolean, show_height boolean, show_weight boolean, social_role text, score numeric)
    LANGUAGE sql SECURITY DEFINER
    AS $$
  WITH viewer_base AS (
    SELECT
      p.id,
      p.relationship_status,
      p.care_circle,
      COALESCE(p.effective_tier::text, p.tier::text, 'free') AS effective_tier,
      p.last_active_at
    FROM public.profiles p
    WHERE p.id = p_user_id
  ),
  flags AS (
    SELECT
      vb.*,
      (vb.effective_tier IN ('plus','gold')) AS adv_allowed,
      (vb.effective_tier = 'gold') AS gold_allowed,
      CASE WHEN vb.effective_tier IN ('plus','gold') THEN 200 ELSE 40 END AS max_rows
    FROM viewer_base vb
  ),
  pet_data AS (
    SELECT
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
      ) AS pets,
      array_remove(array_agg(DISTINCT species), NULL) AS pet_species,
      max(
        CASE
          WHEN weight IS NULL THEN NULL
          WHEN weight_unit = 'lb' THEN weight * 0.453592
          ELSE weight
        END
      ) AS max_weight_kg
    FROM public.pets
    WHERE is_active = true
    GROUP BY owner_id
  ),
  base AS (
    SELECT
      p.*,
      pd.pets,
      pd.pet_species,
      pd.max_weight_kg,
      CASE
        WHEN sp.user_id IS NOT NULL THEN 'nannies'
        WHEN p.owns_pets THEN 'playdates'
        ELSE 'animal-lovers'
      END AS social_role
    FROM public.profiles p
    LEFT JOIN public.sitter_profiles sp ON sp.user_id = p.id
    LEFT JOIN pet_data pd ON pd.owner_id = p.id
    WHERE p.id <> p_user_id
  ),
  filtered AS (
    SELECT
      b.*,
      CASE
        WHEN b.max_weight_kg IS NULL THEN NULL
        WHEN b.max_weight_kg <= 9 THEN 'Small'
        WHEN b.max_weight_kg <= 22 THEN 'Medium'
        ELSE 'Large'
      END AS pet_size
    FROM base b
  ),
  scored AS (
    SELECT
      f.*,
      (
        CASE
          WHEN p_species IS NOT NULL
            AND array_length(p_species, 1) > 0
            AND f.pet_species && p_species THEN 100
          ELSE 0
        END
        + CASE WHEN (p_advanced AND fl.adv_allowed) AND f.verification_status = 'verified' THEN 50 ELSE 0 END
        + CASE WHEN (p_advanced AND fl.adv_allowed) AND fl.relationship_status IS NOT NULL AND f.relationship_status = fl.relationship_status THEN 30 ELSE 0 END
        + CASE WHEN (p_advanced AND fl.adv_allowed) AND (f.has_car OR COALESCE(f.experience_years, 0) > 0 OR array_length(f.pet_experience, 1) > 0) THEN 30 ELSE 0 END
        + CASE WHEN (p_advanced AND fl.adv_allowed) AND (f.social_availability = true OR array_length(f.availability_status, 1) > 0) THEN 20 ELSE 0 END
        + CASE WHEN (p_advanced AND fl.adv_allowed) AND (
            f.id = ANY(fl.care_circle)
            OR EXISTS (
              SELECT 1 FROM public.family_members fm
              WHERE fm.status = 'accepted'
                AND (
                  (fm.inviter_user_id = fl.id AND fm.invitee_user_id = f.id)
                  OR (fm.inviter_user_id = f.id AND fm.invitee_user_id = fl.id)
                )
            )
          ) THEN 20 ELSE 0 END
      ) AS score,
      CASE
        WHEN COALESCE(f.effective_tier::text, f.tier::text, 'free') = 'gold' THEN 3
        WHEN COALESCE(f.effective_tier::text, f.tier::text, 'free') = 'plus' THEN 2
        ELSE 1
      END AS membership_priority
    FROM filtered f
    CROSS JOIN flags fl
    WHERE f.dob IS NOT NULL
      AND (EXTRACT(YEAR FROM age(current_date, f.dob)) BETWEEN p_min_age AND p_max_age)
      AND (p_gender IS NULL OR p_gender = '' OR p_gender = 'Any' OR f.gender_genre = p_gender)
      AND (p_role IS NULL OR p_role = '' OR f.social_role = p_role)
      AND (p_species IS NULL OR array_length(p_species, 1) = 0 OR f.pet_species && p_species)
      AND (p_pet_size IS NULL OR p_pet_size = '' OR p_pet_size = 'Any' OR f.pet_size = p_pet_size)
      AND (p_height_min IS NULL OR f.height >= p_height_min)
      AND (p_height_max IS NULL OR f.height <= p_height_max)
      AND (COALESCE(f.location, f.location_geog) IS NOT NULL)
      AND ST_DWithin(
        COALESCE(f.location, f.location_geog),
        ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
        p_radius_m
      )
      AND (f.location_retention_until IS NULL OR f.location_retention_until > now())
      AND (
        -- Gold-only filters
        fl.gold_allowed IS FALSE
        OR p_only_waved IS FALSE
        OR EXISTS (
          SELECT 1 FROM public.waves w
          WHERE w.to_user_id = fl.id
            AND w.from_user_id = f.id
        )
      )
      AND (
        fl.gold_allowed IS FALSE
        OR p_recently_active IS FALSE
        OR (f.last_active_at IS NOT NULL AND f.last_active_at >= (now() - interval '7 days'))
      )
  )
  SELECT
    id,
    display_name,
    avatar_url,
    verification_status::text,
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
    tier::text,
    effective_tier::text,
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
  FROM scored
  ORDER BY membership_priority DESC, score DESC NULLS LAST, created_at DESC
  LIMIT (SELECT max_rows FROM flags);
$$;


--
-- Name: sync_thread_comment_content(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_thread_comment_content() RETURNS trigger
    LANGUAGE plpgsql
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


--
-- Name: touch_last_active_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.touch_last_active_at() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE public.profiles
  SET last_active_at = now()
  WHERE id = auth.uid();
END;
$$;


--
-- Name: update_chat_last_message(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_chat_last_message() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  UPDATE public.chats
  SET last_message_at = NEW.created_at
  WHERE id = NEW.chat_id;
  RETURN NEW;
END;
$$;


--
-- Name: update_threads_scores(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_threads_scores() RETURNS void
    LANGUAGE plpgsql
    AS $$
begin
  update public.threads t
  set score = (
    (extract(epoch from (now() - t.created_at)) / 86400.0) * 10
    +
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
    case when p.verification_status = 'verified'::public.verification_status_enum then 50 else 0 end
    +
    case when p.tier = 'gold'::public.tier_enum then 30 else 0 end
    +
    ((select count(*) from public.thread_comments c where c.thread_id = t.id) * 5)
    + (coalesce(t.likes, 0) * 3)
    + (coalesce(t.clicks, 0) * 1)
    -
    (ln(extract(day from (now() - t.created_at)) + 1) * 5)
  )
  from public.profiles p
  where p.id = t.user_id;
end;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: upgrade_user_tier(uuid, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.upgrade_user_tier(p_user_id uuid, p_tier text, p_subscription_status text, p_stripe_subscription_id text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
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


--
-- Name: FUNCTION upgrade_user_tier(p_user_id uuid, p_tier text, p_subscription_status text, p_stripe_subscription_id text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.upgrade_user_tier(p_user_id uuid, p_tier text, p_subscription_status text, p_stripe_subscription_id text) IS 'Upgrade user subscription tier - only callable by service role via webhooks';


--
-- Name: validate_vaccination_dates(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_vaccination_dates() RETURNS trigger
    LANGUAGE plpgsql
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


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: admin_audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    actor_id uuid NOT NULL,
    action text NOT NULL,
    target_user_id uuid,
    notes text,
    details jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    actor_social_id text,
    target_social_id text
);


--
-- Name: ai_vet_conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_vet_conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    pet_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    title text
);


--
-- Name: ai_vet_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_vet_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    role text NOT NULL,
    content text NOT NULL,
    media_url text,
    media_analysis jsonb,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT ai_vet_messages_role_check CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text])))
);


--
-- Name: ai_vet_rate_limits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_vet_rate_limits (
    user_id uuid NOT NULL,
    tokens integer DEFAULT 50 NOT NULL,
    last_refill timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ai_vet_usage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_vet_usage (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    month text NOT NULL,
    conversation_count integer DEFAULT 0,
    message_count integer DEFAULT 0,
    image_analysis_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: alert_interactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alert_interactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    alert_id uuid NOT NULL,
    user_id uuid NOT NULL,
    interaction_type text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT alert_interactions_interaction_type_check CHECK ((interaction_type = ANY (ARRAY['support'::text, 'report'::text, 'hide'::text, 'block_user'::text])))
);


--
-- Name: marketplace_bookings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketplace_bookings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    sitter_id uuid NOT NULL,
    stripe_payment_intent_id text NOT NULL,
    stripe_transfer_id text,
    amount integer NOT NULL,
    platform_fee integer NOT NULL,
    sitter_payout integer NOT NULL,
    service_start_date timestamp with time zone NOT NULL,
    service_end_date timestamp with time zone NOT NULL,
    status text DEFAULT 'pending'::text,
    escrow_release_date timestamp with time zone,
    dispute_reason text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    escrow_status text DEFAULT 'pending'::text,
    paid_at timestamp with time zone,
    dispute_flag boolean DEFAULT false,
    stripe_charge_id text,
    location_name text,
    CONSTRAINT marketplace_bookings_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'completed'::text, 'disputed'::text, 'cancelled'::text])))
);


--
-- Name: TABLE marketplace_bookings; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.marketplace_bookings IS 'Pet sitter marketplace bookings with escrow management';


--
-- Name: COLUMN marketplace_bookings.escrow_release_date; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.marketplace_bookings.escrow_release_date IS 'Auto-release funds 48 hours after service_end_date if no dispute';


--
-- Name: bookings; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.bookings AS
 SELECT id,
    client_id,
    sitter_id,
    stripe_payment_intent_id,
    stripe_transfer_id,
    amount,
    platform_fee,
    sitter_payout,
    service_start_date,
    service_end_date,
    status,
    escrow_release_date,
    dispute_reason,
    created_at,
    updated_at,
    escrow_status,
    paid_at,
    dispute_flag,
    stripe_charge_id,
    location_name
   FROM public.marketplace_bookings;


--
-- Name: broadcast_alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.broadcast_alerts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    creator_id uuid NOT NULL,
    type text NOT NULL,
    title text,
    description text,
    address text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    duration_hours integer NOT NULL,
    range_km numeric(6,2) NOT NULL,
    latitude double precision NOT NULL,
    longitude double precision NOT NULL,
    geog public.geography(Point,4326),
    photo_url text,
    post_on_threads boolean DEFAULT false NOT NULL,
    thread_id uuid,
    CONSTRAINT broadcast_alerts_duration_hours_check CHECK (((duration_hours > 0) AND (duration_hours <= 72))),
    CONSTRAINT broadcast_alerts_latitude_check CHECK (((latitude >= ('-90'::integer)::double precision) AND (latitude <= (90)::double precision))),
    CONSTRAINT broadcast_alerts_longitude_check CHECK (((longitude >= ('-180'::integer)::double precision) AND (longitude <= (180)::double precision))),
    CONSTRAINT broadcast_alerts_range_km_check CHECK (((range_km > (0)::numeric) AND (range_km <= (100)::numeric))),
    CONSTRAINT broadcast_alerts_type_check CHECK ((type = ANY (ARRAY['Stray'::text, 'Lost'::text, 'Others'::text])))
);


--
-- Name: chat_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    room_id text NOT NULL,
    sender_id uuid NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: chat_participants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_participants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    chat_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text DEFAULT 'member'::text,
    joined_at timestamp with time zone DEFAULT now(),
    last_read_at timestamp with time zone DEFAULT now(),
    is_muted boolean DEFAULT false,
    CONSTRAINT chat_participants_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'member'::text])))
);


--
-- Name: chat_room_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_room_members (
    room_id text NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: chats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chats (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    type text NOT NULL,
    name text,
    avatar_url text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    last_message_at timestamp with time zone DEFAULT now(),
    CONSTRAINT chats_type_check CHECK ((type = ANY (ARRAY['direct'::text, 'group'::text])))
);


--
-- Name: consent_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.consent_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    consent_type text NOT NULL,
    consent_version text DEFAULT 'v2.0'::text NOT NULL,
    accepted_at timestamp with time zone DEFAULT now() NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT consent_logs_consent_type_check CHECK ((consent_type = 'terms_privacy'::text))
);


--
-- Name: emergency_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.emergency_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    alert_id uuid,
    event_type text NOT NULL,
    status text NOT NULL,
    recipients_count integer DEFAULT 0,
    success_count integer DEFAULT 0,
    failure_count integer DEFAULT 0,
    error_message text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT emergency_logs_event_type_check CHECK ((event_type = ANY (ARRAY['ALERT_CREATED'::text, 'FCM_SENT'::text, 'MOCK_SENT'::text, 'ALERT_RESOLVED'::text]))),
    CONSTRAINT emergency_logs_status_check CHECK ((status = ANY (ARRAY['SUCCESS'::text, 'FAILURE'::text, 'PENDING'::text])))
);


--
-- Name: TABLE emergency_logs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.emergency_logs IS 'Emergency event logs for mesh-alert system. Includes MOCK_SENT entries for testing when FCM keys are not configured.';


--
-- Name: family_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.family_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    inviter_user_id uuid NOT NULL,
    invitee_user_id uuid NOT NULL,
    status text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT family_members_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'declined'::text])))
);


--
-- Name: hazard_identifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hazard_identifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    pet_id uuid,
    image_url text NOT NULL,
    object_identified text,
    is_hazard boolean,
    hazard_type text,
    toxicity_level text,
    ingested boolean DEFAULT false,
    immediate_action text,
    ai_response jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT hazard_identifications_hazard_type_check CHECK ((hazard_type = ANY (ARRAY['TOXIC_PLANT'::text, 'TOXIC_FOOD'::text, 'CHEMICAL'::text, 'INERT'::text]))),
    CONSTRAINT hazard_identifications_toxicity_level_check CHECK ((toxicity_level = ANY (ARRAY['LOW'::text, 'MODERATE'::text, 'HIGH'::text, 'SEVERE'::text])))
);


--
-- Name: TABLE hazard_identifications; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.hazard_identifications IS 'AI-powered hazard identification records';


--
-- Name: identity_verification_cleanup_queue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.identity_verification_cleanup_queue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    object_path text NOT NULL,
    delete_after timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: location_reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.location_reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    location_name text NOT NULL,
    location_type text,
    location public.geography(Point,4326),
    reviewer_id uuid NOT NULL,
    rating integer,
    pet_friendly_score integer,
    safety_score integer,
    review text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT location_reviews_pet_friendly_score_check CHECK (((pet_friendly_score >= 1) AND (pet_friendly_score <= 5))),
    CONSTRAINT location_reviews_rating_check CHECK (((rating >= 1) AND (rating <= 5))),
    CONSTRAINT location_reviews_safety_score_check CHECK (((safety_score >= 1) AND (safety_score <= 5)))
);


--
-- Name: lost_pet_alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lost_pet_alerts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_id uuid NOT NULL,
    pet_id uuid,
    latitude double precision NOT NULL,
    longitude double precision NOT NULL,
    description text,
    photo_url text,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT lost_pet_alerts_status_check CHECK ((status = ANY (ARRAY['active'::text, 'found'::text, 'cancelled'::text])))
);


--
-- Name: TABLE lost_pet_alerts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.lost_pet_alerts IS 'Lost pet alerts for Mesh-Alert system';


--
-- Name: map_alert_notification_queue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.map_alert_notification_queue (
    alert_id uuid NOT NULL,
    run_at timestamp with time zone NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    processed_at timestamp with time zone,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: map_alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.map_alerts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    creator_id uuid NOT NULL,
    latitude double precision NOT NULL,
    longitude double precision NOT NULL,
    alert_type text NOT NULL,
    description text,
    photo_url text,
    is_active boolean DEFAULT true,
    support_count integer DEFAULT 0,
    report_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    location_geog public.geography(Point,4326),
    range_meters integer,
    expires_at timestamp with time zone,
    address text,
    title text,
    thread_id uuid,
    posted_to_threads boolean DEFAULT false NOT NULL,
    social_status text,
    social_url text,
    media_urls text[],
    location_street text,
    location_district text,
    duration_hours integer,
    range_km numeric(6,2),
    post_on_social boolean DEFAULT false NOT NULL,
    social_post_id text,
    location public.geography(Point,4326),
    radius_in_meters integer,
    message text,
    pet_id uuid,
    CONSTRAINT map_alerts_alert_type_check CHECK ((alert_type = ANY (ARRAY['Stray'::text, 'Lost'::text, 'Found'::text, 'Others'::text])))
);


--
-- Name: map_checkins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.map_checkins (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    location public.geography(Point,4326) NOT NULL,
    location_name text,
    location_type text,
    pet_ids uuid[] DEFAULT '{}'::uuid[],
    is_public boolean DEFAULT true,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    expires_at timestamp with time zone DEFAULT (now() + '24:00:00'::interval)
);


--
-- Name: match_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.match_preferences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    looking_for text[] DEFAULT '{}'::text[],
    species_preference text[] DEFAULT '{}'::text[],
    distance_km integer DEFAULT 5,
    age_min integer,
    age_max integer,
    requires_car boolean DEFAULT false,
    requires_verification boolean DEFAULT false,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: matches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.matches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user1_id uuid NOT NULL,
    user2_id uuid NOT NULL,
    chat_id uuid,
    matched_at timestamp with time zone DEFAULT now(),
    last_interaction_at timestamp with time zone DEFAULT now(),
    is_active boolean DEFAULT true,
    CONSTRAINT unique_match CHECK ((user1_id < user2_id))
);


--
-- Name: message_reads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.message_reads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    message_id uuid NOT NULL,
    user_id uuid NOT NULL,
    read_at timestamp with time zone DEFAULT now()
);


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    chat_id uuid NOT NULL,
    sender_id uuid,
    content text,
    message_type text DEFAULT 'text'::text,
    media_url text,
    metadata jsonb DEFAULT '{}'::jsonb,
    is_deleted boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT messages_message_type_check CHECK ((message_type = ANY (ARRAY['text'::text, 'image'::text, 'voice'::text, 'location'::text, 'system'::text])))
);


--
-- Name: notice_board; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notice_board (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    author_id uuid NOT NULL,
    content text NOT NULL,
    category text NOT NULL,
    image_url text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT notice_board_category_check CHECK ((category = ANY (ARRAY['Social'::text, 'Charity'::text, 'Help'::text, 'Donations'::text, 'Neighborhood News'::text])))
);


--
-- Name: notification_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    alert_id uuid,
    notification_type text NOT NULL,
    recipients_count integer DEFAULT 0 NOT NULL,
    success_count integer DEFAULT 0 NOT NULL,
    failure_count integer DEFAULT 0 NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notification_logs_notification_type_check CHECK ((notification_type = ANY (ARRAY['mesh_alert'::text, 'emergency'::text, 'system'::text])))
);


--
-- Name: TABLE notification_logs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.notification_logs IS 'Tracks mesh-alert and emergency notification delivery for analytics and debugging';


--
-- Name: notification_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_preferences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    push_enabled boolean DEFAULT true,
    email_enabled boolean DEFAULT true,
    new_matches boolean DEFAULT true,
    new_messages boolean DEFAULT true,
    ai_vet_responses boolean DEFAULT true,
    map_alerts boolean DEFAULT true,
    notice_board boolean DEFAULT true,
    marketing boolean DEFAULT false,
    quiet_hours_start time without time zone,
    quiet_hours_end time without time zone,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    message text NOT NULL,
    type text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    read boolean DEFAULT false NOT NULL,
    title text DEFAULT 'Alert'::text NOT NULL,
    body text NOT NULL,
    data jsonb DEFAULT '{}'::jsonb,
    is_read boolean DEFAULT false,
    sent_at timestamp with time zone,
    CONSTRAINT notifications_type_check CHECK ((type = ANY (ARRAY['alert'::text, 'admin'::text])))
);


--
-- Name: payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    subscription_id uuid,
    amount numeric(10,2) NOT NULL,
    currency text DEFAULT 'HKD'::text,
    status text NOT NULL,
    payment_method text,
    provider_payment_id text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT payments_status_check CHECK ((status = ANY (ARRAY['succeeded'::text, 'pending'::text, 'failed'::text, 'refunded'::text])))
);


--
-- Name: pets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_id uuid NOT NULL,
    photo_url text,
    name text NOT NULL,
    species text NOT NULL,
    breed text,
    gender text,
    weight integer,
    weight_unit text DEFAULT 'kg'::text,
    dob date,
    vaccinations jsonb DEFAULT '[]'::jsonb,
    medications jsonb DEFAULT '[]'::jsonb,
    routine text,
    temperament text[] DEFAULT '{}'::text[],
    vet_contact text,
    microchip_id text,
    bio text,
    is_public boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    is_active boolean DEFAULT true,
    neutered_spayed boolean DEFAULT false,
    vaccination_dates text[] DEFAULT ARRAY[]::text[],
    next_vaccination_reminder date,
    clinic_name text,
    preferred_vet text,
    phone_no text,
    CONSTRAINT pets_next_vaccination_future CHECK (((next_vaccination_reminder IS NULL) OR (next_vaccination_reminder > CURRENT_DATE))),
    CONSTRAINT pets_next_vaccination_future_chk CHECK (((next_vaccination_reminder IS NULL) OR (next_vaccination_reminder > CURRENT_DATE))),
    CONSTRAINT pets_weight_lt_100 CHECK (((weight IS NULL) OR (weight < 100)))
);


--
-- Name: COLUMN pets.neutered_spayed; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pets.neutered_spayed IS 'Whether pet has been neutered or spayed';


--
-- Name: COLUMN pets.vaccination_dates; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pets.vaccination_dates IS 'Vaccination dates stored as MM-YYYY format strings';


--
-- Name: COLUMN pets.next_vaccination_reminder; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pets.next_vaccination_reminder IS 'Next scheduled vaccination reminder date';


--
-- Name: pins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pins (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid,
    lat double precision,
    lng double precision,
    address text,
    is_invisible boolean DEFAULT false,
    thread_id uuid,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: poi_locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.poi_locations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    osm_id text NOT NULL,
    poi_type text NOT NULL,
    name text NOT NULL,
    latitude double precision NOT NULL,
    longitude double precision NOT NULL,
    address text,
    phone text,
    opening_hours text,
    is_active boolean DEFAULT true NOT NULL,
    last_harvested_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT poi_locations_poi_type_check CHECK ((poi_type = ANY (ARRAY['veterinary'::text, 'pet_shop'::text, 'pet_grooming'::text])))
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    display_name text,
    legal_name text,
    phone text,
    gender_genre text,
    dob date,
    height integer,
    weight integer,
    weight_unit text DEFAULT 'kg'::text,
    degree text,
    school text,
    affiliation text,
    pet_experience text[] DEFAULT '{}'::text[],
    experience_years integer DEFAULT 0,
    relationship_status text,
    has_car boolean DEFAULT false,
    languages text[] DEFAULT '{}'::text[],
    location_name text,
    user_role text DEFAULT 'free'::text,
    bio text,
    avatar_url text,
    onboarding_completed boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    major text,
    owns_pets boolean DEFAULT false,
    social_availability boolean DEFAULT false,
    availability_status text[] DEFAULT '{}'::text[],
    show_gender boolean DEFAULT true,
    show_age boolean DEFAULT true,
    show_height boolean DEFAULT true,
    show_weight boolean DEFAULT true,
    show_academic boolean DEFAULT true,
    show_affiliation boolean DEFAULT true,
    show_bio boolean DEFAULT true,
    vouch_score integer DEFAULT 0,
    fcm_token text,
    emergency_mode boolean DEFAULT false,
    care_circle uuid[] DEFAULT '{}'::uuid[],
    latitude double precision,
    longitude double precision,
    location public.geography(Point,4326),
    verification_document_url text,
    subscription_status text DEFAULT 'free'::text,
    payment_method text,
    last_payment_date timestamp with time zone,
    orientation text,
    occupation text,
    show_orientation boolean DEFAULT true,
    show_occupation boolean DEFAULT true,
    tier public.tier_enum DEFAULT 'free'::public.tier_enum,
    stripe_customer_id text,
    stripe_subscription_id text,
    stars_count integer DEFAULT 0,
    mesh_alert_count integer DEFAULT 0,
    media_credits integer DEFAULT 0,
    family_slots integer DEFAULT 0,
    last_lat double precision,
    last_lng double precision,
    verification_comment text,
    verification_status public.verification_status_enum DEFAULT 'unverified'::public.verification_status_enum NOT NULL,
    location_country text,
    location_district text,
    user_id text,
    social_album text[] DEFAULT '{}'::text[],
    location_geog public.geography(Point,4326),
    role text DEFAULT 'user'::text,
    show_relationship_status boolean DEFAULT true,
    location_pinned_until timestamp with time zone,
    location_retention_until timestamp with time zone,
    subscription_cycle_anchor_day integer,
    subscription_current_period_start timestamp with time zone,
    subscription_current_period_end timestamp with time zone,
    last_login timestamp with time zone DEFAULT now(),
    map_visible boolean DEFAULT false NOT NULL,
    subscription_start timestamp with time zone,
    prefs jsonb DEFAULT '{}'::jsonb NOT NULL,
    email text,
    full_name text,
    posted_to_threads boolean DEFAULT false NOT NULL,
    is_admin boolean DEFAULT false,
    social_id text NOT NULL,
    last_active_at timestamp with time zone,
    effective_tier public.tier_enum DEFAULT 'free'::public.tier_enum,
    CONSTRAINT profiles_family_slots_check CHECK ((family_slots >= 0)),
    CONSTRAINT profiles_media_credits_check CHECK ((media_credits >= 0)),
    CONSTRAINT profiles_mesh_alert_count_check CHECK ((mesh_alert_count >= 0)),
    CONSTRAINT profiles_min_age CHECK ((dob < (CURRENT_DATE - '16 years'::interval))),
    CONSTRAINT profiles_stars_count_check CHECK ((stars_count >= 0)),
    CONSTRAINT profiles_subscription_status_check CHECK ((subscription_status = ANY (ARRAY['free'::text, 'premium_pending'::text, 'premium_active'::text, 'premium_cancelled'::text]))),
    CONSTRAINT social_id_format CHECK ((social_id ~ '^[a-z0-9._]+$'::text)),
    CONSTRAINT social_id_length CHECK (((length(social_id) >= 6) AND (length(social_id) <= 20)))
);


--
-- Name: TABLE profiles; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.profiles IS 'Truncated for Sprint 1 - Fresh testing slate';


--
-- Name: COLUMN profiles.has_car; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.has_car IS 'Pet driver capability - can transport pets';


--
-- Name: COLUMN profiles.languages; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.languages IS 'Languages spoken by user for social matching';


--
-- Name: COLUMN profiles.vouch_score; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.vouch_score IS 'Community trust score (0-100)';


--
-- Name: COLUMN profiles.emergency_mode; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.emergency_mode IS 'Break-Glass Privacy emergency mode toggle';


--
-- Name: COLUMN profiles.care_circle; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.care_circle IS 'Trusted user IDs for emergency location sharing';


--
-- Name: COLUMN profiles.location; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.location IS 'User location as geography(POINT, 4326) for efficient spatial queries. Protected by Break-Glass Privacy RLS.';


--
-- Name: COLUMN profiles.subscription_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.subscription_status IS 'Stripe subscription status';


--
-- Name: COLUMN profiles.orientation; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.orientation IS 'Sexual orientation separate from gender identity';


--
-- Name: COLUMN profiles.occupation; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.occupation IS 'Current job title or occupation';


--
-- Name: COLUMN profiles.show_orientation; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.show_orientation IS 'Privacy toggle for sexual orientation';


--
-- Name: COLUMN profiles.show_occupation; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.show_occupation IS 'Privacy toggle for occupation';


--
-- Name: COLUMN profiles.tier; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.tier IS 'User subscription tier: free, plus, gold';


--
-- Name: COLUMN profiles.stripe_customer_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.stripe_customer_id IS 'Stripe Customer ID (unique)';


--
-- Name: COLUMN profiles.stripe_subscription_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.stripe_subscription_id IS 'Active Stripe Subscription ID';


--
-- Name: COLUMN profiles.stars_count; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.stars_count IS 'Boost/Star credits for social features';


--
-- Name: COLUMN profiles.mesh_alert_count; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.mesh_alert_count IS 'Emergency mesh alert credits';


--
-- Name: COLUMN profiles.media_credits; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.media_credits IS 'AI Vet media upload credits';


--
-- Name: COLUMN profiles.family_slots; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.family_slots IS 'Additional family member slots';


--
-- Name: COLUMN profiles.verification_comment; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.verification_comment IS 'Admin review comment for verification (pending/verified/unverified).';


--
-- Name: COLUMN profiles.verification_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.verification_status IS 'Status of identity verification: unverified, pending, verified.';


--
-- Name: COLUMN profiles.subscription_cycle_anchor_day; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.subscription_cycle_anchor_day IS 'Day-of-month (1-31) used as billing cycle anchor for monthly quota resets (Stripe billing_cycle_anchor-derived).';


--
-- Name: COLUMN profiles.subscription_current_period_start; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.subscription_current_period_start IS 'Stripe subscription current_period_start (UTC) for auditing and support.';


--
-- Name: COLUMN profiles.subscription_current_period_end; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.subscription_current_period_end IS 'Stripe subscription current_period_end (UTC) for auditing and support.';


--
-- Name: COLUMN profiles.map_visible; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.map_visible IS 'Contract v2.0 Map: when true, user allows their pinned location to be visible to others while location_pinned_until > now().';


--
-- Name: COLUMN profiles.subscription_start; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.subscription_start IS 'Subscription start timestamp used to anchor monthly quota cycle resets (anniversary-based).';


--
-- Name: COLUMN profiles.prefs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.prefs IS 'User preferences JSON. Keys include push_notifications_enabled and email_notifications_enabled.';


--
-- Name: COLUMN profiles.effective_tier; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.effective_tier IS 'Effective tier after family/entitlements: free, plus, gold';


--
-- Name: profiles_public; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.profiles_public AS
 SELECT id,
    display_name,
    avatar_url,
        CASE
            WHEN show_bio THEN bio
            ELSE NULL::text
        END AS bio,
        CASE
            WHEN show_gender THEN gender_genre
            ELSE NULL::text
        END AS gender_genre,
        CASE
            WHEN show_age THEN dob
            ELSE NULL::date
        END AS dob,
        CASE
            WHEN show_height THEN height
            ELSE NULL::integer
        END AS height,
        CASE
            WHEN show_weight THEN weight
            ELSE NULL::integer
        END AS weight,
    weight_unit,
        CASE
            WHEN show_academic THEN degree
            ELSE NULL::text
        END AS degree,
        CASE
            WHEN show_academic THEN school
            ELSE NULL::text
        END AS school,
        CASE
            WHEN show_academic THEN major
            ELSE NULL::text
        END AS major,
        CASE
            WHEN show_affiliation THEN affiliation
            ELSE NULL::text
        END AS affiliation,
    location_name,
    verification_status,
    has_car,
    user_role,
    pet_experience,
    experience_years,
    languages,
    relationship_status,
    owns_pets,
    social_availability,
    availability_status,
    created_at
   FROM public.profiles;


--
-- Name: push_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.push_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token text NOT NULL,
    platform text NOT NULL,
    device_id text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    last_used_at timestamp with time zone DEFAULT now(),
    CONSTRAINT push_tokens_platform_check CHECK ((platform = ANY (ARRAY['ios'::text, 'android'::text, 'web'::text])))
);


--
-- Name: reminders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reminders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_id uuid NOT NULL,
    pet_id uuid NOT NULL,
    kind text,
    reason text,
    due_date date NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: scan_rate_limits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scan_rate_limits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    scan_timestamp timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE scan_rate_limits; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.scan_rate_limits IS 'Rate limiting for free-tier users (3 scans/hour). Premium users bypass this table.';


--
-- Name: sitter_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sitter_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    stripe_connect_account_id text NOT NULL,
    onboarding_complete boolean DEFAULT false,
    payouts_enabled boolean DEFAULT false,
    charges_enabled boolean DEFAULT false,
    hourly_rate integer,
    bio text,
    services jsonb DEFAULT '[]'::jsonb,
    availability jsonb DEFAULT '{}'::jsonb,
    rating numeric(3,2) DEFAULT 0.00,
    total_bookings integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE sitter_profiles; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.sitter_profiles IS 'Pet sitter marketplace profiles with Stripe Connect integration';


--
-- Name: social_interactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.social_interactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    target_id uuid NOT NULL,
    interaction_type text NOT NULL,
    reason text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT social_interactions_interaction_type_check CHECK ((interaction_type = ANY (ARRAY['pass'::text, 'hide'::text, 'block'::text, 'report'::text])))
);


--
-- Name: subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    plan_type text NOT NULL,
    status text DEFAULT 'active'::text,
    payment_provider text,
    provider_subscription_id text,
    current_period_start timestamp with time zone NOT NULL,
    current_period_end timestamp with time zone NOT NULL,
    cancel_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT subscriptions_plan_type_check CHECK ((plan_type = ANY (ARRAY['monthly'::text, 'yearly'::text]))),
    CONSTRAINT subscriptions_status_check CHECK ((status = ANY (ARRAY['active'::text, 'cancelled'::text, 'expired'::text, 'past_due'::text])))
);


--
-- Name: support_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    subject text,
    message text NOT NULL,
    email text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: thread_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.thread_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    thread_id uuid NOT NULL,
    user_id uuid NOT NULL,
    text text NOT NULL,
    images text[] DEFAULT '{}'::text[],
    created_at timestamp with time zone DEFAULT now(),
    content text DEFAULT ''::text NOT NULL
);


--
-- Name: threads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.threads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    tags text[] DEFAULT '{}'::text[],
    hashtags text[] DEFAULT '{}'::text[],
    content text NOT NULL,
    images text[] DEFAULT '{}'::text[],
    created_at timestamp with time zone DEFAULT now(),
    likes integer DEFAULT 0,
    clicks integer DEFAULT 0,
    score double precision DEFAULT 0,
    is_map_alert boolean DEFAULT false NOT NULL,
    map_id uuid,
    is_public boolean DEFAULT true NOT NULL
);


--
-- Name: transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    stripe_event_id text NOT NULL,
    stripe_session_id text,
    type text NOT NULL,
    amount integer,
    currency text DEFAULT 'usd'::text,
    status text DEFAULT 'pending'::text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    escrow_status text,
    idempotency_key text,
    CONSTRAINT transactions_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'completed'::text, 'failed'::text, 'refunded'::text]))),
    CONSTRAINT transactions_type_check CHECK ((type = ANY (ARRAY['subscription'::text, 'star_pack'::text, 'emergency_alert'::text, 'vet_media'::text, 'family_slot'::text, '5_media_pack'::text, '7_day_extension'::text, 'verified_badge'::text, 'marketplace_booking'::text])))
);


--
-- Name: TABLE transactions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.transactions IS 'Full audit trail of all payment events from Stripe webhooks';


--
-- Name: COLUMN transactions.stripe_event_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transactions.stripe_event_id IS 'Stripe Event ID - ensures idempotency (unique constraint prevents double-processing)';


--
-- Name: triage_cache; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.triage_cache (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    image_hash text NOT NULL,
    object_identified text NOT NULL,
    is_hazard boolean NOT NULL,
    hazard_type text,
    toxicity_level text,
    immediate_action text,
    ai_response jsonb,
    hit_count integer DEFAULT 1,
    first_cached_at timestamp with time zone DEFAULT now() NOT NULL,
    last_accessed_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '90 days'::interval),
    CONSTRAINT triage_cache_hazard_type_check CHECK ((hazard_type = ANY (ARRAY['TOXIC_PLANT'::text, 'TOXIC_FOOD'::text, 'CHEMICAL'::text, 'INERT'::text]))),
    CONSTRAINT triage_cache_toxicity_level_check CHECK ((toxicity_level = ANY (ARRAY['LOW'::text, 'MODERATE'::text, 'HIGH'::text, 'SEVERE'::text])))
);


--
-- Name: TABLE triage_cache; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.triage_cache IS 'AI classification cache to reduce GPT-4o-mini API costs. Shared across users for common items (chocolate, grapes, etc).';


--
-- Name: typing_indicators; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.typing_indicators (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    chat_id uuid NOT NULL,
    user_id uuid NOT NULL,
    started_at timestamp with time zone DEFAULT now()
);


--
-- Name: user_locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_locations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    location public.geography(Point,4326) NOT NULL,
    location_name text,
    accuracy_meters double precision,
    is_public boolean DEFAULT false,
    updated_at timestamp with time zone DEFAULT now(),
    expires_at timestamp with time zone
);


--
-- Name: user_quotas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_quotas (
    user_id uuid NOT NULL,
    day_start date DEFAULT CURRENT_DATE NOT NULL,
    week_start date DEFAULT (date_trunc('week'::text, now()))::date NOT NULL,
    month_start date DEFAULT (date_trunc('month'::text, now()))::date NOT NULL,
    thread_posts_today integer DEFAULT 0 NOT NULL,
    discovery_profiles_today integer DEFAULT 0 NOT NULL,
    ai_vet_uploads_today integer DEFAULT 0 NOT NULL,
    stars_month_used integer DEFAULT 0 NOT NULL,
    broadcast_week_used integer DEFAULT 0 NOT NULL,
    broadcast_month_used integer DEFAULT 0 NOT NULL,
    priority_analyses_month_used integer DEFAULT 0 NOT NULL,
    extras_stars integer DEFAULT 0 NOT NULL,
    extras_ai_vet_uploads integer DEFAULT 0 NOT NULL,
    extras_broadcasts integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    discovery_views_today integer DEFAULT 0 NOT NULL,
    media_usage_today integer DEFAULT 0 NOT NULL,
    stars_used_cycle integer DEFAULT 0 NOT NULL,
    broadcast_alerts_week integer DEFAULT 0 NOT NULL,
    extra_stars integer DEFAULT 0 NOT NULL,
    extra_media_10 integer DEFAULT 0 NOT NULL,
    extra_broadcast_72h integer DEFAULT 0 NOT NULL
);


--
-- Name: user_quotas_legacy_20260208; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_quotas_legacy_20260208 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    day date DEFAULT CURRENT_DATE NOT NULL,
    ai_images integer DEFAULT 0 NOT NULL,
    chat_images integer DEFAULT 0 NOT NULL,
    thread_posts integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: verification_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.verification_audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    verification_id uuid NOT NULL,
    action text NOT NULL,
    performed_by uuid,
    details jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: verification_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.verification_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    request_type text NOT NULL,
    status text DEFAULT 'pending'::text,
    provider text,
    provider_request_id text,
    document_type text,
    document_number_hash text,
    submitted_data jsonb,
    verification_result jsonb,
    reviewed_by uuid,
    rejection_reason text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    expires_at timestamp with time zone,
    CONSTRAINT verification_requests_request_type_check CHECK ((request_type = ANY (ARRAY['id'::text, 'biometric'::text, 'phone'::text]))),
    CONSTRAINT verification_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'approved'::text, 'rejected'::text, 'expired'::text])))
);


--
-- Name: verification_uploads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.verification_uploads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    document_type text NOT NULL,
    document_url text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    rejection_reason text,
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL,
    reviewed_at timestamp with time zone,
    reviewed_by uuid,
    selfie_url text,
    country text,
    legal_name text,
    archived_at timestamp with time zone,
    archived_by uuid,
    CONSTRAINT verification_uploads_document_type_check CHECK ((document_type = ANY (ARRAY['passport'::text, 'id_card'::text, 'drivers_license'::text]))),
    CONSTRAINT verification_uploads_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'verified'::text, 'unverified'::text])))
);


--
-- Name: TABLE verification_uploads; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.verification_uploads IS 'Stores ID and passport verification documents';


--
-- Name: waves; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.waves (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    from_user_id uuid,
    to_user_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    message text,
    receiver_id uuid NOT NULL,
    responded_at timestamp with time zone,
    sender_id uuid NOT NULL,
    status text DEFAULT 'pending'::text,
    wave_type text DEFAULT 'standard'::text,
    CONSTRAINT waves_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'rejected'::text, 'expired'::text]))),
    CONSTRAINT waves_wave_type_check CHECK ((wave_type = ANY (ARRAY['standard'::text, 'super'::text])))
);


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION _qms_cycle_month_start(p_owner_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public._qms_cycle_month_start(p_owner_id uuid) TO anon;
GRANT ALL ON FUNCTION public._qms_cycle_month_start(p_owner_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public._qms_cycle_month_start(p_owner_id uuid) TO service_role;


--
-- Name: FUNCTION _qms_effective_tier(p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public._qms_effective_tier(p_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public._qms_effective_tier(p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public._qms_effective_tier(p_user_id uuid) TO service_role;


--
-- Name: FUNCTION _qms_get_pool_owner(p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public._qms_get_pool_owner(p_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public._qms_get_pool_owner(p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public._qms_get_pool_owner(p_user_id uuid) TO service_role;


--
-- Name: FUNCTION _qms_touch_row(p_owner_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public._qms_touch_row(p_owner_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public._qms_touch_row(p_owner_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public._qms_touch_row(p_owner_id uuid) TO service_role;


--
-- Name: FUNCTION admin_set_verification_status(p_user_id uuid, p_decision text, p_comment text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_set_verification_status(p_user_id uuid, p_decision text, p_comment text) TO anon;
GRANT ALL ON FUNCTION public.admin_set_verification_status(p_user_id uuid, p_decision text, p_comment text) TO authenticated;
GRANT ALL ON FUNCTION public.admin_set_verification_status(p_user_id uuid, p_decision text, p_comment text) TO service_role;


--
-- Name: FUNCTION award_sitter_vouch(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.award_sitter_vouch() TO anon;
GRANT ALL ON FUNCTION public.award_sitter_vouch() TO authenticated;
GRANT ALL ON FUNCTION public.award_sitter_vouch() TO service_role;


--
-- Name: FUNCTION broadcast_alerts_set_geog(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.broadcast_alerts_set_geog() TO anon;
GRANT ALL ON FUNCTION public.broadcast_alerts_set_geog() TO authenticated;
GRANT ALL ON FUNCTION public.broadcast_alerts_set_geog() TO service_role;


--
-- Name: FUNCTION check_and_increment_quota(action_type text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.check_and_increment_quota(action_type text) TO anon;
GRANT ALL ON FUNCTION public.check_and_increment_quota(action_type text) TO authenticated;
GRANT ALL ON FUNCTION public.check_and_increment_quota(action_type text) TO service_role;


--
-- Name: FUNCTION check_for_match(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.check_for_match() TO anon;
GRANT ALL ON FUNCTION public.check_for_match() TO authenticated;
GRANT ALL ON FUNCTION public.check_for_match() TO service_role;


--
-- Name: FUNCTION check_identifier_registered(p_email text, p_phone text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.check_identifier_registered(p_email text, p_phone text) TO anon;
GRANT ALL ON FUNCTION public.check_identifier_registered(p_email text, p_phone text) TO authenticated;
GRANT ALL ON FUNCTION public.check_identifier_registered(p_email text, p_phone text) TO service_role;


--
-- Name: FUNCTION check_scan_rate_limit(user_uuid uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.check_scan_rate_limit(user_uuid uuid) TO anon;
GRANT ALL ON FUNCTION public.check_scan_rate_limit(user_uuid uuid) TO authenticated;
GRANT ALL ON FUNCTION public.check_scan_rate_limit(user_uuid uuid) TO service_role;


--
-- Name: FUNCTION cleanup_expired_broadcast_alerts(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.cleanup_expired_broadcast_alerts() TO anon;
GRANT ALL ON FUNCTION public.cleanup_expired_broadcast_alerts() TO authenticated;
GRANT ALL ON FUNCTION public.cleanup_expired_broadcast_alerts() TO service_role;


--
-- Name: FUNCTION cleanup_expired_map_alerts(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.cleanup_expired_map_alerts() TO anon;
GRANT ALL ON FUNCTION public.cleanup_expired_map_alerts() TO authenticated;
GRANT ALL ON FUNCTION public.cleanup_expired_map_alerts() TO service_role;


--
-- Name: FUNCTION create_alert_thread_and_pin(payload jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_alert_thread_and_pin(payload jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_alert_thread_and_pin(payload jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.create_alert_thread_and_pin(payload jsonb) TO service_role;


--
-- Name: FUNCTION create_match_chat(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.create_match_chat() TO anon;
GRANT ALL ON FUNCTION public.create_match_chat() TO authenticated;
GRANT ALL ON FUNCTION public.create_match_chat() TO service_role;


--
-- Name: FUNCTION debug_whoami(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.debug_whoami() FROM PUBLIC;
GRANT ALL ON FUNCTION public.debug_whoami() TO authenticated;
GRANT ALL ON FUNCTION public.debug_whoami() TO service_role;


--
-- Name: FUNCTION downgrade_user_tier(p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.downgrade_user_tier(p_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.downgrade_user_tier(p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.downgrade_user_tier(p_user_id uuid) TO service_role;


--
-- Name: FUNCTION enforce_map_alert_contract(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.enforce_map_alert_contract() TO anon;
GRANT ALL ON FUNCTION public.enforce_map_alert_contract() TO authenticated;
GRANT ALL ON FUNCTION public.enforce_map_alert_contract() TO service_role;


--
-- Name: FUNCTION enqueue_map_alert_notification(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.enqueue_map_alert_notification() TO anon;
GRANT ALL ON FUNCTION public.enqueue_map_alert_notification() TO authenticated;
GRANT ALL ON FUNCTION public.enqueue_map_alert_notification() TO service_role;


--
-- Name: FUNCTION ensure_profile_for_auth_user(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.ensure_profile_for_auth_user() TO anon;
GRANT ALL ON FUNCTION public.ensure_profile_for_auth_user() TO authenticated;
GRANT ALL ON FUNCTION public.ensure_profile_for_auth_user() TO service_role;


--
-- Name: FUNCTION file_booking_dispute(p_booking_id uuid, p_dispute_reason text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.file_booking_dispute(p_booking_id uuid, p_dispute_reason text) TO anon;
GRANT ALL ON FUNCTION public.file_booking_dispute(p_booking_id uuid, p_dispute_reason text) TO authenticated;
GRANT ALL ON FUNCTION public.file_booking_dispute(p_booking_id uuid, p_dispute_reason text) TO service_role;


--
-- Name: FUNCTION finalize_identity_submission(p_doc_type text, p_doc_path text, p_selfie_path text, p_country text, p_legal_name text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.finalize_identity_submission(p_doc_type text, p_doc_path text, p_selfie_path text, p_country text, p_legal_name text) TO anon;
GRANT ALL ON FUNCTION public.finalize_identity_submission(p_doc_type text, p_doc_path text, p_selfie_path text, p_country text, p_legal_name text) TO authenticated;
GRANT ALL ON FUNCTION public.finalize_identity_submission(p_doc_type text, p_doc_path text, p_selfie_path text, p_country text, p_legal_name text) TO service_role;


--
-- Name: FUNCTION find_nearby_users(alert_lat double precision, alert_lng double precision, radius_meters integer, min_vouch_score integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.find_nearby_users(alert_lat double precision, alert_lng double precision, radius_meters integer, min_vouch_score integer) TO anon;
GRANT ALL ON FUNCTION public.find_nearby_users(alert_lat double precision, alert_lng double precision, radius_meters integer, min_vouch_score integer) TO authenticated;
GRANT ALL ON FUNCTION public.find_nearby_users(alert_lat double precision, alert_lng double precision, radius_meters integer, min_vouch_score integer) TO service_role;


--
-- Name: FUNCTION generate_uid(len integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.generate_uid(len integer) TO anon;
GRANT ALL ON FUNCTION public.generate_uid(len integer) TO authenticated;
GRANT ALL ON FUNCTION public.generate_uid(len integer) TO service_role;


--
-- Name: FUNCTION get_friend_pins_nearby(p_lat double precision, p_lng double precision, p_radius_m integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_friend_pins_nearby(p_lat double precision, p_lng double precision, p_radius_m integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_friend_pins_nearby(p_lat double precision, p_lng double precision, p_radius_m integer) TO service_role;


--
-- Name: FUNCTION get_map_alerts_nearby(p_lat double precision, p_lng double precision, p_radius_m integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_map_alerts_nearby(p_lat double precision, p_lng double precision, p_radius_m integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_map_alerts_nearby(p_lat double precision, p_lng double precision, p_radius_m integer) TO service_role;


--
-- Name: FUNCTION get_quota_snapshot(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_quota_snapshot() TO anon;
GRANT ALL ON FUNCTION public.get_quota_snapshot() TO authenticated;
GRANT ALL ON FUNCTION public.get_quota_snapshot() TO service_role;


--
-- Name: FUNCTION get_visible_broadcast_alerts(p_lat double precision, p_lng double precision); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_visible_broadcast_alerts(p_lat double precision, p_lng double precision) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_visible_broadcast_alerts(p_lat double precision, p_lng double precision) TO authenticated;
GRANT ALL ON FUNCTION public.get_visible_broadcast_alerts(p_lat double precision, p_lng double precision) TO service_role;
GRANT ALL ON FUNCTION public.get_visible_broadcast_alerts(p_lat double precision, p_lng double precision) TO anon;


--
-- Name: FUNCTION get_visible_map_alerts(p_lat double precision, p_lng double precision); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_visible_map_alerts(p_lat double precision, p_lng double precision) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_visible_map_alerts(p_lat double precision, p_lng double precision) TO authenticated;
GRANT ALL ON FUNCTION public.get_visible_map_alerts(p_lat double precision, p_lng double precision) TO service_role;


--
-- Name: FUNCTION handle_identity_review(target_user_id uuid, action text, notes text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.handle_identity_review(target_user_id uuid, action text, notes text) TO anon;
GRANT ALL ON FUNCTION public.handle_identity_review(target_user_id uuid, action text, notes text) TO authenticated;
GRANT ALL ON FUNCTION public.handle_identity_review(target_user_id uuid, action text, notes text) TO service_role;


--
-- Name: FUNCTION handle_marketplace_payment_success(p_payment_intent_id text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.handle_marketplace_payment_success(p_payment_intent_id text) TO anon;
GRANT ALL ON FUNCTION public.handle_marketplace_payment_success(p_payment_intent_id text) TO authenticated;
GRANT ALL ON FUNCTION public.handle_marketplace_payment_success(p_payment_intent_id text) TO service_role;


--
-- Name: FUNCTION handle_new_auth_user(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.handle_new_auth_user() TO anon;
GRANT ALL ON FUNCTION public.handle_new_auth_user() TO authenticated;
GRANT ALL ON FUNCTION public.handle_new_auth_user() TO service_role;


--
-- Name: FUNCTION handle_new_user(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.handle_new_user() TO anon;
GRANT ALL ON FUNCTION public.handle_new_user() TO authenticated;
GRANT ALL ON FUNCTION public.handle_new_user() TO service_role;


--
-- Name: FUNCTION increment_user_credits(p_user_id uuid, p_stars integer, p_mesh_alerts integer, p_media_credits integer, p_family_slots integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.increment_user_credits(p_user_id uuid, p_stars integer, p_mesh_alerts integer, p_media_credits integer, p_family_slots integer) TO anon;
GRANT ALL ON FUNCTION public.increment_user_credits(p_user_id uuid, p_stars integer, p_mesh_alerts integer, p_media_credits integer, p_family_slots integer) TO authenticated;
GRANT ALL ON FUNCTION public.increment_user_credits(p_user_id uuid, p_stars integer, p_mesh_alerts integer, p_media_credits integer, p_family_slots integer) TO service_role;


--
-- Name: FUNCTION is_social_id_taken(candidate text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_social_id_taken(candidate text) TO anon;
GRANT ALL ON FUNCTION public.is_social_id_taken(candidate text) TO authenticated;
GRANT ALL ON FUNCTION public.is_social_id_taken(candidate text) TO service_role;


--
-- Name: FUNCTION map_alerts_apply_interaction_counts(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.map_alerts_apply_interaction_counts() TO anon;
GRANT ALL ON FUNCTION public.map_alerts_apply_interaction_counts() TO authenticated;
GRANT ALL ON FUNCTION public.map_alerts_apply_interaction_counts() TO service_role;


--
-- Name: FUNCTION map_alerts_auto_hide_on_reports(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.map_alerts_auto_hide_on_reports() TO anon;
GRANT ALL ON FUNCTION public.map_alerts_auto_hide_on_reports() TO authenticated;
GRANT ALL ON FUNCTION public.map_alerts_auto_hide_on_reports() TO service_role;


--
-- Name: FUNCTION map_alerts_sync_location(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.map_alerts_sync_location() TO anon;
GRANT ALL ON FUNCTION public.map_alerts_sync_location() TO authenticated;
GRANT ALL ON FUNCTION public.map_alerts_sync_location() TO service_role;


--
-- Name: FUNCTION mark_booking_completed(p_booking_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.mark_booking_completed(p_booking_id uuid) TO anon;
GRANT ALL ON FUNCTION public.mark_booking_completed(p_booking_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.mark_booking_completed(p_booking_id uuid) TO service_role;


--
-- Name: FUNCTION notify_on_map_alert_insert(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.notify_on_map_alert_insert() TO anon;
GRANT ALL ON FUNCTION public.notify_on_map_alert_insert() TO authenticated;
GRANT ALL ON FUNCTION public.notify_on_map_alert_insert() TO service_role;


--
-- Name: FUNCTION pii_purge_identity_verification(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.pii_purge_identity_verification() TO anon;
GRANT ALL ON FUNCTION public.pii_purge_identity_verification() TO authenticated;
GRANT ALL ON FUNCTION public.pii_purge_identity_verification() TO service_role;


--
-- Name: FUNCTION prevent_non_admin_verification(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.prevent_non_admin_verification() TO anon;
GRANT ALL ON FUNCTION public.prevent_non_admin_verification() TO authenticated;
GRANT ALL ON FUNCTION public.prevent_non_admin_verification() TO service_role;


--
-- Name: FUNCTION prevent_sensitive_profile_updates(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.prevent_sensitive_profile_updates() TO anon;
GRANT ALL ON FUNCTION public.prevent_sensitive_profile_updates() TO authenticated;
GRANT ALL ON FUNCTION public.prevent_sensitive_profile_updates() TO service_role;


--
-- Name: FUNCTION process_due_map_alert_notifications(p_limit integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.process_due_map_alert_notifications(p_limit integer) TO anon;
GRANT ALL ON FUNCTION public.process_due_map_alert_notifications(p_limit integer) TO authenticated;
GRANT ALL ON FUNCTION public.process_due_map_alert_notifications(p_limit integer) TO service_role;


--
-- Name: FUNCTION process_identity_cleanup(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.process_identity_cleanup() TO anon;
GRANT ALL ON FUNCTION public.process_identity_cleanup() TO authenticated;
GRANT ALL ON FUNCTION public.process_identity_cleanup() TO service_role;


--
-- Name: FUNCTION protect_monetized_fields(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.protect_monetized_fields() TO anon;
GRANT ALL ON FUNCTION public.protect_monetized_fields() TO authenticated;
GRANT ALL ON FUNCTION public.protect_monetized_fields() TO service_role;


--
-- Name: FUNCTION purge_expired_cache(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.purge_expired_cache() TO anon;
GRANT ALL ON FUNCTION public.purge_expired_cache() TO authenticated;
GRANT ALL ON FUNCTION public.purge_expired_cache() TO service_role;


--
-- Name: FUNCTION purge_expired_verification_docs(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.purge_expired_verification_docs() TO anon;
GRANT ALL ON FUNCTION public.purge_expired_verification_docs() TO authenticated;
GRANT ALL ON FUNCTION public.purge_expired_verification_docs() TO service_role;


--
-- Name: FUNCTION qms_reset_daily(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.qms_reset_daily() TO anon;
GRANT ALL ON FUNCTION public.qms_reset_daily() TO authenticated;
GRANT ALL ON FUNCTION public.qms_reset_daily() TO service_role;


--
-- Name: FUNCTION qms_reset_monthly(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.qms_reset_monthly() TO anon;
GRANT ALL ON FUNCTION public.qms_reset_monthly() TO authenticated;
GRANT ALL ON FUNCTION public.qms_reset_monthly() TO service_role;


--
-- Name: FUNCTION qms_reset_weekly(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.qms_reset_weekly() TO anon;
GRANT ALL ON FUNCTION public.qms_reset_weekly() TO authenticated;
GRANT ALL ON FUNCTION public.qms_reset_weekly() TO service_role;


--
-- Name: FUNCTION qms_rollover_all(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.qms_rollover_all() TO anon;
GRANT ALL ON FUNCTION public.qms_rollover_all() TO authenticated;
GRANT ALL ON FUNCTION public.qms_rollover_all() TO service_role;


--
-- Name: FUNCTION queue_identity_cleanup(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.queue_identity_cleanup() TO anon;
GRANT ALL ON FUNCTION public.queue_identity_cleanup() TO authenticated;
GRANT ALL ON FUNCTION public.queue_identity_cleanup() TO service_role;


--
-- Name: FUNCTION refill_ai_vet_rate_limits(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.refill_ai_vet_rate_limits() TO anon;
GRANT ALL ON FUNCTION public.refill_ai_vet_rate_limits() TO authenticated;
GRANT ALL ON FUNCTION public.refill_ai_vet_rate_limits() TO service_role;


--
-- Name: FUNCTION refresh_subscription_quotas(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.refresh_subscription_quotas() TO anon;
GRANT ALL ON FUNCTION public.refresh_subscription_quotas() TO authenticated;
GRANT ALL ON FUNCTION public.refresh_subscription_quotas() TO service_role;


--
-- Name: FUNCTION release_escrow_funds(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.release_escrow_funds() TO anon;
GRANT ALL ON FUNCTION public.release_escrow_funds() TO authenticated;
GRANT ALL ON FUNCTION public.release_escrow_funds() TO service_role;


--
-- Name: FUNCTION set_escrow_release_date(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_escrow_release_date() TO anon;
GRANT ALL ON FUNCTION public.set_escrow_release_date() TO authenticated;
GRANT ALL ON FUNCTION public.set_escrow_release_date() TO service_role;


--
-- Name: FUNCTION set_profiles_user_id(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_profiles_user_id() TO anon;
GRANT ALL ON FUNCTION public.set_profiles_user_id() TO authenticated;
GRANT ALL ON FUNCTION public.set_profiles_user_id() TO service_role;


--
-- Name: FUNCTION set_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_updated_at() TO anon;
GRANT ALL ON FUNCTION public.set_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.set_updated_at() TO service_role;


--
-- Name: FUNCTION set_user_location(p_lat double precision, p_lng double precision, p_pin_hours integer, p_retention_hours integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_user_location(p_lat double precision, p_lng double precision, p_pin_hours integer, p_retention_hours integer) TO anon;
GRANT ALL ON FUNCTION public.set_user_location(p_lat double precision, p_lng double precision, p_pin_hours integer, p_retention_hours integer) TO authenticated;
GRANT ALL ON FUNCTION public.set_user_location(p_lat double precision, p_lng double precision, p_pin_hours integer, p_retention_hours integer) TO service_role;


--
-- Name: FUNCTION social_discovery(p_user_id uuid, p_lat double precision, p_lng double precision, p_radius_m integer, p_min_age integer, p_max_age integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.social_discovery(p_user_id uuid, p_lat double precision, p_lng double precision, p_radius_m integer, p_min_age integer, p_max_age integer) TO anon;
GRANT ALL ON FUNCTION public.social_discovery(p_user_id uuid, p_lat double precision, p_lng double precision, p_radius_m integer, p_min_age integer, p_max_age integer) TO authenticated;
GRANT ALL ON FUNCTION public.social_discovery(p_user_id uuid, p_lat double precision, p_lng double precision, p_radius_m integer, p_min_age integer, p_max_age integer) TO service_role;


--
-- Name: FUNCTION social_discovery(p_user_id uuid, p_lat double precision, p_lng double precision, p_radius_m integer, p_min_age integer, p_max_age integer, p_role text, p_gender text, p_species text[], p_pet_size text, p_advanced boolean, p_height_min numeric, p_height_max numeric, p_only_waved boolean, p_recently_active boolean); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.social_discovery(p_user_id uuid, p_lat double precision, p_lng double precision, p_radius_m integer, p_min_age integer, p_max_age integer, p_role text, p_gender text, p_species text[], p_pet_size text, p_advanced boolean, p_height_min numeric, p_height_max numeric, p_only_waved boolean, p_recently_active boolean) TO anon;
GRANT ALL ON FUNCTION public.social_discovery(p_user_id uuid, p_lat double precision, p_lng double precision, p_radius_m integer, p_min_age integer, p_max_age integer, p_role text, p_gender text, p_species text[], p_pet_size text, p_advanced boolean, p_height_min numeric, p_height_max numeric, p_only_waved boolean, p_recently_active boolean) TO authenticated;
GRANT ALL ON FUNCTION public.social_discovery(p_user_id uuid, p_lat double precision, p_lng double precision, p_radius_m integer, p_min_age integer, p_max_age integer, p_role text, p_gender text, p_species text[], p_pet_size text, p_advanced boolean, p_height_min numeric, p_height_max numeric, p_only_waved boolean, p_recently_active boolean) TO service_role;


--
-- Name: FUNCTION sync_thread_comment_content(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.sync_thread_comment_content() TO anon;
GRANT ALL ON FUNCTION public.sync_thread_comment_content() TO authenticated;
GRANT ALL ON FUNCTION public.sync_thread_comment_content() TO service_role;


--
-- Name: FUNCTION touch_last_active_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.touch_last_active_at() TO anon;
GRANT ALL ON FUNCTION public.touch_last_active_at() TO authenticated;
GRANT ALL ON FUNCTION public.touch_last_active_at() TO service_role;


--
-- Name: FUNCTION update_chat_last_message(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_chat_last_message() TO anon;
GRANT ALL ON FUNCTION public.update_chat_last_message() TO authenticated;
GRANT ALL ON FUNCTION public.update_chat_last_message() TO service_role;


--
-- Name: FUNCTION update_threads_scores(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_threads_scores() TO anon;
GRANT ALL ON FUNCTION public.update_threads_scores() TO authenticated;
GRANT ALL ON FUNCTION public.update_threads_scores() TO service_role;


--
-- Name: FUNCTION update_updated_at_column(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_updated_at_column() TO anon;
GRANT ALL ON FUNCTION public.update_updated_at_column() TO authenticated;
GRANT ALL ON FUNCTION public.update_updated_at_column() TO service_role;


--
-- Name: FUNCTION upgrade_user_tier(p_user_id uuid, p_tier text, p_subscription_status text, p_stripe_subscription_id text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.upgrade_user_tier(p_user_id uuid, p_tier text, p_subscription_status text, p_stripe_subscription_id text) TO anon;
GRANT ALL ON FUNCTION public.upgrade_user_tier(p_user_id uuid, p_tier text, p_subscription_status text, p_stripe_subscription_id text) TO authenticated;
GRANT ALL ON FUNCTION public.upgrade_user_tier(p_user_id uuid, p_tier text, p_subscription_status text, p_stripe_subscription_id text) TO service_role;


--
-- Name: FUNCTION validate_vaccination_dates(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.validate_vaccination_dates() TO anon;
GRANT ALL ON FUNCTION public.validate_vaccination_dates() TO authenticated;
GRANT ALL ON FUNCTION public.validate_vaccination_dates() TO service_role;


--
-- Name: TABLE admin_audit_logs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.admin_audit_logs TO anon;
GRANT ALL ON TABLE public.admin_audit_logs TO authenticated;
GRANT ALL ON TABLE public.admin_audit_logs TO service_role;


--
-- Name: TABLE ai_vet_conversations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.ai_vet_conversations TO anon;
GRANT ALL ON TABLE public.ai_vet_conversations TO authenticated;
GRANT ALL ON TABLE public.ai_vet_conversations TO service_role;


--
-- Name: TABLE ai_vet_messages; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.ai_vet_messages TO anon;
GRANT ALL ON TABLE public.ai_vet_messages TO authenticated;
GRANT ALL ON TABLE public.ai_vet_messages TO service_role;


--
-- Name: TABLE ai_vet_rate_limits; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.ai_vet_rate_limits TO anon;
GRANT ALL ON TABLE public.ai_vet_rate_limits TO authenticated;
GRANT ALL ON TABLE public.ai_vet_rate_limits TO service_role;


--
-- Name: TABLE ai_vet_usage; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.ai_vet_usage TO anon;
GRANT ALL ON TABLE public.ai_vet_usage TO authenticated;
GRANT ALL ON TABLE public.ai_vet_usage TO service_role;


--
-- Name: TABLE alert_interactions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.alert_interactions TO anon;
GRANT ALL ON TABLE public.alert_interactions TO authenticated;
GRANT ALL ON TABLE public.alert_interactions TO service_role;


--
-- Name: TABLE marketplace_bookings; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.marketplace_bookings TO service_role;
GRANT SELECT ON TABLE public.marketplace_bookings TO authenticated;


--
-- Name: TABLE bookings; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.bookings TO anon;
GRANT ALL ON TABLE public.bookings TO authenticated;
GRANT ALL ON TABLE public.bookings TO service_role;


--
-- Name: TABLE broadcast_alerts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.broadcast_alerts TO service_role;
GRANT INSERT ON TABLE public.broadcast_alerts TO authenticated;


--
-- Name: TABLE chat_messages; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.chat_messages TO anon;
GRANT ALL ON TABLE public.chat_messages TO authenticated;
GRANT ALL ON TABLE public.chat_messages TO service_role;


--
-- Name: TABLE chat_participants; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.chat_participants TO anon;
GRANT ALL ON TABLE public.chat_participants TO authenticated;
GRANT ALL ON TABLE public.chat_participants TO service_role;


--
-- Name: TABLE chat_room_members; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.chat_room_members TO anon;
GRANT ALL ON TABLE public.chat_room_members TO authenticated;
GRANT ALL ON TABLE public.chat_room_members TO service_role;


--
-- Name: TABLE chats; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.chats TO anon;
GRANT ALL ON TABLE public.chats TO authenticated;
GRANT ALL ON TABLE public.chats TO service_role;


--
-- Name: TABLE consent_logs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.consent_logs TO anon;
GRANT ALL ON TABLE public.consent_logs TO authenticated;
GRANT ALL ON TABLE public.consent_logs TO service_role;


--
-- Name: TABLE emergency_logs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.emergency_logs TO anon;
GRANT ALL ON TABLE public.emergency_logs TO authenticated;
GRANT ALL ON TABLE public.emergency_logs TO service_role;


--
-- Name: TABLE family_members; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.family_members TO anon;
GRANT ALL ON TABLE public.family_members TO authenticated;
GRANT ALL ON TABLE public.family_members TO service_role;


--
-- Name: TABLE hazard_identifications; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.hazard_identifications TO anon;
GRANT ALL ON TABLE public.hazard_identifications TO authenticated;
GRANT ALL ON TABLE public.hazard_identifications TO service_role;


--
-- Name: TABLE identity_verification_cleanup_queue; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.identity_verification_cleanup_queue TO anon;
GRANT ALL ON TABLE public.identity_verification_cleanup_queue TO authenticated;
GRANT ALL ON TABLE public.identity_verification_cleanup_queue TO service_role;


--
-- Name: TABLE location_reviews; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.location_reviews TO anon;
GRANT ALL ON TABLE public.location_reviews TO authenticated;
GRANT ALL ON TABLE public.location_reviews TO service_role;


--
-- Name: TABLE lost_pet_alerts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.lost_pet_alerts TO anon;
GRANT ALL ON TABLE public.lost_pet_alerts TO authenticated;
GRANT ALL ON TABLE public.lost_pet_alerts TO service_role;


--
-- Name: TABLE map_alert_notification_queue; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.map_alert_notification_queue TO anon;
GRANT ALL ON TABLE public.map_alert_notification_queue TO authenticated;
GRANT ALL ON TABLE public.map_alert_notification_queue TO service_role;


--
-- Name: TABLE map_alerts; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.map_alerts TO anon;
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.map_alerts TO authenticated;
GRANT ALL ON TABLE public.map_alerts TO service_role;


--
-- Name: TABLE map_checkins; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.map_checkins TO anon;
GRANT ALL ON TABLE public.map_checkins TO authenticated;
GRANT ALL ON TABLE public.map_checkins TO service_role;


--
-- Name: TABLE match_preferences; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.match_preferences TO anon;
GRANT ALL ON TABLE public.match_preferences TO authenticated;
GRANT ALL ON TABLE public.match_preferences TO service_role;


--
-- Name: TABLE matches; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.matches TO anon;
GRANT ALL ON TABLE public.matches TO authenticated;
GRANT ALL ON TABLE public.matches TO service_role;


--
-- Name: TABLE message_reads; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.message_reads TO anon;
GRANT ALL ON TABLE public.message_reads TO authenticated;
GRANT ALL ON TABLE public.message_reads TO service_role;


--
-- Name: TABLE messages; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.messages TO anon;
GRANT ALL ON TABLE public.messages TO authenticated;
GRANT ALL ON TABLE public.messages TO service_role;


--
-- Name: TABLE notice_board; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.notice_board TO anon;
GRANT ALL ON TABLE public.notice_board TO authenticated;
GRANT ALL ON TABLE public.notice_board TO service_role;


--
-- Name: TABLE notification_logs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.notification_logs TO anon;
GRANT ALL ON TABLE public.notification_logs TO authenticated;
GRANT ALL ON TABLE public.notification_logs TO service_role;


--
-- Name: TABLE notification_preferences; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.notification_preferences TO anon;
GRANT ALL ON TABLE public.notification_preferences TO authenticated;
GRANT ALL ON TABLE public.notification_preferences TO service_role;


--
-- Name: TABLE notifications; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.notifications TO anon;
GRANT ALL ON TABLE public.notifications TO authenticated;
GRANT ALL ON TABLE public.notifications TO service_role;


--
-- Name: TABLE payments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.payments TO anon;
GRANT ALL ON TABLE public.payments TO authenticated;
GRANT ALL ON TABLE public.payments TO service_role;


--
-- Name: TABLE pets; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.pets TO anon;
GRANT ALL ON TABLE public.pets TO authenticated;
GRANT ALL ON TABLE public.pets TO service_role;


--
-- Name: TABLE pins; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.pins TO anon;
GRANT ALL ON TABLE public.pins TO authenticated;
GRANT ALL ON TABLE public.pins TO service_role;


--
-- Name: TABLE poi_locations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.poi_locations TO anon;
GRANT ALL ON TABLE public.poi_locations TO authenticated;
GRANT ALL ON TABLE public.poi_locations TO service_role;


--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.profiles TO anon;
GRANT ALL ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;


--
-- Name: TABLE profiles_public; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.profiles_public TO anon;
GRANT ALL ON TABLE public.profiles_public TO authenticated;
GRANT ALL ON TABLE public.profiles_public TO service_role;


--
-- Name: TABLE push_tokens; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.push_tokens TO anon;
GRANT ALL ON TABLE public.push_tokens TO authenticated;
GRANT ALL ON TABLE public.push_tokens TO service_role;


--
-- Name: TABLE reminders; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.reminders TO anon;
GRANT ALL ON TABLE public.reminders TO authenticated;
GRANT ALL ON TABLE public.reminders TO service_role;


--
-- Name: TABLE scan_rate_limits; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.scan_rate_limits TO anon;
GRANT ALL ON TABLE public.scan_rate_limits TO authenticated;
GRANT ALL ON TABLE public.scan_rate_limits TO service_role;


--
-- Name: TABLE sitter_profiles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.sitter_profiles TO anon;
GRANT ALL ON TABLE public.sitter_profiles TO authenticated;
GRANT ALL ON TABLE public.sitter_profiles TO service_role;


--
-- Name: TABLE social_interactions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.social_interactions TO anon;
GRANT ALL ON TABLE public.social_interactions TO authenticated;
GRANT ALL ON TABLE public.social_interactions TO service_role;


--
-- Name: TABLE subscriptions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.subscriptions TO anon;
GRANT ALL ON TABLE public.subscriptions TO authenticated;
GRANT ALL ON TABLE public.subscriptions TO service_role;


--
-- Name: TABLE support_requests; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.support_requests TO anon;
GRANT ALL ON TABLE public.support_requests TO authenticated;
GRANT ALL ON TABLE public.support_requests TO service_role;


--
-- Name: TABLE thread_comments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.thread_comments TO anon;
GRANT ALL ON TABLE public.thread_comments TO authenticated;
GRANT ALL ON TABLE public.thread_comments TO service_role;


--
-- Name: TABLE threads; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.threads TO anon;
GRANT ALL ON TABLE public.threads TO authenticated;
GRANT ALL ON TABLE public.threads TO service_role;


--
-- Name: TABLE transactions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.transactions TO anon;
GRANT ALL ON TABLE public.transactions TO authenticated;
GRANT ALL ON TABLE public.transactions TO service_role;


--
-- Name: TABLE triage_cache; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.triage_cache TO anon;
GRANT ALL ON TABLE public.triage_cache TO authenticated;
GRANT ALL ON TABLE public.triage_cache TO service_role;


--
-- Name: TABLE typing_indicators; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.typing_indicators TO anon;
GRANT ALL ON TABLE public.typing_indicators TO authenticated;
GRANT ALL ON TABLE public.typing_indicators TO service_role;


--
-- Name: TABLE user_locations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_locations TO anon;
GRANT ALL ON TABLE public.user_locations TO authenticated;
GRANT ALL ON TABLE public.user_locations TO service_role;


--
-- Name: TABLE user_quotas; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_quotas TO anon;
GRANT ALL ON TABLE public.user_quotas TO authenticated;
GRANT ALL ON TABLE public.user_quotas TO service_role;


--
-- Name: TABLE user_quotas_legacy_20260208; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_quotas_legacy_20260208 TO anon;
GRANT ALL ON TABLE public.user_quotas_legacy_20260208 TO authenticated;
GRANT ALL ON TABLE public.user_quotas_legacy_20260208 TO service_role;


--
-- Name: TABLE verification_audit_log; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.verification_audit_log TO anon;
GRANT ALL ON TABLE public.verification_audit_log TO authenticated;
GRANT ALL ON TABLE public.verification_audit_log TO service_role;


--
-- Name: TABLE verification_requests; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.verification_requests TO anon;
GRANT ALL ON TABLE public.verification_requests TO authenticated;
GRANT ALL ON TABLE public.verification_requests TO service_role;


--
-- Name: TABLE verification_uploads; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.verification_uploads TO anon;
GRANT ALL ON TABLE public.verification_uploads TO authenticated;
GRANT ALL ON TABLE public.verification_uploads TO service_role;


--
-- Name: TABLE waves; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.waves TO anon;
GRANT ALL ON TABLE public.waves TO authenticated;
GRANT ALL ON TABLE public.waves TO service_role;


--
-- PostgreSQL database dump complete
--

\unrestrict QntI1Kd56Vinda7XcibqqMU7YgUb5UJGF8NhtRQKSPuc9VDn5vsoDMrZL2XL3Rq

