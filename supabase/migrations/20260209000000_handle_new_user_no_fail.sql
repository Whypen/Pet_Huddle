-- Make auth signups resilient: never fail auth.users inserts due to profile creation issues.
-- If profile insert fails (RLS, constraint, or transient issues), we swallow and allow signup.
-- The app can then upsert profiles on first authenticated session.

create or replace function public.handle_new_user()
returns trigger as $$
declare
  v_display_name text;
  v_legal_name text;
  v_phone text;
begin
  v_display_name := coalesce(new.raw_user_meta_data->>'display_name', new.email);
  v_legal_name := coalesce(
    new.raw_user_meta_data->>'legal_name',
    new.raw_user_meta_data->>'display_name',
    new.email
  );
  v_phone := new.raw_user_meta_data->>'phone';

  begin
    insert into public.profiles (id, display_name, legal_name, phone)
    values (new.id, v_display_name, v_legal_name, v_phone)
    on conflict (id) do update
      set display_name = excluded.display_name,
          legal_name = excluded.legal_name,
          phone = excluded.phone,
          updated_at = now();
  exception when others then
    -- Never block auth user creation.
    null;
  end;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

