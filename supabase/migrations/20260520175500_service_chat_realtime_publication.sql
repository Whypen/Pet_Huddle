begin;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'service_chats'
    ) then
      alter publication supabase_realtime add table public.service_chats;
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'service_disputes'
    ) then
      alter publication supabase_realtime add table public.service_disputes;
    end if;

  end if;
end $$;

commit;
