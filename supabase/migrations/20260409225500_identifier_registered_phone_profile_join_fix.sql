create or replace function public.check_identifier_registered(
  p_email text default null::text,
  p_phone text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_phone text := nullif(regexp_replace(trim(coalesce(p_phone, '')), '\\D', '', 'g'), '');
  v_email_exists boolean := false;
  v_phone_exists boolean := false;
  v_field text := null;
  v_has_block_lookup boolean := false;
  v_blocks jsonb := jsonb_build_object(
    'blocked', false,
    'blocked_by', null,
    'public_message', null,
    'review_required', false,
    'cooldown_until', null
  );
begin
  select to_regprocedure('public.lookup_signup_blocks(text,text,text,text)') is not null
    into v_has_block_lookup;

  if v_has_block_lookup then
    select public.lookup_signup_blocks(v_email, v_phone, null, null) into v_blocks;
    if coalesce((v_blocks->>'blocked')::boolean, false) then
      return jsonb_build_object(
        'registered', false,
        'field', null,
        'blocked', true,
        'blocked_by', v_blocks->>'blocked_by',
        'public_message', v_blocks->>'public_message',
        'review_required', false,
        'cooldown_until', null
      );
    end if;
  end if;

  if v_email is not null then
    select exists (
      select 1
      from auth.users u
      join public.profiles p on p.id = u.id
      where lower(coalesce(u.email, '')) = v_email
        and p.account_status <> 'removed'
    ) into v_email_exists;
  end if;

  if v_phone is not null then
    select exists (
      select 1
      from public.profiles p
      join auth.users u on u.id = p.id
      where regexp_replace(coalesce(p.phone, ''), '\\D', '', 'g') = v_phone
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
    'field', v_field,
    'blocked', false,
    'blocked_by', null,
    'public_message', null,
    'review_required', coalesce((v_blocks->>'review_required')::boolean, false),
    'cooldown_until', v_blocks->>'cooldown_until'
  );
end;
$$;

comment on function public.check_identifier_registered(text, text)
is 'Checks if email/phone is registered for live non-removed accounts and returns block/review signals when lookup_signup_blocks is available.';
