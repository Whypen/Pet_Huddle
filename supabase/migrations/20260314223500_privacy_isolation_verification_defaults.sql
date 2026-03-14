-- Privacy isolation hardening:
-- 1) Canonical startup verification defaults for new profile rows
-- 2) Auth trigger bootstrap writes explicit clean verification state
-- 3) Mixed-truth normalization backfill

-- Enforce canonical enum contract at type level.
-- Legacy labels mapped:
--   not_submitted -> unverified
--   approved      -> verified
--   rejected      -> unverified
drop function if exists public.admin_review_verification(uuid, public.verification_status_enum, text);
drop function if exists public.refresh_identity_verification_status(uuid);

drop trigger if exists trg_prevent_non_admin_verification on public.profiles;
drop trigger if exists trg_queue_identity_cleanup on public.profiles;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'verification_status_enum_canonical'
  ) then
    create type public.verification_status_enum_canonical as enum ('unverified', 'pending', 'verified');
  end if;
end;
$$;

alter table if exists public.profiles
  alter column verification_status drop default;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'verification_status'
      and udt_name <> 'verification_status_enum_canonical'
  ) then
    alter table public.profiles
      alter column verification_status
      type public.verification_status_enum_canonical
      using (
        case lower(coalesce(verification_status::text, ''))
          when 'approved' then 'verified'
          when 'rejected' then 'unverified'
          when 'not_submitted' then 'unverified'
          when 'verified' then 'verified'
          when 'pending' then 'pending'
          when 'unverified' then 'unverified'
          else 'unverified'
        end
      )::public.verification_status_enum_canonical;
  end if;
end;
$$;

do $$
begin
  if exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'verification_status_enum'
  ) then
    drop type public.verification_status_enum;
  end if;
  alter type public.verification_status_enum_canonical rename to verification_status_enum;
end;
$$;

alter table if exists public.profiles
  alter column verification_status set default 'unverified'::public.verification_status_enum;

alter table if exists public.profiles
  alter column is_verified set default false;

alter table if exists public.profiles
  alter column verification_comment drop default;

-- Normalize legacy/mixed truth rows safely.
-- Rule: verification badge truth is is_verified=true only; status must stay consistent.
update public.profiles
set verification_status = coalesce(verification_status, 'unverified'::public.verification_status_enum)
where verification_status is null;

update public.profiles
set verification_status = case lower(verification_status::text)
  when 'approved' then 'verified'::public.verification_status_enum
  when 'rejected' then 'unverified'::public.verification_status_enum
  when 'not_submitted' then 'unverified'::public.verification_status_enum
  else verification_status
end
where lower(verification_status::text) in ('approved', 'rejected', 'not_submitted');

update public.profiles
set is_verified = case when verification_status = 'verified'::public.verification_status_enum then true else false end
where is_verified is distinct from (verification_status = 'verified'::public.verification_status_enum);

update public.profiles
set verification_status = 'verified'::public.verification_status_enum
where is_verified = true
  and verification_status <> 'verified'::public.verification_status_enum;

update public.profiles
set verification_comment = null
where verification_status = 'unverified'::public.verification_status_enum
  and verification_comment is not null;

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
grant execute on function public.refresh_identity_verification_status(uuid) to authenticated, service_role;

create or replace function public.admin_review_verification(
  p_user_id uuid,
  p_status public.verification_status_enum,
  p_comment text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
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
grant execute on function public.admin_review_verification(uuid, public.verification_status_enum, text) to service_role;

create trigger trg_prevent_non_admin_verification
before update of verification_status, is_verified on public.profiles
for each row
execute function public.prevent_non_admin_verification();

create trigger trg_queue_identity_cleanup
after update of verification_status on public.profiles
for each row
execute function public.queue_identity_cleanup();

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
  v_display_name := nullif(
    btrim(
      coalesce(
        new.raw_user_meta_data->>'display_name',
        new.raw_user_meta_data->>'name',
        new.raw_user_meta_data->>'full_name',
        split_part(new.email, '@', 1),
        'Huddle User'
      )
    ),
    ''
  );
  if v_display_name is null then
    v_display_name := 'Huddle User';
  end if;

  v_legal_name := nullif(
    btrim(
      coalesce(
        new.raw_user_meta_data->>'legal_name',
        new.raw_user_meta_data->>'full_name',
        v_display_name
      )
    ),
    ''
  );
  if v_legal_name is null then
    v_legal_name := v_display_name;
  end if;

  v_phone := nullif(btrim(coalesce(new.raw_user_meta_data->>'phone', new.phone, '')), '');
  if v_phone is null or v_phone !~ '^\+[0-9]{7,15}$' then
    v_phone := '+10000000000';
  end if;

  insert into public.profiles (
    id,
    display_name,
    legal_name,
    phone,
    verification_status,
    is_verified,
    verification_comment,
    updated_at
  )
  values (
    new.id,
    v_display_name,
    v_legal_name,
    v_phone,
    'unverified'::public.verification_status_enum,
    false,
    null,
    now()
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  return public.handle_new_auth_user();
end;
$$;
