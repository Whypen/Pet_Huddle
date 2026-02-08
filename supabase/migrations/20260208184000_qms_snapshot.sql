-- Contract v2.0: expose a safe quota snapshot for the authenticated user (supports UI gating)

create or replace function public.get_quota_snapshot()
returns table(
  effective_tier text,
  pool_owner_id uuid,
  thread_posts_today int,
  discovery_profiles_today int,
  ai_vet_uploads_today int,
  stars_month_used int,
  broadcast_week_used int,
  broadcast_month_used int,
  priority_analyses_month_used int,
  extras_stars int,
  extras_ai_vet_uploads int,
  extras_broadcasts int
)
language plpgsql
security definer
as $$
declare
  u_id uuid := auth.uid();
  owner_id uuid;
  tier text;
begin
  if u_id is null then
    return;
  end if;

  owner_id := public._qms_get_pool_owner(u_id);
  tier := public._qms_effective_tier(owner_id);
  if tier <> 'gold' then
    owner_id := u_id;
    tier := public._qms_effective_tier(owner_id);
  end if;

  perform public._qms_touch_row(owner_id);

  return query
  select
    tier,
    owner_id,
    uq.thread_posts_today,
    uq.discovery_profiles_today,
    uq.ai_vet_uploads_today,
    uq.stars_month_used,
    uq.broadcast_week_used,
    uq.broadcast_month_used,
    uq.priority_analyses_month_used,
    uq.extras_stars,
    uq.extras_ai_vet_uploads,
    uq.extras_broadcasts
  from public.user_quotas uq
  where uq.user_id = owner_id;
end;
$$;

revoke all on function public.get_quota_snapshot() from anon;
grant execute on function public.get_quota_snapshot() to authenticated;
grant execute on function public.get_quota_snapshot() to service_role;

