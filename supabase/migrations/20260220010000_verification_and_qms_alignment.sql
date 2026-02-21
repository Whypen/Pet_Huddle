begin;

-- Align verification-related functions to unverified/pending/verified
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
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
    'free',
    'free',
    false
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create or replace function public.handle_identity_review(target_user_id uuid, action text, notes text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_admin uuid;
  v_is_admin boolean;
  v_upload record;
  v_action text;
begin
  v_admin := auth.uid();

  select is_admin into v_is_admin from public.profiles where id = v_admin;

  insert into public.admin_audit_logs (actor_id, action, target_user_id, notes)
  values (v_admin, 'kyc_review_attempt', target_user_id, notes);

  if v_is_admin is distinct from true then
    raise exception 'Not authorized';
  end if;

  select *
  into v_upload
  from public.verification_uploads
  where user_id = target_user_id and status = 'pending'
  order by uploaded_at desc
  limit 1;

  if v_upload is null then
    raise exception 'No pending upload';
  end if;

  if action in ('verify', 'verified') then
    update public.profiles as prof
      set verification_status = 'verified'::public.verification_status_enum,
          verification_comment = null
    where prof.id = target_user_id;

    update public.verification_uploads as vu
      set status = 'verified',
          reviewed_by = v_admin,
          reviewed_at = now(),
          rejection_reason = null
    where vu.id = v_upload.id;

    insert into public.identity_verification_cleanup_queue (user_id, object_path, delete_after)
    values (target_user_id, v_upload.document_url, now() + interval '7 days');

    if v_upload.selfie_url is not null then
      insert into public.identity_verification_cleanup_queue (user_id, object_path, delete_after)
      values (target_user_id, v_upload.selfie_url, now() + interval '7 days');
    end if;

    v_action := 'kyc_verified';
  elsif action in ('unverify', 'unverified') then
    update public.profiles as prof
      set verification_status = 'unverified'::public.verification_status_enum,
          verification_comment = notes
    where prof.id = target_user_id;

    update public.verification_uploads as vu
      set status = 'unverified',
          reviewed_by = v_admin,
          reviewed_at = now(),
          rejection_reason = notes
    where vu.id = v_upload.id;

    v_action := 'kyc_unverified';
  else
    raise exception 'Invalid action: %', action;
  end if;

  insert into public.admin_audit_logs (actor_id, action, target_user_id, notes)
  values (v_admin, v_action, target_user_id, notes);
end;
$$;

create or replace function public.prevent_non_admin_verification()
returns trigger
language plpgsql
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;
  if new.verification_status = 'verified' then
    if not exists (
      select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true
    ) then
      raise exception 'Only admins can verify users';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.prevent_sensitive_profile_updates()
returns trigger
language plpgsql
security definer
as $$
declare
  role text := (auth.jwt() ->> 'role');
  is_admin boolean := false;
  allowed_kyc_transition boolean := false;
  admin_verification_transition boolean := false;
begin
  if role = 'service_role' then
    return new;
  end if;

  select (p.is_admin = true or p.role = 'admin')
    into is_admin
  from public.profiles p
  where p.id = auth.uid();

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

create or replace function public.queue_identity_cleanup()
returns trigger
language plpgsql
as $$
begin
  if (old.verification_status = 'pending'::public.verification_status_enum)
     and (new.verification_status in ('verified'::public.verification_status_enum, 'unverified'::public.verification_status_enum))
     and new.verification_document_url is not null
  then
    insert into public.identity_verification_cleanup_queue (user_id, object_path, delete_after)
    values (new.id, new.verification_document_url, now() + interval '7 days');
  end if;
  return new;
end;
$$;

create or replace function public.purge_expired_verification_docs()
returns void
language plpgsql
as $$
begin
  delete from storage.objects
  where bucket_id = 'identity_verification'
  and name in (
    select verification_document_url
    from public.profiles
    where verification_status in ('verified', 'unverified')
    and updated_at < now() - interval '7 days'
  );
end;
$$;

-- Align threads scoring with verified verification + tier
create or replace function public.update_threads_scores()
returns void
language plpgsql
as $$
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
    case when p.tier = 'gold' then 30 else 0 end
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

-- Align effective tier helper to effective_tier
create or replace function public._qms_effective_tier(p_user_id uuid)
returns text
language sql
stable
as $$
  select coalesce(nullif(p.effective_tier::text, ''), p.tier::text, 'free')
  from public.profiles p
  where p.id = p_user_id;
$$;

-- Align quota limits with spec tiers
create or replace function public.check_and_increment_quota(action_type text)
returns boolean
language plpgsql
security definer
as $$
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

commit;
