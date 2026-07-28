begin;

-- Huddle Growth Agent control plane.  Tokens and inbound Meta records are
-- intentionally isolated from ordinary user/social tables.  Browser clients
-- receive only security-definer projections; encrypted token material is
-- service-role-only.

create table if not exists public.huddle_growth_connections (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('meta', 'threads', 'whatsapp')),
  external_user_id text not null,
  display_name text,
  status text not null default 'active' check (status in ('active', 'degraded', 'revoked', 'error')),
  encrypted_access_token text,
  access_token_iv text,
  token_expires_at timestamptz,
  granted_scopes text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  last_error text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, external_user_id)
);

create table if not exists public.huddle_growth_assets (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.huddle_growth_connections(id) on delete cascade,
  asset_type text not null check (asset_type in ('facebook_page', 'instagram_business', 'threads_profile', 'ad_account', 'whatsapp_business', 'whatsapp_phone')),
  external_id text not null,
  name text,
  status text not null default 'active' check (status in ('active', 'inactive', 'error')),
  encrypted_access_token text,
  access_token_iv text,
  token_expires_at timestamptz,
  granted_scopes text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, asset_type, external_id)
);

create table if not exists public.huddle_growth_content (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('threads', 'instagram', 'facebook', 'messenger', 'whatsapp')),
  asset_id uuid references public.huddle_growth_assets(id) on delete set null,
  campaign_name text,
  objective text,
  content_type text not null default 'text' check (content_type in ('text', 'image', 'video', 'carousel', 'reel', 'story', 'template')),
  body jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'awaiting_approval', 'scheduled', 'publishing', 'published', 'failed', 'deleted')),
  scheduled_at timestamptz,
  published_at timestamptz,
  external_id text,
  performance jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  approved_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.huddle_growth_actions (
  id uuid primary key default gen_random_uuid(),
  action_type text not null,
  platform text check (platform in ('threads', 'instagram', 'facebook', 'messenger', 'whatsapp', 'ads', 'system')),
  asset_id uuid references public.huddle_growth_assets(id) on delete set null,
  content_id uuid references public.huddle_growth_content(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  risk_level text not null default 'routine' check (risk_level in ('routine', 'bounded_optimisation', 'high')),
  status text not null default 'queued' check (status in ('queued', 'awaiting_approval', 'running', 'succeeded', 'failed', 'cancelled')),
  idempotency_key text not null,
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 20),
  next_retry_at timestamptz not null default now(),
  requested_by uuid references public.profiles(id) on delete set null,
  approved_by uuid references public.profiles(id) on delete set null,
  started_at timestamptz,
  completed_at timestamptz,
  last_error text,
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (idempotency_key)
);

create table if not exists public.huddle_growth_approvals (
  id uuid primary key default gen_random_uuid(),
  action_id uuid not null references public.huddle_growth_actions(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'expired')),
  note text,
  requested_by uuid references public.profiles(id) on delete set null,
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (action_id)
);

create table if not exists public.huddle_growth_budget_policies (
  id boolean primary key default true check (id),
  emergency_stop boolean not null default false,
  daily_spend_cap_minor bigint not null default 0 check (daily_spend_cap_minor >= 0),
  monthly_spend_cap_minor bigint not null default 0 check (monthly_spend_cap_minor >= 0),
  max_auto_budget_increase_percent numeric(5,2) not null default 10 check (max_auto_budget_increase_percent between 0 and 100),
  auto_pause_enabled boolean not null default true,
  auto_pause_ctr_threshold numeric(12,4) not null default 0,
  auto_pause_cpl_threshold_minor bigint,
  allowed_actions text[] not null default array['draft','analyse','schedule','publish_text','routine_reply','bounded_pause']::text[],
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.huddle_growth_budget_policies (id)
values (true)
on conflict (id) do nothing;

create table if not exists public.huddle_growth_leads (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid references public.huddle_growth_assets(id) on delete set null,
  external_lead_id text not null,
  source text not null default 'meta_lead_ads',
  status text not null default 'new' check (status in ('new', 'qualified', 'routed', 'contacted', 'converted', 'discarded')),
  tags text[] not null default '{}',
  data jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (source, external_lead_id)
);

create table if not exists public.huddle_growth_performance (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid references public.huddle_growth_assets(id) on delete cascade,
  platform text not null,
  external_id text,
  period_start date not null,
  period_end date not null,
  metrics jsonb not null default '{}'::jsonb,
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  unique (asset_id, external_id, period_start, period_end)
);

create table if not exists public.huddle_growth_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  external_event_id text not null,
  event_type text,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  unique (provider, external_event_id)
);

create table if not exists public.huddle_growth_oauth_states (
  id uuid primary key default gen_random_uuid(),
  state_hash text not null unique,
  provider text not null check (provider in ('meta', 'threads')),
  created_by uuid not null references public.profiles(id) on delete cascade,
  redirect_uri text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.huddle_growth_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action_id uuid references public.huddle_growth_actions(id) on delete set null,
  connection_id uuid references public.huddle_growth_connections(id) on delete set null,
  action text not null,
  platform text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists huddle_growth_actions_queue_idx
  on public.huddle_growth_actions (status, next_retry_at, created_at);
create index if not exists huddle_growth_audit_created_idx
  on public.huddle_growth_audit_logs (created_at desc);
create index if not exists huddle_growth_performance_lookup_idx
  on public.huddle_growth_performance (platform, period_end desc);
create index if not exists huddle_growth_webhook_created_idx
  on public.huddle_growth_webhook_events (created_at desc);

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'huddle_growth_connections', 'huddle_growth_assets', 'huddle_growth_content',
    'huddle_growth_actions', 'huddle_growth_approvals', 'huddle_growth_budget_policies',
    'huddle_growth_leads', 'huddle_growth_performance', 'huddle_growth_webhook_events',
    'huddle_growth_audit_logs', 'huddle_growth_oauth_states'
  ] loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format('revoke all on table public.%I from public, anon, authenticated', v_table);
  end loop;
end $$;

create or replace function public.huddle_growth_require_admin()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_actor uuid := auth.uid();
begin
  if v_actor is null or not public.is_huddle_admin_user(v_actor) then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  return v_actor;
end;
$$;

revoke all on function public.huddle_growth_require_admin() from public, anon;
grant execute on function public.huddle_growth_require_admin() to authenticated, service_role;

create or replace function public.huddle_growth_get_console()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_actor uuid := public.huddle_growth_require_admin();
begin
  return jsonb_build_object(
    'connections', coalesce((select jsonb_agg(jsonb_build_object(
      'id', c.id, 'provider', c.provider, 'external_user_id', c.external_user_id,
      'display_name', c.display_name, 'status', c.status,
      'token_expires_at', c.token_expires_at, 'granted_scopes', c.granted_scopes,
      'metadata', c.metadata, 'last_synced_at', c.last_synced_at, 'last_error', c.last_error,
      'created_at', c.created_at, 'updated_at', c.updated_at
    ) order by c.created_at desc) from public.huddle_growth_connections c), '[]'::jsonb),
    'assets', coalesce((select jsonb_agg(to_jsonb(a) order by a.updated_at desc) from public.huddle_growth_assets a), '[]'::jsonb),
    'actions', coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at desc) from public.huddle_growth_actions a where a.status in ('queued','awaiting_approval','running','failed') limit 100), '[]'::jsonb),
    'approvals', coalesce((select jsonb_agg(to_jsonb(ap) order by ap.created_at desc) from public.huddle_growth_approvals ap where ap.status = 'pending' limit 100), '[]'::jsonb),
    'policy', (select to_jsonb(p) - 'id' from public.huddle_growth_budget_policies p where p.id = true),
    'audit', coalesce((select jsonb_agg(to_jsonb(l) order by l.created_at desc) from public.huddle_growth_audit_logs l limit 100), '[]'::jsonb)
  );
end;
$$;

create or replace function public.huddle_growth_queue_action(
  p_action_type text,
  p_platform text,
  p_payload jsonb,
  p_risk_level text default 'routine',
  p_idempotency_key text default null,
  p_asset_id uuid default null,
  p_content_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public.huddle_growth_require_admin();
  v_key text := coalesce(nullif(btrim(p_idempotency_key), ''), encode(gen_random_bytes(16), 'hex'));
  v_id uuid;
  v_status text := case when p_risk_level = 'high' then 'awaiting_approval' else 'queued' end;
begin
  if p_action_type is null or btrim(p_action_type) = '' then raise exception 'action_type_required'; end if;
  if p_risk_level not in ('routine','bounded_optimisation','high') then raise exception 'invalid_risk_level'; end if;
  insert into public.huddle_growth_actions (action_type, platform, asset_id, content_id, payload, risk_level, status, idempotency_key, requested_by)
  values (p_action_type, nullif(p_platform, ''), p_asset_id, p_content_id, coalesce(p_payload, '{}'::jsonb), p_risk_level, v_status, v_key, v_actor)
  on conflict (idempotency_key) do update set updated_at = now()
  returning id into v_id;
  if v_status = 'awaiting_approval' then
    insert into public.huddle_growth_approvals (action_id, requested_by)
    values (v_id, v_actor)
    on conflict (action_id) do nothing;
  end if;
  insert into public.huddle_growth_audit_logs (actor_id, action_id, action, platform, details)
  values (v_actor, v_id, 'action_queued', p_platform, jsonb_build_object('risk_level', p_risk_level, 'idempotency_key', v_key));
  return v_id;
end;
$$;

create or replace function public.huddle_growth_decide_action(p_action_id uuid, p_approved boolean, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public.huddle_growth_require_admin();
  v_status text := case when p_approved then 'approved' else 'rejected' end;
begin
  if p_action_id is null then raise exception 'action_required'; end if;
  update public.huddle_growth_approvals
  set status = v_status, note = p_note, decided_by = v_actor, decided_at = now()
  where action_id = p_action_id and status = 'pending';
  if not found then raise exception 'approval_not_pending'; end if;
  update public.huddle_growth_actions
  set status = case when p_approved then 'queued' else 'cancelled' end,
      approved_by = case when p_approved then v_actor else null end,
      updated_at = now()
  where id = p_action_id and status = 'awaiting_approval';
  insert into public.huddle_growth_audit_logs (actor_id, action_id, action, details)
  values (v_actor, p_action_id, case when p_approved then 'action_approved' else 'action_rejected' end, jsonb_build_object('note', p_note));
  return jsonb_build_object('action_id', p_action_id, 'status', case when p_approved then 'queued' else 'cancelled' end);
end;
$$;

create or replace function public.huddle_growth_update_policy(
  p_emergency_stop boolean,
  p_daily_spend_cap_minor bigint,
  p_monthly_spend_cap_minor bigint,
  p_max_auto_budget_increase_percent numeric,
  p_auto_pause_enabled boolean,
  p_auto_pause_ctr_threshold numeric,
  p_auto_pause_cpl_threshold_minor bigint,
  p_allowed_actions text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_actor uuid := public.huddle_growth_require_admin(); v_policy public.huddle_growth_budget_policies%rowtype;
begin
  if p_daily_spend_cap_minor < 0 or p_monthly_spend_cap_minor < 0 then raise exception 'invalid_spend_cap'; end if;
  update public.huddle_growth_budget_policies set
    emergency_stop = coalesce(p_emergency_stop, emergency_stop),
    daily_spend_cap_minor = coalesce(p_daily_spend_cap_minor, daily_spend_cap_minor),
    monthly_spend_cap_minor = coalesce(p_monthly_spend_cap_minor, monthly_spend_cap_minor),
    max_auto_budget_increase_percent = coalesce(p_max_auto_budget_increase_percent, max_auto_budget_increase_percent),
    auto_pause_enabled = coalesce(p_auto_pause_enabled, auto_pause_enabled),
    auto_pause_ctr_threshold = coalesce(p_auto_pause_ctr_threshold, auto_pause_ctr_threshold),
    auto_pause_cpl_threshold_minor = p_auto_pause_cpl_threshold_minor,
    allowed_actions = coalesce(p_allowed_actions, allowed_actions),
    updated_by = v_actor, updated_at = now()
  where id = true returning * into v_policy;
  insert into public.huddle_growth_audit_logs (actor_id, action, details)
  values (v_actor, 'policy_updated', jsonb_build_object('emergency_stop', v_policy.emergency_stop, 'daily_spend_cap_minor', v_policy.daily_spend_cap_minor, 'monthly_spend_cap_minor', v_policy.monthly_spend_cap_minor));
  return to_jsonb(v_policy) - 'id';
end;
$$;

revoke all on function public.huddle_growth_get_console() from public, anon;
revoke all on function public.huddle_growth_queue_action(text,text,jsonb,text,text,uuid,uuid) from public, anon;
revoke all on function public.huddle_growth_decide_action(uuid,boolean,text) from public, anon;
revoke all on function public.huddle_growth_update_policy(boolean,bigint,bigint,numeric,boolean,numeric,bigint,text[]) from public, anon;
grant execute on function public.huddle_growth_get_console() to authenticated, service_role;
grant execute on function public.huddle_growth_queue_action(text,text,jsonb,text,text,uuid,uuid) to authenticated, service_role;
grant execute on function public.huddle_growth_decide_action(uuid,boolean,text) to authenticated, service_role;
grant execute on function public.huddle_growth_update_policy(boolean,bigint,bigint,numeric,boolean,numeric,bigint,text[]) to authenticated, service_role;

commit;
