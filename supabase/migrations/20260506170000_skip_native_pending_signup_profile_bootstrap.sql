-- Native signup creates an auth user immediately after email verification so
-- the app can resume at signup/name. Profile rows must still wait for set-profile.

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_display_name text;
  v_legal_name text;
  v_phone text;
begin
  if coalesce(new.raw_user_meta_data->>'huddle_native_signup_pending', 'false') = 'true' then
    return new;
  end if;

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

  v_phone := nullif(btrim(coalesce(new.raw_user_meta_data->>'phone', new.phone, '+0000000000')), '');
  if v_phone is null or v_phone !~ '^\\+[0-9]{7,15}$' then
    v_phone := '+0000000000';
  end if;

  insert into public.profiles (id, display_name, legal_name, phone, updated_at)
  values (new.id, v_display_name, v_legal_name, v_phone, now())
  on conflict (id) do nothing;

  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_display_name text;
  v_legal_name text;
  v_phone text;
begin
  if coalesce(new.raw_user_meta_data->>'huddle_native_signup_pending', 'false') = 'true' then
    return new;
  end if;

  v_display_name := coalesce(new.raw_user_meta_data->>'display_name', new.email);
  v_legal_name := coalesce(
    new.raw_user_meta_data->>'legal_name',
    new.raw_user_meta_data->>'display_name',
    new.email
  );
  v_phone := new.raw_user_meta_data->>'phone';

  begin
    insert into public.profiles (id, display_name, legal_name, phone)
    values (new.id, v_display_name, v_legal_name, v_phone)
    on conflict (id) do update
      set display_name = excluded.display_name,
          legal_name = excluded.legal_name,
          phone = excluded.phone,
          updated_at = now();
  exception when others then
    null;
  end;

  return new;
end;
$$;
