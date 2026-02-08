-- Consent audit log for legal compliance (GDPR/CCPA/FTC transparency)

create table if not exists public.consent_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  consent_type text not null check (consent_type in ('terms_privacy')),
  consent_version text not null default 'v2.0',
  accepted_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_consent_logs_user_id on public.consent_logs(user_id, accepted_at desc);

alter table public.consent_logs enable row level security;

drop policy if exists "consent_logs_read_own" on public.consent_logs;
create policy "consent_logs_read_own"
on public.consent_logs
for select
using (auth.uid() = user_id);

drop policy if exists "consent_logs_insert_own" on public.consent_logs;
create policy "consent_logs_insert_own"
on public.consent_logs
for insert
with check (auth.uid() = user_id);

drop policy if exists "consent_logs_service_role_all" on public.consent_logs;
create policy "consent_logs_service_role_all"
on public.consent_logs
for all
using ((auth.jwt() ->> 'role') = 'service_role')
with check ((auth.jwt() ->> 'role') = 'service_role');

