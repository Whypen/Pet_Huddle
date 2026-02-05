create or replace function public.prevent_sensitive_profile_updates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  jwt_role text := current_setting('request.jwt.claim.role', true);
  jwt_sub text := current_setting('request.jwt.claim.sub', true);
begin
  -- Allow backend/admin contexts that execute without end-user JWT claims.
  if jwt_role is null or jwt_sub is null or jwt_role = 'service_role' then
    return new;
  end if;

  if coalesce(new.is_verified, false) is distinct from coalesce(old.is_verified, false)
     or coalesce(new.verification_status::text, '') is distinct from coalesce(old.verification_status::text, '')
     or coalesce(new.verification_comment, '') is distinct from coalesce(old.verification_comment, '')
     or coalesce(new.tier, '') is distinct from coalesce(old.tier, '')
     or coalesce(new.stars_count, 0) is distinct from coalesce(old.stars_count, 0)
     or coalesce(new.mesh_alert_count, 0) is distinct from coalesce(old.mesh_alert_count, 0)
     or coalesce(new.media_credits, 0) is distinct from coalesce(old.media_credits, 0)
     or coalesce(new.family_slots, 0) is distinct from coalesce(old.family_slots, 0)
  then
    raise exception 'Direct update of protected profile fields is not allowed';
  end if;

  return new;
end;
$$;
