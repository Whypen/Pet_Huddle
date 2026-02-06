-- PHASE 1: PostGIS index, identity_verification RLS, threads scoring

-- Enable PostGIS if needed
create extension if not exists postgis;

-- Ensure profiles.location has a GIST index
create index if not exists idx_profiles_location_geography
  on public.profiles using gist (location);

-- Identity verification bucket RLS (private)
-- Owners can insert/read/delete their own verification images; admin role can read
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'identity_verification_owner_read'
  ) then
    create policy identity_verification_owner_read
    on storage.objects for select
    using (
      bucket_id = 'identity_verification'
      and (
        auth.uid() = owner
        or (auth.jwt() ->> 'role') = 'admin'
      )
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'identity_verification_owner_insert'
  ) then
    create policy identity_verification_owner_insert
    on storage.objects for insert
    with check (
      bucket_id = 'identity_verification'
      and auth.uid() = owner
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'identity_verification_owner_delete'
  ) then
    create policy identity_verification_owner_delete
    on storage.objects for delete
    using (
      bucket_id = 'identity_verification'
      and auth.uid() = owner
    );
  end if;
end $$;

-- Threads scoring support columns
alter table public.threads
  add column if not exists likes int default 0,
  add column if not exists clicks int default 0,
  add column if not exists score double precision default 0;

-- Weighted scoring function
create or replace function public.update_threads_scores()
returns void
language plpgsql
as $$
begin
  update public.threads t
  set score = (
    -- time boost: newer = higher
    (extract(epoch from (now() - t.created_at)) / 86400.0) * 10
    +
    -- relationship weight: care_circle presence
    case
      when p.care_circle is not null and array_length(p.care_circle, 1) > 0 then 20
      else 0
    end
    +
    -- badge/role weight
    case when p.is_verified then 50 else 0 end
    +
    case when p.tier = 'gold' then 30 else 0 end
    +
    -- engagement
    ((select count(*) from public.thread_comments c where c.thread_id = t.id) * 5)
    + (coalesce(t.likes, 0) * 3)
    + (coalesce(t.clicks, 0) * 1)
    -
    -- decay
    (ln(extract(day from (now() - t.created_at)) + 1) * 5)
  )
  from public.profiles p
  where p.id = t.user_id;
end;
$$;

-- Hourly score refresh
-- requires pg_cron (available on Supabase)
select
  case
    when not exists (select 1 from cron.job where jobname = 'threads_score_hourly')
      then cron.schedule('threads_score_hourly', '0 * * * *', 'select public.update_threads_scores();')
    else null
  end;
