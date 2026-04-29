-- Profile editorial photos data layer.
-- Forward migration:
--   - profiles.photos stores the five editorial slots plus slot metadata.
--   - Legacy avatar_url and social_album stay in place for fallback during rollout.
-- Reverse script, if rollback is required before Phase 5:
--   alter table public.profiles drop column if exists profile_editorial_v1;
--   alter table public.profiles drop column if exists profile_photos_migrated_seen_at;
--   alter table public.profiles drop column if exists photos;
--   delete from storage.buckets where id = 'Profiles';

alter table public.profiles
  add column if not exists photos jsonb not null default '{}'::jsonb,
  add column if not exists profile_photos_migrated_seen_at timestamptz,
  add column if not exists profile_editorial_v1 boolean not null default false;

update public.profiles
set photos = jsonb_strip_nulls(
  jsonb_build_object(
    'cover', nullif(btrim(coalesce(avatar_url, '')), ''),
    'establishing', nullif(btrim(coalesce(social_album[1], '')), ''),
    'pack', nullif(btrim(coalesce(social_album[2], '')), ''),
    'solo', nullif(btrim(coalesce(social_album[3], '')), ''),
    'closer', nullif(btrim(coalesce(social_album[4], '')), ''),
    'pack_caption', null,
    'solo_aspect', case
      when nullif(btrim(coalesce(social_album[3], '')), '') is null then null
      else '4:5'
    end
  )
)
where photos = '{}'::jsonb;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
select
  'Profiles',
  'Profiles',
  false,
  12000000,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
where not exists (
  select 1 from storage.buckets where id = 'Profiles'
);

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'profiles_photos_public_read'
  ) then
    create policy profiles_photos_public_read
    on storage.objects for select
    using (bucket_id = 'Profiles');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'profiles_photos_owner_insert'
  ) then
    create policy profiles_photos_owner_insert
    on storage.objects for insert
    with check (
      bucket_id = 'Profiles'
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
      and policyname = 'profiles_photos_owner_update'
  ) then
    create policy profiles_photos_owner_update
    on storage.objects for update
    using (
      bucket_id = 'Profiles'
      and auth.uid() = owner
    )
    with check (
      bucket_id = 'Profiles'
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
      and policyname = 'profiles_photos_owner_delete'
  ) then
    create policy profiles_photos_owner_delete
    on storage.objects for delete
    using (
      bucket_id = 'Profiles'
      and auth.uid() = owner
    );
  end if;
end $$;
