-- Keep broadcast alerts alive through the 7-day retained-dot window.
-- The visibility RPC already exposes marker_state = expired_dot for this period,
-- so physical cleanup must not delete rows at active expiry.

create or replace function public.cleanup_expired_broadcast_alerts()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer := 0;
begin
  delete from public.broadcast_alerts
  where archived_at is not null
     or (
       created_at + make_interval(hours => greatest(1, least(72, duration_hours))) + interval '7 days'
     ) <= now();

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;
