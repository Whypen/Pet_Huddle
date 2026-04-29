-- Ensure profiles.avatar_url is browser-ready for canonical profile_photos paths.
-- profiles.photos keeps storage paths like profile_photos/{userId}/cover-....webp.
-- profiles.avatar_url must keep the public URL form for browser/native image rendering.

update public.profiles
set
  avatar_url = 'https://ztrbourwcnhrpmzwlrcn.supabase.co/storage/v1/object/public/profile_photos/' || avatar_url,
  updated_at = now()
where avatar_url like 'profile_photos/%';
