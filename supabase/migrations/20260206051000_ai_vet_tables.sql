-- AI Vet conversations + rate limits
create table if not exists public.ai_vet_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  pet_id uuid references public.pets(id) on delete set null,
  messages jsonb not null default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.ai_vet_rate_limits (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  tokens integer not null default 50,
  last_refill timestamptz not null default now()
);

alter table public.ai_vet_conversations enable row level security;
alter table public.ai_vet_rate_limits enable row level security;

create policy ai_vet_conversations_owner_select
on public.ai_vet_conversations for select
using (auth.uid() = user_id);

create policy ai_vet_conversations_owner_insert
on public.ai_vet_conversations for insert
with check (auth.uid() = user_id);

create policy ai_vet_conversations_owner_update
on public.ai_vet_conversations for update
using (auth.uid() = user_id);

create policy ai_vet_rate_limits_owner_select
on public.ai_vet_rate_limits for select
using (auth.uid() = user_id);

create policy ai_vet_rate_limits_owner_upsert
on public.ai_vet_rate_limits for insert
with check (auth.uid() = user_id);
