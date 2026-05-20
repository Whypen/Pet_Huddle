create or replace function public.sync_service_chat_after_dispute_resolution()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if new.status like 'resolved%' then
    update public.service_chats
    set status = 'completed',
        care_status = 'completed',
        completed_at = coalesce(completed_at, new.executed_at, new.decision_at, new.updated_at, now()),
        updated_at = now()
    where id = new.service_chat_id
      and (
        coalesce(status, '') <> 'completed'
        or coalesce(care_status, '') <> 'completed'
        or completed_at is null
      );
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_sync_service_chat_after_dispute_resolution on public.service_disputes;

create trigger trg_sync_service_chat_after_dispute_resolution
after insert or update of status, executed_at, decision_at, updated_at
on public.service_disputes
for each row
execute function public.sync_service_chat_after_dispute_resolution();
