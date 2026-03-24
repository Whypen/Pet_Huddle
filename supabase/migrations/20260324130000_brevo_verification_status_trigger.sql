-- Brevo CRM bridge: fire verification_completed sync on any verification_status change
-- ──────────────────────────────────────────────────────────────────────────────────
-- Covers ALL paths that call refresh_identity_verification_status:
--   verify-human-challenge, verify-device-fingerprint,
--   stripe-webhook (card setup), create-identity-setup-intent
--
-- Uses pg_net (already in use in this project) to call brevo-sync edge function.
-- Fail-open: errors are caught and logged, never block the profile update.
-- Only fires when verification_status actually changes (OLD IS DISTINCT FROM NEW).

create or replace function public.notify_brevo_verification_status_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url  text;
  v_key  text;
begin
  -- Only proceed when status actually changed
  if OLD.verification_status is not distinct from NEW.verification_status then
    return NEW;
  end if;

  begin
    v_url := current_setting('app.settings.supabase_url', true) || '/functions/v1/brevo-sync';
    v_key := current_setting('app.settings.service_role_key', true);

    if v_url is null or v_key is null then
      raise warning '[brevo] supabase_url or service_role_key not set in app.settings';
      return NEW;
    end if;

    perform net.http_post(
      url     := v_url,
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || v_key,
        'Content-Type',  'application/json'
      ),
      body    := jsonb_build_object(
        'event',   'verification_completed',
        'user_id', NEW.id::text
      )
    );
  exception when others then
    -- Fail open: never block the profile update
    raise warning '[brevo] verification trigger failed for user %: %', NEW.id, SQLERRM;
  end;

  return NEW;
end;
$$;

drop trigger if exists trg_brevo_verification_status_changed on public.profiles;

create trigger trg_brevo_verification_status_changed
  after update of verification_status
  on public.profiles
  for each row
  execute function public.notify_brevo_verification_status_changed();
