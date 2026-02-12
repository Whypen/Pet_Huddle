-- Allow authenticated users to insert their own map alerts
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'map_alerts'
      and policyname = 'map_alerts_insert_auth'
  ) then
    create policy "map_alerts_insert_auth"
    on public.map_alerts
    for insert
    to authenticated
    with check (creator_id = auth.uid());
  end if;
end
$$;

grant insert on public.map_alerts to authenticated;
