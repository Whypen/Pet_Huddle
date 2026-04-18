-- Link preview cache: server-side OG metadata storage keyed by URL hash.
-- Eliminates per-mount edge function roundtrip; previews paint instantly when cached.

create table if not exists public.link_preview_cache (
  url_hash    text primary key,
  url         text not null,
  payload     jsonb not null,
  fetched_at  timestamptz not null default now()
);

create index if not exists link_preview_cache_fetched_at_idx
  on public.link_preview_cache (fetched_at desc);

alter table public.link_preview_cache enable row level security;

drop policy if exists "link_preview_cache_read_all" on public.link_preview_cache;
create policy "link_preview_cache_read_all"
  on public.link_preview_cache
  for select
  to authenticated
  using (true);

drop policy if exists "link_preview_cache_upsert_auth" on public.link_preview_cache;
create policy "link_preview_cache_upsert_auth"
  on public.link_preview_cache
  for insert
  to authenticated
  with check (true);

drop policy if exists "link_preview_cache_update_auth" on public.link_preview_cache;
create policy "link_preview_cache_update_auth"
  on public.link_preview_cache
  for update
  to authenticated
  using (true)
  with check (true);

grant select, insert, update on public.link_preview_cache to authenticated;
