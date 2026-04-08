-- Enable RLS on PostGIS reference table exposed via PostgREST.
-- Keep read behavior unchanged for client roles.

alter table public.spatial_ref_sys enable row level security;

drop policy if exists "spatial_ref_sys_read_all" on public.spatial_ref_sys;
create policy "spatial_ref_sys_read_all"
on public.spatial_ref_sys
for select
to anon, authenticated
using (true);
