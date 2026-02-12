-- Grants and RLS for map_alerts (UAT unblock)
grant usage on schema public to authenticated;
grant insert, select, update, delete on public.map_alerts to authenticated;
grant usage, select on all sequences in schema public to authenticated;

alter table public.map_alerts enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'map_alerts'
      and policyname = 'map_alerts_insert_auth_only'
  ) then
    create policy "map_alerts_insert_auth_only"
    on public.map_alerts
    for insert
    to authenticated
    with check (creator_id = auth.uid());
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'map_alerts'
      and policyname = 'map_alerts_select_auth'
  ) then
    create policy "map_alerts_select_auth"
    on public.map_alerts
    for select
    to authenticated
    using (true);
  end if;
end
$$;
