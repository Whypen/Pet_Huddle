-- Marketplace status + escrow alignment for SPEC

alter table public.marketplace_bookings
  add column if not exists stripe_charge_id text;

alter table public.marketplace_bookings
  add column if not exists location_name text;

do $$
declare
  conname text;
begin
  select conname into conname
  from pg_constraint
  where conrelid = 'public.marketplace_bookings'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%status%';

  if conname is not null then
    execute format('alter table public.marketplace_bookings drop constraint %I', conname);
  end if;
end $$;

alter table public.marketplace_bookings
  add constraint marketplace_bookings_status_check
  check (status in ('pending','confirmed','in_progress','completed','disputed','refunded'));

create or replace function public.release_escrow_funds()
returns void
language plpgsql
security definer
as $$
declare
  booking_record record;
begin
  for booking_record in
    select *
    from public.marketplace_bookings
    where status in ('confirmed','in_progress')
      and escrow_release_date <= now()
      and escrow_status = 'pending'
  loop
    update public.marketplace_bookings
    set
      status = 'completed',
      escrow_status = 'released',
      updated_at = now()
    where id = booking_record.id;
  end loop;
end;
$$;
