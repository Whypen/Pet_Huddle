create or replace function public.notify_brevo_onboarding_completed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_key text;
  should_fire boolean := false;
begin
  if TG_OP = 'INSERT' then
    should_fire := coalesce(NEW.onboarding_completed, false);
  elsif TG_OP = 'UPDATE' then
    should_fire := coalesce(NEW.onboarding_completed, false)
      and not coalesce(OLD.onboarding_completed, false);
  end if;

  if not should_fire then
    return NEW;
  end if;

  select decrypted_secret into v_url
  from vault.decrypted_secrets
  where name = 'supabase_project_url';

  select decrypted_secret into v_key
  from vault.decrypted_secrets
  where name = 'supabase_service_role_key';

  if coalesce(v_url, '') = '' or coalesce(v_key, '') = '' then
    raise warning '[brevo] onboarding trigger skipped for user %: missing vault secrets', NEW.id;
    return NEW;
  end if;

  begin
    perform net.http_post(
      url := v_url || '/functions/v1/brevo-sync',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || v_key,
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object(
        'event', 'profile_completed',
        'user_id', NEW.id::text
      )
    );
  exception when others then
    raise warning '[brevo] onboarding trigger failed for user %: %', NEW.id, SQLERRM;
  end;

  return NEW;
end;
$$;

drop trigger if exists trg_brevo_onboarding_completed on public.profiles;

create trigger trg_brevo_onboarding_completed
  after insert or update of onboarding_completed
  on public.profiles
  for each row
  execute function public.notify_brevo_onboarding_completed();
