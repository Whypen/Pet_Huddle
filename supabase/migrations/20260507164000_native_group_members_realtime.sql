do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat_room_members'
  ) then
    alter publication supabase_realtime add table public.chat_room_members;
  end if;
end $$;
