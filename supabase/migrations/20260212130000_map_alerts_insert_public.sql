-- TEMP: allow insert when creator_id is provided (local dev/UAT)
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'map_alerts'
      and policyname = 'map_alerts_insert_public'
  ) then
    create policy "map_alerts_insert_public"
    on public.map_alerts
    for insert
    to anon, authenticated
    with check (creator_id is not null);
  end if;
end
$$;
