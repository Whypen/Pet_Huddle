-- Admin update policy for marketplace_bookings
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'marketplace_bookings'
      and policyname = 'Admins can update all bookings'
  ) then
    create policy "Admins can update all bookings"
      on public.marketplace_bookings
      for update
      using ((auth.jwt() ->> 'role') = 'admin');
  end if;
end $$;

-- Ensure disputed status exists if enum
do $$
declare
  status_type regtype;
begin
  select atttypid::regtype into status_type
  from pg_attribute
  where attrelid = 'public.marketplace_bookings'::regclass
    and attname = 'status';

  if status_type::text like '%marketplace_booking_status%' then
    execute 'alter type ' || status_type::text || ' add value if not exists ''disputed''';
    execute 'alter type ' || status_type::text || ' add value if not exists ''released''';
    execute 'alter type ' || status_type::text || ' add value if not exists ''refunded''';
  end if;
end $$;
