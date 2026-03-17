-- ── Moderation System ────────────────────────────────────────────────────────
-- Tables: user_reports
-- Columns added to profiles: account_status, restriction_expires_at, suspension_expires_at
-- Function: process_user_report(), expire_account_restrictions()

-- ── 1. account_status enum ──────────────────────────────────────────────────
do $$ begin
  create type public.account_status_enum as enum ('active','restricted','suspended','removed');
exception when duplicate_object then null; end $$;

-- ── 2. Add columns to profiles ──────────────────────────────────────────────
alter table public.profiles
  add column if not exists account_status public.account_status_enum
    not null default 'active',
  add column if not exists restriction_expires_at timestamptz,
  add column if not exists suspension_expires_at timestamptz;

-- ── 3. user_reports table ───────────────────────────────────────────────────
create table if not exists public.user_reports (
  id              uuid primary key default gen_random_uuid(),
  reporter_id     uuid not null references public.profiles(id) on delete cascade,
  target_id       uuid not null references public.profiles(id) on delete cascade,
  categories      text[] not null default '{}',
  score           int  not null default 0,
  details         text,
  attachment_urls text[] not null default '{}',
  is_scored       boolean not null default true,
  window_start    timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

-- Prevent duplicate scored reports within a 30-day window per reporter→target
create unique index if not exists user_reports_dedup_idx
  on public.user_reports (reporter_id, target_id)
  where is_scored = true;

-- ── 4. RLS on user_reports ──────────────────────────────────────────────────
alter table public.user_reports enable row level security;

create policy "user_reports_insert"
  on public.user_reports
  for insert
  to authenticated
  with check (reporter_id = auth.uid());

create policy "user_reports_select_own"
  on public.user_reports
  for select
  to authenticated
  using (reporter_id = auth.uid());

-- ── 5. Category weight helper ────────────────────────────────────────────────
create or replace function public.report_category_weight(category text)
returns int
language sql
immutable
as $$
  select case category
    when 'Spam or fake account'                              then 1
    when 'Inappropriate or offensive content'                then 2
    when 'Harassment or bullying'                            then 3
    when 'Impersonation or stolen photos'                    then 4
    when 'Unsafe or harmful behavior (online or in-person)'  then 5
    when 'Scams, money requests, or promotions'              then 5
    when 'Hate, discrimination, or threats'                  then 6
    when 'Other'                                             then 1
    else 1
  end;
$$;

-- ── 6. process_user_report() ─────────────────────────────────────────────────
create or replace function public.process_user_report(
  p_target_id       uuid,
  p_categories      text[],
  p_details         text      default null,
  p_attachment_urls text[]    default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reporter_id        uuid := auth.uid();
  v_base_score         int;
  v_bonus              int := 0;
  v_final_score        int;
  v_rolling_risk       int;
  v_existing_report_id uuid;
  v_report_id          uuid;
  v_new_status         public.account_status_enum;
  v_expires_at         timestamptz;
  v_immediate          boolean := false;
begin
  if v_reporter_id is null then
    raise exception 'auth_required';
  end if;
  if p_target_id is null or p_target_id = v_reporter_id then
    raise exception 'invalid_target';
  end if;
  if array_length(p_categories, 1) is null then
    raise exception 'categories_required';
  end if;

  -- Base score = weight of highest-severity selected category
  select max(public.report_category_weight(c))
  into v_base_score
  from unnest(p_categories) as c;

  v_base_score := coalesce(v_base_score, 1);

  -- Bonus: +2 if attachment, +1 if details >= 20 chars
  if array_length(p_attachment_urls, 1) > 0   then v_bonus := v_bonus + 2; end if;
  if length(coalesce(p_details, '')) >= 20     then v_bonus := v_bonus + 1; end if;

  v_final_score := least(v_base_score + v_bonus, 8);

  -- Immediate action: severe category + attachment evidence
  if array_length(p_attachment_urls, 1) > 0 and (
    'Unsafe or harmful behavior (online or in-person)' = any(p_categories) or
    'Scams, money requests, or promotions'             = any(p_categories) or
    'Hate, discrimination, or threats'                 = any(p_categories)
  ) then
    v_immediate := true;
  end if;

  -- Anti-abuse: check for existing scored report from this reporter→target in last 30d
  select id into v_existing_report_id
  from public.user_reports
  where reporter_id = v_reporter_id
    and target_id   = p_target_id
    and is_scored   = true
    and window_start > (now() - interval '30 days')
  limit 1;

  if v_existing_report_id is not null then
    -- Append evidence only, do not re-score
    update public.user_reports
    set
      attachment_urls = attachment_urls || coalesce(p_attachment_urls, '{}'),
      details = coalesce(details, '') || E'\n---\n' || coalesce(p_details, '')
    where id = v_existing_report_id;
    return jsonb_build_object('action', 'evidence_appended', 'report_id', v_existing_report_id);
  end if;

  -- Insert scored report
  insert into public.user_reports
    (reporter_id, target_id, categories, score, details, attachment_urls, is_scored, window_start)
  values
    (v_reporter_id, p_target_id, p_categories, v_final_score, p_details, coalesce(p_attachment_urls, '{}'), true, now())
  returning id into v_report_id;

  -- Rolling 30-day risk for target
  select coalesce(sum(score), 0)
  into v_rolling_risk
  from public.user_reports
  where target_id  = p_target_id
    and is_scored  = true
    and window_start > (now() - interval '30 days');

  -- Determine enforcement action
  if v_immediate then
    -- Immediate: 72h suspend
    v_new_status := 'suspended';
    v_expires_at := now() + interval '72 hours';
  elsif v_rolling_risk between 5 and 6 then
    v_new_status := 'restricted';
    v_expires_at := now() + interval '24 hours';
  elsif v_rolling_risk between 7 and 8 then
    v_new_status := 'restricted';
    v_expires_at := now() + interval '72 hours';
  elsif v_rolling_risk between 9 and 11 then
    v_new_status := 'suspended';
    v_expires_at := now() + interval '7 days';
  elsif v_rolling_risk between 12 and 14 then
    v_new_status := 'suspended';
    v_expires_at := now() + interval '30 days';
  elsif v_rolling_risk >= 15 then
    v_new_status := 'removed';
    v_expires_at := null;
  end if;

  -- Apply to profile (only escalate, never de-escalate automatically)
  if v_new_status is not null then
    update public.profiles
    set
      account_status = case
        when account_status = 'removed'   then 'removed'
        when account_status = 'suspended' and v_new_status = 'restricted' then 'suspended'
        else v_new_status
      end,
      restriction_expires_at = case
        when v_new_status = 'restricted' then v_expires_at
        else restriction_expires_at
      end,
      suspension_expires_at = case
        when v_new_status = 'suspended' then v_expires_at
        when v_new_status = 'removed'   then null
        else suspension_expires_at
      end
    where id = p_target_id;
  end if;

  return jsonb_build_object(
    'action',       coalesce(v_new_status::text, 'none'),
    'report_id',    v_report_id,
    'score',        v_final_score,
    'rolling_risk', v_rolling_risk
  );
end;
$$;
grant execute on function public.process_user_report(uuid, text[], text, text[]) to authenticated;

-- ── 7. Auto-expire restrictions/suspensions ──────────────────────────────────
create or replace function public.expire_account_restrictions()
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles
  set
    account_status = 'active',
    restriction_expires_at = null
  where account_status = 'restricted'
    and restriction_expires_at is not null
    and restriction_expires_at < now();

  update public.profiles
  set
    account_status = 'active',
    suspension_expires_at = null
  where account_status = 'suspended'
    and suspension_expires_at is not null
    and suspension_expires_at < now();
$$;
grant execute on function public.expire_account_restrictions() to authenticated;
