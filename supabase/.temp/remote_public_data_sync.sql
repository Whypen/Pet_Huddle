SET session_replication_role = replica;

--
-- PostgreSQL database dump
--

-- \restrict JVwkKsrKhvGws6M16dlsDDn2z6Q9rKTiOqhZtK7L41tQVdT4oxbSBnPAvtl05xO

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: profiles; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."profiles" ("id", "email", "full_name", "created_at", "major", "owns_pets", "social_availability", "availability_status", "show_gender", "show_age", "show_height", "show_weight", "show_academic", "show_affiliation", "show_bio", "display_name", "legal_name", "phone", "gender_genre", "dob", "height", "weight", "weight_unit", "degree", "school", "affiliation", "pet_experience", "experience_years", "relationship_status", "has_car", "languages", "location_name", "user_role", "is_verified", "bio", "avatar_url", "onboarding_completed", "updated_at", "occupation", "orientation", "show_occupation", "location", "vouch_score", "emergency_mode", "care_circle", "fcm_token", "latitude", "longitude", "verification_document_url", "subscription_status", "payment_method", "last_payment_date", "show_orientation", "tier", "stripe_customer_id", "stripe_subscription_id", "stars_count", "mesh_alert_count", "media_credits", "family_slots", "verified", "last_lat", "last_lng", "verification_comment", "verification_status", "location_country", "location_district", "user_id", "social_album", "location_geog", "role", "show_relationship_status", "location_pinned_until", "location_retention_until", "subscription_cycle_anchor_day", "subscription_current_period_start", "subscription_current_period_end", "last_login", "map_visible", "subscription_start", "prefs", "posted_to_threads", "is_admin", "social_id", "effective_tier", "non_social", "hide_from_map", "last_active_at", "human_verification_status", "human_verified_at", "card_verification_status", "card_verified", "card_verified_at", "card_brand", "card_last4", "stripe_setup_intent_id") VALUES
	('e4b8346e-727b-41e0-8b08-26569cecef45', NULL, NULL, '2026-02-23 13:45:16.443054+00', NULL, false, false, '{}', true, true, true, true, true, true, true, 'Rowan 30', 'Rowan Seed 30', NULL, 'Non-binary', '1999-06-12', NULL, NULL, 'kg', NULL, NULL, NULL, '{hamster}', 0, NULL, false, '{}', 'Hong Kong', 'free', false, 'Pet-loving free member ready to chat and help.', NULL, false, '2026-03-07 21:58:02.371972+00', NULL, NULL, true, NULL, 0, false, '{}', NULL, NULL, NULL, NULL, 'free', NULL, NULL, true, 'free', NULL, NULL, 0, 0, 0, 0, false, 22.319194569701256, 114.15986625135314, NULL, 'not_submitted', NULL, NULL, '9250187198', '{}', NULL, 'user', true, NULL, NULL, NULL, NULL, NULL, '2026-02-23 13:45:16.443054+00', false, NULL, '{}', false, false, '9000000029', 'free', true, true, '2026-03-06 16:23:13.121273+00', 'not_started', NULL, 'not_started', false, NULL, NULL, NULL, NULL),
	('935ee81a-2819-462a-8725-54664345f7a3', NULL, NULL, '2026-02-23 13:45:17.337029+00', NULL, false, false, '{}', true, true, true, true, true, true, true, 'Harper 31', 'Harper Seed 31', NULL, 'Male', '1990-07-13', NULL, NULL, 'kg', NULL, NULL, NULL, '{dog}', 0, NULL, true, '{}', 'Hong Kong', 'free', false, 'Pet-loving free member ready to chat and help.', NULL, false, '2026-03-07 21:58:02.371972+00', NULL, NULL, true, NULL, 0, false, '{}', NULL, NULL, NULL, NULL, 'free', NULL, NULL, true, 'free', NULL, NULL, 0, 0, 0, 0, false, 22.314764080979373, 114.12876567651108, NULL, 'not_submitted', NULL, NULL, '9142293921', '{}', NULL, 'user', true, NULL, NULL, NULL, NULL, NULL, '2026-02-23 13:45:17.337029+00', false, NULL, '{}', false, false, '9000000030', 'free', true, true, '2026-03-06 16:23:13.121273+00', 'not_started', NULL, 'not_started', false, NULL, NULL, NULL, NULL),
	('ade29a94-38b6-4723-830b-902c217fe8f6', NULL, NULL, '2026-02-23 13:45:18.234164+00', NULL, false, false, '{}', true, true, true, true, true, true, true, 'Parker 32', 'Parker Seed 32', NULL, 'Female', '1991-08-14', NULL, NULL, 'kg', NULL, NULL, NULL, '{cat}', 0, NULL, false, '{}', 'Hong Kong', 'free', false, 'Pet-loving free member ready to chat and help.', NULL, false, '2026-03-07 21:58:02.371972+00', NULL, NULL, true, NULL, 0, false, '{}', NULL, NULL, NULL, NULL, 'free', NULL, NULL, true, 'free', NULL, NULL, 0, 0, 0, 0, false, 22.278727796649942, 114.14836446504432, NULL, 'not_submitted', NULL, NULL, '1656718896', '{}', NULL, 'user', true, NULL, NULL, NULL, NULL, NULL, '2026-02-23 13:45:18.234164+00', false, NULL, '{}', false, false, '9000000031', 'free', true, true, '2026-03-06 16:23:13.121273+00', 'not_started', NULL, 'not_started', false, NULL, NULL, NULL, NULL),
	('30e7e892-86c1-4d51-a527-d2a87735df09', NULL, NULL, '2026-02-23 13:45:29.572852+00', NULL, false, false, '{}', true, true, true, true, true, true, true, 'Cameron 45', 'Cameron Seed 45', NULL, 'Non-binary', '1994-05-18', NULL, NULL, 'kg', NULL, NULL, NULL, '{dog,cat}', 0, NULL, false, '{}', 'Hong Kong', 'free', false, 'Pet-loving free member ready to chat and help.', NULL, false, '2026-03-07 21:58:02.371972+00', NULL, NULL, true, NULL, 0, false, '{}', NULL, NULL, NULL, NULL, 'free', NULL, NULL, true, 'free', NULL, NULL, 0, 0, 0, 0, false, 22.242321258333924, 114.19038342468045, NULL, 'not_submitted', NULL, NULL, '6249042299', '{}', NULL, 'user', true, NULL, NULL, NULL, NULL, NULL, '2026-02-23 13:45:29.572852+00', false, NULL, '{}', false, false, '9000000044', 'free', true, true, '2026-03-06 16:23:13.121273+00', 'not_started', NULL, 'not_started', false, NULL, NULL, NULL, NULL),
	('8710cc78-f489-4848-b273-4896394f5477', NULL, NULL, '2026-02-23 13:45:30.47198+00', NULL, false, false, '{}', true, true, true, true, true, true, true, 'Drew 46', 'Drew Seed 46', NULL, 'Male', '1995-06-10', NULL, NULL, 'kg', NULL, NULL, NULL, '{bird}', 0, NULL, true, '{}', 'Hong Kong', 'free', false, 'Pet-loving free member ready to chat and help.', NULL, false, '2026-03-07 21:58:02.371972+00', NULL, NULL, true, NULL, 0, false, '{}', NULL, NULL, NULL, NULL, 'free', NULL, NULL, true, 'free', NULL, NULL, 0, 0, 0, 0, false, 22.32844995066945, 114.12667077240023, NULL, 'not_submitted', NULL, NULL, '4020048464', '{}', NULL, 'user', true, NULL, NULL, NULL, NULL, NULL, '2026-02-23 13:45:30.47198+00', false, NULL, '{}', false, false, '9000000045', 'free', true, true, '2026-03-06 16:23:13.121273+00', 'not_started', NULL, 'not_started', false, NULL, NULL, NULL, NULL),
	('11735970-c8be-4401-a56e-8c32661037ac', NULL, NULL, '2026-02-23 13:45:31.346192+00', NULL, false, false, '{}', true, true, true, true, true, true, true, 'Morgan 47', 'Morgan Seed 47', NULL, 'Female', '1996-07-11', NULL, NULL, 'kg', NULL, NULL, NULL, '{rabbit}', 0, NULL, false, '{}', 'Hong Kong', 'free', false, 'Pet-loving free member ready to chat and help.', NULL, false, '2026-03-07 21:58:02.371972+00', NULL, NULL, true, NULL, 0, false, '{}', NULL, NULL, NULL, NULL, 'free', NULL, NULL, true, 'free', NULL, NULL, 0, 0, 0, 0, false, 22.252715090799168, 114.12064573264544, NULL, 'not_submitted', NULL, NULL, '6128569714', '{}', NULL, 'user', true, NULL, NULL, NULL, NULL, NULL, '2026-02-23 13:45:31.346192+00', false, NULL, '{}', false, false, '9000000046', 'free', true, true, '2026-03-06 16:23:13.121273+00', 'not_started', NULL, 'not_started', false, NULL, NULL, NULL, NULL),
	('7af2ae7f-b7e8-41eb-a72e-f2622a1a16d6', NULL, NULL, '2026-02-23 13:44:59.64009+00', NULL, false, false, '{}', true, true, true, true, true, true, true, 'Harper 11', 'Harper Seed 11', NULL, 'Female', '1990-03-11', NULL, NULL, 'kg', NULL, NULL, NULL, '{rabbit}', 0, NULL, false, '{}', 'Hong Kong', 'free', false, 'Pet-loving free member ready to chat and help.', NULL, false, '2026-03-07 21:58:02.371972+00', NULL, NULL, true, NULL, 0, false, '{}', NULL, NULL, NULL, NULL, 'free', NULL, NULL, true, 'free', NULL, NULL, 0, 0, 0, 0, false, 22.28947025048915, 114.18501153070966, NULL, 'not_submitted', NULL, NULL, '9814055541', '{}', NULL, 'user', true, NULL, NULL, NULL, NULL, NULL, '2026-02-23 13:44:59.64009+00', false, NULL, '{}', false, false, '9000000010', 'free', true, true, '2026-03-06 16:23:13.121273+00', 'not_started', NULL, 'not_started', false, NULL, NULL, NULL, NULL),
	('b3f7c0b6-0dad-42cb-b608-1903f35ce76a', NULL, NULL, '2026-02-23 13:45:07.552184+00', NULL, false, false, '{}', true, true, true, true, true, true, true, 'Reese 20', 'Reese Seed 20', NULL, 'Female', '1999-04-11', NULL, NULL, 'kg', NULL, NULL, NULL, '{cat}', 0, NULL, false, '{}', 'Hong Kong', 'free', false, 'Pet-loving free member ready to chat and help.', NULL, false, '2026-03-07 21:58:02.371972+00', NULL, NULL, true, NULL, 0, false, '{}', NULL, NULL, NULL, NULL, 'free', NULL, NULL, true, 'free', NULL, NULL, 0, 0, 0, 0, false, 22.2382819804278, 114.20452443589642, NULL, 'not_submitted', NULL, NULL, '5100978692', '{}', NULL, 'user', true, NULL, NULL, NULL, NULL, NULL, '2026-02-23 13:45:07.552184+00', false, NULL, '{}', false, false, '9000000019', 'free', true, true, '2026-03-06 16:23:13.121273+00', 'not_started', NULL, 'not_started', false, NULL, NULL, NULL, NULL),
	('ef5ad1de-44d4-47b3-ad72-dc5d2d1bd9c1', NULL, NULL, '2026-02-23 13:45:01.476556+00', NULL, false, false, '{}', true, true, true, true, true, true, true, 'Kai 13', 'Kai Seed 13', NULL, 'Male', '1992-05-13', NULL, NULL, 'kg', NULL, NULL, NULL, '{dog}', 0, NULL, true, '{}', 'Hong Kong', 'free', false, 'Pet-loving free member ready to chat and help.', NULL, false, '2026-03-07 21:58:02.371972+00', NULL, NULL, true, NULL, 0, false, '{}', NULL, NULL, NULL, NULL, 'free', NULL, NULL, true, 'free', NULL, NULL, 0, 0, 0, 0, false, 22.27583211023564, 114.16082495429524, NULL, 'not_submitted', NULL, NULL, '6309338250', '{}', NULL, 'user', true, NULL, NULL, NULL, NULL, NULL, '2026-02-23 13:45:01.476556+00', false, NULL, '{}', false, false, '9000000012', 'free', true, true, '2026-03-06 16:23:13.121273+00', 'not_started', NULL, 'not_started', false, NULL, NULL, NULL, NULL),
	('d051c5ed-d6fe-43b4-8c66-471449be0e51', NULL, NULL, '2026-02-23 13:45:02.345988+00', NULL, false, false, '{}', true, true, true, true, true, true, true, 'Jules 14', 'Jules Seed 14', NULL, 'Female', '1993-06-14', NULL, NULL, 'kg', NULL, NULL, NULL, '{cat}', 0, NULL, false, '{}', 'Hong Kong', 'free', false, 'Pet-loving free member ready to chat and help.', NULL, false, '2026-03-07 21:58:02.371972+00', NULL, NULL, true, NULL, 0, false, '{}', NULL, NULL, NULL, NULL, 'free', NULL, NULL, true, 'free', NULL, NULL, 0, 0, 0, 0, false, 22.245782247885163, 114.14049956623329, NULL, 'not_submitted', NULL, NULL, '8641553077', '{}', NULL, 'user', true, NULL, NULL, NULL, NULL, NULL, '2026-02-23 13:45:02.345988+00', false, NULL, '{}', false, false, '9000000013', 'free', true, true, '2026-03-06 16:23:13.121273+00', 'not_started', NULL, 'not_started', false, NULL, NULL, NULL, NULL),
	('248a2d06-f6ab-459c-8d43-0a250c2f9b43', NULL, NULL, '2026-02-23 13:45:03.191751+00', NULL, false, false, '{}', true, true, true, true, true, true, true, 'Emerson 15', 'Emerson Seed 15', NULL, 'Non-binary', '1994-07-15', NULL, NULL, 'kg', NULL, NULL, NULL, '{dog,cat}', 0, NULL, false, '{}', 'Hong Kong', 'free', false, 'Pet-loving free member ready to chat and help.', NULL, false, '2026-03-07 21:58:02.371972+00', NULL, NULL, true, NULL, 0, false, '{}', NULL, NULL, NULL, NULL, 'free', NULL, NULL, true, 'free', NULL, NULL, 0, 0, 0, 0, false, 22.292163023533984, 114.19862940478986, NULL, 'not_submitted', NULL, NULL, '5693314223', '{}', NULL, 'user', true, NULL, NULL, NULL, NULL, NULL, '2026-02-23 13:45:03.191751+00', false, NULL, '{}', false, false, '9000000014', 'free', true, true, '2026-03-06 16:23:13.121273+00', 'not_started', NULL, 'not_started', false, NULL, NULL, NULL, NULL),
	('2e383cb2-e703-4c3f-b6e1-239b4fe1dfbb', NULL, NULL, '2026-02-23 13:45:04.069951+00', NULL, false, false, '{}', true, true, true, true, true, true, true, 'Skyler 16', 'Skyler Seed 16', NULL, 'Male', '1995-08-16', NULL, NULL, 'kg', NULL, NULL, NULL, '{bird}', 0, NULL, true, '{}', 'Hong Kong', 'free', false, 'Pet-loving free member ready to chat and help.', NULL, false, '2026-03-07 21:58:02.371972+00', NULL, NULL, true, NULL, 0, false, '{}', NULL, NULL, NULL, NULL, 'free', NULL, NULL, true, 'free', NULL, NULL, 0, 0, 0, 0, false, 22.297453254682814, 114.1376716492543, NULL, 'not_submitted', NULL, NULL, '3111210947', '{}', NULL, 'user', true, NULL, NULL, NULL, NULL, NULL, '2026-02-23 13:45:04.069951+00', false, NULL, '{}', false, false, '9000000015', 'free', true, true, '2026-03-06 16:23:13.121273+00', 'not_started', NULL, 'not_started', false, NULL, NULL, NULL, NULL),
	('53190b03-3524-4df5-8889-bc1a30002603', NULL, NULL, '2026-02-23 13:45:04.92916+00', NULL, false, false, '{}', true, true, true, true, true, true, true, 'Quinn 17', 'Quinn Seed 17', NULL, 'Female', '1996-01-17', NULL, NULL, 'kg', NULL, NULL, NULL, '{rabbit}', 0, NULL, false, '{}', 'Hong Kong', 'free', false, 'Pet-loving free member ready to chat and help.', NULL, false, '2026-03-07 21:58:02.371972+00', NULL, NULL, true, NULL, 0, false, '{}', NULL, NULL, NULL, NULL, 'free', NULL, NULL, true, 'free', NULL, NULL, 0, 0, 0, 0, false, 22.325563408080576, 114.13344585840875, NULL, 'not_submitted', NULL, NULL, '7468686748', '{}', NULL, 'user', true, NULL, NULL, NULL, NULL, NULL, '2026-02-23 13:45:04.92916+00', false, NULL, '{}', false, false, '9000000016', 'free', true, true, '2026-03-06 16:23:13.121273+00', 'not_started', NULL, 'not_started', false, NULL, NULL, NULL, NULL),
	('330789ee-edd8-4e5b-8ca8-916e35809065', NULL, NULL, '2026-02-23 13:45:05.808878+00', NULL, false, false, '{}', true, true, true, true, true, true, true, 'Hayden 18', 'Hayden Seed 18', NULL, 'Non-binary', '1997-02-18', NULL, NULL, 'kg', NULL, NULL, NULL, '{hamster}', 0, NULL, false, '{}', 'Hong Kong', 'free', false, 'Pet-loving free member ready to chat and help.', NULL, false, '2026-03-07 21:58:02.371972+00', NULL, NULL, true, NULL, 0, false, '{}', NULL, NULL, NULL, NULL, 'free', NULL, NULL, true, 'free', NULL, NULL, 0, 0, 0, 0, false, 22.28283408822764, 114.17728378863359, NULL, 'not_submitted', NULL, NULL, '6012821931', '{}', NULL, 'user', true, NULL, NULL, NULL, NULL, NULL, '2026-02-23 13:45:05.808878+00', false, NULL, '{}', false, false, '9000000017', 'free', true, true, '2026-03-06 16:23:13.121273+00', 'not_started', NULL, 'not_started', false, NULL, NULL, NULL, NULL),
	('9ca2f145-8d75-43e5-9e71-4a3490158947', NULL, NULL, '2026-02-23 13:45:06.701263+00', NULL, false, false, '{}', true, true, true, true, true, true, true, 'Blake 19', 'Blake Seed 19', NULL, 'Male', '1998-03-10', NULL, NULL, 'kg', NULL, NULL, NULL, '{dog}', 0, NULL, true, '{}', 'Hong Kong', 'free', false, 'Pet-loving free member ready to chat and help.', NULL, false, '2026-03-07 21:58:02.371972+00', NULL, NULL, true, NULL, 0, false, '{}', NULL, NULL, NULL, NULL, 'free', NULL, NULL, true, 'free', NULL, NULL, 0, 0, 0, 0, false, 22.277015385970287, 114.13803064176977, NULL, 'not_submitted', NULL, NULL, '4491829619', '{}', NULL, 'user', true, NULL, NULL, NULL, NULL, NULL, '2026-02-23 13:45:06.701263+00', false, NULL, '{}', false, false, '9000000018', 'free', true, true, '2026-03-06 16:23:13.121273+00', 'not_started', NULL, 'not_started', false, NULL, NULL, NULL, NULL),
	('0cb39b40-e57c-4f59-bb71-754f2f504e0f', NULL, NULL, '2026-02-23 13:43:06.716901+00', NULL, false, false, '{}', true, true, true, true, true, true, true, 'Alex 1', 'Alex Seed 1', NULL, 'Male', '1990-01-10', NULL, NULL, 'kg', NULL, NULL, NULL, '{dog}', 0, NULL, true, '{}', 'Hong Kong', 'free', false, 'Pet-loving free member ready to chat and help.', NULL, false, '2026-03-07 21:58:02.371972+00', NULL, NULL, true, NULL, 0, false, '{}', NULL, NULL, NULL, NULL, 'free', NULL, NULL, true, 'free', NULL, NULL, 0, 0, 0, 0, false, 22.27128086023587, 114.19181644253068, NULL, 'not_submitted', NULL, NULL, '4917038583', '{}', NULL, 'user', true, NULL, NULL, NULL, NULL, NULL, '2026-02-23 13:43:06.716901+00', false, NULL, '{}', false, false, '9000000000', 'free', true, true, '2026-03-06 16:23:13.121273+00', 'not_started', NULL, 'not_started', false, NULL, NULL, NULL, NULL),
	('5546372c-ab10-4e2c-b0cc-34dfe6de669b', NULL, NULL, '2026-02-23 13:45:00.566006+00', NULL, false, false, '{}', true, true, true, true, true, true, true, 'Parker 12', 'Parker Seed 12', NULL, 'Non-binary', '1991-04-12', NULL, NULL, 'kg', NULL, NULL, NULL, '{hamster}', 0, NULL, false, '{}', 'Hong Kong', 'free', false, 'Pet-loving free member ready to chat and help.', NULL, false, '2026-03-07 21:58:02.371972+00', NULL, NULL, true, NULL, 0, false, '{}', NULL, NULL, NULL, NULL, 'free', NULL, NULL, true, 'free', NULL, NULL, 0, 0, 0, 0, false, 22.294394031754944, 114.16512772029938, NULL, 'not_submitted', NULL, NULL, '2924160430', '{}', NULL, 'user', true, NULL, NULL, NULL, NULL, NULL, '2026-02-23 13:45:00.566006+00', false, NULL, '{}', false, false, '9000000011', 'free', true, true, '2026-03-06 16:23:13.121273+00', 'not_started', NULL, 'not_started', false, NULL, NULL, NULL, NULL),
	('2711d70c-710e-4be8-84b1-0c6901d72bfc', NULL, NULL, '2026-02-23 13:45:24.296836+00', NULL, false, false, '{}', true, true, true, true, true, true, true, 'Blake 39', 'Blake Seed 39', NULL, 'Non-binary', '1998-07-12', NULL, NULL, 'kg', NULL, NULL, NULL, '{dog,cat}', 0, NULL, false, '{}', 'Hong Kong', 'free', false, 'Pet-loving free member ready to chat and help.', NULL, false, '2026-03-07 21:58:02.371972+00', NULL, NULL, true, NULL, 0, false, '{}', NULL, NULL, NULL, NULL, 'free', NULL, NULL, true, 'free', NULL, NULL, 0, 0, 0, 0, false, 22.307794280934196, 114.12686350220737, NULL, 'not_submitted', NULL, NULL, '2471107311', '{}', NULL, 'user', true, NULL, NULL, NULL, NULL, NULL, '2026-02-23 13:45:24.296836+00', false, NULL, '{}', false, false, '9000000038', 'free', true, true, '2026-03-06 16:23:13.121273+00', 'not_started', NULL, 'not_started', false, NULL, NULL, NULL, NULL),
	('13d810c3-fd15-4eb0-9879-40b46f613e78', NULL, NULL, '2026-02-24 12:24:59.084607+00', NULL, false, false, '{}', true, true, true, true, true, true, true, 'deep.link.1771935897077', 'deep.link.1771935897077', NULL, NULL, NULL, NULL, NULL, 'kg', NULL, NULL, NULL, '{}', 0, NULL, false, '{}', NULL, 'free', false, NULL, NULL, false, '2026-03-07 21:58:02.371972+00', NULL, NULL, true, NULL, 0, false, '{}', NULL, NULL, NULL, NULL, 'free', NULL, NULL, true, 'free', NULL, NULL, 0, 0, 0, 0, false, NULL, NULL, NULL, 'not_submitted', NULL, NULL, '4855062250', '{}', NULL, 'user', true, NULL, NULL, NULL, NULL, NULL, '2026-02-24 12:24:59.084607+00', false, NULL, '{}', false, false, 'u13d810c3fd', 'free', true, true, '2026-03-06 16:23:13.121273+00', 'not_started', NULL, 'not_started', false, NULL, NULL, NULL, NULL),
	('712a088f-4c82-409c-9eac-5ffd2fd233ef', NULL, NULL, '2026-02-23 13:45:32.175691+00', NULL, false, false, '{}', true, true, true, true, true, true, true, 'Avery 48', 'Avery Seed 48', NULL, 'Non-binary', '1997-08-12', NULL, NULL, 'kg', NULL, NULL, NULL, '{hamster}', 0, NULL, false, '{}', 'Hong Kong', 'free', false, 'Pet-loving free member ready to chat and help.', NULL, false, '2026-03-07 21:58:02.371972+00', NULL, NULL, true, NULL, 0, false, '{}', NULL, NULL, NULL, NULL, 'free', NULL, NULL, true, 'free', NULL, NULL, 0, 0, 0, 0, false, 22.295589596508144, 114.16358064235627, NULL, 'not_submitted', NULL, NULL, '7215664359', '{}', NULL, 'user', true, NULL, NULL, NULL, NULL, NULL, '2026-02-23 13:45:32.175691+00', false, NULL, '{}', false, false, '9000000047', 'free', true, true, '2026-03-06 16:23:13.121273+00', 'not_started', NULL, 'not_started', false, NULL, NULL, NULL, NULL),
	('573634a4-0041-4e21-aac3-2dc7bb5f01f7', NULL, NULL, '2026-02-23 13:45:33.063244+00', NULL, false, false, '{}', true, true, true, true, true, true, true, 'Casey 49', 'Casey Seed 49', NULL, 'Male', '1998-01-13', NULL, NULL, 'kg', NULL, NULL, NULL, '{dog}', 0, NULL, true, '{}', 'Hong Kong', 'free', false, 'Pet-loving free member ready to chat and help.', NULL, false, '2026-03-07 21:58:02.371972+00', NULL, NULL, true, NULL, 0, false, '{}', NULL, NULL, NULL, NULL, 'free', NULL, NULL, true, 'free', NULL, NULL, 0, 0, 0, 0, false, 22.25745026698483, 114.21987324550703, NULL, 'not_submitted', NULL, NULL, '1692149784', '{}', NULL, 'user', true, NULL, NULL, NULL, NULL, NULL, '2026-02-23 13:45:33.063244+00', false, NULL, '{}', false, false, '9000000048', 'free', true, true, '2026-03-06 16:23:13.121273+00', 'not_started', NULL, 'not_started', false, NULL, NULL, NULL, NULL),
	('401801e5-3d2b-4b0f-af01-b184b148a9bf', NULL, NULL, '2026-02-23 13:45:33.957584+00', NULL, false, false, '{}', true, true, true, true, true, true, true, 'Rowan 50', 'Rowan Seed 50', NULL, 'Female', '1999-02-14', NULL, NULL, 'kg', NULL, NULL, NULL, '{cat}', 0, NULL, false, '{}', 'Hong Kong', 'free', false, 'Pet-loving free member ready to chat and help.', NULL, false, '2026-03-07 21:58:02.371972+00', NULL, NULL, true, NULL, 0, false, '{}', NULL, NULL, NULL, NULL, 'free', NULL, NULL, true, 'free', NULL, NULL, 0, 0, 0, 0, false, 22.26901817579555, 114.1155715853385, NULL, 'not_submitted', NULL, NULL, '9589913745', '{}', NULL, 'user', true, NULL, NULL, NULL, NULL, NULL, '2026-02-23 13:45:33.957584+00', false, NULL, '{}', false, false, '9000000049', 'free', true, true, '2026-03-06 16:23:13.121273+00', 'not_started', NULL, 'not_started', false, NULL, NULL, NULL, NULL),
	('688a71e7-7acc-4c77-bb2b-518f3d24cf46', NULL, NULL, '2026-02-23 20:19:49.840809+00', NULL, false, false, '{}', true, true, true, true, true, true, true, 'smoke+1771877987355', 'smoke+1771877987355', NULL, NULL, NULL, NULL, NULL, 'kg', NULL, NULL, NULL, '{}', 0, NULL, false, '{}', NULL, 'free', false, NULL, NULL, false, '2026-03-07 21:58:02.371972+00', NULL, NULL, true, NULL, 0, false, '{}', NULL, NULL, NULL, NULL, 'free', NULL, NULL, true, 'free', NULL, NULL, 0, 0, 0, 0, false, NULL, NULL, NULL, 'not_submitted', NULL, NULL, '4170504789', '{}', NULL, 'user', true, NULL, NULL, NULL, NULL, NULL, '2026-02-23 20:19:49.840809+00', false, NULL, '{}', false, false, 'u688a71e77a', 'free', true, true, '2026-03-06 16:23:13.121273+00', 'not_started', NULL, 'not_started', false, NULL, NULL, NULL, NULL),
	('9d340292-d37b-473f-80f1-010fe9fc4fac', NULL, NULL, '2026-02-23 20:20:41.261478+00', NULL, false, false, '{}', true, true, true, true, true, true, true, 'smoke+1771878039702', 'smoke+1771878039702', NULL, NULL, NULL, NULL, NULL, 'kg', NULL, NULL, NULL, '{}', 0, NULL, false, '{}', NULL, 'free', false, NULL, NULL, false, '2026-03-07 21:58:02.371972+00', NULL, NULL, true, NULL, 0, false, '{}', NULL, NULL, NULL, NULL, 'free', NULL, NULL, true, 'free', NULL, NULL, 0, 0, 0, 0, false, NULL, NULL, NULL, 'not_submitted', NULL, NULL, '1454011500', '{}', NULL, 'user', true, NULL, NULL, NULL, NULL, NULL, '2026-02-23 20:20:41.261478+00', false, NULL, '{}', false, false, 'u9d340292d3', 'free', true, true, '2026-03-06 16:23:13.121273+00', 'not_started', NULL, 'not_started', false, NULL, NULL, NULL, NULL),
	('91673215-e452-4561-9aae-c68e27eb4d0a', NULL, NULL, '2026-02-23 20:21:18.988831+00', NULL, false, false, '{}', true, true, true, true, true, true, true, 'smoke+1771878077729', 'smoke+1771878077729', NULL, NULL, NULL, NULL, NULL, 'kg', NULL, NULL, NULL, '{}', 0, NULL, false, '{}', NULL, 'free', false, NULL, NULL, false, '2026-03-07 21:58:02.371972+00', NULL, NULL, true, NULL, 0, false, '{}', NULL, NULL, NULL, NULL, 'free', NULL, NULL, true, 'free', NULL, NULL, 0, 0, 0, 0, false, NULL, NULL, NULL, 'not_submitted', NULL, NULL, '8968518721', '{}', NULL, 'user', true, NULL, NULL, NULL, NULL, NULL, '2026-02-23 20:21:18.988831+00', false, NULL, '{}', false, false, 'u91673215e4', 'free', true, true, '2026-03-06 16:23:13.121273+00', 'not_started', NULL, 'not_started', false, NULL, NULL, NULL, NULL),
	('9f90f24b-3001-4da5-a355-c1a94ca5c274', NULL, NULL, '2026-02-23 13:44:51.651876+00', NULL, false, false, '{}', true, true, true, true, true, true, true, 'Jordan 2', 'Jordan Seed 2', NULL, 'Female', '1991-02-11', NULL, NULL, 'kg', NULL, NULL, NULL, '{cat}', 0, NULL, false, '{}', 'Hong Kong', 'free', false, 'Pet-loving free member ready to chat and help.', NULL, false, '2026-03-07 21:58:02.371972+00', NULL, NULL, true, NULL, 0, false, '{}', NULL, NULL, NULL, NULL, 'free', NULL, NULL, true, 'free', NULL, NULL, 0, 0, 0, 0, false, 22.32851485665755, 114.21023692814826, NULL, 'not_submitted', NULL, NULL, '1152871769', '{}', NULL, 'user', true, NULL, NULL, NULL, NULL, NULL, '2026-02-23 13:44:51.651876+00', false, NULL, '{}', false, false, '9000000001', 'free', true, true, '2026-03-06 16:23:13.121273+00', 'not_started', NULL, 'not_started', false, NULL, NULL, NULL, NULL),
	('b1ebd4a2-85d0-4047-b7a8-d7ce6df5d2bc', NULL, NULL, '2026-02-23 13:44:52.53799+00', NULL, false, false, '{}', true, true, true, true, true, true, true, 'Taylor 3', 'Taylor Seed 3', NULL, 'Non-binary', '1992-03-12', NULL, NULL, 'kg', NULL, NULL, NULL, '{dog,cat}', 0, NULL, false, '{}', 'Hong Kong', 'free', false, 'Pet-loving free member ready to chat and help.', NULL, false, '2026-03-07 21:58:02.371972+00', NULL, NULL, true, NULL, 0, false, '{}', NULL, NULL, NULL, NULL, 'free', NULL, NULL, true, 'free', NULL, NULL, 0, 0, 0, 0, false, 22.242974690048865, 114.10050751480618, NULL, 'not_submitted', NULL, NULL, '3797969218', '{}', NULL, 'user', true, NULL, NULL, NULL, NULL, NULL, '2026-02-23 13:44:52.53799+00', false, NULL, '{}', false, false, '9000000002', 'free', true, true, '2026-03-06 16:23:13.121273+00', 'not_started', NULL, 'not_started', false, NULL, NULL, NULL, NULL),
	('049fd7cf-64b4-4633-9c02-9418873808bd', NULL, NULL, '2026-02-23 13:44:53.359722+00', NULL, false, false, '{}', true, true, true, true, true, true, true, 'Riley 4', 'Riley Seed 4', NULL, 'Male', '1993-04-13', NULL, NULL, 'kg', NULL, NULL, NULL, '{bird}', 0, NULL, true, '{}', 'Hong Kong', 'free', false, 'Pet-loving free member ready to chat and help.', NULL, false, '2026-03-07 21:58:02.371972+00', NULL, NULL, true, NULL, 0, false, '{}', NULL, NULL, NULL, NULL, 'free', NULL, NULL, true, 'free', NULL, NULL, 0, 0, 0, 0, false, 22.28599908930357, 114.18115805333355, NULL, 'not_submitted', NULL, NULL, '5270818255', '{}', NULL, 'user', true, NULL, NULL, NULL, NULL, NULL, '2026-02-23 13:44:53.359722+00', false, NULL, '{}', false, false, '9000000003', 'free', true, true, '2026-03-06 16:23:13.121273+00', 'not_started', NULL, 'not_started', false, NULL, NULL, NULL, NULL),
	('6560a0a4-7cce-408c-b935-d4084336549f', NULL, NULL, '2026-02-23 13:44:54.266911+00', NULL, false, false, '{}', true, true, true, true, true, true, true, 'Cameron 5', 'Cameron Seed 5', NULL, 'Female', '1994-05-14', NULL, NULL, 'kg', NULL, NULL, NULL, '{rabbit}', 0, NULL, false, '{}', 'Hong Kong', 'free', false, 'Pet-loving free member ready to chat and help.', NULL, false, '2026-03-07 21:58:02.371972+00', NULL, NULL, true, NULL, 0, false, '{}', NULL, NULL, NULL, NULL, 'free', NULL, NULL, true, 'free', NULL, NULL, 0, 0, 0, 0, false, 22.323724040798346, 114.13071880619549, NULL, 'not_submitted', NULL, NULL, '2729941460', '{}', NULL, 'user', true, NULL, NULL, NULL, NULL, NULL, '2026-02-23 13:44:54.266911+00', false, NULL, '{}', false, false, '9000000004', 'free', true, true, '2026-03-06 16:23:13.121273+00', 'not_started', NULL, 'not_started', false, NULL, NULL, NULL, NULL),
	('4f8c2d44-c199-47c8-8ea2-467f336414c2', NULL, NULL, '2026-02-23 13:44:55.172571+00', NULL, false, false, '{}', true, true, true, true, true, true, true, 'Drew 6', 'Drew Seed 6', NULL, 'Non-binary', '1995-06-15', NULL, NULL, 'kg', NULL, NULL, NULL, '{hamster}', 0, NULL, false, '{}', 'Hong Kong', 'free', false, 'Pet-loving free member ready to chat and help.', NULL, false, '2026-03-07 21:58:02.371972+00', NULL, NULL, true, NULL, 0, false, '{}', NULL, NULL, NULL, NULL, 'free', NULL, NULL, true, 'free', NULL, NULL, 0, 0, 0, 0, false, 22.242243919879225, 114.16580415561504, NULL, 'not_submitted', NULL, NULL, '7644204579', '{}', NULL, 'user', true, NULL, NULL, NULL, NULL, NULL, '2026-02-23 13:44:55.172571+00', false, NULL, '{}', false, false, '9000000005', 'free', true, true, '2026-03-06 16:23:13.121273+00', 'not_started', NULL, 'not_started', false, NULL, NULL, NULL, NULL),
	('f47edec9-087d-47bb-9b84-eed59aa1c986', NULL, NULL, '2026-02-23 13:44:56.012822+00', NULL, false, false, '{}', true, true, true, true, true, true, true, 'Morgan 7', 'Morgan Seed 7', NULL, 'Male', '1996-07-16', NULL, NULL, 'kg', NULL, NULL, NULL, '{dog}', 0, NULL, true, '{}', 'Hong Kong', 'free', false, 'Pet-loving free member ready to chat and help.', NULL, false, '2026-03-07 21:58:02.371972+00', NULL, NULL, true, NULL, 0, false, '{}', NULL, NULL, NULL, NULL, 'free', NULL, NULL, true, 'free', NULL, NULL, 0, 0, 0, 0, false, 22.30492490415795, 114.18756823797764, NULL, 'not_submitted', NULL, NULL, '9245751087', '{}', NULL, 'user', true, NULL, NULL, NULL, NULL, NULL, '2026-02-23 13:44:56.012822+00', false, NULL, '{}', false, false, '9000000006', 'free', true, true, '2026-03-06 16:23:13.121273+00', 'not_started', NULL, 'not_started', false, NULL, NULL, NULL, NULL),
	('b05171e6-74f0-4a7c-9453-0c966d6615a6', NULL, NULL, '2026-02-23 13:44:56.885945+00', NULL, false, false, '{}', true, true, true, true, true, true, true, 'Avery 8', 'Avery Seed 8', NULL, 'Female', '1997-08-17', NULL, NULL, 'kg', NULL, NULL, NULL, '{cat}', 0, NULL, false, '{}', 'Hong Kong', 'free', false, 'Pet-loving free member ready to chat and help.', NULL, false, '2026-03-07 21:58:02.371972+00', NULL, NULL, true, NULL, 0, false, '{}', NULL, NULL, NULL, NULL, 'free', NULL, NULL, true, 'free', NULL, NULL, 0, 0, 0, 0, false, 22.298604411948133, 114.1563320741053, NULL, 'not_submitted', NULL, NULL, '8997011865', '{}', NULL, 'user', true, NULL, NULL, NULL, NULL, NULL, '2026-02-23 13:44:56.885945+00', false, NULL, '{}', false, false, '9000000007', 'free', true, true, '2026-03-06 16:23:13.121273+00', 'not_started', NULL, 'not_started', false, NULL, NULL, NULL, NULL),
	('0c654e7e-36fd-40e1-a257-80247ffee3d0', NULL, NULL, '2026-02-23 13:44:57.790769+00', NULL, false, false, '{}', true, true, true, true, true, true, true, 'Casey 9', 'Casey Seed 9', NULL, 'Non-binary', '1998-01-18', NULL, NULL, 'kg', NULL, NULL, NULL, '{dog,cat}', 0, NULL, false, '{}', 'Hong Kong', 'free', false, 'Pet-loving free member ready to chat and help.', NULL, false, '2026-03-07 21:58:02.371972+00', NULL, NULL, true, NULL, 0, false, '{}', NULL, NULL, NULL, NULL, 'free', NULL, NULL, true, 'free', NULL, NULL, 0, 0, 0, 0, false, 22.25588684903889, 114.16496317018986, NULL, 'not_submitted', NULL, NULL, '6372893055', '{}', NULL, 'user', true, NULL, NULL, NULL, NULL, NULL, '2026-02-23 13:44:57.790769+00', false, NULL, '{}', false, false, '9000000008', 'free', true, true, '2026-03-06 16:23:13.121273+00', 'not_started', NULL, 'not_started', false, NULL, NULL, NULL, NULL),
	('8ab510b8-230d-49c8-9b80-a0ce8b22738b', NULL, NULL, '2026-02-23 13:44:58.62642+00', NULL, false, false, '{}', true, true, true, true, true, true, true, 'Rowan 10', 'Rowan Seed 10', NULL, 'Male', '1999-02-10', NULL, NULL, 'kg', NULL, NULL, NULL, '{bird}', 0, NULL, true, '{}', 'Hong Kong', 'free', false, 'Pet-loving free member ready to chat and help.', NULL, false, '2026-03-07 21:58:02.371972+00', NULL, NULL, true, NULL, 0, false, '{}', NULL, NULL, NULL, NULL, 'free', NULL, NULL, true, 'free', NULL, NULL, 0, 0, 0, 0, false, 22.33578518665071, 114.1261083692023, NULL, 'not_submitted', NULL, NULL, '0043078862', '{}', NULL, 'user', true, NULL, NULL, NULL, NULL, NULL, '2026-02-23 13:44:58.62642+00', false, NULL, '{}', false, false, '9000000009', 'free', true, true, '2026-03-06 16:23:13.121273+00', 'not_started', NULL, 'not_started', false, NULL, NULL, NULL, NULL),
	('16825b9d-b1af-428c-8348-f950d108f796', NULL, NULL, '2026-02-23 13:45:08.434162+00', NULL, false, false, '{}', true, true, true, true, true, true, true, 'Alex 21', 'Alex Seed 21', NULL, 'Non-binary', '1990-05-12', NULL, NULL, 'kg', NULL, NULL, NULL, '{dog,cat}', 0, NULL, false, '{}', 'Hong Kong', 'free', false, 'Pet-loving free member ready to chat and help.', NULL, false, '2026-03-07 21:58:02.371972+00', NULL, NULL, true, NULL, 0, false, '{}', NULL, NULL, NULL, NULL, 'free', NULL, NULL, true, 'free', NULL, NULL, 0, 0, 0, 0, false, 22.33961201705859, 114.12650860928176, NULL, 'not_submitted', NULL, NULL, '1029026794', '{}', NULL, 'user', true, NULL, NULL, NULL, NULL, NULL, '2026-02-23 13:45:08.434162+00', false, NULL, '{}', false, false, '9000000020', 'free', true, true, '2026-03-06 16:23:13.121273+00', 'not_started', NULL, 'not_started', false, NULL, NULL, NULL, NULL),
	('af2f0bec-4c26-49c0-b672-c1186e4f60cc', NULL, NULL, '2026-02-23 13:45:09.318929+00', NULL, false, false, '{}', true, true, true, true, true, true, true, 'Jordan 22', 'Jordan Seed 22', NULL, 'Male', '1991-06-13', NULL, NULL, 'kg', NULL, NULL, NULL, '{bird}', 0, NULL, true, '{}', 'Hong Kong', 'free', false, 'Pet-loving free member ready to chat and help.', NULL, false, '2026-03-07 21:58:02.371972+00', NULL, NULL, true, NULL, 0, false, '{}', NULL, NULL, NULL, NULL, 'free', NULL, NULL, true, 'free', NULL, NULL, 0, 0, 0, 0, false, 22.324409786673986, 114.1056598317329, NULL, 'not_submitted', NULL, NULL, '8015831794', '{}', NULL, 'user', true, NULL, NULL, NULL, NULL, NULL, '2026-02-23 13:45:09.318929+00', false, NULL, '{}', false, false, '9000000021', 'free', true, true, '2026-03-06 16:23:13.121273+00', 'not_started', NULL, 'not_started', false, NULL, NULL, NULL, NULL),
	('b81745a4-5df8-4d77-8079-91f7adc8edbd', NULL, NULL, '2026-02-23 13:45:10.165861+00', NULL, false, false, '{}', true, true, true, true, true, true, true, 'Taylor 23', 'Taylor Seed 23', NULL, 'Female', '1992-07-14', NULL, NULL, 'kg', NULL, NULL, NULL, '{rabbit}', 0, NULL, false, '{}', 'Hong Kong', 'free', false, 'Pet-loving free member ready to chat and help.', NULL, false, '2026-03-07 21:58:02.371972+00', NULL, NULL, true, NULL, 0, false, '{}', NULL, NULL, NULL, NULL, 'free', NULL, NULL, true, 'free', NULL, NULL, 0, 0, 0, 0, false, 22.220723292705465, 114.13876876886052, NULL, 'not_submitted', NULL, NULL, '6004385533', '{}', NULL, 'user', true, NULL, NULL, NULL, NULL, NULL, '2026-02-23 13:45:10.165861+00', false, NULL, '{}', false, false, '9000000022', 'free', true, true, '2026-03-06 16:23:13.121273+00', 'not_started', NULL, 'not_started', false, NULL, NULL, NULL, NULL),
	('999c5bac-284e-40cf-9002-b1e43c5f8616', NULL, NULL, '2026-02-23 13:45:11.270063+00', NULL, false, false, '{}', true, true, true, true, true, true, true, 'Riley 24', 'Riley Seed 24', NULL, 'Non-binary', '1993-08-15', NULL, NULL, 'kg', NULL, NULL, NULL, '{hamster}', 0, NULL, false, '{}', 'Hong Kong', 'free', false, 'Pet-loving free member ready to chat and help.', NULL, false, '2026-03-07 21:58:02.371972+00', NULL, NULL, true, NULL, 0, false, '{}', NULL, NULL, NULL, NULL, 'free', NULL, NULL, true, 'free', NULL, NULL, 0, 0, 0, 0, false, 22.257798161708582, 114.12336004069618, NULL, 'not_submitted', NULL, NULL, '7957435958', '{}', NULL, 'user', true, NULL, NULL, NULL, NULL, NULL, '2026-02-23 13:45:11.270063+00', false, NULL, '{}', false, false, '9000000023', 'free', true, true, '2026-03-06 16:23:13.121273+00', 'not_started', NULL, 'not_started', false, NULL, NULL, NULL, NULL),
	('57db7b5a-f943-4eb8-85cf-8a66e3472d95', NULL, NULL, '2026-02-23 13:45:12.097418+00', NULL, false, false, '{}', true, true, true, true, true, true, true, 'Cameron 25', 'Cameron Seed 25', NULL, 'Male', '1994-01-16', NULL, NULL, 'kg', NULL, NULL, NULL, '{dog}', 0, NULL, true, '{}', 'Hong Kong', 'free', false, 'Pet-loving free member ready to chat and help.', NULL, false, '2026-03-07 21:58:02.371972+00', NULL, NULL, true, NULL, 0, false, '{}', NULL, NULL, NULL, NULL, 'free', NULL, NULL, true, 'free', NULL, NULL, 0, 0, 0, 0, false, 22.26975214544657, 114.21018836056275, NULL, 'not_submitted', NULL, NULL, '5142506808', '{}', NULL, 'user', true, NULL, NULL, NULL, NULL, NULL, '2026-02-23 13:45:12.097418+00', false, NULL, '{}', false, false, '9000000024', 'free', true, true, '2026-03-06 16:23:13.121273+00', 'not_started', NULL, 'not_started', false, NULL, NULL, NULL, NULL),
	('ab88d021-10c0-474c-90cb-4a020a2ad376', NULL, NULL, '2026-02-23 13:45:12.99938+00', NULL, false, false, '{}', true, true, true, true, true, true, true, 'Drew 26', 'Drew Seed 26', NULL, 'Female', '1995-02-17', NULL, NULL, 'kg', NULL, NULL, NULL, '{cat}', 0, NULL, false, '{}', 'Hong Kong', 'free', false, 'Pet-loving free member ready to chat and help.', NULL, false, '2026-03-07 21:58:02.371972+00', NULL, NULL, true, NULL, 0, false, '{}', NULL, NULL, NULL, NULL, 'free', NULL, NULL, true, 'free', NULL, NULL, 0, 0, 0, 0, false, 22.276767286816035, 114.15153582095972, NULL, 'not_submitted', NULL, NULL, '9524130859', '{}', NULL, 'user', true, NULL, NULL, NULL, NULL, NULL, '2026-02-23 13:45:12.99938+00', false, NULL, '{}', false, false, '9000000025', 'free', true, true, '2026-03-06 16:23:13.121273+00', 'not_started', NULL, 'not_started', false, NULL, NULL, NULL, NULL),
	('f2352373-78ae-4e89-b122-28062f108314', NULL, NULL, '2026-02-23 13:45:13.848348+00', NULL, false, false, '{}', true, true, true, true, true, true, true, 'Morgan 27', 'Morgan Seed 27', NULL, 'Non-binary', '1996-03-18', NULL, NULL, 'kg', NULL, NULL, NULL, '{dog,cat}', 0, NULL, false, '{}', 'Hong Kong', 'free', false, 'Pet-loving free member ready to chat and help.', NULL, false, '2026-03-07 21:58:02.371972+00', NULL, NULL, true, NULL, 0, false, '{}', NULL, NULL, NULL, NULL, 'free', NULL, NULL, true, 'free', NULL, NULL, 0, 0, 0, 0, false, 22.335532639766726, 114.15571325674618, NULL, 'not_submitted', NULL, NULL, '5915645807', '{}', NULL, 'user', true, NULL, NULL, NULL, NULL, NULL, '2026-02-23 13:45:13.848348+00', false, NULL, '{}', false, false, '9000000026', 'free', true, true, '2026-03-06 16:23:13.121273+00', 'not_started', NULL, 'not_started', false, NULL, NULL, NULL, NULL),
	('a1d83329-0847-471a-90dc-7f6629e93e95', NULL, NULL, '2026-02-23 13:45:14.755914+00', NULL, false, false, '{}', true, true, true, true, true, true, true, 'Avery 28', 'Avery Seed 28', NULL, 'Male', '1997-04-10', NULL, NULL, 'kg', NULL, NULL, NULL, '{bird}', 0, NULL, true, '{}', 'Hong Kong', 'free', false, 'Pet-loving free member ready to chat and help.', NULL, false, '2026-03-07 21:58:02.371972+00', NULL, NULL, true, NULL, 0, false, '{}', NULL, NULL, NULL, NULL, 'free', NULL, NULL, true, 'free', NULL, NULL, 0, 0, 0, 0, false, 22.31309574519577, 114.17007470815867, NULL, 'not_submitted', NULL, NULL, '3682750144', '{}', NULL, 'user', true, NULL, NULL, NULL, NULL, NULL, '2026-02-23 13:45:14.755914+00', false, NULL, '{}', false, false, '9000000027', 'free', true, true, '2026-03-06 16:23:13.121273+00', 'not_started', NULL, 'not_started', false, NULL, NULL, NULL, NULL),
	('1a5db664-8ef8-4e5f-85be-fc0556fd1fdd', NULL, NULL, '2026-02-23 13:45:15.612505+00', NULL, false, false, '{}', true, true, true, true, true, true, true, 'Casey 29', 'Casey Seed 29', NULL, 'Female', '1998-05-11', NULL, NULL, 'kg', NULL, NULL, NULL, '{rabbit}', 0, NULL, false, '{}', 'Hong Kong', 'free', false, 'Pet-loving free member ready to chat and help.', NULL, false, '2026-03-07 21:58:02.371972+00', NULL, NULL, true, NULL, 0, false, '{}', NULL, NULL, NULL, NULL, 'free', NULL, NULL, true, 'free', NULL, NULL, 0, 0, 0, 0, false, 22.245790811453812, 114.20807631877732, NULL, 'not_submitted', NULL, NULL, '0685227081', '{}', NULL, 'user', true, NULL, NULL, NULL, NULL, NULL, '2026-02-23 13:45:15.612505+00', false, NULL, '{}', false, false, '9000000028', 'free', true, true, '2026-03-06 16:23:13.121273+00', 'not_started', NULL, 'not_started', false, NULL, NULL, NULL, NULL),
	('61fff020-3c25-4f3b-822c-6b2423e987e3', NULL, NULL, '2026-02-23 13:45:19.084169+00', NULL, false, false, '{}', true, true, true, true, true, true, true, 'Kai 33', 'Kai Seed 33', NULL, 'Non-binary', '1992-01-15', NULL, NULL, 'kg', NULL, NULL, NULL, '{dog,cat}', 0, NULL, false, '{}', 'Hong Kong', 'free', false, 'Pet-loving free member ready to chat and help.', NULL, false, '2026-03-07 21:58:02.371972+00', NULL, NULL, true, NULL, 0, false, '{}', NULL, NULL, NULL, NULL, 'free', NULL, NULL, true, 'free', NULL, NULL, 0, 0, 0, 0, false, 22.320419397496444, 114.18263693634836, NULL, 'not_submitted', NULL, NULL, '8950528702', '{}', NULL, 'user', true, NULL, NULL, NULL, NULL, NULL, '2026-02-23 13:45:19.084169+00', false, NULL, '{}', false, false, '9000000032', 'free', true, true, '2026-03-06 16:23:13.121273+00', 'not_started', NULL, 'not_started', false, NULL, NULL, NULL, NULL),
	('33e45f53-a933-4b8b-9c4a-f907d800b088', NULL, NULL, '2026-02-23 13:45:19.960574+00', NULL, false, false, '{}', true, true, true, true, true, true, true, 'Jules 34', 'Jules Seed 34', NULL, 'Male', '1993-02-16', NULL, NULL, 'kg', NULL, NULL, NULL, '{bird}', 0, NULL, true, '{}', 'Hong Kong', 'free', false, 'Pet-loving free member ready to chat and help.', NULL, false, '2026-03-07 21:58:02.371972+00', NULL, NULL, true, NULL, 0, false, '{}', NULL, NULL, NULL, NULL, 'free', NULL, NULL, true, 'free', NULL, NULL, 0, 0, 0, 0, false, 22.287473176652952, 114.15306680164605, NULL, 'not_submitted', NULL, NULL, '4519346149', '{}', NULL, 'user', true, NULL, NULL, NULL, NULL, NULL, '2026-02-23 13:45:19.960574+00', false, NULL, '{}', false, false, '9000000033', 'free', true, true, '2026-03-06 16:23:13.121273+00', 'not_started', NULL, 'not_started', false, NULL, NULL, NULL, NULL),
	('558c23da-678b-40a4-8667-f17478c04427', NULL, NULL, '2026-02-23 13:45:20.911372+00', NULL, false, false, '{}', true, true, true, true, true, true, true, 'Emerson 35', 'Emerson Seed 35', NULL, 'Female', '1994-03-17', NULL, NULL, 'kg', NULL, NULL, NULL, '{rabbit}', 0, NULL, false, '{}', 'Hong Kong', 'free', false, 'Pet-loving free member ready to chat and help.', NULL, false, '2026-03-07 21:58:02.371972+00', NULL, NULL, true, NULL, 0, false, '{}', NULL, NULL, NULL, NULL, 'free', NULL, NULL, true, 'free', NULL, NULL, 0, 0, 0, 0, false, 22.3069006435381, 114.19624422578241, NULL, 'not_submitted', NULL, NULL, '7593019161', '{}', NULL, 'user', true, NULL, NULL, NULL, NULL, NULL, '2026-02-23 13:45:20.911372+00', false, NULL, '{}', false, false, '9000000034', 'free', true, true, '2026-03-06 16:23:13.121273+00', 'not_started', NULL, 'not_started', false, NULL, NULL, NULL, NULL),
	('a0808549-470a-42aa-aa3d-970063d20b36', NULL, NULL, '2026-02-23 13:45:21.767193+00', NULL, false, false, '{}', true, true, true, true, true, true, true, 'Skyler 36', 'Skyler Seed 36', NULL, 'Non-binary', '1995-04-18', NULL, NULL, 'kg', NULL, NULL, NULL, '{hamster}', 0, NULL, false, '{}', 'Hong Kong', 'free', false, 'Pet-loving free member ready to chat and help.', NULL, false, '2026-03-07 21:58:02.371972+00', NULL, NULL, true, NULL, 0, false, '{}', NULL, NULL, NULL, NULL, 'free', NULL, NULL, true, 'free', NULL, NULL, 0, 0, 0, 0, false, 22.252172091337346, 114.20772747644028, NULL, 'not_submitted', NULL, NULL, '7930844184', '{}', NULL, 'user', true, NULL, NULL, NULL, NULL, NULL, '2026-02-23 13:45:21.767193+00', false, NULL, '{}', false, false, '9000000035', 'free', true, true, '2026-03-06 16:23:13.121273+00', 'not_started', NULL, 'not_started', false, NULL, NULL, NULL, NULL),
	('91247bb5-7c93-4d46-a7fa-5906a55312ed', NULL, NULL, '2026-02-23 13:45:22.59784+00', NULL, false, false, '{}', true, true, true, true, true, true, true, 'Quinn 37', 'Quinn Seed 37', NULL, 'Male', '1996-05-10', NULL, NULL, 'kg', NULL, NULL, NULL, '{dog}', 0, NULL, true, '{}', 'Hong Kong', 'free', false, 'Pet-loving free member ready to chat and help.', NULL, false, '2026-03-07 21:58:02.371972+00', NULL, NULL, true, NULL, 0, false, '{}', NULL, NULL, NULL, NULL, 'free', NULL, NULL, true, 'free', NULL, NULL, 0, 0, 0, 0, false, 22.310403323863817, 114.20061390807824, NULL, 'not_submitted', NULL, NULL, '3230483482', '{}', NULL, 'user', true, NULL, NULL, NULL, NULL, NULL, '2026-02-23 13:45:22.59784+00', false, NULL, '{}', false, false, '9000000036', 'free', true, true, '2026-03-06 16:23:13.121273+00', 'not_started', NULL, 'not_started', false, NULL, NULL, NULL, NULL),
	('ad704984-09ae-4fc2-bb7c-9062de2da145', NULL, NULL, '2026-02-23 13:45:23.465995+00', NULL, false, false, '{}', true, true, true, true, true, true, true, 'Hayden 38', 'Hayden Seed 38', NULL, 'Female', '1997-06-11', NULL, NULL, 'kg', NULL, NULL, NULL, '{cat}', 0, NULL, false, '{}', 'Hong Kong', 'free', false, 'Pet-loving free member ready to chat and help.', NULL, false, '2026-03-07 21:58:02.371972+00', NULL, NULL, true, NULL, 0, false, '{}', NULL, NULL, NULL, NULL, 'free', NULL, NULL, true, 'free', NULL, NULL, 0, 0, 0, 0, false, 22.324591371343125, 114.15045503211137, NULL, 'not_submitted', NULL, NULL, '6077269306', '{}', NULL, 'user', true, NULL, NULL, NULL, NULL, NULL, '2026-02-23 13:45:23.465995+00', false, NULL, '{}', false, false, '9000000037', 'free', true, true, '2026-03-06 16:23:13.121273+00', 'not_started', NULL, 'not_started', false, NULL, NULL, NULL, NULL),
	('c6c96794-d3fe-41d8-bd7d-11535823a7b9', NULL, NULL, '2026-02-23 13:45:25.200253+00', NULL, false, false, '{}', true, true, true, true, true, true, true, 'Reese 40', 'Reese Seed 40', NULL, 'Male', '1999-08-13', NULL, NULL, 'kg', NULL, NULL, NULL, '{bird}', 0, NULL, true, '{}', 'Hong Kong', 'free', false, 'Pet-loving free member ready to chat and help.', NULL, false, '2026-03-07 21:58:02.371972+00', NULL, NULL, true, NULL, 0, false, '{}', NULL, NULL, NULL, NULL, 'free', NULL, NULL, true, 'free', NULL, NULL, 0, 0, 0, 0, false, 22.225655821156614, 114.14616009245532, NULL, 'not_submitted', NULL, NULL, '8126041370', '{}', NULL, 'user', true, NULL, NULL, NULL, NULL, NULL, '2026-02-23 13:45:25.200253+00', false, NULL, '{}', false, false, '9000000039', 'free', true, true, '2026-03-06 16:23:13.121273+00', 'not_started', NULL, 'not_started', false, NULL, NULL, NULL, NULL),
	('64b9a01e-6854-43ba-9a3d-c92a736b1d9e', NULL, NULL, '2026-02-23 13:45:26.090423+00', NULL, false, false, '{}', true, true, true, true, true, true, true, 'Alex 41', 'Alex Seed 41', NULL, 'Female', '1990-01-14', NULL, NULL, 'kg', NULL, NULL, NULL, '{rabbit}', 0, NULL, false, '{}', 'Hong Kong', 'free', false, 'Pet-loving free member ready to chat and help.', NULL, false, '2026-03-07 21:58:02.371972+00', NULL, NULL, true, NULL, 0, false, '{}', NULL, NULL, NULL, NULL, 'free', NULL, NULL, true, 'free', NULL, NULL, 0, 0, 0, 0, false, 22.270328011803667, 114.13417576680706, NULL, 'not_submitted', NULL, NULL, '5035681145', '{}', NULL, 'user', true, NULL, NULL, NULL, NULL, NULL, '2026-02-23 13:45:26.090423+00', false, NULL, '{}', false, false, '9000000040', 'free', true, true, '2026-03-06 16:23:13.121273+00', 'not_started', NULL, 'not_started', false, NULL, NULL, NULL, NULL),
	('d5d8ffa0-8975-4e29-9700-5020382f26f6', NULL, NULL, '2026-02-23 13:45:26.919952+00', NULL, false, false, '{}', true, true, true, true, true, true, true, 'Jordan 42', 'Jordan Seed 42', NULL, 'Non-binary', '1991-02-15', NULL, NULL, 'kg', NULL, NULL, NULL, '{hamster}', 0, NULL, false, '{}', 'Hong Kong', 'free', false, 'Pet-loving free member ready to chat and help.', NULL, false, '2026-03-07 21:58:02.371972+00', NULL, NULL, true, NULL, 0, false, '{}', NULL, NULL, NULL, NULL, 'free', NULL, NULL, true, 'free', NULL, NULL, 0, 0, 0, 0, false, 22.322307390828822, 114.13620293912872, NULL, 'not_submitted', NULL, NULL, '5326553147', '{}', NULL, 'user', true, NULL, NULL, NULL, NULL, NULL, '2026-02-23 13:45:26.919952+00', false, NULL, '{}', false, false, '9000000041', 'free', true, true, '2026-03-06 16:23:13.121273+00', 'not_started', NULL, 'not_started', false, NULL, NULL, NULL, NULL),
	('24ba406e-3a0d-42f2-8d64-86c623c88397', NULL, NULL, '2026-02-23 13:45:27.838589+00', NULL, false, false, '{}', true, true, true, true, true, true, true, 'Taylor 43', 'Taylor Seed 43', NULL, 'Male', '1992-03-16', NULL, NULL, 'kg', NULL, NULL, NULL, '{dog}', 0, NULL, true, '{}', 'Hong Kong', 'free', false, 'Pet-loving free member ready to chat and help.', NULL, false, '2026-03-07 21:58:02.371972+00', NULL, NULL, true, NULL, 0, false, '{}', NULL, NULL, NULL, NULL, 'free', NULL, NULL, true, 'free', NULL, NULL, 0, 0, 0, 0, false, 22.300295241858436, 114.1758205310826, NULL, 'not_submitted', NULL, NULL, '4107100191', '{}', NULL, 'user', true, NULL, NULL, NULL, NULL, NULL, '2026-02-23 13:45:27.838589+00', false, NULL, '{}', false, false, '9000000042', 'free', true, true, '2026-03-06 16:23:13.121273+00', 'not_started', NULL, 'not_started', false, NULL, NULL, NULL, NULL),
	('651ca2ea-7b64-4c66-a37b-56f9f39f6a38', NULL, NULL, '2026-02-23 13:45:28.732573+00', NULL, false, false, '{}', true, true, true, true, true, true, true, 'Riley 44', 'Riley Seed 44', NULL, 'Female', '1993-04-17', NULL, NULL, 'kg', NULL, NULL, NULL, '{cat}', 0, NULL, false, '{}', 'Hong Kong', 'free', false, 'Pet-loving free member ready to chat and help.', NULL, false, '2026-03-07 21:58:02.371972+00', NULL, NULL, true, NULL, 0, false, '{}', NULL, NULL, NULL, NULL, 'free', NULL, NULL, true, 'free', NULL, NULL, 0, 0, 0, 0, false, 22.294279545526404, 114.18842266815221, NULL, 'not_submitted', NULL, NULL, '6878375367', '{}', NULL, 'user', true, NULL, NULL, NULL, NULL, NULL, '2026-02-23 13:45:28.732573+00', false, NULL, '{}', false, false, '9000000043', 'free', true, true, '2026-03-06 16:23:13.121273+00', 'not_started', NULL, 'not_started', false, NULL, NULL, NULL, NULL),
	('142fe520-1179-4031-b22f-268e2107a64c', NULL, NULL, '2026-02-24 12:25:16.075261+00', NULL, false, false, '{}', true, true, true, true, true, true, true, 'deep.link.1771935914902', 'deep.link.1771935914902', NULL, NULL, NULL, NULL, NULL, 'kg', NULL, NULL, NULL, '{}', 0, NULL, false, '{}', NULL, 'free', false, NULL, NULL, false, '2026-03-07 21:58:02.371972+00', NULL, NULL, true, NULL, 0, false, '{}', NULL, NULL, NULL, NULL, 'free', NULL, NULL, true, 'free', NULL, NULL, 0, 0, 0, 0, false, NULL, NULL, NULL, 'not_submitted', NULL, NULL, '5235017060', '{}', NULL, 'user', true, NULL, NULL, NULL, NULL, NULL, '2026-02-24 12:25:16.075261+00', false, NULL, '{}', false, false, 'u142fe52011', 'free', true, true, '2026-03-06 16:23:13.121273+00', 'not_started', NULL, 'not_started', false, NULL, NULL, NULL, NULL),
	('9f132236-a0b0-4af3-b51e-4bde1a54c02c', NULL, NULL, '2026-02-26 20:03:17.071326+00', NULL, false, false, '{}', true, true, true, true, true, true, true, 'probe+1772136195875', 'probe+1772136195875', NULL, NULL, NULL, NULL, NULL, 'kg', NULL, NULL, NULL, '{}', 0, NULL, false, '{}', NULL, 'free', false, NULL, NULL, false, '2026-03-07 21:58:02.371972+00', NULL, NULL, true, NULL, 0, false, '{}', NULL, NULL, NULL, NULL, 'free', NULL, NULL, true, 'free', NULL, NULL, 0, 0, 0, 0, false, NULL, NULL, NULL, 'not_submitted', NULL, NULL, '2429571277', '{}', NULL, 'user', true, NULL, NULL, NULL, NULL, NULL, '2026-02-26 20:03:17.071326+00', false, NULL, '{}', false, false, 'u9f132236a0', 'free', true, true, '2026-03-06 16:23:13.121273+00', 'not_started', NULL, 'not_started', false, NULL, NULL, NULL, NULL),
	('ebd6df42-69b7-473f-8da9-c25407a8f88f', NULL, NULL, '2026-02-26 20:06:45.570517+00', NULL, false, false, '{}', true, true, true, true, true, true, true, 'overflow+1772136404298', 'overflow+1772136404298', NULL, NULL, NULL, NULL, NULL, 'kg', NULL, NULL, NULL, '{}', 0, NULL, false, '{}', NULL, 'free', false, NULL, NULL, false, '2026-03-07 21:58:02.371972+00', NULL, NULL, true, NULL, 0, false, '{}', NULL, NULL, NULL, NULL, 'free', NULL, NULL, true, 'free', NULL, NULL, 0, 0, 0, 0, false, NULL, NULL, NULL, 'not_submitted', NULL, NULL, '7181015320', '{}', NULL, 'user', true, NULL, NULL, NULL, NULL, NULL, '2026-02-26 20:06:45.570517+00', false, NULL, '{}', false, false, 'uebd6df4269', 'free', true, true, '2026-03-06 16:23:13.121273+00', 'not_started', NULL, 'not_started', false, NULL, NULL, NULL, NULL);


--
-- Data for Name: admin_audit_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: pets; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: ai_vet_conversations; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: ai_vet_messages; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: ai_vet_rate_limits; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: ai_vet_usage; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: map_alerts; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: alert_interactions; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: broadcast_alerts; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: broadcast_alert_interactions; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: chats; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."chats" ("id", "type", "name", "avatar_url", "created_by", "created_at", "updated_at", "last_message_at") VALUES
	('873f8aeb-7b22-4d80-b7c3-e02de0cc3060', 'direct', 'Test Seed Chat', NULL, '0cb39b40-e57c-4f59-bb71-754f2f504e0f', '2026-02-23 18:48:48.263418+00', '2026-02-23 18:48:48.263418+00', '2026-02-23 18:48:48.263418+00');


--
-- Data for Name: chat_messages; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: chat_participants; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: chat_room_members; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: consent_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: device_fingerprint_history; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: lost_pet_alerts; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: emergency_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: family_members; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: hazard_identifications; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: human_verification_attempts; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: identity_verification_cleanup_queue; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: location_reviews; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: map_alert_notification_queue; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: map_checkins; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: marketplace_bookings; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: match_preferences; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: matches; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: messages; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: message_reads; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: notice_board; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: notification_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: notification_preferences; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: notifications; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: subscriptions; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: payments; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: pet_care_profiles; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: pins; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."pins" ("id", "user_id", "lat", "lng", "thread_id", "is_public", "expires_at", "created_at", "is_invisible") VALUES
	('9587a817-a6e1-48e2-b644-7f8fd3bc3081', 'e4b8346e-727b-41e0-8b08-26569cecef45', 22.319194569701256, 114.15986625135314, NULL, false, NULL, '2026-03-07 21:58:02.371972+00', false),
	('e95eecd8-0362-49bb-b0a3-09e79eb56fe7', '935ee81a-2819-462a-8725-54664345f7a3', 22.314764080979373, 114.12876567651108, NULL, false, NULL, '2026-03-07 21:58:02.371972+00', false),
	('403d2dd1-77a8-41c3-90a9-c837fe49b1ca', 'ade29a94-38b6-4723-830b-902c217fe8f6', 22.278727796649942, 114.14836446504432, NULL, false, NULL, '2026-03-07 21:58:02.371972+00', false),
	('10276126-a754-4a99-9ecf-bcfd3bbe8e2d', '30e7e892-86c1-4d51-a527-d2a87735df09', 22.242321258333924, 114.19038342468045, NULL, false, NULL, '2026-03-07 21:58:02.371972+00', false),
	('ca9b10cc-80b9-43c0-b616-a0d36d22c6db', '8710cc78-f489-4848-b273-4896394f5477', 22.32844995066945, 114.12667077240023, NULL, false, NULL, '2026-03-07 21:58:02.371972+00', false),
	('30cbef70-abea-4b2a-a288-82c45255b9c0', '11735970-c8be-4401-a56e-8c32661037ac', 22.252715090799168, 114.12064573264544, NULL, false, NULL, '2026-03-07 21:58:02.371972+00', false),
	('4ae3378a-6369-42e2-a354-2020a7fd0404', '7af2ae7f-b7e8-41eb-a72e-f2622a1a16d6', 22.28947025048915, 114.18501153070966, NULL, false, NULL, '2026-03-07 21:58:02.371972+00', false),
	('301115b2-389a-443f-a106-cf3a85f55044', 'b3f7c0b6-0dad-42cb-b608-1903f35ce76a', 22.2382819804278, 114.20452443589642, NULL, false, NULL, '2026-03-07 21:58:02.371972+00', false),
	('728971b6-2a7e-4e9a-b484-9e057d4820e7', 'ef5ad1de-44d4-47b3-ad72-dc5d2d1bd9c1', 22.27583211023564, 114.16082495429524, NULL, false, NULL, '2026-03-07 21:58:02.371972+00', false),
	('b2b942b1-2e07-43af-80fb-e218f2981084', 'd051c5ed-d6fe-43b4-8c66-471449be0e51', 22.245782247885163, 114.14049956623329, NULL, false, NULL, '2026-03-07 21:58:02.371972+00', false),
	('780e328a-9246-4534-ae78-c74feafb1f12', '248a2d06-f6ab-459c-8d43-0a250c2f9b43', 22.292163023533984, 114.19862940478986, NULL, false, NULL, '2026-03-07 21:58:02.371972+00', false),
	('42f8e8c3-227c-4233-aed0-650f45edde59', '2e383cb2-e703-4c3f-b6e1-239b4fe1dfbb', 22.297453254682814, 114.1376716492543, NULL, false, NULL, '2026-03-07 21:58:02.371972+00', false),
	('b0272578-b4db-4282-af91-db7eb5b5d513', '53190b03-3524-4df5-8889-bc1a30002603', 22.325563408080576, 114.13344585840875, NULL, false, NULL, '2026-03-07 21:58:02.371972+00', false),
	('534a6dea-99e0-4dda-89c2-ac9947c4bd7f', '330789ee-edd8-4e5b-8ca8-916e35809065', 22.28283408822764, 114.17728378863359, NULL, false, NULL, '2026-03-07 21:58:02.371972+00', false),
	('31155ec9-fcae-417b-a2ca-ca170c612696', '9ca2f145-8d75-43e5-9e71-4a3490158947', 22.277015385970287, 114.13803064176977, NULL, false, NULL, '2026-03-07 21:58:02.371972+00', false),
	('ba901d1e-2d31-4a7a-8244-7a619a3228f4', '0cb39b40-e57c-4f59-bb71-754f2f504e0f', 22.27128086023587, 114.19181644253068, NULL, false, NULL, '2026-03-07 21:58:02.371972+00', false),
	('1f8ba9ce-2e91-4c43-ab80-b8ae2cbf4a50', '5546372c-ab10-4e2c-b0cc-34dfe6de669b', 22.294394031754944, 114.16512772029938, NULL, false, NULL, '2026-03-07 21:58:02.371972+00', false),
	('3f447a26-45ad-44eb-9faa-eda844bf38cd', '2711d70c-710e-4be8-84b1-0c6901d72bfc', 22.307794280934196, 114.12686350220737, NULL, false, NULL, '2026-03-07 21:58:02.371972+00', false),
	('648f6609-47c3-43e7-b5f3-8d285c81801d', '712a088f-4c82-409c-9eac-5ffd2fd233ef', 22.295589596508144, 114.16358064235627, NULL, false, NULL, '2026-03-07 21:58:02.371972+00', false),
	('acb16b4e-0c5e-48a3-9a39-88eb61b22cc0', '573634a4-0041-4e21-aac3-2dc7bb5f01f7', 22.25745026698483, 114.21987324550703, NULL, false, NULL, '2026-03-07 21:58:02.371972+00', false),
	('5a64d8b2-706e-4d68-a576-71f945a075ad', '401801e5-3d2b-4b0f-af01-b184b148a9bf', 22.26901817579555, 114.1155715853385, NULL, false, NULL, '2026-03-07 21:58:02.371972+00', false),
	('63b68fa6-8fff-4c02-8869-63c48d7602e3', '9f90f24b-3001-4da5-a355-c1a94ca5c274', 22.32851485665755, 114.21023692814826, NULL, false, NULL, '2026-03-07 21:58:02.371972+00', false),
	('51d22568-0fee-41e4-a505-83857e102699', 'b1ebd4a2-85d0-4047-b7a8-d7ce6df5d2bc', 22.242974690048865, 114.10050751480618, NULL, false, NULL, '2026-03-07 21:58:02.371972+00', false),
	('40a436bf-3ffc-4166-813b-fcb04864666c', '049fd7cf-64b4-4633-9c02-9418873808bd', 22.28599908930357, 114.18115805333355, NULL, false, NULL, '2026-03-07 21:58:02.371972+00', false),
	('19161ee4-ab96-4b02-b839-6790f02a7994', '6560a0a4-7cce-408c-b935-d4084336549f', 22.323724040798346, 114.13071880619549, NULL, false, NULL, '2026-03-07 21:58:02.371972+00', false),
	('20b15209-6a3a-41de-8662-9795bd50c3b6', '4f8c2d44-c199-47c8-8ea2-467f336414c2', 22.242243919879225, 114.16580415561504, NULL, false, NULL, '2026-03-07 21:58:02.371972+00', false),
	('b39b7a10-1bbd-44eb-a8ad-d21d7836fe4f', 'f47edec9-087d-47bb-9b84-eed59aa1c986', 22.30492490415795, 114.18756823797764, NULL, false, NULL, '2026-03-07 21:58:02.371972+00', false),
	('d29df65b-27c5-4bd1-bf62-184be8d17910', 'b05171e6-74f0-4a7c-9453-0c966d6615a6', 22.298604411948133, 114.1563320741053, NULL, false, NULL, '2026-03-07 21:58:02.371972+00', false),
	('7cc67c5b-b369-48c5-8020-b08bc176bacf', '0c654e7e-36fd-40e1-a257-80247ffee3d0', 22.25588684903889, 114.16496317018986, NULL, false, NULL, '2026-03-07 21:58:02.371972+00', false),
	('3b6e765d-3f99-43a0-a558-601cf2ae43bb', '8ab510b8-230d-49c8-9b80-a0ce8b22738b', 22.33578518665071, 114.1261083692023, NULL, false, NULL, '2026-03-07 21:58:02.371972+00', false),
	('8ea694d8-f53b-4443-9b15-7f97dfbb4aba', '16825b9d-b1af-428c-8348-f950d108f796', 22.33961201705859, 114.12650860928176, NULL, false, NULL, '2026-03-07 21:58:02.371972+00', false),
	('5d839ea5-e703-4998-9f99-249c2430336d', 'af2f0bec-4c26-49c0-b672-c1186e4f60cc', 22.324409786673986, 114.1056598317329, NULL, false, NULL, '2026-03-07 21:58:02.371972+00', false),
	('ea897605-da1d-4241-94c5-ec69700b615b', 'b81745a4-5df8-4d77-8079-91f7adc8edbd', 22.220723292705465, 114.13876876886052, NULL, false, NULL, '2026-03-07 21:58:02.371972+00', false),
	('354904e4-bd45-4665-bff2-bb63e6fb5516', '999c5bac-284e-40cf-9002-b1e43c5f8616', 22.257798161708582, 114.12336004069618, NULL, false, NULL, '2026-03-07 21:58:02.371972+00', false),
	('2324e832-6b93-462c-8618-72b0508f748e', '57db7b5a-f943-4eb8-85cf-8a66e3472d95', 22.26975214544657, 114.21018836056275, NULL, false, NULL, '2026-03-07 21:58:02.371972+00', false),
	('1cb6f9b9-3da1-4151-af1c-0f98dca1c271', 'ab88d021-10c0-474c-90cb-4a020a2ad376', 22.276767286816035, 114.15153582095972, NULL, false, NULL, '2026-03-07 21:58:02.371972+00', false),
	('776f883a-1574-454c-9b5d-0361db0459a1', 'f2352373-78ae-4e89-b122-28062f108314', 22.335532639766726, 114.15571325674618, NULL, false, NULL, '2026-03-07 21:58:02.371972+00', false),
	('12c05eca-f70b-4e02-a11d-511cbaf79bfc', 'a1d83329-0847-471a-90dc-7f6629e93e95', 22.31309574519577, 114.17007470815867, NULL, false, NULL, '2026-03-07 21:58:02.371972+00', false),
	('9e2e81de-cac5-4126-a2cd-7495ba159246', '1a5db664-8ef8-4e5f-85be-fc0556fd1fdd', 22.245790811453812, 114.20807631877732, NULL, false, NULL, '2026-03-07 21:58:02.371972+00', false),
	('7c609f2d-f02e-41ce-bbda-9111cc674c1a', '61fff020-3c25-4f3b-822c-6b2423e987e3', 22.320419397496444, 114.18263693634836, NULL, false, NULL, '2026-03-07 21:58:02.371972+00', false),
	('b65611f2-9a71-4d47-8335-008c52f22922', '33e45f53-a933-4b8b-9c4a-f907d800b088', 22.287473176652952, 114.15306680164605, NULL, false, NULL, '2026-03-07 21:58:02.371972+00', false),
	('25f93ebc-96c5-4e31-abad-1f12104b8d82', '558c23da-678b-40a4-8667-f17478c04427', 22.3069006435381, 114.19624422578241, NULL, false, NULL, '2026-03-07 21:58:02.371972+00', false),
	('ec100df1-6b87-4fe1-b456-45d7f3711f13', 'a0808549-470a-42aa-aa3d-970063d20b36', 22.252172091337346, 114.20772747644028, NULL, false, NULL, '2026-03-07 21:58:02.371972+00', false),
	('7c70e7b5-0e2c-4ac0-91a4-2b9a820f920a', '91247bb5-7c93-4d46-a7fa-5906a55312ed', 22.310403323863817, 114.20061390807824, NULL, false, NULL, '2026-03-07 21:58:02.371972+00', false),
	('01883a41-8ac1-44dc-9284-3143a06d133d', 'ad704984-09ae-4fc2-bb7c-9062de2da145', 22.324591371343125, 114.15045503211137, NULL, false, NULL, '2026-03-07 21:58:02.371972+00', false),
	('28ca73ad-067a-4b60-84b6-0ae631170d07', 'c6c96794-d3fe-41d8-bd7d-11535823a7b9', 22.225655821156614, 114.14616009245532, NULL, false, NULL, '2026-03-07 21:58:02.371972+00', false),
	('032f85ed-2e8e-4946-84b3-11cd6b5ac990', '64b9a01e-6854-43ba-9a3d-c92a736b1d9e', 22.270328011803667, 114.13417576680706, NULL, false, NULL, '2026-03-07 21:58:02.371972+00', false),
	('8c0547a4-097c-4030-8ae0-2418ade9a400', 'd5d8ffa0-8975-4e29-9700-5020382f26f6', 22.322307390828822, 114.13620293912872, NULL, false, NULL, '2026-03-07 21:58:02.371972+00', false),
	('b8d3a205-1b72-4f91-940b-65c19772456e', '24ba406e-3a0d-42f2-8d64-86c623c88397', 22.300295241858436, 114.1758205310826, NULL, false, NULL, '2026-03-07 21:58:02.371972+00', false),
	('e77eb494-1538-4b12-8415-8785f31405e4', '651ca2ea-7b64-4c66-a37b-56f9f39f6a38', 22.294279545526404, 114.18842266815221, NULL, false, NULL, '2026-03-07 21:58:02.371972+00', false);


--
-- Data for Name: poi_locations; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."poi_locations" ("id", "osm_id", "poi_type", "name", "latitude", "longitude", "address", "phone", "opening_hours", "is_active", "last_harvested_at", "created_at", "updated_at") VALUES
	('199abec8-7a00-47fd-9c1f-928d0816261c', 'node_857784484', 'veterinary', 'PPC動物診所', 22.3178158, 114.1917413, NULL, NULL, NULL, true, '2026-02-10 13:29:53.543+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('bf2eb8e5-923b-401b-b694-f56def69a0cf', 'node_4846202895', 'veterinary', 'Veterinary Clinic', 22.3297258, 114.1916537, '打鼓嶺道 Tak Ku Ling Road 54', NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('3e57192d-4688-4c80-a917-51b1008c8b2b', 'node_4846605096', 'pet_grooming', 'O My Dog', 22.2793907, 114.2260545, '筲箕灣道 Shau Kei Wan Road', NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('0a7e9d62-cbcd-4b60-a642-b343b088e494', 'node_4846605110', 'pet_shop', '狗狗物語 Monogatari of Pet', 22.2799311, 114.2257246, '筲箕灣道 Shau Kei Wan Road 235', NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('1eade823-21d6-4be7-9002-cac781f8843e', 'node_4846641819', 'pet_shop', 'Sweet Heart Grooming', 22.3456617, 114.1977213, '雙鳳街 Sheung Fung Street', NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('16ff0f3c-3137-42f5-9bdb-260859c7a1b4', 'node_4847959959', 'veterinary', '東區動物醫院 East Island Animal Hospital', 22.2801582, 114.2250966, '筲箕灣道 Shau Kei Wan Road 256', '+852 2915 3999', '24/7', true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('d34a92ca-2388-4199-a388-3c7e7b127a76', 'node_4848058994', 'veterinary', 'The Sanctuary Animal Hospital', 22.2831096, 114.22095, '筲箕灣道 Shau Kei Wan Road', NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('4d6d6e1f-391f-4e4d-8046-52a8d386646d', 'node_4848257009', 'veterinary', 'International Pet Therapy and Grooming Academy', 22.279819, 114.2250256, '西灣河街 Sai Wan Ho Street', NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('39ae7f63-9a65-4a85-bb10-2f0ff52cb5bc', 'node_4848257010', 'veterinary', 'Vetopia', 22.2798271, 114.2249831, '西灣河街 Sai Wan Ho Street', NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('2f5ab3f3-56a8-4fbe-b0c0-8a91ee7308ac', 'node_4848257016', 'pet_shop', 'Ctny Motors', 22.2800681, 114.2239469, '西灣河街 Sai Wan Ho Street', NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('f09138ea-c5f2-4b1f-90a8-506df3042172', 'node_4848291641', 'pet_shop', '多多龍 Totoro Supplies', 22.278541, 114.2269272, '南康街 Nam Hong Street', NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('cc78f987-cda8-4d0a-9745-acc1459cc68f', 'node_4848301626', 'veterinary', '南區獸醫中心 Southern District Veterinary Centre', 22.2435854, 114.153543, '鴨脷洲大街 Main Street, Ap Lei Chau 165-167號地下A1-A2', NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('1866e729-0243-48ad-97e3-dc0c7da0b78e', 'node_4849846778', 'veterinary', 'Biorecovery Veterinary Clinic', 22.2857477, 114.1384228, '第三街 Third Street', NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('994e35ff-73f6-4435-a602-ec1ec8c7f4da', 'node_4855891400', 'pet_shop', '廷和水族世界 Ting Wo Aquarium World', 22.2850302, 114.1927028, '英皇道 King''s Road', NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('1e732e2d-339a-4db5-8419-1c6c686f0e1a', 'node_4856227765', 'veterinary', 'Central Animal Hospital', 22.2858433, 114.1905255, '興發街 Hing Fat Street', NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('0b223aee-36fd-4b30-8da9-a8532f2d90ce', 'node_4856397003', 'veterinary', 'Dr. Hugh''s Veterinary Hospital', 22.2851133, 114.1910737, '永興街 Wing Hing Street', NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('5bf223f1-1015-487c-9cec-aafde4373d3e', 'node_4856435231', 'pet_shop', 'Tony''s Aquarium', 22.2854078, 114.1908614, '歌頓道 Gordon Road', NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('9c20b770-dfab-4391-a198-a79648c763b1', 'node_4856435242', 'veterinary', '夏利維動物醫院 Chris & Nicola''s Animal Hospital', 22.2854322, 114.1926761, '永興街 Wing Hing Street 37', '+852 2570 6048', 'Mo-Fr 08:00-20:00; Sa-Su 09:00-18:00', true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('1d019c57-2dfe-4656-81a2-9d57a7c8a58d', 'node_4857802425', 'pet_shop', '愛的寵物店 Honey Pet Shop', 22.2771322, 114.1705065, '莊士敦道 Johnston Road', NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('b40a86d2-f2e2-4b72-ae54-41143078f0c9', 'node_4858151668', 'pet_shop', 'Dog Cat', 22.3285485, 114.1667113, '大埔道 Tai Po Road', NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('cd53a059-947d-4a70-82a2-7173ed13c8b8', 'node_4858263681', 'veterinary', 'Pets Central', 22.2918384, 114.1982704, '渣華道 Java Road', NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('bc221486-291b-4f54-8267-dc35361e5ab0', 'node_4858562063', 'pet_shop', 'Lego Pet', 22.2817126, 114.1836565, '景隆街 Cannon Street', NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('94cd9d75-7e9b-49d4-a96c-1e2979b6e9ba', 'node_4858562064', 'pet_shop', 'Flag Ship Pet Grooming', 22.2817658, 114.1836268, '景隆街 Cannon Street', NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('e944efcc-c38e-43d9-96db-666cfc4a00bc', 'node_4858618223', 'pet_shop', '寵物網 PetsOrder', 22.2807279, 114.1833354, '駱克道 Lockhart Road 509', NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('9d6c2e0e-0e47-4ff6-8098-cf6e4331eb46', 'node_4858620562', 'pet_shop', 'Mega Pet', 22.2815816, 114.1834955, '景隆街 Cannon Street', NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('86cf55ce-a221-45d6-b8c4-7bac758b47f6', 'node_4858620563', 'pet_shop', 'Pets Icon', 22.2816218, 114.1834752, '景隆街 Cannon Street', NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('554c254b-2d9a-4f39-bb57-75023c030c53', 'node_4858671793', 'pet_shop', '爪子大本營 Paws and Friends', 22.3725642, 114.1110815, '沙咀道 Sha Tsui Road', NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('a622ee3e-ea3c-4f2b-b191-003b02e9adfb', 'node_4858671797', 'veterinary', '享和動物醫療中心 Heung Wo Animal Medical Centre', 22.3721387, 114.1118371, '沙咀道 Sha Tsui Road 136-138', NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('a12a90e4-cf9c-4494-9145-9c50485155b9', 'node_4860203936', 'pet_shop', '小美尾 Wagging Tails', 22.2848554, 114.1911132, '興發街 Hing Fat Street', NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('6ac98f31-d47c-4560-94f5-89fc7eb5acee', 'node_4860203937', 'veterinary', '中央動物醫院 Central Animal Hospital', 22.285007, 114.1910577, '興發街 Hing Fat Street', NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('42806180-8aef-4bda-8af1-de05296ad000', 'node_4860226234', 'pet_shop', 'Honey Pet Shop', 22.2902801, 114.1946668, '電氣道 Electric Road', NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('fac84cc3-4584-4edd-978f-e620b60a0642', 'node_4860226248', 'pet_shop', 'Mode', 22.2911732, 114.1957039, '渣華道 Java Road', NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('e8f522da-e5ed-4fde-b230-983743215371', 'node_4860337568', 'pet_shop', '龍貓仔專門店 Chinchilla & Pets Shop', 22.2913116, 114.195531, '渣華道 Java Road', NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('10856c62-4104-4a78-9571-76d5c486c778', 'node_4860337571', 'pet_shop', 'Universal Pet''s Grooming', 22.2915148, 114.1961306, '渣華道 Java Road', NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('5b003f24-77fc-49ef-8777-9597c8d16c24', 'node_4860600547', 'veterinary', '九龍貓醫院 Kowloon Cat Hospital', 22.3271622, 114.1660686, '鴨寮街 Apliu Street 22', NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('f81468ed-070e-42a7-8e65-c6d561f23015', 'node_4861954703', 'veterinary', 'Happy Pets', 22.2789091, 114.1914894, '銅鑼灣道 Tung Lo Wan Road', NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('ce12a0dd-f7b1-4b06-8fb2-9a335ed06577', 'node_4862215539', 'pet_shop', 'Loving Care', 22.278738, 114.1911811, '銅鑼灣道 Tung Lo Wan Road', NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('de8324f3-b352-4cbf-937d-a3bba395ed44', 'node_4862215540', 'pet_shop', 'Zoo Pet''s Grooming', 22.2786299, 114.1909382, '銅鑼灣道 Tung Lo Wan Road', NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('263f439a-7662-4c8a-b2f6-b713b9f70825', 'node_4862626529', 'pet_shop', '樂高寵物 Lego Pet', 22.2863908, 114.1334161, '皇后大道西 Queen''s Road West', NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('2de634b8-cf27-42f7-b08f-8c6af19f5cf9', 'node_4862651555', 'pet_shop', 'YG Pet Pet Club', 22.2815623, 114.1264328, '加多近街 Cadogan Street', NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('80b6c643-1869-4a5b-9583-b0015a01ce47', 'node_4862727292', 'pet_shop', 'Sun Lucky Pet Shop', 22.3355022, 114.1602978, '青山道 Castle Peak Road 136', NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('0d062250-ca2b-430c-941a-6cd56ca1687e', 'node_4864408017', 'pet_shop', 'I love Pet', 22.3188131, 114.1637227, '橡樹街 Oak Street', NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('0cd6f268-68e9-458f-aaea-514ea3dee76f', 'node_4864458951', 'pet_shop', '太子寵物 Prince Pet', 22.3685579, 114.1149618, NULL, NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('81372ce5-fbcb-4fdf-bfae-9ea15c375b03', 'node_4864458954', 'pet_shop', 'D.O.G. Styling and Goods', 22.3677084, 114.1165481, NULL, NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('9d95c41d-d895-46b1-8331-e65d37a1260c', 'node_4864691166', 'pet_shop', 'I Love Pet Pet', 22.3188341, 114.192294, '土瓜灣道 To Kwa Wan Road', NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('279c8ff1-3530-4960-8c5e-e0062e532888', 'node_4870055747', 'pet_shop', 'Potwest Dog Grooming', 22.2828521, 114.1262405, '吉席街 Catchick Street', NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('6fab0d76-22c6-489b-8c87-cc9aa4dda7e9', 'node_4870055748', 'pet_shop', 'Dogger', 22.2828778, 114.1262468, '吉席街 Catchick Street', NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('e2f0ffbb-7c8e-403f-9053-51d9a99cf3a4', 'node_4870055763', 'pet_shop', 'Doggy', 22.2831062, 114.1275851, '吉席街 Catchick Street', NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('e0a820c5-28a1-401d-b424-410f78f0b289', 'node_4870091593', 'pet_shop', 'Paws Buddy', 22.2835638, 114.1292912, '吉席街 Catchick Street', NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('a252400d-b802-45fd-af9a-b2b71831829e', 'node_4870132928', 'pet_shop', 'Puppy Doggy', 22.2849685, 114.1312876, '堅彌地城海旁 Praya, Kennedy Town', NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('cf482cc5-ba39-47dd-96a7-b774798d178d', 'node_5397532203', 'veterinary', '西沙路動物醫院 Sai Sha Road Animal Hospital', 22.4246901, 114.2303562, NULL, NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('4c3d9cf3-0001-49cc-9e39-6f28c62b9677', 'node_5397532204', 'pet_shop', 'Pet Pet Shop', 22.4246592, 114.2302482, NULL, NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('72cd476a-7a82-4c92-83e9-c7215e92e95f', 'node_5397606805', 'pet_shop', '田園貓狗美容 Noah''s Ark', 22.4245904, 114.23004, NULL, NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('6663ae0f-054d-442e-b4ae-35ccf3da1485', 'node_5397686915', 'veterinary', '新港城獸醫中心', 22.4224988, 114.232371, NULL, NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('c49bf6da-39e5-4f2d-b093-393281a8cbd3', 'node_5397686917', 'pet_shop', '精伶犬 Clever Pet Shop', 22.4227617, 114.2322731, NULL, NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('1ced1533-5d59-4012-aa15-9c49d24d9520', 'node_5397686919', 'pet_shop', '貓犬浴場 Natural & Morn Pet Grooming', 22.4228298, 114.2328672, NULL, NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('4b1bdef5-7b5d-413b-9846-ddd62359268c', 'node_5397786893', 'pet_shop', 'Go Home 寵物美容 Go Home Pets Grooming', 22.4239601, 114.2338882, NULL, NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('c21335fc-fad5-4e98-8396-0c43fe1849bd', 'node_5398079729', 'veterinary', '馬鞍山動物醫院 Ma On Shan Animal Hospital', 22.4250809, 114.2288787, NULL, NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('522d1a10-8bab-4f79-84f8-658a835b955c', 'node_5398498594', 'pet_shop', 'Pet Pet Shop', 22.4298349, 114.2427922, NULL, NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('5696ce77-a03a-4f13-883b-553ea64a1d42', 'node_5697014486', 'veterinary', 'SAA伍威權動物醫療中心 SAA Albert Wu Veyerinary Centre', 22.4456239, 114.0318006, NULL, NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('26551f25-c204-4870-9b95-a1f66a3c2fce', 'node_5943272908', 'veterinary', '北區動物診所 Northern Animal Clinic', 22.50504, 114.12701, '新豐路 San Fung Avenue 55', NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('b58517d9-f009-4e27-819d-2e10f17cad3b', 'node_5954298859', 'pet_shop', '銀河 Galaxy Aquarium', 22.323238, 114.169881, '通菜街 Tung Choi Street 190', NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('8d874d07-7939-4a7d-b00f-cdf7eeca1873', 'node_5954298860', 'pet_shop', '迪士尼水族', 22.323278, 114.169872, '通菜街 Tung Choi Street 192', NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('1ea55390-a7e7-48f0-bd76-d1e391fa1fad', 'node_5954298863', 'pet_shop', '海港錦鯉中心 Harbour Koi Centre', 22.32306, 114.169913, '通菜街 Tung Choi Street 182', NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('b34d4cbe-e5d5-492a-91ad-e385243847ff', 'node_5964190367', 'veterinary', '上水寵物診所 Sheung Shui Veterinary Clinic', 22.5060519, 114.1274711, '新成路 San Shing Avenue 8', '+852 26392229', 'Mo-Su,PH 09:30-20:00', true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('cf7189d5-3701-4941-9021-83bf305a1dd7', 'node_5964190368', 'pet_shop', '88寵物中心 88 Pet Centre', 22.5060559, 114.1274467, '新成路 San Shing Avenue 6A', NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('7a3b9d07-bde0-446d-be0e-58b6a3cc977c', 'node_6378290618', 'pet_shop', '均記雀鳥 Kwan Kee Birds & Small Animals', 22.275865, 114.171242, '大王東街 Tai Wong Street East', NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('3ba99a48-ef9c-4b91-a149-bde66dd0d3fe', 'node_6417901295', 'pet_shop', 'Pet Paradise', 22.2824029, 114.1854255, NULL, NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('9da348ac-2f98-4150-9fa1-8f5334010726', 'node_6759443415', 'pet_shop', 'Little Boss', 22.2796658, 114.185146, NULL, NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('ad45e320-2ffc-4644-9629-3e036eb0c385', 'node_6815269169', 'pet_shop', 'PETs 818', 22.5057373, 114.127376, '新健街 San Kin Street 5', NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('88e2ec7a-d061-4033-a18a-81b69df6cc76', 'node_7159756148', 'veterinary', 'Island Veterinary Services', 22.2963243, 114.0160373, NULL, '+852 2987 9003', '09:00-19:00', true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('13e8af03-c8e2-43d5-bae2-e138ffc15f2e', 'node_7159756149', 'pet_grooming', 'Pets Gallery', 22.2962821, 114.0160521, NULL, '+852 2987 0428', NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('7b146b32-406c-4c00-8f1f-31dad62e26e4', 'node_7276260009', 'pet_shop', 'Pet Line', 22.5045413, 114.1295696, '新成路 San Shing Avenue 103', NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('c8e36a5c-0562-44ce-b135-2dc368653f12', 'node_7457152985', 'veterinary', '城大動物醫療中心 CityU Veterinary Medical Centre', 22.3290573, 114.159491, '荔枝角道 Lai Chi Kok Road 339', NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('31fa9d1a-ee49-4d45-bf5c-0a79d000b5c9', 'node_7462486043', 'veterinary', '寵心動物診所', 22.3073071, 114.1861346, NULL, NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('a9bf8bab-a6ea-4433-9cfb-dfc26b8f2dbe', 'node_7525763037', 'pet_shop', 'Pet Stop', 22.2916125, 113.9486239, NULL, NULL, 'Tu-Th,Sa-Su 12:00-20:30', true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('1a9a879b-a75c-4508-a87c-de6165b6b0fd', 'node_7528576372', 'veterinary', '東涌獸醫中心 Tung Chung Vet Centre', 22.2924929, 113.9431385, NULL, NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('7a673932-1386-41f3-bfcc-1c60dc3e494b', 'node_8018280318', 'veterinary', '柏域獸醫診所 Pet’n Vet Clinic', 22.3293305, 114.1910746, '城南道 South Wall Road 32', NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('1f311c3b-6bbc-48d2-b1ca-3d6c162a0959', 'node_8285806303', 'pet_shop', '寵物城 Mega Pet', 22.3803501, 114.272692, '萬年街 Man Nin Street 110', NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('a9df899c-493a-482f-8cb5-d2f5c4918d04', 'node_8285806304', 'veterinary', '西貢獸醫醫院 Pet Space Sai Kung Veterinary Hospital', 22.3802421, 114.2725939, '萬年街 Man Nin Street 116', NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('5f7dd47f-defe-4daa-8438-aa6c3decadee', 'node_8530290108', 'pet_shop', 'Pet Line', 22.3052511, 114.1856558, NULL, NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('a0aa4e6d-880d-44aa-b9d4-28a57f674b39', 'node_8597580285', 'veterinary', '沙田圍獸醫診所 Shatin Wai Pet Clinic', 22.3796248, 114.1974503, '沙田圍崗背街9號', NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('dab5dc61-9c23-4033-a4f3-cd59af49a6db', 'node_8664262821', 'pet_shop', '天恩愛寵屋', 22.3652815, 114.1356401, NULL, NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('d0d6aced-a6ad-4ee9-898b-042cfc28cfaf', 'node_8726852697', 'pet_grooming', 'Pet Grooming', 22.3131415, 114.1649255, NULL, NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('e5dd8a45-db50-4726-81d2-27b39dedc642', 'node_9603237009', 'veterinary', 'Nine Lives', 22.2829419, 114.1277783, 'Hau Wo Street', NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('4c123cd0-8f86-4d7d-b6f6-2f0f1df8d5cf', 'node_9603237010', 'pet_shop', 'Pet West', 22.2828919, 114.1274713, 'Hau Wo Street', NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('2029d45a-ff3a-4969-ab8b-ce9dd404818e', 'node_9789497991', 'pet_grooming', 'Dog.Lover', 22.3296169, 114.1897824, '南角道 Nam Kok Road 39', NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('c9592f18-97da-44d3-a523-f8a263eeae29', 'node_9913575076', 'pet_shop', '貓犬站', 22.3300839, 114.159682, '欽州街 Yen Chow Street 56A', NULL, 'Mo-Su 12:00-21:00', true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('76fa8381-6ec8-4d9b-bf4f-01e9438bb970', 'node_9938961256', 'veterinary', '希樂動物診所', 22.3269923, 114.1659711, '鴨寮街 Apliu Street 17', '+852 2397 0800', 'Tu-Fr 08:30-12:30,14:00-16:00; Sa 08:30-12:30; Su 09:00-12:00', true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('ada80d3a-5648-48a2-a91c-f207ff0c61c5', 'node_10133043714', 'veterinary', '香港非牟利獸醫診所 Hong Kong Non-Profit making Veterinary Clinic', 22.3249889, 114.167107, '基隆街 Ki Lung Street 22-24', '+852 2393 2070', NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('9b9397d9-69d5-44a4-a521-75a76474c566', 'node_10133043715', 'veterinary', 'NPV動物中醫藥及針灸中心 NPV Traditional Chinese Medicine And Acupuncture Centre', 22.3255957, 114.1660204, '基隆街 Ki Lung Street 77', '+852 2393 2070', NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('367bc64a-8490-4871-86e7-4ea92ec7c158', 'node_10133043716', 'veterinary', 'NPV社區動物醫療中心 NPV Stray Animal Medical Centre', 22.325834, 114.166032, '基隆街 Ki Lung Street 72', '+852 2391 0789', NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('7a0311cd-3bb7-4800-84e4-70f72c617bcc', 'node_10133611149', 'veterinary', 'NPV 動物醫院 NPV Animal Hospital', 22.3255546, 114.1663999, '基隆街 Ki Lung Street 50', '+852 2393 2070', '24/7', true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('921a42d9-f811-434f-89b7-54ac60009bba', 'node_10141514948', 'veterinary', 'NPV 香港非牟利獸醫診所 Hong Kong Non-Profit making Veterinary Clinic', 22.2922661, 114.1978407, '和富道 Wharf Road 116', NULL, 'Mo-Su 09:00-19:00', true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('7c8911ef-7bdd-46a4-a7bd-02b6a358ce3d', 'node_10547868310', 'pet_shop', 'Happy Pet', 22.3219113, 114.1699152, NULL, NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('9640f5e9-c000-4be6-ad97-155b0fbe36de', 'node_10726301484', 'pet_grooming', 'Pet Pet HK', 22.3218433, 114.1710771, '洗衣街 Sai Yee Street 149A', NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('d6ada76d-d36e-42c0-8591-d9532b0d1b7b', 'node_10810968750', 'pet_shop', '樂高寵物 Lego Pet', 22.3221049, 114.1700996, '通菜街 Tung Choi Street 156', NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('f3290dd1-59c0-44ac-b1e7-1c9d82d37ec8', 'node_10810968751', 'pet_shop', '經典寵物店 Classic Pet Shop', 22.3215727, 114.1702078, '通菜街 Tung Choi Street 132', NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('c971f17e-3fb2-4dbc-a73e-5aca1bedefc1', 'node_10810968752', 'pet_shop', 'Sit Hand Down', 22.3216186, 114.1701985, '通菜街 Tung Choi Street 134', NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('259f9115-efe0-4196-be0b-d1042a290311', 'node_10810968753', 'pet_shop', '寵物武士 Samurai Pet', 22.3218488, 114.1701517, '通菜街 Tung Choi Street 144', NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('ce96f2db-2c17-4766-952c-87704bbf6696', 'node_10810968755', 'pet_shop', 'Pet Empire', 22.322022, 114.1701165, '通菜街 Tung Choi Street 152', NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('7726e80d-35ed-489a-b846-8eabf6442f3a', 'node_10810968758', 'pet_shop', 'KOC Pet', 22.3217104, 114.1701798, '通菜街 Tung Choi Street 138', NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('df4283cc-894e-4598-aa89-9d5c6bd58aad', 'node_10810968759', 'pet_shop', 'Gimme Paw', 22.3216645, 114.1701891, '通菜街 Tung Choi Street 136', NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('5ecafff8-c42d-434e-952a-2682e5ee2b3a', 'node_10810968760', 'pet_shop', 'Little Boss', 22.3218668, 114.170148, '通菜街 Tung Choi Street 146', NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('08621c40-f19a-4ee5-984f-e80b415135a3', 'node_10810968761', 'pet_shop', 'Petsco', 22.3214809, 114.1702264, '通菜街 Tung Choi Street 128', NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('9d3a8c7c-2daf-4d2d-9d7f-678403bf131e', 'node_10810968762', 'pet_shop', '星匯寵物 Galaxy Pets', 22.3219392, 114.1701333, '通菜街 Tung Choi Street 148', NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('db7dc266-4a68-463e-9333-68121b79989b', 'node_10810968763', 'pet_shop', 'Pet Line', 22.3217563, 114.1701705, '通菜街 Tung Choi Street 140', NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('fd27d280-d01d-49e5-80ea-23fb10ce574b', 'node_13229847798', 'veterinary', '森灵动物医院', 22.5530566, 113.8908878, NULL, NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('1b6e5aa3-06d3-42ad-8052-d28023415426', 'node_13321362637', 'pet_shop', 'Sze Pet', 22.3355109, 114.159963, NULL, NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('0af87c46-8d9d-453c-8096-fdf8fd909bb5', 'node_13387881173', 'pet_grooming', 'Unique Pet', 22.2793116, 114.1518971, '羅便臣道 Robinson Road 30-32', NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('9a48f7d8-5724-4e83-b4cd-189e4d5c1ce3', 'node_13387881188', 'pet_shop', 'The Barkyard', 22.2799534, 114.151146, '摩羅廟交加街 Mosque Junction 20', NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('76c96f4b-0539-43c2-a836-4d5f721adf92', 'node_13387881542', 'pet_shop', 'petペット', 22.2805243, 114.1512199, '卑利街 Peel Street 80-82', '+852 6360 1010', NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('aee69e4f-ee60-4410-8fdd-4fc7c0e91c8f', 'node_13387881543', 'veterinary', '半山獸醫中心 Mid Levels Veterinary Centre', 22.2805566, 114.1512581, '卑利街 Peel Street 80-82', '+852 2140 6581', 'Mo-Sa 09:00-20:00; Su,PH 10:00-19:00', true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('6e000bdd-6117-46eb-90c0-527638a436d3', 'node_13387881546', 'pet_grooming', '寵物窩', 22.280322, 114.1511859, '摩羅廟街 Mosque Street 31-37', '+852 9021 8212', NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('8fdd8060-72e5-4c49-ba58-21eef68e06ad', 'way_169412855', 'veterinary', '奧運馬房馬醫院', 22.395704, 114.2037782, NULL, NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('bff94d92-8d3b-4a6b-9a77-123ae7830534', 'way_301326728', 'veterinary', '海洋公園獸醫院 Ocean Park Veterinary Hospital', 22.2437752, 114.178199, NULL, NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('59b763b2-40c8-4b76-b1e8-80b079401015', 'way_495065161', 'pet_shop', 'Pet Brother', 22.4343935, 113.9953763, '田心路 Tin Sum Road', NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('0f61da03-4acf-480e-aeb1-584457e6ba57', 'way_620768173', 'veterinary', '大龍獸醫化驗所 Tai Lung Veterinary Laboratory', 22.4826631, 114.1156639, NULL, NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('de891a88-e8e4-4564-8315-c4c28cee40f3', 'way_844989002', 'veterinary', 'Veterinary Clinic', 22.4827202, 114.1157461, NULL, NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('169fd51e-92f0-4e0c-a825-cc9bd319f1ee', 'way_849146141', 'veterinary', '獸醫中心 Veterinary Centre', 22.2323269, 114.1703528, NULL, NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('1350ecde-f78c-47e9-bd64-a1431da40deb', 'way_887523890', 'veterinary', '動物管理及動物福利綜合大樓 Animal Management and Animal Welfare Building Complex', 22.3199046, 114.205963, '承佑街 Shing Yau Street 16', NULL, 'Mo-Su 09:00-13:00,14:00-16:30', true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('4a270da0-90e0-4c54-8d1a-f28919b9f2e8', 'way_1380029192', 'veterinary', '元朗錦綉動物褔利中心 Fairview Animal Welfare Centre', 22.4723593, 114.0515037, '錦綉花園大道 Fairview Park Boulevard', '+852 2482 2770', NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('f07ac6cc-49f3-4f26-bafd-bfbdf805d11c', 'node_2023414804', 'veterinary', '寵樂動物診所 HPVC', 22.4478228, 114.1691559, NULL, NULL, NULL, true, '2026-02-10 13:29:53.543+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('0388e682-3684-4290-baea-a9c6b48ce217', 'node_2082869275', 'veterinary', '東九龍動物醫院 Kowloon East Animal Hospital', 22.315911, 114.2231084, NULL, NULL, NULL, true, '2026-02-10 13:29:53.543+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('f82efebc-f79c-4b47-afd0-e9aadf4b63f2', 'node_3296355750', 'pet_shop', '愛寵店 My Dear Pet Shop', 22.286735, 114.1398234, NULL, NULL, NULL, true, '2026-02-10 13:29:53.543+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('f53f72ca-8443-4b8c-bf26-8a0c7195c1fb', 'node_3667223174', 'pet_shop', '維記水族', 22.2763112, 114.1745209, NULL, NULL, NULL, true, '2026-02-10 13:29:53.543+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('bfe1d2ac-bccc-4252-943a-b75b81ec0658', 'node_3668108823', 'pet_shop', '新海濤寵物屋', 22.2770478, 114.1757919, NULL, NULL, NULL, true, '2026-02-10 13:29:53.543+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('df463eb1-1a2d-4603-aaf7-4c3e3e7726d5', 'node_3668141211', 'pet_shop', '冠軍堡寵物用品店', 22.2763634, 114.1764068, NULL, NULL, NULL, true, '2026-02-10 13:29:53.543+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('e0e3de05-948f-44bc-8861-8c8e9d3f7e10', 'node_3748707248', 'veterinary', '馬醫院 Equine Hospital', 22.4033489, 114.2092177, NULL, NULL, NULL, true, '2026-02-10 13:29:53.543+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('ec83b638-58eb-4703-b624-ea5d8ceb7ee3', 'node_4085148859', 'veterinary', '紅磡獸醫診所 Hung Hom Veterinary Clinic', 22.3064122, 114.1883189, NULL, NULL, NULL, true, '2026-02-10 13:29:53.543+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('3b8b9fa2-83f1-4782-85dc-c7c1d9ba7019', 'node_4085148864', 'veterinary', '澳洲寵物醫院 Australia Veterinary Hospital', 22.3067381, 114.1881608, NULL, NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('2f9e1d23-b1b2-4061-953d-587fa3845275', 'node_4334008310', 'veterinary', '仁德動物醫院', 22.4472009, 114.166034, NULL, NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('b1d8fdc3-eb13-4a34-8359-7fe9832d36a7', 'node_4382016339', 'pet_shop', '瑞朋宠物医院', 22.5027445, 113.9286073, NULL, NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('c726dece-7037-4e5e-9e0b-5ca92919c624', 'node_4457765252', 'veterinary', '東方獸醫診所 (屯門)', 22.3976156, 113.9776317, NULL, NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('dd5720d5-70fc-4748-b5c4-f7112fc8dace', 'node_4457765253', 'veterinary', '彩虹獸醫診所', 22.3989302, 113.9776328, NULL, NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('6c581a0b-ca49-4903-a61c-9db6a1a7a18c', 'node_4535489674', 'pet_shop', '狗友記 Buddy Doggies', 22.3068309, 114.1668961, '文匯街 Man Wui Street 6', '+852 27280716', NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('a53d9b27-213b-401c-bcb1-b1f5bc604dd0', 'node_4843888621', 'veterinary', 'Veterinary Clinic', 22.4882951, 113.9179871, NULL, NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('afb8969e-ac27-4197-b480-27931f79faa9', 'node_4845701423', 'pet_shop', 'Pet Shop', 22.4822263, 113.9081125, NULL, NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('8e0c9d3c-a6b4-489a-818c-c417b76d7f1e', 'node_4846202894', 'veterinary', 'Veterinary Clinic', 22.3301978, 114.191675, '打鼓嶺道 Tak Ku Ling Road 76', NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('f8574b59-6f7e-4f29-812e-94c03d7af702', 'node_11037990182', 'veterinary', '土瓜灣動物醫院 Faithful Veterinary Hospital', 22.3235532, 114.1894551, '北帝街 Pak Tai Street 139', '+852 2711 9909', 'Mo-Su 09:00-21:00; PH off', true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('561fb84a-6feb-4822-ba87-4d2483d32ac2', 'node_11792843856', 'pet_shop', 'Q-Pets', 22.3213603, 114.1700311, NULL, NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('87839fd4-fcfe-48c1-95ea-8483d954cdb4', 'node_11957724935', 'pet_shop', 'Peek A Paw', 22.4109759, 113.9687708, NULL, NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('fe6d1cbe-50ae-4a1e-9f03-3bc736154473', 'node_12104107308', 'pet_shop', '穎迎寵物', 22.5046802, 114.1276698, '新勤街 San Kan Street 11', NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('e5b7de76-6df9-4627-8a78-9b06f7108a73', 'node_12133971904', 'veterinary', '深健獸醫診所', 22.366822, 114.0586458, '青山公路－深井段 Castle Peak Road – Sham Tseng 41-63', '24969833', NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('5be648a2-0f53-4b48-bee0-a1d03baf5a05', 'node_12361561161', 'veterinary', '贝贝宠物医院(春风分院)', 22.5425415, 114.1212409, NULL, NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('d876c056-2009-4049-81f1-d558149333cc', 'node_12608977468', 'pet_grooming', '新寵物緣 Pet Garden', 22.3674373, 114.0589862, NULL, NULL, 'Tu-Su 10:30-19:30', true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('f73bd672-f1e0-43a1-bd51-db6454258783', 'node_12747720801', 'pet_shop', '荃灣展業水族', 22.3715914, 114.1164077, '鱟地坊 Hau Tei Square', NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('eba64bc2-6357-4e36-a5ef-42bda04fc666', 'node_12754098301', 'pet_shop', '喜樂毛孩', 22.3694099, 114.1210505, '荃富街 Tsuen Fu Street', NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('3a9b857a-15ce-4f80-8e23-e09209be79d9', 'node_12760044469', 'veterinary', '毛守獸醫中心 Paws Guardian Veterinary Centre', 22.3988288, 114.1948064, '㘭背灣街 Au Pui Wan Street', NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('1739dd08-d146-4009-a4eb-74a6a8d57398', 'node_12761907943', 'pet_shop', '寵物天地 Kiss Kids Club', 22.368478, 114.132736, '光輝圍 Kwong Fai Circuit 39', '+852-24281717', NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('eb56f317-ed48-4b9f-beac-a8d668ffbb86', 'node_12761907946', 'veterinary', '葵興獸醫診所 Kwai Hing Veterinary Clinic', 22.3680762, 114.1327114, '光輝圍 Kwong Fai Circuit 27', '+852-27922007', 'Mo-Su 10:00-21:00', true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('eceeb7ee-f66d-4a3b-8800-3c091e6b0883', 'node_13049195685', 'pet_shop', '樂高寵物 Lego Pet', 22.3065798, 114.1881967, '民泰街 Man Tai Street 22-24', NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('6123c9f0-67d5-4187-aa9a-beb5d7ad31be', 'node_13190201642', 'veterinary', 'Veterinary Clinic', 22.2548984, 114.1338832, NULL, NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00'),
	('702f15d5-ad6f-49fd-a181-f1cb96c6506c', 'node_13227238597', 'veterinary', '深宠医学宠物医院', 22.556353, 113.8859654, NULL, NULL, NULL, true, '2026-02-10 13:29:53.544+00', '2026-02-10 11:41:46.462521+00', '2026-02-10 11:41:46.462521+00');


--
-- Data for Name: threads; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: post_mentions; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: push_tokens; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: reminders; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: thread_comments; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: reply_mentions; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: scan_rate_limits; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: sitter_profiles; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: social_interactions; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: spatial_ref_sys; Type: TABLE DATA; Schema: public; Owner: supabase_admin
--



--
-- Data for Name: support_requests; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: transactions; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: triage_cache; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: typing_indicators; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: user_blocks; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: user_locations; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."user_locations" ("id", "user_id", "location", "location_name", "accuracy_meters", "is_public", "updated_at", "expires_at") VALUES
	('e7125dc5-5bf8-49ed-8b4c-1ec1724b8f9e', '30e7e892-86c1-4d51-a527-d2a87735df09', '0101000020E6100000FEACF53D2F8C5C4076AB17C4083E3640', NULL, NULL, true, '2026-03-07 21:58:02.371972+00', '2026-03-07 23:58:02.371972+00'),
	('451a0883-c494-4755-986c-615a92b8f0f2', '8710cc78-f489-4848-b273-4896394f5477', '0101000020E61000005B34BA5F1B885C40847FC44B15543640', NULL, NULL, true, '2026-03-07 21:58:02.371972+00', '2026-03-07 23:58:02.371972+00'),
	('9edfa40b-d3b4-4016-a764-4d726fa88ccc', '11735970-c8be-4401-a56e-8c32661037ac', '0101000020E61000004E07E1A8B8875C402730AAEFB1403640', NULL, NULL, true, '2026-03-07 21:58:02.371972+00', '2026-03-07 23:58:02.371972+00'),
	('6a8dfc38-d7d3-4ff2-a31b-c11e5591ea6d', '7af2ae7f-b7e8-41eb-a72e-f2622a1a16d6', '0101000020E6100000FA719A3AD78B5C400D04EBB81A4A3640', NULL, NULL, true, '2026-03-07 21:58:02.371972+00', '2026-03-07 23:58:02.371972+00'),
	('0c33aa22-193e-4060-984e-b8b9d3c60d55', 'b3f7c0b6-0dad-42cb-b608-1903f35ce76a', '0101000020E61000001CDAA8ED168D5C40DC29410C003D3640', NULL, NULL, true, '2026-03-07 21:58:02.371972+00', '2026-03-07 23:58:02.371972+00'),
	('303dc08b-9d38-45f6-9226-aa77109fa795', 'ef5ad1de-44d4-47b3-ad72-dc5d2d1bd9c1', '0101000020E61000000AC5BFF44A8A5C4014A6E4EE9C463640', NULL, NULL, true, '2026-03-07 21:58:02.371972+00', '2026-03-07 23:58:02.371972+00'),
	('5af886a5-10f7-4f70-b4f5-291f3ca21b44', 'd051c5ed-d6fe-43b4-8c66-471449be0e51', '0101000020E6100000BF84E4F1FD885C40A99ADC95EB3E3640', NULL, NULL, true, '2026-03-07 21:58:02.371972+00', '2026-03-07 23:58:02.371972+00'),
	('41c358e5-a930-472f-a616-309cb0cdaa17', '248a2d06-f6ab-459c-8d43-0a250c2f9b43', '0101000020E61000002B661B58B68C5C40CF2D2732CB4A3640', NULL, NULL, true, '2026-03-07 21:58:02.371972+00', '2026-03-07 23:58:02.371972+00'),
	('0cf12208-bd09-4ec7-8bb0-ecf7c3767aed', '2e383cb2-e703-4c3f-b6e1-239b4fe1dfbb', '0101000020E61000008DC8BF9CCF885C4092F380E5254C3640', NULL, NULL, true, '2026-03-07 21:58:02.371972+00', '2026-03-07 23:58:02.371972+00'),
	('9ef03cc5-7e81-4af1-8480-2f2f77734cc6', '53190b03-3524-4df5-8889-bc1a30002603', '0101000020E6100000BE697F608A885C40FA7A9E1F58533640', NULL, NULL, true, '2026-03-07 21:58:02.371972+00', '2026-03-07 23:58:02.371972+00'),
	('8a638ad6-f13c-44f0-a1e7-611eb6569676', '330789ee-edd8-4e5b-8ca8-916e35809065', '0101000020E6100000B4921A9E588B5C40B72197D067483640', NULL, NULL, true, '2026-03-07 21:58:02.371972+00', '2026-03-07 23:58:02.371972+00'),
	('3b050396-3ba6-4cba-8ca8-34d4aa44e9bd', '9ca2f145-8d75-43e5-9e71-4a3490158947', '0101000020E6100000D00F797ED5885C40303BF77AEA463640', NULL, NULL, true, '2026-03-07 21:58:02.371972+00', '2026-03-07 23:58:02.371972+00'),
	('897bfd28-1702-4131-9691-7578f9fcdc33', '0cb39b40-e57c-4f59-bb71-754f2f504e0f', '0101000020E610000047E078B8468C5C406ABE96A972453640', NULL, NULL, true, '2026-03-07 21:58:02.371972+00', '2026-03-07 23:58:02.371972+00'),
	('86bcd848-e5f7-4ed9-b6da-f3085aa139f3', '5546372c-ab10-4e2c-b0cc-34dfe6de669b', '0101000020E61000005496DB73918A5C406B8642685D4B3640', NULL, NULL, true, '2026-03-07 21:58:02.371972+00', '2026-03-07 23:58:02.371972+00'),
	('e3f0525d-ea9f-425a-82f3-6d48fef8079f', '2711d70c-710e-4be8-84b1-0c6901d72bfc', '0101000020E6100000594218881E885C401A82229BCB4E3640', NULL, NULL, true, '2026-03-07 21:58:02.371972+00', '2026-03-07 23:58:02.371972+00'),
	('c94b7041-1132-4716-b449-ee2ee4fc9c1d', '712a088f-4c82-409c-9eac-5ffd2fd233ef', '0101000020E6100000724BF11A788A5C40520A82C2AB4B3640', NULL, NULL, true, '2026-03-07 21:58:02.371972+00', '2026-03-07 23:58:02.371972+00'),
	('b4a93d8c-6fb8-4ba0-805d-bee1905cd8d0', '573634a4-0041-4e21-aac3-2dc7bb5f01f7', '0101000020E6100000F5AD3B67128E5C40DB0BBD42E8413640', NULL, NULL, true, '2026-03-07 21:58:02.371972+00', '2026-03-07 23:58:02.371972+00'),
	('de62f2e4-fde9-4251-9a95-7d1692f345ac', '401801e5-3d2b-4b0f-af01-b184b148a9bf', '0101000020E61000000CD85C8665875C404C120B60DE443640', NULL, NULL, true, '2026-03-07 21:58:02.371972+00', '2026-03-07 23:58:02.371972+00'),
	('b5767c44-7aeb-44f1-8124-c61cf1dbee2d', '9f90f24b-3001-4da5-a355-c1a94ca5c274', '0101000020E6100000BBB39685748D5C402498B58C19543640', NULL, NULL, true, '2026-03-07 21:58:02.371972+00', '2026-03-07 23:58:02.371972+00'),
	('7ebcb234-a6f8-4a3b-97a9-6b092c610090', 'b1ebd4a2-85d0-4047-b7a8-d7ce6df5d2bc', '0101000020E6100000114612B76E865C40FF83DB96333E3640', NULL, NULL, true, '2026-03-07 21:58:02.371972+00', '2026-03-07 23:58:02.371972+00'),
	('1bec3158-3cea-4a2e-bd3b-9f7584fac511', '049fd7cf-64b4-4633-9c02-9418873808bd', '0101000020E6100000609EF217988B5C409F3E7F3C37493640', NULL, NULL, true, '2026-03-07 21:58:02.371972+00', '2026-03-07 23:58:02.371972+00'),
	('6407ac58-5645-454e-bf21-2b84b17e84a6', '6560a0a4-7cce-408c-b935-d4084336549f', '0101000020E61000003C6569B25D885C406A282894DF523640', NULL, NULL, true, '2026-03-07 21:58:02.371972+00', '2026-03-07 23:58:02.371972+00'),
	('b40523a3-9271-42b7-89eb-b13a45f9e49e', '4f8c2d44-c199-47c8-8ea2-467f336414c2', '0101000020E6100000147A08899C8A5C403F8991B2033E3640', NULL, NULL, true, '2026-03-07 21:58:02.371972+00', '2026-03-07 23:58:02.371972+00'),
	('29292a60-45f1-40ad-8da8-93fb135fb574', 'f47edec9-087d-47bb-9b84-eed59aa1c986', '0101000020E610000078F8351E018C5C402618FB8E0F4E3640', NULL, NULL, true, '2026-03-07 21:58:02.371972+00', '2026-03-07 23:58:02.371972+00'),
	('346475a7-50ba-4d73-a393-4feeb46351e4', 'b05171e6-74f0-4a7c-9453-0c966d6615a6', '0101000020E610000047663E58018A5C4030C2B756714C3640', NULL, NULL, true, '2026-03-07 21:58:02.371972+00', '2026-03-07 23:58:02.371972+00'),
	('cf71c789-1048-431d-aab3-b24b6b29ecd7', '0c654e7e-36fd-40e1-a257-80247ffee3d0', '0101000020E6100000A340AFC18E8A5C403919F0CC81413640', NULL, NULL, true, '2026-03-07 21:58:02.371972+00', '2026-03-07 23:58:02.371972+00'),
	('5d615b50-8f14-486d-8596-13c5adf8e6d0', '8ab510b8-230d-49c8-9b80-a0ce8b22738b', '0101000020E6100000735ED62812885C4064259B04F6553640', NULL, NULL, true, '2026-03-07 21:58:02.371972+00', '2026-03-07 23:58:02.371972+00'),
	('23bc0809-4613-43f9-b2d4-07421a211855', '16825b9d-b1af-428c-8348-f950d108f796', '0101000020E6100000C4E190B718885C4062982AD0F0563640', NULL, NULL, true, '2026-03-07 21:58:02.371972+00', '2026-03-07 23:58:02.371972+00'),
	('84c83f83-bcc2-4e88-bdbb-0fe05129bd66', 'af2f0bec-4c26-49c0-b672-c1186e4f60cc', '0101000020E6100000CB727421C3865C40614410850C533640', NULL, NULL, true, '2026-03-07 21:58:02.371972+00', '2026-03-07 23:58:02.371972+00'),
	('18ab8c9f-eae1-4699-b231-da3a0509a3a9', 'b81745a4-5df8-4d77-8079-91f7adc8edbd', '0101000020E610000093FD6696E1885C40AAA25B5281383640', NULL, NULL, true, '2026-03-07 21:58:02.371972+00', '2026-03-07 23:58:02.371972+00'),
	('fd31bdde-d722-4478-99c1-8b4e66422a28', '999c5bac-284e-40cf-9002-b1e43c5f8616', '0101000020E6100000181B8321E5875C40DD81710FFF413640', NULL, NULL, true, '2026-03-07 21:58:02.371972+00', '2026-03-07 23:58:02.371972+00'),
	('58c97984-1e7a-49d3-a949-a11986002690', '57db7b5a-f943-4eb8-85cf-8a66e3472d95', '0101000020E61000007BA7E1B9738D5C4007B8027A0E453640', NULL, NULL, true, '2026-03-07 21:58:02.371972+00', '2026-03-07 23:58:02.371972+00'),
	('988f2d72-15ae-4534-875c-1e6e943723a8', 'ab88d021-10c0-474c-90cb-4a020a2ad376', '0101000020E610000073CC4CC3B2895C403F7A8D38DA463640', NULL, NULL, true, '2026-03-07 21:58:02.371972+00', '2026-03-07 23:58:02.371972+00'),
	('0c8477c5-1aee-4e28-b815-02cf56187755', 'f2352373-78ae-4e89-b122-28062f108314', '0101000020E6100000D351BC34F7895C40E4899277E5553640', NULL, NULL, true, '2026-03-07 21:58:02.371972+00', '2026-03-07 23:58:02.371972+00'),
	('55cc4888-af46-4d29-8db2-8be374d34460', 'a1d83329-0847-471a-90dc-7f6629e93e95', '0101000020E6100000C45A0781E28A5C40F121F20A27503640', NULL, NULL, true, '2026-03-07 21:58:02.371972+00', '2026-03-07 23:58:02.371972+00'),
	('2bef8337-63ac-4655-ab4c-6226619de1b3', '1a5db664-8ef8-4e5f-85be-fc0556fd1fdd', '0101000020E61000001F0E561F518D5C40F7D98825EC3E3640', NULL, NULL, true, '2026-03-07 21:58:02.371972+00', '2026-03-07 23:58:02.371972+00'),
	('af3ca160-ebdf-4f0e-a72a-6d382dc0fa49', 'e4b8346e-727b-41e0-8b08-26569cecef45', '0101000020E6100000EF52A83F3B8A5C407DED3DBCB6513640', NULL, NULL, true, '2026-03-07 21:58:02.371972+00', '2026-03-07 23:58:02.371972+00'),
	('c7ac400f-a15c-4b28-a1ad-410bde020e08', '935ee81a-2819-462a-8725-54664345f7a3', '0101000020E6100000985D64B23D885C400CC3F96094503640', NULL, NULL, true, '2026-03-07 21:58:02.371972+00', '2026-03-07 23:58:02.371972+00'),
	('39ec4a1e-dad0-44df-8e3a-ff7900fb8256', 'ade29a94-38b6-4723-830b-902c217fe8f6', '0101000020E61000004050ABCD7E895C40FF1873B45A473640', NULL, NULL, true, '2026-03-07 21:58:02.371972+00', '2026-03-07 23:58:02.371972+00'),
	('7956af5c-589f-4f43-9ac8-2abb3f7526a4', '61fff020-3c25-4f3b-822c-6b2423e987e3', '0101000020E61000001A2AD552B08B5C405240710107523640', NULL, NULL, true, '2026-03-07 21:58:02.371972+00', '2026-03-07 23:58:02.371972+00'),
	('1a9d803f-6a86-43e7-bc86-3c9c1f0cd7ec', '33e45f53-a933-4b8b-9c4a-f907d800b088', '0101000020E610000014CBB2D8CB895C40A03394D797493640', NULL, NULL, true, '2026-03-07 21:58:02.371972+00', '2026-03-07 23:58:02.371972+00'),
	('30f908a9-2efc-4130-a86a-fb05eaa42509', '558c23da-678b-40a4-8667-f17478c04427', '0101000020E6100000EAF0F0438F8C5C40141E630A914E3640', NULL, NULL, true, '2026-03-07 21:58:02.371972+00', '2026-03-07 23:58:02.371972+00'),
	('ea0fee1c-0863-4a73-8c64-965c94ae57b4', 'a0808549-470a-42aa-aa3d-970063d20b36', '0101000020E6100000AA722F684B8D5C400142A5598E403640', NULL, NULL, true, '2026-03-07 21:58:02.371972+00', '2026-03-07 23:58:02.371972+00'),
	('d7180b4f-1cd7-4dce-81fb-ca2c67c37d23', '91247bb5-7c93-4d46-a7fa-5906a55312ed', '0101000020E61000006794B7DBD68C5C4096909C97764F3640', NULL, NULL, true, '2026-03-07 21:58:02.371972+00', '2026-03-07 23:58:02.371972+00'),
	('4eb3d878-5029-484f-9f89-3f62089d077d', 'ad704984-09ae-4fc2-bb7c-9062de2da145', '0101000020E6100000F79B240EA1895C40867B8C6B18533640', NULL, NULL, true, '2026-03-07 21:58:02.371972+00', '2026-03-07 23:58:02.371972+00'),
	('2800978d-30e2-4032-8b0a-1f62b97d51ce', 'c6c96794-d3fe-41d8-bd7d-11535823a7b9', '0101000020E6100000DC44DCAF5A895C400A057494C4393640', NULL, NULL, true, '2026-03-07 21:58:02.371972+00', '2026-03-07 23:58:02.371972+00'),
	('f265f731-9aaa-4047-9b20-a2fb7558cbb6', '64b9a01e-6854-43ba-9a3d-c92a736b1d9e', '0101000020E61000008896F45596885C40B3E3713734453640', NULL, NULL, true, '2026-03-07 21:58:02.371972+00', '2026-03-07 23:58:02.371972+00'),
	('c4e45db6-4851-44e5-8052-6d28a60c4a05', 'd5d8ffa0-8975-4e29-9700-5020382f26f6', '0101000020E6100000534B888CB7885C406FDEB6BC82523640', NULL, NULL, true, '2026-03-07 21:58:02.371972+00', '2026-03-07 23:58:02.371972+00'),
	('b97a88f1-b5dd-4444-a77a-ea4214d14da0', '24ba406e-3a0d-42f2-8d64-86c623c88397', '0101000020E6100000C5BDC1A4408B5C4028ED2226E04C3640', NULL, NULL, true, '2026-03-07 21:58:02.371972+00', '2026-03-07 23:58:02.371972+00'),
	('450f8342-d75c-4d67-9835-0092d2720606', '651ca2ea-7b64-4c66-a37b-56f9f39f6a38', '0101000020E61000007C62F31D0F8C5C40EBEA7FE7554B3640', NULL, NULL, true, '2026-03-07 21:58:02.371972+00', '2026-03-07 23:58:02.371972+00');


--
-- Data for Name: user_quotas; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: user_quotas_legacy_20260208; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: user_unmatches; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: verification_requests; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: verification_audit_log; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: verification_uploads; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: waves; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- PostgreSQL database dump complete
--

-- \unrestrict JVwkKsrKhvGws6M16dlsDDn2z6Q9rKTiOqhZtK7L41tQVdT4oxbSBnPAvtl05xO

RESET ALL;
