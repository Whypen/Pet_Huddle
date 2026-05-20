create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  bucket text not null,
  object_path text not null,
  owner_id uuid not null,
  content_type text,
  content_id uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  deleted_at timestamptz,
  unique (bucket, object_path)
);

create index if not exists idx_media_assets_owner_created
  on public.media_assets(owner_id, created_at desc);

create index if not exists idx_media_assets_content
  on public.media_assets(content_type, content_id)
  where content_id is not null;

alter table public.media_assets enable row level security;

drop policy if exists "media_assets_owner_read" on public.media_assets;
create policy "media_assets_owner_read"
on public.media_assets
for select
using (owner_id = auth.uid());

drop function if exists public.register_native_media_asset(text, text, text, uuid, timestamptz);

create or replace function public.register_native_media_asset(
  p_bucket text,
  p_object_path text,
  p_content_type text default null,
  p_content_id uuid default null,
  p_expires_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_bucket text := lower(btrim(coalesce(p_bucket, '')));
  v_path text := btrim(coalesce(p_object_path, ''));
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if v_bucket not in ('alerts', 'avatars', 'chat_attachments', 'notices', 'pets', 'profile_photos', 'profiles', 'social_album') then
    raise exception 'invalid_bucket';
  end if;

  v_path := regexp_replace(split_part(v_path, '?', 1), '^/+', '');
  if v_path = '' or v_path like '%..%' then
    raise exception 'invalid_object_path';
  end if;

  if v_path not like v_uid::text || '/%' then
    raise exception 'object_path_owner_mismatch';
  end if;

  insert into public.media_assets(bucket, object_path, owner_id, content_type, content_id, expires_at)
  values (v_bucket, v_path, v_uid, nullif(btrim(coalesce(p_content_type, '')), ''), p_content_id, p_expires_at)
  on conflict (bucket, object_path) do update
    set content_type = coalesce(excluded.content_type, public.media_assets.content_type),
        content_id = coalesce(excluded.content_id, public.media_assets.content_id),
        expires_at = coalesce(excluded.expires_at, public.media_assets.expires_at),
        deleted_at = null
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.register_native_media_asset(text, text, text, uuid, timestamptz) from public, anon;
grant execute on function public.register_native_media_asset(text, text, text, uuid, timestamptz) to authenticated;
