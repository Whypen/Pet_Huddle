-- v1.2 core schema alignment
-- Extensions
create extension if not exists postgis;
create extension if not exists pgcrypto;

-- Profiles additions
alter table public.profiles
  add column if not exists dob date,
  add column if not exists location_country text,
  add column if not exists location_district text,
  add column if not exists user_id text,
  add column if not exists verification_status text,
  add column if not exists verification_comment text,
  add column if not exists verification_document_url text,
  add column if not exists has_car boolean default false,
  add column if not exists languages text[] default '{}'::text[],
  add column if not exists relationship_status text,
  add column if not exists social_album text[] default '{}'::text[],
  add column if not exists location_geog geography(Point,4326);

-- Ensure unique immutable user_id (10-digit string)
create or replace function public.generate_uid(len integer)
returns text
language plpgsql
as $$
declare
  i integer;
  s text := '';
begin
  for i in 1..len loop
    s := s || floor(random()*10)::int;
  end loop;
  return s;
end;
$$;

create or replace function public.set_profiles_user_id()
returns trigger
language plpgsql
as $$
begin
  if new.user_id is null or length(new.user_id) = 0 then
    new.user_id := public.generate_uid(10);
  end if;
  return new;
end;
$$;

create trigger trg_set_profiles_user_id
before insert on public.profiles
for each row
execute function public.set_profiles_user_id();

alter table public.profiles
  add constraint if not exists profiles_user_id_unique unique (user_id);

alter table public.profiles
  add constraint if not exists profiles_user_id_len check (char_length(user_id) = 10) not valid;

-- Age gate constraint (allow NOT VALID for backfill)
alter table public.profiles
  add constraint if not exists profiles_min_age
  check (dob is null or dob <= (current_date - interval '16 years')) not valid;

-- Pets additions
alter table public.pets
  add column if not exists neutered_spayed boolean default false,
  add column if not exists clinic_name text,
  add column if not exists preferred_vet text,
  add column if not exists phone_no text,
  add column if not exists next_vaccination_reminder date;

alter table public.pets
  add constraint if not exists pets_weight_lt_100 check (weight is null or weight < 100);

alter table public.pets
  add constraint if not exists pets_next_vaccination_future
  check (next_vaccination_reminder is null or next_vaccination_reminder > current_date);

-- vaccination_dates <= current_date for each element (if array exists)
alter table public.pets
  add constraint if not exists pets_vaccination_dates_past
  check (
    vaccination_dates is null
    or array_length(vaccination_dates, 1) is null
    or (select bool_and(d <= current_date) from unnest(vaccination_dates) d)
  );

-- Threads
create table if not exists public.threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  tags text[] default '{}'::text[],
  hashtags text[] default '{}'::text[],
  content text not null,
  images text[] default '{}'::text[],
  created_at timestamptz default now()
);

create table if not exists public.thread_comments (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.threads(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  text text not null,
  images text[] default '{}'::text[],
  created_at timestamptz default now()
);

create table if not exists public.family_members (
  id uuid primary key default gen_random_uuid(),
  inviter_user_id uuid not null references public.profiles(id) on delete cascade,
  invitee_user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null check (status in ('pending','accepted','declined')),
  created_at timestamptz default now()
);

-- RLS policies for threads & comments
alter table public.threads enable row level security;
alter table public.thread_comments enable row level security;
alter table public.family_members enable row level security;

create policy threads_owner_select
on public.threads for select
using (auth.uid() = user_id);

create policy threads_owner_insert
on public.threads for insert
with check (auth.uid() = user_id);

create policy threads_owner_update
on public.threads for update
using (auth.uid() = user_id);

create policy threads_owner_delete
on public.threads for delete
using (auth.uid() = user_id);

create policy thread_comments_owner_select
on public.thread_comments for select
using (auth.uid() = user_id);

create policy thread_comments_owner_insert
on public.thread_comments for insert
with check (auth.uid() = user_id);

create policy thread_comments_owner_update
on public.thread_comments for update
using (auth.uid() = user_id);

create policy thread_comments_owner_delete
on public.thread_comments for delete
using (auth.uid() = user_id);

create policy family_members_owner_select
on public.family_members for select
using (auth.uid() = inviter_user_id or auth.uid() = invitee_user_id);

create policy family_members_owner_insert
on public.family_members for insert
with check (auth.uid() = inviter_user_id);

create policy family_members_owner_update
on public.family_members for update
using (auth.uid() = inviter_user_id or auth.uid() = invitee_user_id);

-- Transactions additions
alter table public.transactions
  add column if not exists escrow_status text,
  add column if not exists idempotency_key text;

alter table public.transactions
  add constraint if not exists transactions_idempotency_unique unique (idempotency_key);

-- PostGIS index for geo queries
create index if not exists profiles_location_geog_gix on public.profiles using gist (location_geog);

-- Identity verification bucket
insert into storage.buckets (id, name, public)
select 'identity_verification', 'identity_verification', false
where not exists (
  select 1 from storage.buckets where id = 'identity_verification'
);

-- RLS policies for identity_verification objects
alter table storage.objects enable row level security;

-- Owner can insert/select their own identity files
create policy identity_verification_owner_select
on storage.objects for select
using (
  bucket_id = 'identity_verification'
  and auth.uid() = owner
);

create policy identity_verification_owner_insert
on storage.objects for insert
with check (
  bucket_id = 'identity_verification'
  and auth.uid() = owner
);

-- Admin/service role can manage
create policy identity_verification_admin_all
on storage.objects for all
using (bucket_id = 'identity_verification' and auth.role() = 'service_role')
with check (bucket_id = 'identity_verification' and auth.role() = 'service_role');

-- Auto-delete identity files 7 days after verification_status change (cron)
create table if not exists public.identity_verification_cleanup_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  object_path text not null,
  delete_after timestamptz not null,
  created_at timestamptz default now()
);

create or replace function public.queue_identity_cleanup()
returns trigger
language plpgsql
as $$
begin
  if (new.verification_status in ('approved','rejected')) and new.verification_document_url is not null then
    insert into public.identity_verification_cleanup_queue (user_id, object_path, delete_after)
    values (new.id, new.verification_document_url, now() + interval '7 days');
  end if;
  return new;
end;
$$;

create trigger trg_queue_identity_cleanup
after update of verification_status on public.profiles
for each row
execute function public.queue_identity_cleanup();

-- Cleanup job: delete queued storage objects (runs hourly)
create or replace function public.process_identity_cleanup()
returns void
language plpgsql
as $$
declare
  rec record;
begin
  for rec in select * from public.identity_verification_cleanup_queue where delete_after <= now() loop
    delete from storage.objects where bucket_id = 'identity_verification' and name = rec.object_path;
    delete from public.identity_verification_cleanup_queue where id = rec.id;
  end loop;
end;
$$;

select
  cron.schedule(
    'identity_cleanup_hourly',
    '0 * * * *',
    $$select public.process_identity_cleanup();$$
  )
where not exists (
  select 1 from cron.job where jobname = 'identity_cleanup_hourly'
);
