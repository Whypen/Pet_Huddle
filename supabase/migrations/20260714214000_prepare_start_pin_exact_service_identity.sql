begin;

create or replace function public.prepare_service_start_pin_by_service_id(p_service_chat_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
begin
  if not exists (select 1 from public.service_chats where id = p_service_chat_id) then
    raise exception 'service_chat_not_found';
  end if;
  return public.prepare_service_start_pin(p_service_chat_id);
end;
$function$;

revoke all on function public.prepare_service_start_pin_by_service_id(uuid) from public, anon;
grant execute on function public.prepare_service_start_pin_by_service_id(uuid) to authenticated, service_role;

commit;
