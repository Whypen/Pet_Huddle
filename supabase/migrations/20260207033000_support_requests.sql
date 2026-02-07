create table if not exists public.support_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  subject text,
  message text not null,
  email text,
  created_at timestamptz default now()
);

alter table public.support_requests enable row level security;

create policy support_requests_insert
on public.support_requests for insert
with check (auth.uid() = user_id);

create policy support_requests_admin_select
on public.support_requests for select
using ((auth.jwt() ->> 'role') = 'admin');
