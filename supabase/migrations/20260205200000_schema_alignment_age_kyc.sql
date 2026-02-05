-- Schema alignment for profiles/pets + KYC storage readiness
-- Request scope: occupation, verification columns, neutered_spayed, vet contact split, reminder validation.

alter table public.profiles
  add column if not exists occupation text,
  add column if not exists verification_status text,
  add column if not exists verification_comment text;

alter table public.pets
  add column if not exists neutered_spayed boolean default false,
  add column if not exists clinic_name text,
  add column if not exists preferred_vet text,
  add column if not exists phone_no text,
  add column if not exists next_vaccination_reminder date;

-- Ensure reminder dates are future-oriented.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'pets_next_vaccination_future_chk'
      and conrelid = 'public.pets'::regclass
  ) then
    alter table public.pets
      add constraint pets_next_vaccination_future_chk
      check (next_vaccination_reminder is null or next_vaccination_reminder > current_date);
  end if;
end $$;

-- Ensure identity verification bucket exists (private by default).
insert into storage.buckets (id, name, public)
values ('identity_verification', 'identity_verification', false)
on conflict (id) do nothing;
