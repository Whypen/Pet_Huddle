-- ── pet_care_profiles ─────────────────────────────────────────────────────────
create table if not exists public.pet_care_profiles (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles(id) on delete cascade,
  story               text,
  skills              text[]    not null default '{}',
  proof_metadata      jsonb     not null default '{}',
  vet_license_found   boolean,
  days                text[]    not null default '{}',
  time_blocks         text[]    not null default '{}',
  other_time_from     text,
  other_time_to       text,
  emergency_readiness boolean,
  min_notice_value    integer,
  min_notice_unit     text      check (min_notice_unit in ('hours', 'days')),
  location_styles     text[]    not null default '{}',
  specify_area        boolean   not null default false,
  area_name           text,
  area_lat            double precision,
  area_lng            double precision,
  completed           boolean   not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint pet_care_profiles_user_id_key unique (user_id)
);

-- Updated_at trigger (reuse or create)
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_pet_care_profiles_updated_at on public.pet_care_profiles;
create trigger set_pet_care_profiles_updated_at
  before update on public.pet_care_profiles
  for each row execute procedure public.set_updated_at();

-- RLS
alter table public.pet_care_profiles enable row level security;

create policy "Users can read own pet_care_profile"
  on public.pet_care_profiles for select
  using (user_id = auth.uid());

create policy "Users can insert own pet_care_profile"
  on public.pet_care_profiles for insert
  with check (user_id = auth.uid());

create policy "Users can update own pet_care_profile"
  on public.pet_care_profiles for update
  using (user_id = auth.uid());
