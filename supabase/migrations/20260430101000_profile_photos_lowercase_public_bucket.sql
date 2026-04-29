-- Move editorial profile photos to the canonical lowercase public bucket.
-- The old "Profiles" bucket was private at bucket level but had public read RLS,
-- which made the access model incoherent and kept a case-sensitive bucket footgun.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
select
  'profile_photos',
  'profile_photos',
  true,
  12000000,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
where not exists (
  select 1 from storage.buckets where id = 'profile_photos'
);

drop policy if exists profiles_photos_public_read on storage.objects;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'profile_photos_public_read'
  ) then
    create policy profile_photos_public_read
    on storage.objects for select
    using (bucket_id = 'profile_photos');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'profile_photos_owner_insert'
  ) then
    create policy profile_photos_owner_insert
    on storage.objects for insert
    with check (
      bucket_id = 'profile_photos'
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
      and policyname = 'profile_photos_owner_update'
  ) then
    create policy profile_photos_owner_update
    on storage.objects for update
    using (
      bucket_id = 'profile_photos'
      and auth.uid() = owner
    )
    with check (
      bucket_id = 'profile_photos'
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
      and policyname = 'profile_photos_owner_delete'
  ) then
    create policy profile_photos_owner_delete
    on storage.objects for delete
    using (
      bucket_id = 'profile_photos'
      and auth.uid() = owner
    );
  end if;
end $$;

update storage.objects existing
set
  bucket_id = 'profile_photos',
  name = regexp_replace(existing.name, '^Profiles/', 'profile_photos/')
where existing.bucket_id = 'Profiles'
  and existing.name like 'Profiles/%'
  and not exists (
    select 1
    from storage.objects target
    where target.bucket_id = 'profile_photos'
      and target.name = regexp_replace(existing.name, '^Profiles/', 'profile_photos/')
  );

create or replace function pg_temp.rewrite_profile_photo_path(value text)
returns text
language sql
immutable
as $$
  select case
    when value like 'Profiles/%' then regexp_replace(value, '^Profiles/', 'profile_photos/')
    else value
  end
$$;

update public.profiles
set photos = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          photos,
          '{cover}',
          to_jsonb(pg_temp.rewrite_profile_photo_path(photos->>'cover')),
          false
        ),
        '{establishing}',
        to_jsonb(pg_temp.rewrite_profile_photo_path(photos->>'establishing')),
        false
      ),
      '{pack}',
      to_jsonb(pg_temp.rewrite_profile_photo_path(photos->>'pack')),
      false
    ),
    '{solo}',
    to_jsonb(pg_temp.rewrite_profile_photo_path(photos->>'solo')),
    false
  ),
  '{closer}',
  to_jsonb(pg_temp.rewrite_profile_photo_path(photos->>'closer')),
  false
)
where photos::text like '%Profiles/%';

update public.profiles p
set social_album = rewritten.album_values
from (
  select
    id,
    array_agg(
      case
        when item like 'Profiles/%' then regexp_replace(item, '^Profiles/', 'profile_photos/')
        else item
      end
      order by ordinality
    ) as album_values
  from public.profiles
  cross join unnest(social_album) with ordinality as album(item, ordinality)
  where social_album is not null
  group by id
) rewritten
where p.id = rewritten.id
  and p.social_album::text like '%Profiles/%';
