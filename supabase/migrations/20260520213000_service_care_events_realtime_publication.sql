begin;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'service_care_events'
    ) then
      alter publication supabase_realtime add table public.service_care_events;
    end if;
  end if;
end $$;

commit;
