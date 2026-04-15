alter table public.profiles
  add column if not exists phone_verification_status public.verification_status_enum not null default 'unverified';

alter table public.profiles
  add column if not exists phone_verified_at timestamptz;

update public.phone_otp_challenges
set status = 'expired',
    updated_at = now()
where status = 'sent'
  and expires_at <= now();

create or replace function public.get_otp_resend_cooldown(p_request_count int)
returns int
language sql
immutable
as $$
  select case
    when p_request_count <= 0 then 0
    when p_request_count = 1 then 90
    when p_request_count = 2 then 180
    when p_request_count = 3 then 300
    when p_request_count = 4 then 600
    else 1800
  end;
$$;

create or replace function public.check_phone_otp_rate_limit(
  p_phone_hash text,
  p_user_id uuid,
  p_ip text
)
returns table(
  is_limited boolean,
  reason text,
  phone_cnt int,
  user_cnt int,
  ip_cnt int,
  seconds_until_allow int
)
language plpgsql
stable
security definer
as $$
declare
  v_phone_cnt int;
  v_phone_earliest timestamptz;
  v_user_cnt int;
  v_user_earliest timestamptz;
  v_ip_cnt int;
  v_ip_earliest timestamptz;
  v_cooldown int;
  v_secs_since int;
  v_secs_remain int;
begin
  select cnt, earliest_at into v_phone_cnt, v_phone_earliest
  from public.get_phone_otp_request_count(p_phone_hash => p_phone_hash);

  select cnt, earliest_at into v_user_cnt, v_user_earliest
  from public.get_phone_otp_request_count(p_user_id => p_user_id);

  select cnt, earliest_at into v_ip_cnt, v_ip_earliest
  from public.get_phone_otp_request_count(p_ip => p_ip);

  v_phone_cnt := coalesce(v_phone_cnt, 0);
  v_user_cnt := coalesce(v_user_cnt, 0);
  v_ip_cnt := coalesce(v_ip_cnt, 0);

  if v_phone_cnt >= 5 then
    v_secs_remain := greatest(
      0,
      86400 - coalesce(extract(epoch from (now() - v_phone_earliest))::int, 0)
    );
    return query select true, 'phone_daily_cap', v_phone_cnt, v_user_cnt, v_ip_cnt, v_secs_remain;
    return;
  end if;

  if p_user_id is not null and v_user_cnt >= 5 then
    v_secs_remain := greatest(
      0,
      86400 - coalesce(extract(epoch from (now() - v_user_earliest))::int, 0)
    );
    return query select true, 'user_daily_cap', v_phone_cnt, v_user_cnt, v_ip_cnt, v_secs_remain;
    return;
  end if;

  if v_ip_cnt >= 25 then
    v_secs_remain := greatest(
      0,
      86400 - coalesce(extract(epoch from (now() - v_ip_earliest))::int, 0)
    );
    return query select true, 'ip_daily_cap', v_phone_cnt, v_user_cnt, v_ip_cnt, v_secs_remain;
    return;
  end if;

  if v_phone_cnt > 0 then
    v_cooldown := public.get_otp_resend_cooldown(v_phone_cnt);

    select coalesce(
      extract(epoch from (now() - max(created_at)))::int,
      99999
    )
    into v_secs_since
    from public.phone_otp_attempts
    where phone_hash = p_phone_hash
      and attempt_type in ('request', 'resend')
      and status <> 'rate_limited'
      and created_at > now() - interval '24 hours';

    v_secs_since := coalesce(v_secs_since, 99999);

    if v_secs_since < v_cooldown then
      return query select true, 'resend_cooldown', v_phone_cnt, v_user_cnt, v_ip_cnt, (v_cooldown - v_secs_since);
      return;
    end if;
  end if;

  return query select false, null::text, v_phone_cnt, v_user_cnt, v_ip_cnt, 0;
end;
$$;

create or replace function public.refresh_phone_verification_status(p_user_id uuid)
returns public.verification_status_enum
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_phone text := '';
  v_profile_phone_norm text := '';
  v_status public.verification_status_enum := 'unverified';
  v_verified_at timestamptz := null;
begin
  if p_user_id is null then
    raise exception 'missing_user_id';
  end if;

  select coalesce(phone, '')
  into v_profile_phone
  from public.profiles
  where id = p_user_id;

  if not found then
    raise exception 'profile_not_found';
  end if;

  v_profile_phone_norm := regexp_replace(v_profile_phone, '[^0-9+]', '', 'g');

  if v_profile_phone_norm <> '' then
    select max(source_verified_at)
    into v_verified_at
    from (
      select au.phone_confirmed_at as source_verified_at
      from auth.users au
      where au.id = p_user_id
        and au.phone_confirmed_at is not null
        and regexp_replace(coalesce(au.phone, ''), '[^0-9+]', '', 'g') = v_profile_phone_norm

      union all

      select c.verified_at as source_verified_at
      from public.phone_otp_challenges c
      where c.user_id = p_user_id
        and c.status = 'verified'
        and c.verified_at is not null
        and regexp_replace(coalesce(c.phone_e164, ''), '[^0-9+]', '', 'g') = v_profile_phone_norm

      union all

      select coalesce(
        nullif(vr.verification_result->>'verified_at', '')::timestamptz,
        vr.created_at
      ) as source_verified_at
      from public.verification_requests vr
      where vr.user_id = p_user_id
        and vr.request_type = 'phone'
        and vr.status = 'approved'
        and regexp_replace(coalesce(vr.submitted_data->>'phone', ''), '[^0-9+]', '', 'g') = v_profile_phone_norm
    ) verified_sources;

    if v_verified_at is not null then
      v_status := 'verified';
    elsif exists (
      select 1
      from public.phone_otp_challenges c
      where c.user_id = p_user_id
        and c.status = 'sent'
        and c.otp_type = 'phone_change'
        and c.expires_at > now()
        and regexp_replace(coalesce(c.phone_e164, ''), '[^0-9+]', '', 'g') = v_profile_phone_norm
    ) then
      v_status := 'pending';
    end if;
  end if;

  update public.profiles
  set phone_verification_status = v_status,
      phone_verified_at = case
        when v_status = 'verified' then coalesce(v_verified_at, phone_verified_at, now())
        else null
      end
  where id = p_user_id;

  return v_status;
end;
$$;

grant execute on function public.refresh_phone_verification_status(uuid) to authenticated, service_role;

do $$
declare
  v_profile record;
begin
  for v_profile in
    select id
    from public.profiles
  loop
    perform public.refresh_phone_verification_status(v_profile.id);
  end loop;
end;
$$;

update auth.users u
set phone_change = '',
    phone_change_sent_at = null
where coalesce(u.phone_change, '') <> ''
  and not exists (
    select 1
    from public.phone_otp_challenges c
    where c.user_id = u.id
      and c.otp_type = 'phone_change'
      and c.status = 'sent'
      and c.expires_at > now()
      and regexp_replace(coalesce(c.phone_e164, ''), '[^0-9+]', '', 'g') = regexp_replace(coalesce(u.phone_change, ''), '[^0-9+]', '', 'g')
  );

create or replace function public.refresh_identity_verification_status(p_user_id uuid)
returns public.verification_status_enum
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_phone_status public.verification_status_enum := 'unverified';
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
  v_phone_status := public.refresh_phone_verification_status(p_user_id);

  select exists(
    select 1
    from public.device_fingerprint_history d
    where d.user_id = p_user_id
  )
  into v_device_complete;

  if v_profile.verification_rejection_code = 'blocked_identity' then
    v_final := 'unverified';
  elsif v_device_complete
     and v_phone_status = 'verified'
     and v_human_status = 'passed'
     and v_card_status = 'passed' then
    v_final := 'verified';
  elsif v_phone_status = 'pending'
     or v_human_status <> 'not_started'
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

grant execute on function public.refresh_identity_verification_status(uuid) to authenticated, service_role;
