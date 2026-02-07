-- Spec gap fixes: profile toggles, social_album bucket, thread_comments content, ai-vet refill, pets cleanup

-- Profile relationship visibility toggle
alter table public.profiles
  add column if not exists show_relationship_status boolean default true;

-- Thread comments: add content column for app usage
alter table public.thread_comments
  add column if not exists content text;

update public.thread_comments
set content = coalesce(content, text)
where content is null;

alter table public.thread_comments
  alter column content set default '',
  alter column content set not null;

-- Social album bucket (private, <= 500KB, images only)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
select 'social_album', 'social_album', false, 500000, ARRAY['image/jpeg','image/png','image/webp']
where not exists (
  select 1 from storage.buckets where id = 'social_album'
);

-- RLS policies for social_album storage objects (owner only)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'social_album_owner_select'
  ) then
    create policy social_album_owner_select
    on storage.objects for select
    using (
      bucket_id = 'social_album'
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
      and policyname = 'social_album_owner_insert'
  ) then
    create policy social_album_owner_insert
    on storage.objects for insert
    with check (
      bucket_id = 'social_album'
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
      and policyname = 'social_album_owner_update'
  ) then
    create policy social_album_owner_update
    on storage.objects for update
    using (
      bucket_id = 'social_album'
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
      and policyname = 'social_album_owner_delete'
  ) then
    create policy social_album_owner_delete
    on storage.objects for delete
    using (
      bucket_id = 'social_album'
      and auth.uid() = owner
    );
  end if;
end $$;

-- Ensure admin can read identity verification bucket (if not already)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'identity_verification_admin_read'
  ) then
    create policy identity_verification_admin_read
    on storage.objects for select
    using (
      bucket_id = 'identity_verification'
      and (auth.jwt() ->> 'role') = 'admin'
    );
  end if;
end $$;

-- AI Vet token bucket refill (daily reset to 50 tokens)
create or replace function public.refill_ai_vet_rate_limits()
returns void
language plpgsql
as $$
begin
  update public.ai_vet_rate_limits
  set tokens = 50,
      last_refill = now()
  where now() - last_refill >= interval '24 hours';
end;
$$;

select
  case
    when not exists (select 1 from cron.job where jobname = 'ai_vet_rate_limits_daily_refill')
      then cron.schedule('ai_vet_rate_limits_daily_refill', '0 0 * * *', 'select public.refill_ai_vet_rate_limits();')
    else null
  end;

-- One-time cleanup for fake pet profiles
-- NOTE: TRUNCATE fails when foreign keys reference pets (e.g., ai_vet_conversations).
-- A DELETE achieves the same cleanup while respecting ON DELETE actions.
delete from public.pets;
