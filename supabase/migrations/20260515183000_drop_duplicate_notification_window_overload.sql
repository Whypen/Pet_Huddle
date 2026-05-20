drop function if exists public.upsert_notification_window(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  uuid,
  text
);

revoke all on function public.upsert_notification_window(
  uuid,
  text,
  text,
  text,
  text,
  uuid,
  uuid,
  text
) from public, anon;

grant execute on function public.upsert_notification_window(
  uuid,
  text,
  text,
  text,
  text,
  uuid,
  uuid,
  text
) to authenticated, service_role;
