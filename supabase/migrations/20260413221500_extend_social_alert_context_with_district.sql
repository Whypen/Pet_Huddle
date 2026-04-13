-- Extend social alert context for map action label and deep-link resilience.

drop function if exists public.get_social_feed_alert_context(uuid[]);

create or replace function public.get_social_feed_alert_context(p_thread_ids uuid[])
returns table(
  thread_id uuid,
  map_id uuid,
  alert_type text,
  location_district text
)
language sql
security definer
set search_path = public
as $$
  with base as (
    select t.id as thread_id, t.map_id
    from public.threads t
    where t.id = any(coalesce(p_thread_ids, array[]::uuid[]))
  ),
  by_map as (
    select
      b.thread_id,
      b.map_id,
      ba.id as alert_id,
      ba.type,
      coalesce(
        nullif(btrim(coalesce(to_jsonb(ba)->>'location_district', '')), ''),
        nullif(
          btrim(
            case
              when strpos(coalesce(ba.address, ''), ',') > 0
                then split_part(split_part(ba.address, ',', 2), ',', 1)
              else ba.address
            end
          ),
          ''
        ),
        nullif(btrim(ba.address), '')
      ) as location_district
    from base b
    left join public.broadcast_alerts ba on ba.id = b.map_id
  ),
  by_thread as (
    select
      b.thread_id,
      ba.id as alert_id,
      ba.type,
      coalesce(
        nullif(btrim(coalesce(to_jsonb(ba)->>'location_district', '')), ''),
        nullif(
          btrim(
            case
              when strpos(coalesce(ba.address, ''), ',') > 0
                then split_part(split_part(ba.address, ',', 2), ',', 1)
              else ba.address
            end
          ),
          ''
        ),
        nullif(btrim(ba.address), '')
      ) as location_district,
      row_number() over (partition by b.thread_id order by ba.created_at desc, ba.id desc) as rn
    from base b
    left join public.broadcast_alerts ba on ba.thread_id = b.thread_id
  )
  select
    b.thread_id,
    coalesce(
      bt.alert_id,
      case when b.alert_id is not null then b.map_id else null end
    ) as map_id,
    coalesce(
      nullif(bt.type, ''),
      nullif(b.type, ''),
      null
    ) as alert_type,
    coalesce(
      nullif(bt.location_district, ''),
      nullif(b.location_district, ''),
      null
    ) as location_district
  from by_map b
  left join by_thread bt on bt.thread_id = b.thread_id and bt.rn = 1;
$$;

revoke all on function public.get_social_feed_alert_context(uuid[]) from public;
grant execute on function public.get_social_feed_alert_context(uuid[]) to authenticated;
grant execute on function public.get_social_feed_alert_context(uuid[]) to service_role;
