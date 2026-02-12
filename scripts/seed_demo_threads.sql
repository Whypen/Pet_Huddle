-- Seed demo threads + map_alerts with service_role (dev/staging only).
-- Requires service_role privileges to insert into auth.users.

do $$
declare
  v_user_id uuid;
  v_instance_id uuid;
  v_email text := 'demo@huddle.local';
begin
  -- Ensure demo flags exist
  alter table public.threads add column if not exists is_demo boolean not null default false;
  alter table public.map_alerts add column if not exists is_demo boolean not null default false;

  -- Find or create a demo auth user
  select id into v_user_id from auth.users where email = v_email limit 1;
  if v_user_id is null then
    select id into v_instance_id from auth.instances limit 1;
    insert into auth.users (
      id,
      instance_id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at
    ) values (
      gen_random_uuid(),
      v_instance_id,
      'authenticated',
      'authenticated',
      v_email,
      crypt('demo_password', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{"display_name":"Huddle Demo"}',
      now(),
      now()
    )
    returning id into v_user_id;
  end if;

  -- Ensure profile exists with display_name
  insert into public.profiles (id, display_name, updated_at)
  values (v_user_id, 'Huddle Demo', now())
  on conflict (id) do update set display_name = excluded.display_name, updated_at = excluded.updated_at;

  -- Seed demo threads (IDs match src/lib/demoData.ts)
  insert into public.threads (id, user_id, title, content, is_map_alert, is_public, is_demo)
  values
    ('43a06dd1-0ce0-4854-8448-42dd905a4d18', v_user_id, 'Lost Alert: Tsim Sha Tsui', 'Missing tabby cat near TST promenade.', true, true, true),
    ('9888a51c-eb39-418d-b779-b5171b1d399d', v_user_id, 'Stray Alert: Mong Kok', 'Friendly Shiba spotted near Mong Kok East exit.', true, true, true),
    ('b6f5bb06-1f74-4b4c-9bdb-aefe7f5e1131', v_user_id, 'Community Notice: Central', 'Community feed station restocked in Central.', true, true, true),
    ('f6fe5d47-48f8-4c29-a065-5e1068ff0a09', v_user_id, 'Lost Alert: Wan Chai', 'Small white dog missing near Wan Chai market.', true, true, true),
    ('2bd23e9b-9758-46fd-a807-4803a4ee12e7', v_user_id, 'Stray Alert: Sham Shui Po', 'Young orange kitten seen near Apliu Street, Sham Shui Po.', true, true, true),
    ('ed305f81-a25e-4ecf-9ab8-03fb70a4c017', v_user_id, 'Community Notice: Tsuen Wan', 'Pet adoption booth open at Tsuen Wan plaza today.', true, true, true),
    ('8dfe8ca2-7141-4465-b8a3-0f535e8fbd6b', v_user_id, 'Stray Alert: Tsing Yi', 'Injured pigeon reported near Tsing Yi station.', true, true, true),
    ('c4856dc0-2ff1-42b9-916a-560de967a8e1', v_user_id, 'Lost Alert: Kwun Tong', 'Parakeet flew off near Kwun Tong ferry pier.', true, true, true),
    ('5b1df1e8-e80f-4f85-90d7-cd67c5a3f1f4', v_user_id, 'Community Notice: Sai Kung', 'Volunteers needed for Sai Kung beach cleanup with pets.', true, true, true),
    ('6ead51ff-33f7-450d-8122-38226b368924', v_user_id, 'Stray Alert: Aberdeen', 'Brown mixed-breed dog seen near Aberdeen promenade.', true, true, true)
  on conflict (id) do nothing;

  -- Seed demo map_alerts linked to threads
  insert into public.map_alerts (creator_id, latitude, longitude, alert_type, title, description, address, thread_id, is_active, is_demo, posted_to_threads)
  values
    (v_user_id, 22.2963, 114.1722, 'Lost',   'Lost Alert',    'Missing tabby cat near TST promenade.', 'Tsim Sha Tsui, HK', '43a06dd1-0ce0-4854-8448-42dd905a4d18', true, true, true),
    (v_user_id, 22.3193, 114.1694, 'Stray',  'Stray Alert',   'Friendly Shiba spotted near Mong Kok East exit.', 'Mong Kok, HK', '9888a51c-eb39-418d-b779-b5171b1d399d', true, true, true),
    (v_user_id, 22.2819, 114.1589, 'Others', 'Community Notice', 'Community feed station restocked in Central.', 'Central, HK', 'b6f5bb06-1f74-4b4c-9bdb-aefe7f5e1131', true, true, true),
    (v_user_id, 22.2776, 114.1731, 'Lost',   'Lost Alert',    'Small white dog missing near Wan Chai market.', 'Wan Chai, HK', 'f6fe5d47-48f8-4c29-a065-5e1068ff0a09', true, true, true),
    (v_user_id, 22.3305, 114.1621, 'Stray',  'Stray Alert',   'Young orange kitten seen near Apliu Street, Sham Shui Po.', 'Sham Shui Po, HK', '2bd23e9b-9758-46fd-a807-4803a4ee12e7', true, true, true),
    (v_user_id, 22.3707, 114.1113, 'Others', 'Community Notice', 'Pet adoption booth open at Tsuen Wan plaza today.', 'Tsuen Wan, HK', 'ed305f81-a25e-4ecf-9ab8-03fb70a4c017', true, true, true),
    (v_user_id, 22.3587, 114.1077, 'Stray',  'Stray Alert',   'Injured pigeon reported near Tsing Yi station.', 'Tsing Yi, HK', '8dfe8ca2-7141-4465-b8a3-0f535e8fbd6b', true, true, true),
    (v_user_id, 22.3071, 114.2252, 'Lost',   'Lost Alert',    'Parakeet flew off near Kwun Tong ferry pier.', 'Kwun Tong, HK', 'c4856dc0-2ff1-42b9-916a-560de967a8e1', true, true, true),
    (v_user_id, 22.3814, 114.2705, 'Others', 'Community Notice', 'Volunteers needed for Sai Kung beach cleanup with pets.', 'Sai Kung, HK', '5b1df1e8-e80f-4f85-90d7-cd67c5a3f1f4', true, true, true),
    (v_user_id, 22.2479, 114.1547, 'Stray',  'Stray Alert',   'Brown mixed-breed dog seen near Aberdeen promenade.', 'Aberdeen, HK', '6ead51ff-33f7-450d-8122-38226b368924', true, true, true)
  on conflict do nothing;
end $$;
