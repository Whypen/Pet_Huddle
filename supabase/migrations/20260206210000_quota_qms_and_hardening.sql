-- QMS: user_quotas + check_and_increment_quota
create table if not exists public.user_quotas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  day date not null default current_date,
  ai_images int not null default 0,
  chat_images int not null default 0,
  thread_posts int not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, day)
);

alter table public.user_quotas enable row level security;

-- Users can read their own quotas
create policy "User can read own quotas" on public.user_quotas
for select using (auth.uid() = user_id);

-- Only service role can update/insert
create policy "Service role manages quotas" on public.user_quotas
for all using ((auth.jwt() ->> 'role') = 'service_role')
with check ((auth.jwt() ->> 'role') = 'service_role');

create or replace function public.check_and_increment_quota(action_type text)
returns boolean
language plpgsql
security definer
as $$
declare
  u_id uuid := auth.uid();
  t text;
  q record;
  limit_ai int := 1;
  limit_chat int := 5;
  limit_thread int := 1;
  allowed boolean := true;
  today date := current_date;
  tier text;
begin
  if u_id is null then
    return false;
  end if;

  select coalesce(p.tier, 'free') into tier from public.profiles p where p.id = u_id;
  if tier in ('premium','gold') then
    limit_ai := 9999;
    limit_chat := 9999;
    limit_thread := 9999;
  end if;

  select * into q from public.user_quotas where user_id = u_id and day = today;
  if not found then
    insert into public.user_quotas(user_id, day) values (u_id, today) returning * into q;
  end if;

  if action_type = 'ai_vision' then
    if q.ai_images >= limit_ai then
      return false;
    end if;
    update public.user_quotas set ai_images = ai_images + 1 where user_id = u_id and day = today;
  elsif action_type = 'chat_image' then
    if q.chat_images >= limit_chat then
      return false;
    end if;
    update public.user_quotas set chat_images = chat_images + 1 where user_id = u_id and day = today;
  elsif action_type = 'thread_post' then
    if q.thread_posts >= limit_thread then
      return false;
    end if;
    update public.user_quotas set thread_posts = thread_posts + 1 where user_id = u_id and day = today;
  else
    -- Unknown action type: allow without increment
    allowed := true;
  end if;

  return allowed;
end;
$$;

-- Identity verification bucket restrictive policies
-- enforce restrictive: owner insert, admin read
alter table storage.objects enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'identity_verification_owner_insert_restrictive'
  ) then
    create policy identity_verification_owner_insert_restrictive
    as restrictive
    on storage.objects for insert
    with check (bucket_id = 'identity_verification' and auth.uid() = owner);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'identity_verification_admin_read_restrictive'
  ) then
    create policy identity_verification_admin_read_restrictive
    as restrictive
    on storage.objects for select
    using (bucket_id = 'identity_verification' and (auth.jwt() ->> 'role') = 'admin');
  end if;
end $$;

-- Ensure GIST index exists (latest)
create index if not exists profiles_location_idx on public.profiles using gist (location);
