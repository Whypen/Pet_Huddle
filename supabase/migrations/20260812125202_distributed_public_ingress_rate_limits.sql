create table if not exists private.public_ingress_rate_limits (
  scope text not null,
  key_hash text not null,
  window_started_at timestamptz not null,
  request_count integer not null,
  primary key (scope, key_hash)
);

revoke all on table private.public_ingress_rate_limits from public, anon, authenticated;

create or replace function public.consume_public_ingress_rate_limit(
  p_scope text, p_key_hash text, p_limit integer, p_window_seconds integer default 60
)
returns table(allowed boolean, retry_after_seconds integer)
language plpgsql security definer
set search_path = pg_catalog, private, public
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_window interval;
  v_row private.public_ingress_rate_limits%rowtype;
begin
  if p_scope not in ('public-feed', 'public-groups', 'public-alerts', 'share')
     or p_key_hash !~ '^[a-f0-9]{64}$'
     or p_limit < 1 or p_limit > 1000
     or p_window_seconds < 10 or p_window_seconds > 3600 then
    raise exception 'invalid public ingress rate limit input';
  end if;
  v_window := make_interval(secs => p_window_seconds);
  insert into private.public_ingress_rate_limits as limits
    (scope, key_hash, window_started_at, request_count)
  values (p_scope, p_key_hash, v_now, 1)
  on conflict (scope, key_hash) do update set
    window_started_at = case when limits.window_started_at <= v_now - v_window then v_now else limits.window_started_at end,
    request_count = case when limits.window_started_at <= v_now - v_window then 1 else limits.request_count + 1 end
  returning * into v_row;
  allowed := v_row.request_count <= p_limit;
  retry_after_seconds := case when allowed then 0 else greatest(1,
    ceil(extract(epoch from (v_row.window_started_at + v_window - v_now)))::integer) end;
  return next;
end;
$function$;

revoke all on function public.consume_public_ingress_rate_limit(text, text, integer, integer) from public;
revoke all on function public.consume_public_ingress_rate_limit(text, text, integer, integer) from anon, authenticated;
grant execute on function public.consume_public_ingress_rate_limit(text, text, integer, integer) to service_role;

do $do$
declare v_job_id bigint;
begin
  select jobid into v_job_id from cron.job where jobname = 'prune-public-ingress-rate-limits-daily';
  if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
  perform cron.schedule('prune-public-ingress-rate-limits-daily', '29 3 * * *',
    $job$delete from private.public_ingress_rate_limits where window_started_at < now() - interval '1 day';$job$);
end;
$do$;
