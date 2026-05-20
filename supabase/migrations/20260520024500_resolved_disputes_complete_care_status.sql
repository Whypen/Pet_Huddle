update public.service_chats sc
set status = 'completed',
    care_status = 'completed',
    completed_at = coalesce(sc.completed_at, sd.executed_at, sd.decision_at, sd.updated_at, now()),
    updated_at = now()
from public.service_disputes sd
where sd.service_chat_id = sc.id
  and sd.status like 'resolved%'
  and (
    coalesce(sc.status, '') <> 'completed'
    or coalesce(sc.care_status, '') <> 'completed'
    or sc.completed_at is null
  );
