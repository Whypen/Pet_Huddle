-- Phase 6: dispute lifecycle + payout hold integration (service flow only)
-- - Canonical dispute statuses
-- - Ensure scheduled payout sweep never enqueues unresolved or hold/refund-finalized disputes

update public.service_disputes
set status = 'resolved_hold'
where status in ('resolved', 'closed');

alter table public.service_disputes
  drop constraint if exists service_disputes_status_check;

alter table public.service_disputes
  add constraint service_disputes_status_check
  check (
    status = any (
      array[
        'open'::text,
        'awaiting_evidence'::text,
        'under_review'::text,
        'decision_ready'::text,
        'resolved_hold'::text,
        'resolved_release_full'::text,
        'resolved_partial_refund'::text,
        'resolved_refund_full'::text
      ]
    )
  );

create or replace function public.process_service_payout_releases()
returns integer
language plpgsql
security definer
set search_path = public
as $function$
declare
  rec record;
  v_enqueued int := 0;
begin
  for rec in
    select sc.chat_id
    from public.service_chats sc
    where sc.status = 'completed'
      and sc.payout_release_requested_at is not null
      and sc.payout_released_at is null
      and (
        sc.payout_release_attempted_at is null
        or sc.payout_release_attempted_at <= now() - interval '2 minutes'
      )
      and not exists (
        select 1
        from public.service_disputes sd
        where sd.service_chat_id = sc.id
          and sd.status = any (
            array[
              'open'::text,
              'awaiting_evidence'::text,
              'under_review'::text,
              'decision_ready'::text,
              'resolved_hold'::text,
              'resolved_refund_full'::text
            ]
          )
      )
  loop
    update public.service_chats
    set payout_release_attempted_at = now(),
        updated_at = now()
    where chat_id = rec.chat_id;

    perform net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/release-service-payout',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object('service_chat_id', rec.chat_id)
    );
    v_enqueued := v_enqueued + 1;
  end loop;

  return v_enqueued;
end;
$function$;
