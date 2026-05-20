\set ON_ERROR_STOP on
BEGIN;

-- preserve explicit main account and clear prior obvious demo/test users only
CREATE TEMP TABLE tmp_test_demo_candidates AS
WITH candidate_base AS (
  SELECT
    a.id,
    a.email,
    a.created_at AS auth_created_at,
    p.social_id,
    p.display_name,
    CASE
      WHEN a.email ILIKE 'testaccount%@huddle.test' THEN 'exact testaccount pattern'
      WHEN a.email ILIKE '%sf_test%' THEN 'email pattern sf_test'
      WHEN a.email ILIKE '%hk_test%' THEN 'email pattern hk_test'
      WHEN a.email ILIKE '%huddle_demo%' THEN 'email pattern huddle_demo'
      WHEN a.email ILIKE '%screenshot%' THEN 'email pattern screenshot'
      WHEN a.email ILIKE '%seed%' THEN 'email pattern seed'
      WHEN a.email ILIKE '%demo%' THEN 'email pattern demo'
      WHEN a.email ILIKE '%test%' THEN 'email pattern test'
      WHEN p.social_id ILIKE '%sf_test%' THEN 'social_id pattern sf_test'
      WHEN p.social_id ILIKE '%hk_test%' THEN 'social_id pattern hk_test'
      WHEN p.social_id ILIKE '%huddle_demo%' THEN 'social_id pattern huddle_demo'
      WHEN p.social_id ILIKE '%screenshot%' THEN 'social_id pattern screenshot'
      WHEN p.social_id ILIKE '%seed%' THEN 'social_id pattern seed'
      WHEN p.social_id ILIKE '%demo%' THEN 'social_id pattern demo'
      WHEN p.social_id ILIKE '%test%' THEN 'social_id pattern test'
      WHEN p.display_name ILIKE '%test%' THEN 'display_name pattern test'
      WHEN p.display_name ILIKE '%demo%' THEN 'display_name pattern demo'
      WHEN p.display_name ILIKE '%seed%' THEN 'display_name pattern seed'
      WHEN p.display_name ILIKE '%screenshot%' THEN 'display_name pattern screenshot'
      ELSE 'manual test/demo candidate'
    END AS reason
  FROM auth.users a
  LEFT JOIN public.profiles p ON p.id = a.id
  WHERE (
    a.email ILIKE '%test%'
    OR a.email ILIKE '%demo%'
    OR a.email ILIKE '%seed%'
    OR a.email ILIKE '%screenshot%'
    OR a.email ILIKE '%sf_test%'
    OR a.email ILIKE '%hk_test%'
    OR a.email ILIKE '%huddle_demo%'
    OR p.social_id ILIKE '%test%'
    OR p.social_id ILIKE '%demo%'
    OR p.social_id ILIKE '%seed%'
    OR p.social_id ILIKE '%screenshot%'
    OR p.social_id ILIKE '%sf_test%'
    OR p.social_id ILIKE '%hk_test%'
    OR p.social_id ILIKE '%huddle_demo%'
    OR p.display_name ILIKE '%test%'
    OR p.display_name ILIKE '%demo%'
    OR p.display_name ILIKE '%seed%'
    OR p.display_name ILIKE '%screenshot%'
  )
  AND lower(a.email) <> 'huddle.pet@icloud.com'
  AND NOT EXISTS (SELECT 1 FROM public.payments m WHERE m.user_id = a.id)
  AND NOT EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.user_id = a.id)
)
SELECT * FROM candidate_base;

-- clean prior UAT artifacts to keep reruns deterministic
DELETE FROM public.group_chat_invites gci
WHERE gci.chat_id IN (SELECT id FROM public.chats WHERE name LIKE '[UAT] %');

DELETE FROM public.group_join_requests gjr
WHERE gjr.chat_id IN (SELECT id FROM public.chats WHERE name LIKE '[UAT] %');

DELETE FROM public.chat_participants cp
WHERE cp.chat_id IN (SELECT id FROM public.chats WHERE name LIKE '[UAT] %');

DELETE FROM public.chat_room_members crm
WHERE crm.chat_id IN (SELECT id FROM public.chats WHERE name LIKE '[UAT] %');

DELETE FROM public.chats c
WHERE c.name LIKE '[UAT] %';

DELETE FROM public.thread_comments tc
WHERE tc.thread_id IN (SELECT id FROM public.threads WHERE title LIKE '[UAT] %');

DELETE FROM public.thread_supports ts
WHERE ts.thread_id IN (SELECT id FROM public.threads WHERE title LIKE '[UAT] %');

DELETE FROM public.social_feed_events sfe
WHERE sfe.thread_id IN (SELECT id FROM public.threads WHERE title LIKE '[UAT] %');

DELETE FROM public.threads t
WHERE t.title LIKE '[UAT] %';

DELETE FROM public.group_chat_invites gci
WHERE gci.inviter_user_id IN (SELECT id FROM tmp_test_demo_candidates)
   OR gci.invitee_user_id IN (SELECT id FROM tmp_test_demo_candidates);

DELETE FROM public.group_join_requests gjr
WHERE gjr.user_id IN (SELECT id FROM tmp_test_demo_candidates);

DELETE FROM public.social_feed_events sfe
WHERE sfe.viewer_id IN (SELECT id FROM tmp_test_demo_candidates)
   OR sfe.author_id IN (SELECT id FROM tmp_test_demo_candidates);

DELETE FROM public.thread_supports ts
WHERE ts.user_id IN (SELECT id FROM tmp_test_demo_candidates);

DELETE FROM public.thread_comments tc
WHERE tc.user_id IN (SELECT id FROM tmp_test_demo_candidates);

DELETE FROM public.message_reads mr
WHERE mr.user_id IN (SELECT id FROM tmp_test_demo_candidates);

DELETE FROM public.chat_participants cp
WHERE cp.user_id IN (SELECT id FROM tmp_test_demo_candidates);

DELETE FROM public.chat_room_members crm
WHERE crm.user_id IN (SELECT id FROM tmp_test_demo_candidates);

DELETE FROM public.pins p
WHERE p.user_id IN (SELECT id FROM tmp_test_demo_candidates);

DELETE FROM public.alert_interactions ai
WHERE ai.user_id IN (SELECT id FROM tmp_test_demo_candidates);

DELETE FROM public.broadcast_alert_interactions bai
WHERE bai.user_id IN (SELECT id FROM tmp_test_demo_candidates);


DELETE FROM public.thread_supports ts
WHERE ts.user_id IN (SELECT id FROM tmp_test_demo_candidates);

DELETE FROM public.social_interactions si
WHERE si.user_id IN (SELECT id FROM tmp_test_demo_candidates);

DELETE FROM public.pet_care_profiles pcp
WHERE pcp.user_id IN (SELECT id FROM tmp_test_demo_candidates);

DELETE FROM public.pets pt
WHERE pt.owner_id IN (SELECT id FROM tmp_test_demo_candidates);

DELETE FROM public.pins p
WHERE p.user_id IN (SELECT id FROM tmp_test_demo_candidates);

DELETE FROM public.user_locations ul
WHERE ul.user_id IN (SELECT id FROM tmp_test_demo_candidates);

DELETE FROM public.matches m
WHERE m.user1_id IN (SELECT id FROM tmp_test_demo_candidates)
   OR m.user2_id IN (SELECT id FROM tmp_test_demo_candidates);

DELETE FROM public.waves w
WHERE w.from_user_id IN (SELECT id FROM tmp_test_demo_candidates)
   OR w.to_user_id IN (SELECT id FROM tmp_test_demo_candidates)
   OR w.sender_id IN (SELECT id FROM tmp_test_demo_candidates)
   OR w.receiver_id IN (SELECT id FROM tmp_test_demo_candidates);

DELETE FROM public.threads th
WHERE th.user_id IN (SELECT id FROM tmp_test_demo_candidates)
   OR th.id IN (SELECT tc.thread_id FROM public.thread_comments tc WHERE tc.user_id IN (SELECT id FROM tmp_test_demo_candidates));

DELETE FROM public.pets pt
WHERE pt.owner_id IN (SELECT id FROM tmp_test_demo_candidates);

DELETE FROM public.map_alerts ma
WHERE ma.creator_id IN (SELECT id FROM tmp_test_demo_candidates);

DELETE FROM public.broadcast_alerts ba
WHERE ba.creator_id IN (SELECT id FROM tmp_test_demo_candidates);

DELETE FROM public.profiles pr
WHERE pr.id IN (SELECT id FROM tmp_test_demo_candidates);

DELETE FROM auth.identities ai
WHERE ai.user_id IN (SELECT id FROM tmp_test_demo_candidates)
   OR ai.provider_id IN (SELECT email FROM tmp_test_demo_candidates);

DELETE FROM auth.users u
WHERE u.id IN (SELECT id FROM tmp_test_demo_candidates);

-- build seed roster for 40 UAT accounts (20 SF + 20 HK)
CREATE TEMP TABLE tmp_uat_seed_users (
  seq int PRIMARY KEY,
  id uuid,
  email text,
  password text,
  region text,
  district text,
  lat numeric,
  lng numeric,
  social_id text,
  display_name text,
  full_name text,
  is_provider boolean,
  has_car boolean
);

DO $$
DECLARE
  n int;
  v_id uuid;
  v_region text;
  v_district text;
  v_lat numeric;
  v_lng numeric;
  v_social_id text;
  v_display_name text;
  v_full_name text;
  v_pass text;
  v_is_provider boolean;
  v_has_car boolean;
  v_phone text;
  v_email text;
  v_species text[] := ARRAY['Dog','Cat','Parrot','Cat','Rabbit','Dog','Dog','Cat','Rabbit','Dog'];
  v_breeds text[] := ARRAY['Beagle','Domestic Shorthair','Cockatiel','Tabby','Mini Lop','Golden Retriever','Shiba Inu','Maltese','Cockatoo','Labrador'];
  v_names_first text[] := ARRAY[
    'Ava','Noah','Isabel','Miles','Sophia','Leo','Maya','Ethan','Liam','Nora',
    'Kai','Juniper','Ella','Owen','Mila','Caleb','Ruby','Hugo','Iris','Daniel',
    'Elena','Mateo','Tessa','Nico','Freya','Soren','Clara','Felix','Arya','Mason',
    'Layla','Simon','Gia','Ivy','Noel','Iris','Clair','Nadia','Sora','Noah'
  ];
  v_names_last text[] := ARRAY[
    'Chen','Park','Lopez','Sato','Ramirez','Nguyen','Martinez','Kovacs','Reed','Singh',
    'Foster','Wong','Tan','Keller','Orr','Bennett','Brooks','Yamamoto','Ross','Vega',
    'Kim','Costa','Hsu','Almeida','Griffin','Lin','Mori','Fleming','Meyer','Rossi',
    'Khan','Santos','Nakamura','Diaz','O''Neill','Lau','Miller','Stone','Pinto','Blair'
  ];
  sf_districts text[] := ARRAY[
    'Downtown San Francisco','SoMa','Financial District','Mission Bay','North Beach',
    'Nob Hill','Civic Center','Yerba Buena','South Beach','Hayes Valley'
  ];
  sf_lats numeric[] := ARRAY[37.785,37.778,37.794,37.769,37.806,37.793,37.779,37.785,37.785,37.775];
  sf_lngs numeric[] := ARRAY[-122.406,-122.413,-122.401,-122.393,-122.41,-122.414,-122.419,-122.40,-122.397,-122.425];
  hk_districts text[] := ARRAY[
    'Central','Sheung Wan','Sai Ying Pun','Admiralty','Wan Chai','Causeway Bay','North Point',
    'Quarry Bay','Kennedy Town','Mid-Levels'
  ];
  hk_lats numeric[] := ARRAY[22.2819,22.2867,22.2864,22.2776,22.2806,22.2805,22.2908,22.2844,22.2811,22.2765];
  hk_lngs numeric[] := ARRAY[114.1589,114.1454,114.1405,114.1652,114.1733,114.1827,114.1954,114.2165,114.1284,114.1451];
  pet_name text;
  idx int;
BEGIN
  FOR n IN 1..40 LOOP
    v_region := CASE WHEN n <= 20 THEN 'SF' ELSE 'HK' END;
    idx := ((n - 1) % 10) + 1;
    IF v_region = 'SF' THEN
      v_district := sf_districts[idx];
      v_lat := sf_lats[idx] + (CASE WHEN (n % 2) = 0 THEN 0.00035 ELSE -0.00022 END);
      v_lng := sf_lngs[idx] + (CASE WHEN (n % 3) = 0 THEN -0.00058 ELSE 0.00022 END);
    ELSE
      v_district := hk_districts[idx];
      v_lat := hk_lats[idx] + (CASE WHEN (n % 2) = 0 THEN 0.00041 ELSE -0.00031 END);
      v_lng := hk_lngs[idx] + (CASE WHEN (n % 3) = 0 THEN 0.00042 ELSE -0.00017 END);
    END IF;

    v_email := format('testaccount%s@huddle.test', lpad(n::text, 2, '0'));
    v_pass := format('Huddletest%s*', lpad(n::text, 2, '0'));
    v_social_id := format('%s_%s', CASE WHEN v_region = 'SF' THEN 'sf_test' ELSE 'hk_test' END, lpad((n % 100)::text, 2, '0'));
    v_display_name := format('%s %s', v_names_first[n], v_names_last[n]);
    v_full_name := v_display_name;
    v_is_provider := n IN (2,4,6,8,10,12,14,16,18,20,22,24,26,28,30,32,34,36,38,40);
    v_has_car := v_is_provider AND (n % 2) = 0;
    v_phone := format('+1415%s', lpad((90000000 + n)::text, 8, '0'));

    INSERT INTO auth.users (
      id,
      instance_id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_user_meta_data,
      raw_app_meta_data,
      created_at,
      updated_at
    )
    VALUES (
      gen_random_uuid(),
      '00000000-0000-0000-0000-000000000000'::uuid,
      'authenticated',
      'authenticated',
      v_email,
      crypt(v_pass, gen_salt('bf')),
      now(),
      '{"huddle_native_signup_pending":false}',
      '{}',
      now(),
      now()
    )
    RETURNING id
    INTO v_id;

    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, created_at, updated_at)
    VALUES (
      gen_random_uuid(),
      v_id,
      jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
      'email',
      v_email,
      now(),
      now()
    )
    ON CONFLICT (provider, provider_id) DO UPDATE
      SET user_id = EXCLUDED.user_id,
          identity_data = EXCLUDED.identity_data,
          updated_at = now();

    INSERT INTO public.profiles (
      id, email, full_name, display_name, legal_name, social_id, phone, gender_genre, dob,
      user_role, role, latitude, longitude, last_lat, last_lng,
      location, location_geog,
      location_name, location_country, location_district,
      avatar_url, social_album, map_visible, hide_from_map, has_car, onboarding_completed,
      bio, tier, effective_tier, verification_status, human_verification_status,
      card_verification_status, is_verified, verified, marketing_consent, marketing_opt_in_checked,
      marketing_doi_confirmed, marketing_subscribed, prefs, pet_experience, email_verified,
      last_active_at, user_id
    )
    VALUES (
      v_id,
      v_email,
      v_full_name,
      v_display_name,
      v_full_name,
      v_social_id,
      v_phone,
      CASE WHEN n % 2 = 0 THEN 'Male' ELSE 'Female' END,
      (date '1990-01-01' + (n || ' days')::interval),
      'plus',
      'user',
      v_lat,
      v_lng,
      v_lat,
      v_lng,
      st_setsrid(st_makepoint(v_lng, v_lat), 4326)::geography,
      st_setsrid(st_makepoint(v_lng, v_lat), 4326)::geography,
      v_district || CASE WHEN v_region = 'SF' THEN ', United States' ELSE ', Hong Kong' END,
      CASE WHEN v_region = 'SF' THEN 'United States' ELSE 'Hong Kong' END,
      v_district,
      format('https://api.dicebear.com/9.x/notionists/png?seed=%s', v_social_id),
      ARRAY[format('https://api.dicebear.com/9.x/notionists/png?seed=%s', v_social_id)],
      true,
      false,
      v_has_car,
      true,
      'Neighborhood pet parent supporting daily-safe play and city pet care flows.',
      CASE WHEN v_is_provider THEN 'gold' ELSE 'free' END,
      CASE WHEN v_is_provider THEN 'gold'::tier_enum ELSE 'free'::tier_enum END,
      'pending',
      'not_started',
      'not_started',
      v_is_provider,
      v_is_provider,
      false,
      false,
      false,
      false,
      '{}'::jsonb,
      ARRAY['Dog','Cat'],
      true,
      now(),
      lpad((1000000000 + n)::text, 10, '0')
    )
    ON CONFLICT (id) DO UPDATE
    SET
      display_name = EXCLUDED.display_name,
      legal_name = EXCLUDED.legal_name,
      full_name = EXCLUDED.full_name,
      social_id = EXCLUDED.social_id,
      phone = EXCLUDED.phone,
      dob = EXCLUDED.dob,
      tier = EXCLUDED.tier,
      effective_tier = EXCLUDED.effective_tier,
      avatar_url = EXCLUDED.avatar_url,
      social_album = EXCLUDED.social_album,
      map_visible = EXCLUDED.map_visible,
      hide_from_map = EXCLUDED.hide_from_map,
      has_car = EXCLUDED.has_car,
      location_country = EXCLUDED.location_country,
      location_district = EXCLUDED.location_district,
      location_name = EXCLUDED.location_name,
      latitude = EXCLUDED.latitude,
      longitude = EXCLUDED.longitude,
      last_lat = EXCLUDED.last_lat,
      last_lng = EXCLUDED.last_lng,
      location = EXCLUDED.location,
      location_geog = EXCLUDED.location_geog,
      last_active_at = EXCLUDED.last_active_at,
      email = EXCLUDED.email;

    DELETE FROM public.pets WHERE owner_id = v_id;
    pet_name := CASE WHEN n % 2 = 0 THEN 'Milo' ELSE 'Kai' END || n::text;
    INSERT INTO public.pets (
      owner_id,
      name,
      species,
      breed,
      gender,
      weight,
      weight_unit,
      dob,
      temperament,
      bio,
      is_public,
      is_active,
      neutered_spayed
    ) VALUES (
      v_id,
      pet_name,
      v_species[(n % array_length(v_species, 1)) + 1],
      v_breeds[(n % array_length(v_breeds, 1)) + 1],
      CASE WHEN n % 2 = 0 THEN 'Female' ELSE 'Male' END,
      round((4 + (n % 7) + (n * 0.2))::numeric, 1),
      'kg',
      (date '2016-01-01' + (n * 4 || ' days')::interval),
      ARRAY['friendly','curious'],
      CASE WHEN v_region = 'SF' THEN 'Weekend park socials and low-traffic walk routes are my sweet spot.' ELSE 'City-side pet life with safe corner routes and quick playouts.' END,
      true,
      true,
      (n % 2 = 0)
    );

    DELETE FROM public.pet_care_profiles WHERE user_id = v_id;
    IF v_is_provider THEN
      INSERT INTO public.pet_care_profiles (
        user_id,
        story,
        skills,
        proof_metadata,
        days,
        time_blocks,
        specify_area,
        location_styles,
        completed,
        services_offered,
        pet_types,
        dog_sizes,
        min_notice_value,
        min_notice_unit,
        area_name,
        area_lat,
        area_lng,
        rates,
        listed,
        agreement_accepted,
        agreement_accepted_at,
        agreement_version,
        services_other,
        starting_price,
        currency
      ) VALUES (
        v_id,
        format('%s serves nearby pet families with practical, trusted support from %s.', v_display_name, v_district),
        ARRAY['Professional pet-carer','Medical support','Behaviorist / Trainer'],
        '{}'::jsonb,
        ARRAY['Weekday','Weekend'],
        ARRAY['Morning','Afternoon'],
        false,
        ARRAY['At your home', 'At my home', 'Meet-up / outdoor'],
        true,
        ARRAY['Walking', 'Boarding', 'Drop-in Visits'],
        ARRAY['Dogs', 'Cats'],
        ARRAY['Small', 'Medium', 'Large'],
        CASE WHEN v_has_car THEN 6 ELSE 12 END,
        'hours',
        v_district,
        v_lat,
        v_lng,
        ARRAY[
          jsonb_build_object('rate', 'walk', 'price', CASE WHEN v_region='SF' THEN 38 ELSE 260 END, 'services', ARRAY['Walking'])::text,
          jsonb_build_object('rate', 'drop-in', 'price', CASE WHEN v_region='SF' THEN 120 ELSE 950 END, 'services', ARRAY['Drop-in Visit'])::text
        ],
        true,
        true,
        now(),
        '1.0',
        NULL,
        CASE WHEN v_region='SF' THEN 70 ELSE 540 END,
        CASE WHEN v_region='SF' THEN 'USD' ELSE 'HKD' END
      );
    ELSE
      DELETE FROM public.pet_care_profiles WHERE user_id = v_id;
    END IF;

    INSERT INTO tmp_uat_seed_users (seq, id, email, password, region, district, lat, lng, social_id, display_name, full_name, is_provider, has_car)
    VALUES (n, v_id, v_email, v_pass, v_region, v_district, v_lat, v_lng, v_social_id, v_display_name, v_full_name, v_is_provider, v_has_car)
    ON CONFLICT (seq) DO UPDATE
      SET id = EXCLUDED.id,
          email = EXCLUDED.email,
          password = EXCLUDED.password,
          region = EXCLUDED.region,
          district = EXCLUDED.district,
          lat = EXCLUDED.lat,
          lng = EXCLUDED.lng,
          social_id = EXCLUDED.social_id,
          display_name = EXCLUDED.display_name,
          full_name = EXCLUDED.full_name,
          is_provider = EXCLUDED.is_provider,
          has_car = EXCLUDED.has_car;
  END LOOP;
END
$$;

-- discovery pins
DELETE FROM public.pins WHERE user_id IN (SELECT id FROM tmp_uat_seed_users);
INSERT INTO public.pins (user_id, lat, lng, is_public, is_invisible, address)
SELECT id, lat, lng, true, false, district || ', ' || CASE WHEN region='SF' THEN 'San Francisco' ELSE 'Hong Kong' END
FROM tmp_uat_seed_users u;

-- map alerts and broadcast alerts
INSERT INTO public.map_alerts (
  creator_id, latitude, longitude, alert_type, description, is_active, title, duration_hours, range_km, range_meters,
  expires_at, address, location_street, location_district, post_on_social, is_sensitive, posted_to_threads,
  social_status, social_url, media_urls
)
SELECT
  id,
  lat + 0.0012,
  lng - 0.0009,
  CASE WHEN seq % 3 = 1 THEN 'Stray' WHEN seq % 3 = 2 THEN 'Lost' ELSE 'Found' END,
  format('Local map alert near %s around %s for active safety checks and local support routes.', district, CASE WHEN region='SF' THEN 'Downtown SF' ELSE 'Hong Kong Island' END),
  true,
  format('UAT %s alert %s', CASE WHEN region='SF' THEN 'SF' ELSE 'HK' END, seq),
  24,
  3.0,
  1800,
  now() + interval '7 days',
  district || ', ' || CASE WHEN region='SF' THEN 'San Francisco' ELSE 'Hong Kong' END,
  district || ' corridor',
  district,
  false,
  false,
  false,
  NULL,
  NULL,
  ARRAY[]::text[]
FROM tmp_uat_seed_users;

INSERT INTO public.broadcast_alerts (
  creator_id, type, title, description, address, duration_hours, range_km, range_meters, latitude, longitude, post_on_threads,
  is_sensitive, images, archived_at, geog
)
SELECT
  u.id,
  CASE WHEN u.seq % 4 = 0 THEN 'Caution' WHEN u.seq % 4 = 1 THEN 'Lost' WHEN u.seq % 4 = 2 THEN 'Stray' ELSE 'Others' END,
  format('UAT %s Broadcast %s', CASE WHEN region='SF' THEN 'SF' ELSE 'HK' END, seq),
  format('Broadcast check-point route tip from %s for pet owners.', district),
  district || ', ' || CASE WHEN region='SF' THEN 'San Francisco' ELSE 'Hong Kong' END,
  24,
  4.0,
  2600,
  lat - 0.0011,
  lng + 0.0011,
  false,
  false,
  ARRAY[]::text[],
  NULL,
  NULL
 FROM tmp_uat_seed_users u;

-- threads, comments, supports, feed events
CREATE TEMP TABLE tmp_thread_defs (
  thread_seq int,
  seed_seq int,
  title text,
  content text,
  image text
);
INSERT INTO tmp_thread_defs VALUES
  (1,1,'[UAT] SF morning walk circles','Community-run pet walk route checklist for first-time group meetups.','https://picsum.photos/seed/uat-sf-01/1200/800'),
  (2,2,'[UAT] HK central cat corner tips','Morning cat-safe route ideas near Central for family schedules.','https://picsum.photos/seed/uat-hk-02/1200/800'),
  (3,3,'[UAT] Dogs by the bay','Best short leash corridors by Mission Bay and nearby piers.','https://picsum.photos/seed/uat-sf-03/1200/800'),
  (4,4,'[UAT] Indoor rain day play plans','Rain-friendly indoor bonding ideas and social windows.','https://picsum.photos/seed/uat-hk-04/1200/800'),
  (5,5,'[UAT] Service-ready pet sitters','What families need from reliable carriers in a 5-minute meetup.','https://picsum.photos/seed/uat-sf-05/1200/800'),
  (6,6,'[UAT] HK low-key pet socials','Low crowd-friendly meetup rhythm for calm, short visits.','https://picsum.photos/seed/uat-hk-06/1200/800'),
  (7,7,'[UAT] Paw-safe café map','Which local cafés in SF are best for short playtime pauses.','https://picsum.photos/seed/uat-sf-07/1200/800'),
  (8,8,'[UAT] Pet care in the lifts','Elevator-safe habits for carriers and groups in Hong Kong towers.','https://picsum.photos/seed/uat-hk-08/1200/800'),
  (9,9,'[UAT] SF senior pet support','Gentle routes and senior-friendly timing around Hayes Valley.','https://picsum.photos/seed/uat-sf-09/1200/800'),
  (10,10,'[UAT] HK after-work walk window','After office wind-down pet route ideas around Wan Chai to Causeway.','https://picsum.photos/seed/uat-hk-10/1200/800');

INSERT INTO public.threads (user_id, title, content, images, tags, hashtags, is_public, is_sensitive, is_map_alert)
SELECT su.id, td.title, td.content, ARRAY[td.image], ARRAY['uat','social'], ARRAY['uat','social'], true, false, false
FROM tmp_thread_defs td
JOIN tmp_uat_seed_users su ON su.seq = td.seed_seq
;

CREATE TEMP TABLE tmp_thread_lookup AS
SELECT
  td.thread_seq,
  t.id AS thread_id
FROM tmp_thread_defs td
JOIN public.threads t ON t.title = td.title
WHERE t.title LIKE '[UAT] %';

INSERT INTO public.thread_comments (thread_id, user_id, text, content, images)
SELECT tl.thread_id, su.id, format('Great tip from %s, this is very practical for real-world runs.', su.display_name),
       format('Great tip from %s, this is very practical for real-world runs.', su.display_name),
       ARRAY[]::text[]
FROM tmp_thread_lookup tl
JOIN tmp_uat_seed_users su ON su.seq = ((tl.thread_seq % 20) + 1);

INSERT INTO public.thread_comments (thread_id, user_id, text, content, images)
SELECT tl.thread_id, su.id, 'I can vouch this route after trying it on weekend patrols.',
       'I can vouch this route after trying it on weekend patrols.',
       ARRAY[]::text[]
FROM tmp_thread_lookup tl
JOIN tmp_uat_seed_users su ON su.seq = (((tl.thread_seq + 5) % 20) + 1);

INSERT INTO public.thread_supports (thread_id, user_id)
SELECT tl.thread_id, su.id
FROM tmp_thread_lookup tl
JOIN tmp_uat_seed_users su ON su.seq IN (tl.thread_seq, (tl.thread_seq + 7))
ON CONFLICT (thread_id, user_id) DO NOTHING;

INSERT INTO public.social_feed_events (viewer_id, thread_id, author_id, event_type, metadata)
SELECT su.id, tl.thread_id, su.id, 'impression', jsonb_build_object('source','uat_seed','kind','initial')
FROM tmp_thread_lookup tl
JOIN tmp_uat_seed_users su ON su.seq = ((tl.thread_seq % 20) + 1);

INSERT INTO public.social_feed_events (viewer_id, thread_id, author_id, event_type, metadata)
SELECT su.id, tl.thread_id, su.id, 'comment', jsonb_build_object('source','uat_seed','kind','interaction')
FROM tmp_thread_lookup tl
JOIN tmp_uat_seed_users su ON su.seq = (((tl.thread_seq + 8) % 20) + 1);

-- groups (5 SF + 5 HK)
CREATE TEMP TABLE tmp_group_defs (
  name text,
  region text,
  district text,
  join_style text,
  room_code text,
  invite_only boolean,
  creator_seq int,
  member_count int,
  description text,
  invite_group_code text
);
INSERT INTO tmp_group_defs VALUES
  ('[UAT] SF Downtown Park Pals','SF','Downtown San Francisco','open',NULL,false,1,8,'Open SF community for leash-ready social walks.',''),
  ('[UAT] SF Mission Bay Dog Meetups','SF','Mission Bay','open',NULL,false,2,7,'Open meetup group for mixed pet sizes.',''),
  ('[UAT] SF SF By Code','SF','Civic Center','join-code','123456',false,3,8,'Join with code 123456 for partner meetups.','code'),
  ('[UAT] SF Request Group','SF','Hayes Valley','request',NULL,false,4,5,'Private request-based invite group.','request'),
  ('[UAT] SF Care Circle','SF','South Beach','invited',NULL,true,5,6,'Members invited from verified circles.',''),
  ('[UAT] HK Central Circle','HK','Central','open',NULL,false,21,8,'Open HK group for calm weekday meetups.',''),
  ('[UAT] HK Mid-Levels Walk Club','HK','Mid-Levels','open',NULL,false,22,7,'Open HK group for park and lift-safe coordination.',''),
  ('[UAT] HK Wan Chai By Code','HK','Wan Chai','join-code','123456HK',false,23,8,'Join with a code for trusted invitees in Hong Kong.','code'),
  ('[UAT] HK Request Club','HK','Sheung Wan','request',NULL,false,24,5,'Request-to-join group with admin review.','request'),
  ('[UAT] HK Invite Family','HK','Kennedy Town','invited',NULL,true,25,6,'Invite-only group for care-circle coordination.','');

INSERT INTO public.chats (
  type,
  name,
  created_by,
  location_label,
  location_country,
  visibility,
  join_method,
  room_code,
  avatar_url,
  description,
  pet_focus
)
SELECT
  'group',
  gd.name,
  su.id,
  gd.district,
  CASE WHEN gd.region = 'SF' THEN 'United States' ELSE 'Hong Kong' END,
  CASE WHEN gd.join_style IN ('open') THEN 'public' ELSE 'private' END,
  CASE WHEN gd.join_style IN ('open') THEN 'instant' ELSE 'request' END,
  gd.room_code,
  format('https://api.dicebear.com/9.x/notionists/png?seed=%s', replace(lower(replace(gd.name, ' ', '-')), '''', '')),
  gd.description,
  ARRAY['Dogs', 'Cats']
FROM tmp_group_defs gd
JOIN tmp_uat_seed_users su ON su.seq = gd.creator_seq
;

CREATE TEMP TABLE tmp_group_ids AS
SELECT g.id, gd.join_style, gd.region, gd.creator_seq, gd.district, gd.room_code
FROM public.chats g
JOIN tmp_group_defs gd ON gd.name = g.name;

-- populate group memberships and pending flows
INSERT INTO public.chat_room_members (chat_id, user_id, role, is_muted)
SELECT gi.id, su.id,
       CASE WHEN su.seq = gi.creator_seq THEN 'admin' ELSE 'member' END,
       false
FROM tmp_group_ids gi
JOIN LATERAL (
  SELECT su.id, su.seq
  FROM tmp_uat_seed_users su
  WHERE su.region = CASE WHEN gi.region = 'SF' THEN 'SF' ELSE 'HK' END
  ORDER BY su.seq
  LIMIT CASE WHEN gi.join_style = 'request' THEN 4 ELSE 8 END
) su ON true;

INSERT INTO public.chat_participants (chat_id, user_id, role)
SELECT m.chat_id, m.user_id, m.role
FROM public.chat_room_members m;

INSERT INTO public.group_chat_invites (chat_id, inviter_user_id, invitee_user_id, status, created_at)
SELECT
  gi.id,
  (SELECT rm.user_id FROM public.chat_room_members rm WHERE rm.chat_id = gi.id AND rm.role = 'admin' LIMIT 1),
  p.id,
  'pending',
  now()
FROM tmp_group_ids gi
JOIN public.profiles p
  ON p.email IN ('fongpoman114@gmail.com','twenty_illkid@msn.com','huddle.pet@icloud.com')
WHERE gi.join_style = 'invited'
ON CONFLICT (chat_id, invitee_user_id) DO NOTHING;

INSERT INTO public.group_join_requests (chat_id, user_id, status, created_at)
SELECT
  gi.id,
  su.id,
  'pending',
  now()
FROM tmp_group_ids gi
JOIN tmp_uat_seed_users su ON su.region = CASE WHEN gi.region='SF' THEN 'SF' ELSE 'HK' END
WHERE gi.join_style = 'request'
  AND su.seq % 3 = 0
ON CONFLICT (chat_id, user_id) DO NOTHING;

COMMIT;
