-- Keep profile verification truthful when phone numbers change without OTP completion.
-- A phone step is complete only when the current profile.phone matches a confirmed
-- auth.users.phone, or there is an approved phone verification request for that exact
-- normalized number.

create or replace function public.refresh_identity_verification_status(p_user_id uuid)
returns public.verification_status_enum
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_phone_complete boolean := false;
  v_device_complete boolean := false;
  v_human_status text := 'not_started';
  v_card_status text := 'not_started';
  v_final public.verification_status_enum := 'unverified';
  v_profile_phone_norm text := '';
  v_auth_phone text := '';
  v_auth_phone_norm text := '';
  v_auth_phone_confirmed boolean := false;
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
  v_profile_phone_norm := regexp_replace(coalesce(v_profile.phone, ''), '[^0-9+]', '', 'g');

  select exists(
    select 1
    from public.device_fingerprint_history d
    where d.user_id = p_user_id
  )
  into v_device_complete;

  select
    coalesce(au.phone, ''),
    (au.phone_confirmed_at is not null)
  into
    v_auth_phone,
    v_auth_phone_confirmed
  from auth.users au
  where au.id = p_user_id;

  v_auth_phone_norm := regexp_replace(coalesce(v_auth_phone, ''), '[^0-9+]', '', 'g');

  if v_profile_phone_norm <> '' then
    if v_auth_phone_confirmed and v_auth_phone_norm = v_profile_phone_norm then
      v_phone_complete := true;
    elsif exists (
      select 1
      from public.verification_requests vr
      where vr.user_id = p_user_id
        and vr.request_type = 'phone'
        and vr.status = 'approved'
        and regexp_replace(coalesce(vr.submitted_data->>'phone', ''), '[^0-9+]', '', 'g') = v_profile_phone_norm
    ) then
      v_phone_complete := true;
    end if;
  end if;

  if v_profile.verification_rejection_code = 'blocked_identity' then
    v_final := 'unverified';
  elsif v_device_complete
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

grant execute on function public.refresh_identity_verification_status(uuid) to authenticated, service_role;
