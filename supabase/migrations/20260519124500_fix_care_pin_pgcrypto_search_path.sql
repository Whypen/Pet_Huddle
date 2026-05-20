begin;

alter function public.share_service_start_pin(uuid, boolean)
  set search_path = public, extensions;

alter function public.submit_service_checkin(uuid, text, text, boolean)
  set search_path = public, extensions;

commit;
