alter table public.presignup_tokens
  add column if not exists signal_key uuid not null default gen_random_uuid();

create unique index if not exists presignup_tokens_signal_key_key
  on public.presignup_tokens (signal_key);

create table if not exists public.presignup_verify_signals (
  signal_key uuid primary key,
  verified_at timestamptz not null default now()
);

alter table public.presignup_verify_signals enable row level security;

drop policy if exists presignup_verify_signals_select on public.presignup_verify_signals;
create policy presignup_verify_signals_select
  on public.presignup_verify_signals
  for select
  to anon, authenticated
  using (true);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'presignup_verify_signals'
  ) then
    alter publication supabase_realtime add table public.presignup_verify_signals;
  end if;
end $$;

comment on table public.presignup_verify_signals is
  'Opaque presignup verification completion signals for native resume. Contains no email, token, or profile data.';
