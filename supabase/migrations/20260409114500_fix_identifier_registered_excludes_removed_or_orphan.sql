-- check_identifier_registered should only report currently valid accounts.
-- Ignore auth rows without a live profile and ignore removed profiles.

create or replace function public.check_identifier_registered(
  p_email text default null::text,
  p_phone text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email_exists boolean := false;
  v_phone_exists boolean := false;
  v_field text := null;
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
begin
  -- email: count only auth users linked to non-removed profiles
  if v_email is not null then
    select exists (
      select 1
      from auth.users u
      join public.profiles p on p.id = u.id
      where lower(coalesce(u.email, '')) = v_email
        and p.account_status <> 'removed'
    ) into v_email_exists;
  end if;

  -- phone: count only auth users linked to non-removed profiles
  if v_phone is not null then
    select exists (
      select 1
      from auth.users u
      join public.profiles p on p.id = u.id
      where coalesce(u.phone, '') = v_phone
        and p.account_status <> 'removed'
    ) into v_phone_exists;
  end if;

  if v_email_exists then
    v_field := 'email';
  elsif v_phone_exists then
    v_field := 'phone';
  end if;

  return jsonb_build_object(
    'registered', (v_email_exists or v_phone_exists),
    'field', v_field
  );
end;
$$;

comment on function public.check_identifier_registered(text, text)
is 'Checks if email or phone is already registered for a non-removed profile. Returns {registered: boolean, field: "email"|"phone"|null}';
