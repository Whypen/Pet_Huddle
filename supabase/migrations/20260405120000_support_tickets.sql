-- Support tickets table
create sequence if not exists support_ticket_seq start 1;

create or replace function next_ticket_number()
returns text language plpgsql as $$
begin
  return 'HUD-' || lpad(nextval('support_ticket_seq')::text, 6, '0');
end;
$$;

create table if not exists support_tickets (
  id              uuid primary key default gen_random_uuid(),
  ticket_number   text unique not null,
  user_id         uuid references public.profiles(id) on delete set null,
  name            text not null,
  email           text not null,
  subject         text not null,
  message         text not null,
  wants_reply     boolean not null default false,
  status          text not null default 'open',
  created_at      timestamptz not null default now()
);

create or replace function set_ticket_number()
returns trigger language plpgsql as $$
begin
  if new.ticket_number is null or new.ticket_number = '' then
    new.ticket_number := next_ticket_number();
  end if;
  return new;
end;
$$;

create trigger trg_set_ticket_number
  before insert on support_tickets
  for each row execute function set_ticket_number();

alter table support_tickets enable row level security;

-- Unauthenticated (anon) and authenticated users may insert.
-- No public read, update, or delete.
create policy "support_tickets_insert"
  on support_tickets for insert
  to anon, authenticated
  with check (true);

-- Service role bypasses RLS — used by edge function for admin reads (digest).
