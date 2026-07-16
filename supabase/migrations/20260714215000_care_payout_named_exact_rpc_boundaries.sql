begin;

create or replace function public.claim_service_payout_release_by_service_id(p_service_chat_id uuid, p_lock_token text)
returns jsonb language plpgsql security definer set search_path = public as $function$
begin
  if not exists (select 1 from public.service_chats where id = p_service_chat_id) then raise exception 'service_chat_not_found'; end if;
  return public.claim_service_payout_release(p_service_chat_id, p_lock_token);
end;
$function$;

create or replace function public.unlock_service_payout_release_by_service_id(p_service_chat_id uuid, p_lock_token text)
returns void language plpgsql security definer set search_path = public as $function$
begin
  if not exists (select 1 from public.service_chats where id = p_service_chat_id) then raise exception 'service_chat_not_found'; end if;
  perform public.unlock_service_payout_release(p_service_chat_id, p_lock_token);
end;
$function$;

create or replace function public.mark_service_payout_release_failed_by_service_id(p_service_chat_id uuid, p_lock_token text, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $function$
begin
  if not exists (select 1 from public.service_chats where id = p_service_chat_id) then raise exception 'service_chat_not_found'; end if;
  return public.mark_service_payout_release_failed(p_service_chat_id, p_lock_token, p_reason);
end;
$function$;

create or replace function public.mark_service_payout_manual_recovery_by_service_id(
  p_service_chat_id uuid,
  p_lock_token text,
  p_reason text,
  p_stripe_transfer_id text default null
)
returns jsonb language plpgsql security definer set search_path = public as $function$
begin
  if not exists (select 1 from public.service_chats where id = p_service_chat_id) then raise exception 'service_chat_not_found'; end if;
  return public.mark_service_payout_manual_recovery(p_service_chat_id, p_lock_token, p_reason, p_stripe_transfer_id);
end;
$function$;

create or replace function public.mark_service_payout_released_by_service_id(p_service_chat_id uuid, p_lock_token text, p_stripe_transfer_id text)
returns jsonb language plpgsql security definer set search_path = public as $function$
begin
  if not exists (select 1 from public.service_chats where id = p_service_chat_id) then raise exception 'service_chat_not_found'; end if;
  return public.mark_service_payout_released(p_service_chat_id, p_lock_token, p_stripe_transfer_id);
end;
$function$;

revoke all on function public.claim_service_payout_release_by_service_id(uuid, text) from public, anon, authenticated;
revoke all on function public.unlock_service_payout_release_by_service_id(uuid, text) from public, anon, authenticated;
revoke all on function public.mark_service_payout_release_failed_by_service_id(uuid, text, text) from public, anon, authenticated;
revoke all on function public.mark_service_payout_manual_recovery_by_service_id(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.mark_service_payout_released_by_service_id(uuid, text, text) from public, anon, authenticated;

grant execute on function public.claim_service_payout_release_by_service_id(uuid, text) to service_role;
grant execute on function public.unlock_service_payout_release_by_service_id(uuid, text) to service_role;
grant execute on function public.mark_service_payout_release_failed_by_service_id(uuid, text, text) to service_role;
grant execute on function public.mark_service_payout_manual_recovery_by_service_id(uuid, text, text, text) to service_role;
grant execute on function public.mark_service_payout_released_by_service_id(uuid, text, text) to service_role;

commit;
