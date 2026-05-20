-- Store credential HMAC material inside a private DB table instead of a
-- database-level custom setting. The table has RLS enabled and no client
-- policies or client grants.

create table if not exists public.credential_private_config (
  config_key text primary key,
  config_value text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint credential_private_config_key_not_blank
    check (length(btrim(config_key)) > 0),
  constraint credential_private_config_value_not_blank
    check (length(btrim(config_value)) > 0)
);

drop trigger if exists set_credential_private_config_updated_at on public.credential_private_config;
create trigger set_credential_private_config_updated_at
  before update on public.credential_private_config
  for each row execute procedure public.set_updated_at();

alter table public.credential_private_config enable row level security;

revoke all on table public.credential_private_config from public, anon, authenticated;

insert into public.credential_private_config (config_key, config_value)
select 'license_number_hmac', encode(extensions.gen_random_bytes(32), 'hex')
where not exists (
  select 1
  from public.credential_private_config
  where config_key = 'license_number_hmac'
);

create or replace function public.credential_identifier_hmac(p_identifier text)
returns text
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_clean text := credential_normalize_text(p_identifier);
  v_secret text;
begin
  if v_clean is null then
    return null;
  end if;

  select cpc.config_value
  into v_secret
  from public.credential_private_config cpc
  where cpc.config_key = 'license_number_hmac';

  if nullif(v_secret, '') is null then
    raise exception 'missing_credential_hmac_key' using errcode = 'P0001';
  end if;

  return encode(extensions.hmac(v_clean, v_secret, 'sha256'), 'hex');
end;
$$;

revoke all on function public.credential_identifier_hmac(text) from public, anon, authenticated;
