drop extension if exists "pg_net";

drop trigger if exists "notice_like_count_trigger" on "public"."notice_board_likes";

drop trigger if exists "trg_alert_interactions_counts_del" on "public"."alert_interactions";

drop trigger if exists "trg_alert_interactions_counts_ins" on "public"."alert_interactions";

drop trigger if exists "trg_map_alerts_auto_hide" on "public"."map_alerts";

drop trigger if exists "trg_map_alerts_contract" on "public"."map_alerts";

drop trigger if exists "trg_notify_on_map_alert_insert" on "public"."map_alerts";

drop trigger if exists "award_sitter_vouch_trigger" on "public"."marketplace_bookings";

drop trigger if exists "set_booking_escrow_release" on "public"."marketplace_bookings";

drop trigger if exists "update_bookings_updated_at" on "public"."marketplace_bookings";

drop trigger if exists "trg_validate_vaccination_dates" on "public"."pets";

drop trigger if exists "update_pets_updated_at" on "public"."pets";

drop trigger if exists "protect_profiles_monetization" on "public"."profiles";

drop trigger if exists "trg_prevent_sensitive_profile_updates" on "public"."profiles";

drop trigger if exists "trg_queue_identity_cleanup" on "public"."profiles";

drop trigger if exists "trg_set_profiles_user_id" on "public"."profiles";

drop trigger if exists "update_profiles_updated_at" on "public"."profiles";

drop trigger if exists "trg_reminders_updated_at" on "public"."reminders";

drop trigger if exists "update_sitter_profiles_updated_at" on "public"."sitter_profiles";

drop trigger if exists "trg_sync_thread_comment_content" on "public"."thread_comments";

drop trigger if exists "update_transactions_updated_at" on "public"."transactions";

drop policy "Anyone can view likes" on "public"."notice_board_likes";

drop policy "Users can like posts" on "public"."notice_board_likes";

drop policy "Users can unlike posts" on "public"."notice_board_likes";

drop policy "chat_messages_insert" on "public"."chat_messages";

drop policy "chat_messages_select" on "public"."chat_messages";

drop policy "users_view_own_emergency_logs" on "public"."emergency_logs";

drop policy "users_view_own_notification_logs" on "public"."notification_logs";

drop policy "Admins can update verification status" on "public"."verification_uploads";

drop policy "Admins can view verification uploads" on "public"."verification_uploads";

revoke delete on table "public"."notice_board_likes" from "anon";

revoke insert on table "public"."notice_board_likes" from "anon";

revoke references on table "public"."notice_board_likes" from "anon";

revoke select on table "public"."notice_board_likes" from "anon";

revoke trigger on table "public"."notice_board_likes" from "anon";

revoke truncate on table "public"."notice_board_likes" from "anon";

revoke update on table "public"."notice_board_likes" from "anon";

revoke delete on table "public"."notice_board_likes" from "authenticated";

revoke insert on table "public"."notice_board_likes" from "authenticated";

revoke references on table "public"."notice_board_likes" from "authenticated";

revoke select on table "public"."notice_board_likes" from "authenticated";

revoke trigger on table "public"."notice_board_likes" from "authenticated";

revoke truncate on table "public"."notice_board_likes" from "authenticated";

revoke update on table "public"."notice_board_likes" from "authenticated";

revoke delete on table "public"."notice_board_likes" from "service_role";

revoke insert on table "public"."notice_board_likes" from "service_role";

revoke references on table "public"."notice_board_likes" from "service_role";

revoke select on table "public"."notice_board_likes" from "service_role";

revoke trigger on table "public"."notice_board_likes" from "service_role";

revoke truncate on table "public"."notice_board_likes" from "service_role";

revoke update on table "public"."notice_board_likes" from "service_role";

revoke delete on table "public"."pins" from "anon";

revoke insert on table "public"."pins" from "anon";

revoke references on table "public"."pins" from "anon";

revoke select on table "public"."pins" from "anon";

revoke trigger on table "public"."pins" from "anon";

revoke truncate on table "public"."pins" from "anon";

revoke update on table "public"."pins" from "anon";

revoke delete on table "public"."pins" from "authenticated";

revoke insert on table "public"."pins" from "authenticated";

revoke references on table "public"."pins" from "authenticated";

revoke select on table "public"."pins" from "authenticated";

revoke trigger on table "public"."pins" from "authenticated";

revoke truncate on table "public"."pins" from "authenticated";

revoke update on table "public"."pins" from "authenticated";

revoke delete on table "public"."pins" from "service_role";

revoke insert on table "public"."pins" from "service_role";

revoke references on table "public"."pins" from "service_role";

revoke select on table "public"."pins" from "service_role";

revoke trigger on table "public"."pins" from "service_role";

revoke truncate on table "public"."pins" from "service_role";

revoke update on table "public"."pins" from "service_role";

alter table "public"."notice_board_likes" drop constraint "notice_board_likes_post_id_fkey";

alter table "public"."notice_board_likes" drop constraint "notice_board_likes_post_id_user_id_key";

alter table "public"."notice_board_likes" drop constraint "notice_board_likes_user_id_fkey";

alter table "public"."pins" drop constraint "pins_thread_id_fkey";

alter table "public"."pins" drop constraint "pins_user_id_fkey";

alter table "public"."profiles" drop constraint "profiles_id_fkey";

alter table "public"."waves" drop constraint "waves_from_user_id_fkey";

alter table "public"."waves" drop constraint "waves_to_user_id_fkey";

alter table "public"."ai_vet_conversations" drop constraint "ai_vet_conversations_pet_id_fkey";

alter table "public"."ai_vet_conversations" drop constraint "ai_vet_conversations_user_id_fkey";

alter table "public"."ai_vet_rate_limits" drop constraint "ai_vet_rate_limits_user_id_fkey";

alter table "public"."alert_interactions" drop constraint "alert_interactions_alert_id_fkey";

alter table "public"."alert_interactions" drop constraint "alert_interactions_user_id_fkey";

alter table "public"."chat_messages" drop constraint "chat_messages_sender_id_fkey";

alter table "public"."chat_room_members" drop constraint "chat_room_members_user_id_fkey";

alter table "public"."consent_logs" drop constraint "consent_logs_user_id_fkey";

alter table "public"."emergency_logs" drop constraint "emergency_logs_alert_id_fkey";

alter table "public"."family_members" drop constraint "family_members_invitee_user_id_fkey";

alter table "public"."family_members" drop constraint "family_members_inviter_user_id_fkey";

alter table "public"."hazard_identifications" drop constraint "hazard_identifications_pet_id_fkey";

alter table "public"."hazard_identifications" drop constraint "hazard_identifications_user_id_fkey";

alter table "public"."lost_pet_alerts" drop constraint "lost_pet_alerts_owner_id_fkey";

alter table "public"."lost_pet_alerts" drop constraint "lost_pet_alerts_pet_id_fkey";

alter table "public"."map_alerts" drop constraint "map_alerts_creator_id_fkey";

alter table "public"."marketplace_bookings" drop constraint "marketplace_bookings_client_id_fkey";

alter table "public"."marketplace_bookings" drop constraint "marketplace_bookings_sitter_id_fkey";

alter table "public"."notice_board" drop constraint "notice_board_author_id_fkey";

alter table "public"."notification_logs" drop constraint "notification_logs_alert_id_fkey";

alter table "public"."notifications" drop constraint "notifications_user_id_fkey";

alter table "public"."pets" drop constraint "pets_owner_id_fkey";

alter table "public"."reminders" drop constraint "reminders_owner_id_fkey";

alter table "public"."reminders" drop constraint "reminders_pet_id_fkey";

alter table "public"."scan_rate_limits" drop constraint "scan_rate_limits_user_id_fkey";

alter table "public"."sitter_profiles" drop constraint "sitter_profiles_user_id_fkey";

alter table "public"."support_requests" drop constraint "support_requests_user_id_fkey";

alter table "public"."thread_comments" drop constraint "thread_comments_thread_id_fkey";

alter table "public"."thread_comments" drop constraint "thread_comments_user_id_fkey";

alter table "public"."threads" drop constraint "threads_user_id_fkey";

alter table "public"."transactions" drop constraint "transactions_user_id_fkey";

alter table "public"."user_quotas" drop constraint "user_quotas_user_id_fkey";

alter table "public"."verification_uploads" drop constraint "verification_uploads_reviewed_by_fkey";

alter table "public"."verification_uploads" drop constraint "verification_uploads_user_id_fkey";

alter table "public"."waves" drop constraint "waves_from_user_fk";

alter table "public"."waves" drop constraint "waves_to_user_fk";

drop function if exists "public"."admin_review_verification"(p_user_id uuid, p_status verification_status_enum, p_comment text);

drop function if exists "public"."update_notice_like_count"();

drop type "public"."geometry_dump";

drop view if exists "public"."profiles_public";

drop type "public"."valid_detail";

alter table "public"."notice_board_likes" drop constraint "notice_board_likes_pkey";

alter table "public"."pins" drop constraint "pins_pkey";

drop index if exists "public"."idx_notice_likes_post_id";

drop index if exists "public"."idx_notice_likes_user_id";

drop index if exists "public"."notice_board_likes_pkey";

drop index if exists "public"."notice_board_likes_post_id_user_id_key";

drop index if exists "public"."pins_pkey";

drop index if exists "public"."idx_lost_pet_location";

drop index if exists "public"."idx_profiles_location";

drop table "public"."notice_board_likes";

drop table "public"."pins";


  create table "public"."ai_vet_messages" (
    "id" uuid not null default gen_random_uuid(),
    "conversation_id" uuid not null,
    "role" text not null,
    "content" text not null,
    "media_url" text,
    "media_analysis" jsonb,
    "metadata" jsonb default '{}'::jsonb,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."ai_vet_messages" enable row level security;


  create table "public"."ai_vet_usage" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "month" text not null,
    "conversation_count" integer default 0,
    "message_count" integer default 0,
    "image_analysis_count" integer default 0,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."ai_vet_usage" enable row level security;


  create table "public"."chat_participants" (
    "id" uuid not null default gen_random_uuid(),
    "chat_id" uuid not null,
    "user_id" uuid not null,
    "role" text default 'member'::text,
    "joined_at" timestamp with time zone default now(),
    "last_read_at" timestamp with time zone default now(),
    "is_muted" boolean default false
      );


alter table "public"."chat_participants" enable row level security;


  create table "public"."chats" (
    "id" uuid not null default gen_random_uuid(),
    "type" text not null,
    "name" text,
    "avatar_url" text,
    "created_by" uuid,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now(),
    "last_message_at" timestamp with time zone default now()
      );


alter table "public"."chats" enable row level security;


  create table "public"."location_reviews" (
    "id" uuid not null default gen_random_uuid(),
    "location_name" text not null,
    "location_type" text,
    "location" public.geography(Point,4326),
    "reviewer_id" uuid not null,
    "rating" integer,
    "pet_friendly_score" integer,
    "safety_score" integer,
    "review" text,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."location_reviews" enable row level security;


  create table "public"."map_checkins" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "location" public.geography(Point,4326) not null,
    "location_name" text,
    "location_type" text,
    "pet_ids" uuid[] default '{}'::uuid[],
    "is_public" boolean default true,
    "notes" text,
    "created_at" timestamp with time zone default now(),
    "expires_at" timestamp with time zone default (now() + '24:00:00'::interval)
      );


alter table "public"."map_checkins" enable row level security;


  create table "public"."match_preferences" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "looking_for" text[] default '{}'::text[],
    "species_preference" text[] default '{}'::text[],
    "distance_km" integer default 5,
    "age_min" integer,
    "age_max" integer,
    "requires_car" boolean default false,
    "requires_verification" boolean default false,
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."match_preferences" enable row level security;


  create table "public"."matches" (
    "id" uuid not null default gen_random_uuid(),
    "user1_id" uuid not null,
    "user2_id" uuid not null,
    "chat_id" uuid,
    "matched_at" timestamp with time zone default now(),
    "last_interaction_at" timestamp with time zone default now(),
    "is_active" boolean default true
      );


alter table "public"."matches" enable row level security;


  create table "public"."message_reads" (
    "id" uuid not null default gen_random_uuid(),
    "message_id" uuid not null,
    "user_id" uuid not null,
    "read_at" timestamp with time zone default now()
      );


alter table "public"."message_reads" enable row level security;


  create table "public"."messages" (
    "id" uuid not null default gen_random_uuid(),
    "chat_id" uuid not null,
    "sender_id" uuid,
    "content" text,
    "message_type" text default 'text'::text,
    "media_url" text,
    "metadata" jsonb default '{}'::jsonb,
    "is_deleted" boolean default false,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."messages" enable row level security;


  create table "public"."notification_preferences" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "push_enabled" boolean default true,
    "email_enabled" boolean default true,
    "new_matches" boolean default true,
    "new_messages" boolean default true,
    "ai_vet_responses" boolean default true,
    "map_alerts" boolean default true,
    "notice_board" boolean default true,
    "marketing" boolean default false,
    "quiet_hours_start" time without time zone,
    "quiet_hours_end" time without time zone,
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."notification_preferences" enable row level security;


  create table "public"."payments" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "subscription_id" uuid,
    "amount" numeric(10,2) not null,
    "currency" text default 'HKD'::text,
    "status" text not null,
    "payment_method" text,
    "provider_payment_id" text,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."payments" enable row level security;


  create table "public"."push_tokens" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "token" text not null,
    "platform" text not null,
    "device_id" text,
    "is_active" boolean default true,
    "created_at" timestamp with time zone default now(),
    "last_used_at" timestamp with time zone default now()
      );


alter table "public"."push_tokens" enable row level security;


  create table "public"."social_interactions" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "target_id" uuid not null,
    "interaction_type" text not null,
    "reason" text,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."social_interactions" enable row level security;


  create table "public"."subscriptions" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "plan_type" text not null,
    "status" text default 'active'::text,
    "payment_provider" text,
    "provider_subscription_id" text,
    "current_period_start" timestamp with time zone not null,
    "current_period_end" timestamp with time zone not null,
    "cancel_at" timestamp with time zone,
    "cancelled_at" timestamp with time zone,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."subscriptions" enable row level security;


  create table "public"."typing_indicators" (
    "id" uuid not null default gen_random_uuid(),
    "chat_id" uuid not null,
    "user_id" uuid not null,
    "started_at" timestamp with time zone default now()
      );


alter table "public"."typing_indicators" enable row level security;


  create table "public"."user_locations" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "location" public.geography(Point,4326) not null,
    "location_name" text,
    "accuracy_meters" double precision,
    "is_public" boolean default false,
    "updated_at" timestamp with time zone default now(),
    "expires_at" timestamp with time zone
      );


alter table "public"."user_locations" enable row level security;


  create table "public"."verification_audit_log" (
    "id" uuid not null default gen_random_uuid(),
    "verification_id" uuid not null,
    "action" text not null,
    "performed_by" uuid,
    "details" jsonb,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."verification_audit_log" enable row level security;


  create table "public"."verification_requests" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "request_type" text not null,
    "status" text default 'pending'::text,
    "provider" text,
    "provider_request_id" text,
    "document_type" text,
    "document_number_hash" text,
    "submitted_data" jsonb,
    "verification_result" jsonb,
    "reviewed_by" uuid,
    "rejection_reason" text,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now(),
    "expires_at" timestamp with time zone
      );


alter table "public"."verification_requests" enable row level security;

alter table "public"."ai_vet_conversations" drop column "messages";

alter table "public"."ai_vet_conversations" add column "title" text;

alter table "public"."map_alerts" drop column "address";

alter table "public"."map_alerts" alter column "location_geog" set data type public.geography(Point,4326) using "location_geog"::public.geography(Point,4326);

alter table "public"."notice_board" drop column "like_count";

alter table "public"."notifications" add column "body" text not null;

alter table "public"."notifications" add column "data" jsonb default '{}'::jsonb;

alter table "public"."notifications" add column "is_read" boolean default false;

alter table "public"."notifications" add column "sent_at" timestamp with time zone;

alter table "public"."notifications" alter column "created_at" drop not null;

alter table "public"."profiles" add column "email" text;

alter table "public"."profiles" add column "full_name" text;

alter table "public"."profiles" alter column "care_circle" set default '{}'::uuid[];

alter table "public"."profiles" alter column "id" set default gen_random_uuid();

alter table "public"."profiles" alter column "location" set data type public.geography(Point,4326) using "location"::public.geography(Point,4326);

alter table "public"."profiles" alter column "location_geog" set data type public.geography(Point,4326) using "location_geog"::public.geography(Point,4326);

alter table "public"."profiles" alter column "verification_status" set default 'pending'::public.verification_status_enum;

alter table "public"."profiles" alter column "verification_status" set data type public.verification_status_enum using "verification_status"::text::public.verification_status_enum;

alter table "public"."waves" add column "message" text;

alter table "public"."waves" add column "receiver_id" uuid not null;

alter table "public"."waves" add column "responded_at" timestamp with time zone;

alter table "public"."waves" add column "sender_id" uuid not null;

alter table "public"."waves" add column "status" text default 'pending'::text;

alter table "public"."waves" add column "wave_type" text default 'standard'::text;

alter table "public"."waves" alter column "created_at" drop not null;

alter table "public"."waves" alter column "from_user_id" drop not null;

alter table "public"."waves" alter column "to_user_id" drop not null;

CREATE UNIQUE INDEX ai_vet_messages_pkey ON public.ai_vet_messages USING btree (id);

CREATE UNIQUE INDEX ai_vet_usage_pkey ON public.ai_vet_usage USING btree (id);

CREATE UNIQUE INDEX ai_vet_usage_user_id_month_key ON public.ai_vet_usage USING btree (user_id, month);

CREATE UNIQUE INDEX chat_participants_chat_id_user_id_key ON public.chat_participants USING btree (chat_id, user_id);

CREATE UNIQUE INDEX chat_participants_pkey ON public.chat_participants USING btree (id);

CREATE UNIQUE INDEX chats_pkey ON public.chats USING btree (id);

CREATE INDEX idx_ai_vet_conversations_user_id ON public.ai_vet_conversations USING btree (user_id);

CREATE INDEX idx_ai_vet_messages_conversation_id ON public.ai_vet_messages USING btree (conversation_id);

CREATE INDEX idx_chat_participants_chat_id ON public.chat_participants USING btree (chat_id);

CREATE INDEX idx_chat_participants_user_id ON public.chat_participants USING btree (user_id);

CREATE INDEX idx_map_alerts_creator_id ON public.map_alerts USING btree (creator_id);

CREATE INDEX idx_map_alerts_is_active ON public.map_alerts USING btree (is_active);

CREATE INDEX idx_map_checkins_user_id ON public.map_checkins USING btree (user_id);

CREATE INDEX idx_matches_user1_id ON public.matches USING btree (user1_id);

CREATE INDEX idx_matches_user2_id ON public.matches USING btree (user2_id);

CREATE INDEX idx_message_reads_message_id ON public.message_reads USING btree (message_id);

CREATE INDEX idx_messages_chat_id ON public.messages USING btree (chat_id, created_at DESC);

CREATE INDEX idx_messages_sender_id ON public.messages USING btree (sender_id);

CREATE INDEX idx_notifications_is_read ON public.notifications USING btree (user_id, is_read);

CREATE INDEX idx_notifications_user_id ON public.notifications USING btree (user_id, created_at DESC);

CREATE INDEX idx_profiles_location_gist ON public.profiles USING gist (location);

CREATE INDEX idx_social_interactions_target_id ON public.social_interactions USING btree (target_id);

CREATE INDEX idx_social_interactions_user_id ON public.social_interactions USING btree (user_id);

CREATE INDEX idx_user_locations_geography ON public.user_locations USING gist (location);

CREATE INDEX idx_waves_receiver_id ON public.waves USING btree (receiver_id);

CREATE INDEX idx_waves_sender_id ON public.waves USING btree (sender_id);

CREATE INDEX idx_waves_status ON public.waves USING btree (status);

CREATE UNIQUE INDEX location_reviews_pkey ON public.location_reviews USING btree (id);

CREATE UNIQUE INDEX map_checkins_pkey ON public.map_checkins USING btree (id);

CREATE UNIQUE INDEX match_preferences_pkey ON public.match_preferences USING btree (id);

CREATE UNIQUE INDEX match_preferences_user_id_key ON public.match_preferences USING btree (user_id);

CREATE UNIQUE INDEX matches_pkey ON public.matches USING btree (id);

CREATE UNIQUE INDEX matches_user1_id_user2_id_key ON public.matches USING btree (user1_id, user2_id);

CREATE UNIQUE INDEX message_reads_message_id_user_id_key ON public.message_reads USING btree (message_id, user_id);

CREATE UNIQUE INDEX message_reads_pkey ON public.message_reads USING btree (id);

CREATE UNIQUE INDEX messages_pkey ON public.messages USING btree (id);

CREATE UNIQUE INDEX notification_preferences_pkey ON public.notification_preferences USING btree (id);

CREATE UNIQUE INDEX notification_preferences_user_id_key ON public.notification_preferences USING btree (user_id);

CREATE UNIQUE INDEX payments_pkey ON public.payments USING btree (id);

CREATE UNIQUE INDEX profiles_email_key ON public.profiles USING btree (email);

CREATE UNIQUE INDEX push_tokens_pkey ON public.push_tokens USING btree (id);

CREATE UNIQUE INDEX push_tokens_user_id_token_key ON public.push_tokens USING btree (user_id, token);

CREATE UNIQUE INDEX social_interactions_pkey ON public.social_interactions USING btree (id);

CREATE UNIQUE INDEX social_interactions_user_id_target_id_interaction_type_key ON public.social_interactions USING btree (user_id, target_id, interaction_type);

CREATE UNIQUE INDEX subscriptions_pkey ON public.subscriptions USING btree (id);

CREATE UNIQUE INDEX typing_indicators_chat_id_user_id_key ON public.typing_indicators USING btree (chat_id, user_id);

CREATE UNIQUE INDEX typing_indicators_pkey ON public.typing_indicators USING btree (id);

CREATE UNIQUE INDEX user_locations_pkey ON public.user_locations USING btree (id);

CREATE UNIQUE INDEX user_locations_user_id_key ON public.user_locations USING btree (user_id);

CREATE UNIQUE INDEX verification_audit_log_pkey ON public.verification_audit_log USING btree (id);

CREATE UNIQUE INDEX verification_requests_pkey ON public.verification_requests USING btree (id);

CREATE UNIQUE INDEX waves_sender_id_receiver_id_key ON public.waves USING btree (sender_id, receiver_id);

CREATE INDEX idx_lost_pet_location ON public.lost_pet_alerts USING gist (public.st_setsrid(public.st_makepoint(longitude, latitude), 4326));

CREATE INDEX idx_profiles_location ON public.profiles USING gist (public.st_setsrid(public.st_makepoint(longitude, latitude), 4326));

alter table "public"."ai_vet_messages" add constraint "ai_vet_messages_pkey" PRIMARY KEY using index "ai_vet_messages_pkey";

alter table "public"."ai_vet_usage" add constraint "ai_vet_usage_pkey" PRIMARY KEY using index "ai_vet_usage_pkey";

alter table "public"."chat_participants" add constraint "chat_participants_pkey" PRIMARY KEY using index "chat_participants_pkey";

alter table "public"."chats" add constraint "chats_pkey" PRIMARY KEY using index "chats_pkey";

alter table "public"."location_reviews" add constraint "location_reviews_pkey" PRIMARY KEY using index "location_reviews_pkey";

alter table "public"."map_checkins" add constraint "map_checkins_pkey" PRIMARY KEY using index "map_checkins_pkey";

alter table "public"."match_preferences" add constraint "match_preferences_pkey" PRIMARY KEY using index "match_preferences_pkey";

alter table "public"."matches" add constraint "matches_pkey" PRIMARY KEY using index "matches_pkey";

alter table "public"."message_reads" add constraint "message_reads_pkey" PRIMARY KEY using index "message_reads_pkey";

alter table "public"."messages" add constraint "messages_pkey" PRIMARY KEY using index "messages_pkey";

alter table "public"."notification_preferences" add constraint "notification_preferences_pkey" PRIMARY KEY using index "notification_preferences_pkey";

alter table "public"."payments" add constraint "payments_pkey" PRIMARY KEY using index "payments_pkey";

alter table "public"."push_tokens" add constraint "push_tokens_pkey" PRIMARY KEY using index "push_tokens_pkey";

alter table "public"."social_interactions" add constraint "social_interactions_pkey" PRIMARY KEY using index "social_interactions_pkey";

alter table "public"."subscriptions" add constraint "subscriptions_pkey" PRIMARY KEY using index "subscriptions_pkey";

alter table "public"."typing_indicators" add constraint "typing_indicators_pkey" PRIMARY KEY using index "typing_indicators_pkey";

alter table "public"."user_locations" add constraint "user_locations_pkey" PRIMARY KEY using index "user_locations_pkey";

alter table "public"."verification_audit_log" add constraint "verification_audit_log_pkey" PRIMARY KEY using index "verification_audit_log_pkey";

alter table "public"."verification_requests" add constraint "verification_requests_pkey" PRIMARY KEY using index "verification_requests_pkey";

alter table "public"."ai_vet_messages" add constraint "ai_vet_messages_conversation_id_fkey" FOREIGN KEY (conversation_id) REFERENCES public.ai_vet_conversations(id) ON DELETE CASCADE not valid;

alter table "public"."ai_vet_messages" validate constraint "ai_vet_messages_conversation_id_fkey";

alter table "public"."ai_vet_messages" add constraint "ai_vet_messages_role_check" CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text]))) not valid;

alter table "public"."ai_vet_messages" validate constraint "ai_vet_messages_role_check";

alter table "public"."ai_vet_usage" add constraint "ai_vet_usage_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."ai_vet_usage" validate constraint "ai_vet_usage_user_id_fkey";

alter table "public"."ai_vet_usage" add constraint "ai_vet_usage_user_id_month_key" UNIQUE using index "ai_vet_usage_user_id_month_key";

alter table "public"."chat_participants" add constraint "chat_participants_chat_id_fkey" FOREIGN KEY (chat_id) REFERENCES public.chats(id) ON DELETE CASCADE not valid;

alter table "public"."chat_participants" validate constraint "chat_participants_chat_id_fkey";

alter table "public"."chat_participants" add constraint "chat_participants_chat_id_user_id_key" UNIQUE using index "chat_participants_chat_id_user_id_key";

alter table "public"."chat_participants" add constraint "chat_participants_role_check" CHECK ((role = ANY (ARRAY['admin'::text, 'member'::text]))) not valid;

alter table "public"."chat_participants" validate constraint "chat_participants_role_check";

alter table "public"."chat_participants" add constraint "chat_participants_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."chat_participants" validate constraint "chat_participants_user_id_fkey";

alter table "public"."chats" add constraint "chats_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL not valid;

alter table "public"."chats" validate constraint "chats_created_by_fkey";

alter table "public"."chats" add constraint "chats_type_check" CHECK ((type = ANY (ARRAY['direct'::text, 'group'::text]))) not valid;

alter table "public"."chats" validate constraint "chats_type_check";

alter table "public"."location_reviews" add constraint "location_reviews_pet_friendly_score_check" CHECK (((pet_friendly_score >= 1) AND (pet_friendly_score <= 5))) not valid;

alter table "public"."location_reviews" validate constraint "location_reviews_pet_friendly_score_check";

alter table "public"."location_reviews" add constraint "location_reviews_rating_check" CHECK (((rating >= 1) AND (rating <= 5))) not valid;

alter table "public"."location_reviews" validate constraint "location_reviews_rating_check";

alter table "public"."location_reviews" add constraint "location_reviews_reviewer_id_fkey" FOREIGN KEY (reviewer_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."location_reviews" validate constraint "location_reviews_reviewer_id_fkey";

alter table "public"."location_reviews" add constraint "location_reviews_safety_score_check" CHECK (((safety_score >= 1) AND (safety_score <= 5))) not valid;

alter table "public"."location_reviews" validate constraint "location_reviews_safety_score_check";

alter table "public"."map_checkins" add constraint "map_checkins_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."map_checkins" validate constraint "map_checkins_user_id_fkey";

alter table "public"."match_preferences" add constraint "match_preferences_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."match_preferences" validate constraint "match_preferences_user_id_fkey";

alter table "public"."match_preferences" add constraint "match_preferences_user_id_key" UNIQUE using index "match_preferences_user_id_key";

alter table "public"."matches" add constraint "matches_chat_id_fkey" FOREIGN KEY (chat_id) REFERENCES public.chats(id) ON DELETE SET NULL not valid;

alter table "public"."matches" validate constraint "matches_chat_id_fkey";

alter table "public"."matches" add constraint "matches_user1_id_fkey" FOREIGN KEY (user1_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."matches" validate constraint "matches_user1_id_fkey";

alter table "public"."matches" add constraint "matches_user1_id_user2_id_key" UNIQUE using index "matches_user1_id_user2_id_key";

alter table "public"."matches" add constraint "matches_user2_id_fkey" FOREIGN KEY (user2_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."matches" validate constraint "matches_user2_id_fkey";

alter table "public"."matches" add constraint "unique_match" CHECK ((user1_id < user2_id)) not valid;

alter table "public"."matches" validate constraint "unique_match";

alter table "public"."message_reads" add constraint "message_reads_message_id_fkey" FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE CASCADE not valid;

alter table "public"."message_reads" validate constraint "message_reads_message_id_fkey";

alter table "public"."message_reads" add constraint "message_reads_message_id_user_id_key" UNIQUE using index "message_reads_message_id_user_id_key";

alter table "public"."message_reads" add constraint "message_reads_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."message_reads" validate constraint "message_reads_user_id_fkey";

alter table "public"."messages" add constraint "messages_chat_id_fkey" FOREIGN KEY (chat_id) REFERENCES public.chats(id) ON DELETE CASCADE not valid;

alter table "public"."messages" validate constraint "messages_chat_id_fkey";

alter table "public"."messages" add constraint "messages_message_type_check" CHECK ((message_type = ANY (ARRAY['text'::text, 'image'::text, 'voice'::text, 'location'::text, 'system'::text]))) not valid;

alter table "public"."messages" validate constraint "messages_message_type_check";

alter table "public"."messages" add constraint "messages_sender_id_fkey" FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE SET NULL not valid;

alter table "public"."messages" validate constraint "messages_sender_id_fkey";

alter table "public"."notification_preferences" add constraint "notification_preferences_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."notification_preferences" validate constraint "notification_preferences_user_id_fkey";

alter table "public"."notification_preferences" add constraint "notification_preferences_user_id_key" UNIQUE using index "notification_preferences_user_id_key";

alter table "public"."payments" add constraint "payments_status_check" CHECK ((status = ANY (ARRAY['succeeded'::text, 'pending'::text, 'failed'::text, 'refunded'::text]))) not valid;

alter table "public"."payments" validate constraint "payments_status_check";

alter table "public"."payments" add constraint "payments_subscription_id_fkey" FOREIGN KEY (subscription_id) REFERENCES public.subscriptions(id) ON DELETE SET NULL not valid;

alter table "public"."payments" validate constraint "payments_subscription_id_fkey";

alter table "public"."payments" add constraint "payments_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."payments" validate constraint "payments_user_id_fkey";

alter table "public"."profiles" add constraint "profiles_email_key" UNIQUE using index "profiles_email_key";

alter table "public"."push_tokens" add constraint "push_tokens_platform_check" CHECK ((platform = ANY (ARRAY['ios'::text, 'android'::text, 'web'::text]))) not valid;

alter table "public"."push_tokens" validate constraint "push_tokens_platform_check";

alter table "public"."push_tokens" add constraint "push_tokens_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."push_tokens" validate constraint "push_tokens_user_id_fkey";

alter table "public"."push_tokens" add constraint "push_tokens_user_id_token_key" UNIQUE using index "push_tokens_user_id_token_key";

alter table "public"."social_interactions" add constraint "social_interactions_interaction_type_check" CHECK ((interaction_type = ANY (ARRAY['pass'::text, 'hide'::text, 'block'::text, 'report'::text]))) not valid;

alter table "public"."social_interactions" validate constraint "social_interactions_interaction_type_check";

alter table "public"."social_interactions" add constraint "social_interactions_target_id_fkey" FOREIGN KEY (target_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."social_interactions" validate constraint "social_interactions_target_id_fkey";

alter table "public"."social_interactions" add constraint "social_interactions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."social_interactions" validate constraint "social_interactions_user_id_fkey";

alter table "public"."social_interactions" add constraint "social_interactions_user_id_target_id_interaction_type_key" UNIQUE using index "social_interactions_user_id_target_id_interaction_type_key";

alter table "public"."subscriptions" add constraint "subscriptions_plan_type_check" CHECK ((plan_type = ANY (ARRAY['monthly'::text, 'yearly'::text]))) not valid;

alter table "public"."subscriptions" validate constraint "subscriptions_plan_type_check";

alter table "public"."subscriptions" add constraint "subscriptions_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'cancelled'::text, 'expired'::text, 'past_due'::text]))) not valid;

alter table "public"."subscriptions" validate constraint "subscriptions_status_check";

alter table "public"."subscriptions" add constraint "subscriptions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."subscriptions" validate constraint "subscriptions_user_id_fkey";

alter table "public"."typing_indicators" add constraint "typing_indicators_chat_id_fkey" FOREIGN KEY (chat_id) REFERENCES public.chats(id) ON DELETE CASCADE not valid;

alter table "public"."typing_indicators" validate constraint "typing_indicators_chat_id_fkey";

alter table "public"."typing_indicators" add constraint "typing_indicators_chat_id_user_id_key" UNIQUE using index "typing_indicators_chat_id_user_id_key";

alter table "public"."typing_indicators" add constraint "typing_indicators_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."typing_indicators" validate constraint "typing_indicators_user_id_fkey";

alter table "public"."user_locations" add constraint "user_locations_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."user_locations" validate constraint "user_locations_user_id_fkey";

alter table "public"."user_locations" add constraint "user_locations_user_id_key" UNIQUE using index "user_locations_user_id_key";

alter table "public"."verification_audit_log" add constraint "verification_audit_log_performed_by_fkey" FOREIGN KEY (performed_by) REFERENCES public.profiles(id) ON DELETE SET NULL not valid;

alter table "public"."verification_audit_log" validate constraint "verification_audit_log_performed_by_fkey";

alter table "public"."verification_audit_log" add constraint "verification_audit_log_verification_id_fkey" FOREIGN KEY (verification_id) REFERENCES public.verification_requests(id) ON DELETE CASCADE not valid;

alter table "public"."verification_audit_log" validate constraint "verification_audit_log_verification_id_fkey";

alter table "public"."verification_requests" add constraint "verification_requests_request_type_check" CHECK ((request_type = ANY (ARRAY['id'::text, 'biometric'::text, 'phone'::text]))) not valid;

alter table "public"."verification_requests" validate constraint "verification_requests_request_type_check";

alter table "public"."verification_requests" add constraint "verification_requests_reviewed_by_fkey" FOREIGN KEY (reviewed_by) REFERENCES public.profiles(id) ON DELETE SET NULL not valid;

alter table "public"."verification_requests" validate constraint "verification_requests_reviewed_by_fkey";

alter table "public"."verification_requests" add constraint "verification_requests_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'approved'::text, 'rejected'::text, 'expired'::text]))) not valid;

alter table "public"."verification_requests" validate constraint "verification_requests_status_check";

alter table "public"."verification_requests" add constraint "verification_requests_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."verification_requests" validate constraint "verification_requests_user_id_fkey";

alter table "public"."waves" add constraint "waves_receiver_id_fkey" FOREIGN KEY (receiver_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."waves" validate constraint "waves_receiver_id_fkey";

alter table "public"."waves" add constraint "waves_sender_id_fkey" FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."waves" validate constraint "waves_sender_id_fkey";

alter table "public"."waves" add constraint "waves_sender_id_receiver_id_key" UNIQUE using index "waves_sender_id_receiver_id_key";

alter table "public"."waves" add constraint "waves_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'rejected'::text, 'expired'::text]))) not valid;

alter table "public"."waves" validate constraint "waves_status_check";

alter table "public"."waves" add constraint "waves_wave_type_check" CHECK ((wave_type = ANY (ARRAY['standard'::text, 'super'::text]))) not valid;

alter table "public"."waves" validate constraint "waves_wave_type_check";

alter table "public"."ai_vet_conversations" add constraint "ai_vet_conversations_pet_id_fkey" FOREIGN KEY (pet_id) REFERENCES public.pets(id) ON DELETE SET NULL not valid;

alter table "public"."ai_vet_conversations" validate constraint "ai_vet_conversations_pet_id_fkey";

alter table "public"."ai_vet_conversations" add constraint "ai_vet_conversations_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."ai_vet_conversations" validate constraint "ai_vet_conversations_user_id_fkey";

alter table "public"."ai_vet_rate_limits" add constraint "ai_vet_rate_limits_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."ai_vet_rate_limits" validate constraint "ai_vet_rate_limits_user_id_fkey";

alter table "public"."alert_interactions" add constraint "alert_interactions_alert_id_fkey" FOREIGN KEY (alert_id) REFERENCES public.map_alerts(id) ON DELETE CASCADE not valid;

alter table "public"."alert_interactions" validate constraint "alert_interactions_alert_id_fkey";

alter table "public"."alert_interactions" add constraint "alert_interactions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."alert_interactions" validate constraint "alert_interactions_user_id_fkey";

alter table "public"."chat_messages" add constraint "chat_messages_sender_id_fkey" FOREIGN KEY (sender_id) REFERENCES public.profiles(id) not valid;

alter table "public"."chat_messages" validate constraint "chat_messages_sender_id_fkey";

alter table "public"."chat_room_members" add constraint "chat_room_members_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."chat_room_members" validate constraint "chat_room_members_user_id_fkey";

alter table "public"."consent_logs" add constraint "consent_logs_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."consent_logs" validate constraint "consent_logs_user_id_fkey";

alter table "public"."emergency_logs" add constraint "emergency_logs_alert_id_fkey" FOREIGN KEY (alert_id) REFERENCES public.lost_pet_alerts(id) ON DELETE CASCADE not valid;

alter table "public"."emergency_logs" validate constraint "emergency_logs_alert_id_fkey";

alter table "public"."family_members" add constraint "family_members_invitee_user_id_fkey" FOREIGN KEY (invitee_user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."family_members" validate constraint "family_members_invitee_user_id_fkey";

alter table "public"."family_members" add constraint "family_members_inviter_user_id_fkey" FOREIGN KEY (inviter_user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."family_members" validate constraint "family_members_inviter_user_id_fkey";

alter table "public"."hazard_identifications" add constraint "hazard_identifications_pet_id_fkey" FOREIGN KEY (pet_id) REFERENCES public.pets(id) ON DELETE SET NULL not valid;

alter table "public"."hazard_identifications" validate constraint "hazard_identifications_pet_id_fkey";

alter table "public"."hazard_identifications" add constraint "hazard_identifications_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."hazard_identifications" validate constraint "hazard_identifications_user_id_fkey";

alter table "public"."lost_pet_alerts" add constraint "lost_pet_alerts_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."lost_pet_alerts" validate constraint "lost_pet_alerts_owner_id_fkey";

alter table "public"."lost_pet_alerts" add constraint "lost_pet_alerts_pet_id_fkey" FOREIGN KEY (pet_id) REFERENCES public.pets(id) ON DELETE CASCADE not valid;

alter table "public"."lost_pet_alerts" validate constraint "lost_pet_alerts_pet_id_fkey";

alter table "public"."map_alerts" add constraint "map_alerts_creator_id_fkey" FOREIGN KEY (creator_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."map_alerts" validate constraint "map_alerts_creator_id_fkey";

alter table "public"."marketplace_bookings" add constraint "marketplace_bookings_client_id_fkey" FOREIGN KEY (client_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."marketplace_bookings" validate constraint "marketplace_bookings_client_id_fkey";

alter table "public"."marketplace_bookings" add constraint "marketplace_bookings_sitter_id_fkey" FOREIGN KEY (sitter_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."marketplace_bookings" validate constraint "marketplace_bookings_sitter_id_fkey";

alter table "public"."notice_board" add constraint "notice_board_author_id_fkey" FOREIGN KEY (author_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."notice_board" validate constraint "notice_board_author_id_fkey";

alter table "public"."notification_logs" add constraint "notification_logs_alert_id_fkey" FOREIGN KEY (alert_id) REFERENCES public.lost_pet_alerts(id) ON DELETE CASCADE not valid;

alter table "public"."notification_logs" validate constraint "notification_logs_alert_id_fkey";

alter table "public"."notifications" add constraint "notifications_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."notifications" validate constraint "notifications_user_id_fkey";

alter table "public"."pets" add constraint "pets_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."pets" validate constraint "pets_owner_id_fkey";

alter table "public"."reminders" add constraint "reminders_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."reminders" validate constraint "reminders_owner_id_fkey";

alter table "public"."reminders" add constraint "reminders_pet_id_fkey" FOREIGN KEY (pet_id) REFERENCES public.pets(id) ON DELETE CASCADE not valid;

alter table "public"."reminders" validate constraint "reminders_pet_id_fkey";

alter table "public"."scan_rate_limits" add constraint "scan_rate_limits_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."scan_rate_limits" validate constraint "scan_rate_limits_user_id_fkey";

alter table "public"."sitter_profiles" add constraint "sitter_profiles_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."sitter_profiles" validate constraint "sitter_profiles_user_id_fkey";

alter table "public"."support_requests" add constraint "support_requests_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL not valid;

alter table "public"."support_requests" validate constraint "support_requests_user_id_fkey";

alter table "public"."thread_comments" add constraint "thread_comments_thread_id_fkey" FOREIGN KEY (thread_id) REFERENCES public.threads(id) ON DELETE CASCADE not valid;

alter table "public"."thread_comments" validate constraint "thread_comments_thread_id_fkey";

alter table "public"."thread_comments" add constraint "thread_comments_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."thread_comments" validate constraint "thread_comments_user_id_fkey";

alter table "public"."threads" add constraint "threads_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."threads" validate constraint "threads_user_id_fkey";

alter table "public"."transactions" add constraint "transactions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."transactions" validate constraint "transactions_user_id_fkey";

alter table "public"."user_quotas" add constraint "user_quotas_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."user_quotas" validate constraint "user_quotas_user_id_fkey";

alter table "public"."verification_uploads" add constraint "verification_uploads_reviewed_by_fkey" FOREIGN KEY (reviewed_by) REFERENCES public.profiles(id) not valid;

alter table "public"."verification_uploads" validate constraint "verification_uploads_reviewed_by_fkey";

alter table "public"."verification_uploads" add constraint "verification_uploads_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."verification_uploads" validate constraint "verification_uploads_user_id_fkey";

alter table "public"."waves" add constraint "waves_from_user_fk" FOREIGN KEY (from_user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."waves" validate constraint "waves_from_user_fk";

alter table "public"."waves" add constraint "waves_to_user_fk" FOREIGN KEY (to_user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."waves" validate constraint "waves_to_user_fk";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.admin_review_verification(p_user_id uuid, p_status public.verification_status_enum, p_comment text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.profiles
  SET
    verification_status = p_status,
    verification_comment = p_comment,
    is_verified = (p_status = 'approved')
  WHERE id = p_user_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.check_for_match()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  reverse_wave_exists BOOLEAN;
  user1 UUID;
  user2 UUID;
BEGIN
  IF NEW.status = 'accepted' THEN
    SELECT EXISTS(
      SELECT 1 FROM public.waves
      WHERE sender_id = NEW.receiver_id
      AND receiver_id = NEW.sender_id
      AND status = 'accepted'
    ) INTO reverse_wave_exists;
    
    IF reverse_wave_exists THEN
      IF NEW.sender_id < NEW.receiver_id THEN
        user1 := NEW.sender_id;
        user2 := NEW.receiver_id;
      ELSE
        user1 := NEW.receiver_id;
        user2 := NEW.sender_id;
      END IF;
      
      INSERT INTO public.matches (user1_id, user2_id)
      VALUES (user1, user2)
      ON CONFLICT (user1_id, user2_id) DO NOTHING;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_match_chat()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  new_chat_id UUID;
BEGIN
  INSERT INTO public.chats (type, created_by)
  VALUES ('direct', NEW.user1_id)
  RETURNING id INTO new_chat_id;
  
  INSERT INTO public.chat_participants (chat_id, user_id)
  VALUES 
    (new_chat_id, NEW.user1_id),
    (new_chat_id, NEW.user2_id);
  
  UPDATE public.matches
  SET chat_id = new_chat_id
  WHERE id = NEW.id;
  
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.purge_expired_verification_docs()
 RETURNS void
 LANGUAGE plpgsql
AS $function$
begin
  delete from storage.objects
  where bucket_id = 'identity_verification'
  and name in (
    select verification_document_url -- assuming this matches the storage name
    from public.profiles
    where verification_status in ('Approved', 'Rejected')
    and updated_at < now() - interval '7 days'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.update_chat_last_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  UPDATE public.chats
  SET last_message_at = NEW.created_at
  WHERE id = NEW.chat_id;
  RETURN NEW;
END;
$function$
;

create type "public"."geometry_dump" as ("path" integer[], "geom" public.geometry);

create or replace view "public"."profiles_public" as  SELECT id,
    display_name,
    avatar_url,
        CASE
            WHEN show_bio THEN bio
            ELSE NULL::text
        END AS bio,
        CASE
            WHEN show_gender THEN gender_genre
            ELSE NULL::text
        END AS gender_genre,
        CASE
            WHEN show_age THEN dob
            ELSE NULL::date
        END AS dob,
        CASE
            WHEN show_height THEN height
            ELSE NULL::integer
        END AS height,
        CASE
            WHEN show_weight THEN weight
            ELSE NULL::integer
        END AS weight,
    weight_unit,
        CASE
            WHEN show_academic THEN degree
            ELSE NULL::text
        END AS degree,
        CASE
            WHEN show_academic THEN school
            ELSE NULL::text
        END AS school,
        CASE
            WHEN show_academic THEN major
            ELSE NULL::text
        END AS major,
        CASE
            WHEN show_affiliation THEN affiliation
            ELSE NULL::text
        END AS affiliation,
    location_name,
    is_verified,
    has_car,
    user_role,
    pet_experience,
    experience_years,
    languages,
    relationship_status,
    owns_pets,
    social_availability,
    availability_status,
    created_at
   FROM public.profiles;


create type "public"."valid_detail" as ("valid" boolean, "reason" character varying, "location" public.geometry);

grant delete on table "public"."ai_vet_messages" to "anon";

grant insert on table "public"."ai_vet_messages" to "anon";

grant references on table "public"."ai_vet_messages" to "anon";

grant select on table "public"."ai_vet_messages" to "anon";

grant trigger on table "public"."ai_vet_messages" to "anon";

grant truncate on table "public"."ai_vet_messages" to "anon";

grant update on table "public"."ai_vet_messages" to "anon";

grant delete on table "public"."ai_vet_messages" to "authenticated";

grant insert on table "public"."ai_vet_messages" to "authenticated";

grant references on table "public"."ai_vet_messages" to "authenticated";

grant select on table "public"."ai_vet_messages" to "authenticated";

grant trigger on table "public"."ai_vet_messages" to "authenticated";

grant truncate on table "public"."ai_vet_messages" to "authenticated";

grant update on table "public"."ai_vet_messages" to "authenticated";

grant delete on table "public"."ai_vet_messages" to "service_role";

grant insert on table "public"."ai_vet_messages" to "service_role";

grant references on table "public"."ai_vet_messages" to "service_role";

grant select on table "public"."ai_vet_messages" to "service_role";

grant trigger on table "public"."ai_vet_messages" to "service_role";

grant truncate on table "public"."ai_vet_messages" to "service_role";

grant update on table "public"."ai_vet_messages" to "service_role";

grant delete on table "public"."ai_vet_usage" to "anon";

grant insert on table "public"."ai_vet_usage" to "anon";

grant references on table "public"."ai_vet_usage" to "anon";

grant select on table "public"."ai_vet_usage" to "anon";

grant trigger on table "public"."ai_vet_usage" to "anon";

grant truncate on table "public"."ai_vet_usage" to "anon";

grant update on table "public"."ai_vet_usage" to "anon";

grant delete on table "public"."ai_vet_usage" to "authenticated";

grant insert on table "public"."ai_vet_usage" to "authenticated";

grant references on table "public"."ai_vet_usage" to "authenticated";

grant select on table "public"."ai_vet_usage" to "authenticated";

grant trigger on table "public"."ai_vet_usage" to "authenticated";

grant truncate on table "public"."ai_vet_usage" to "authenticated";

grant update on table "public"."ai_vet_usage" to "authenticated";

grant delete on table "public"."ai_vet_usage" to "service_role";

grant insert on table "public"."ai_vet_usage" to "service_role";

grant references on table "public"."ai_vet_usage" to "service_role";

grant select on table "public"."ai_vet_usage" to "service_role";

grant trigger on table "public"."ai_vet_usage" to "service_role";

grant truncate on table "public"."ai_vet_usage" to "service_role";

grant update on table "public"."ai_vet_usage" to "service_role";

grant delete on table "public"."chat_participants" to "anon";

grant insert on table "public"."chat_participants" to "anon";

grant references on table "public"."chat_participants" to "anon";

grant select on table "public"."chat_participants" to "anon";

grant trigger on table "public"."chat_participants" to "anon";

grant truncate on table "public"."chat_participants" to "anon";

grant update on table "public"."chat_participants" to "anon";

grant delete on table "public"."chat_participants" to "authenticated";

grant insert on table "public"."chat_participants" to "authenticated";

grant references on table "public"."chat_participants" to "authenticated";

grant select on table "public"."chat_participants" to "authenticated";

grant trigger on table "public"."chat_participants" to "authenticated";

grant truncate on table "public"."chat_participants" to "authenticated";

grant update on table "public"."chat_participants" to "authenticated";

grant delete on table "public"."chat_participants" to "service_role";

grant insert on table "public"."chat_participants" to "service_role";

grant references on table "public"."chat_participants" to "service_role";

grant select on table "public"."chat_participants" to "service_role";

grant trigger on table "public"."chat_participants" to "service_role";

grant truncate on table "public"."chat_participants" to "service_role";

grant update on table "public"."chat_participants" to "service_role";

grant delete on table "public"."chats" to "anon";

grant insert on table "public"."chats" to "anon";

grant references on table "public"."chats" to "anon";

grant select on table "public"."chats" to "anon";

grant trigger on table "public"."chats" to "anon";

grant truncate on table "public"."chats" to "anon";

grant update on table "public"."chats" to "anon";

grant delete on table "public"."chats" to "authenticated";

grant insert on table "public"."chats" to "authenticated";

grant references on table "public"."chats" to "authenticated";

grant select on table "public"."chats" to "authenticated";

grant trigger on table "public"."chats" to "authenticated";

grant truncate on table "public"."chats" to "authenticated";

grant update on table "public"."chats" to "authenticated";

grant delete on table "public"."chats" to "service_role";

grant insert on table "public"."chats" to "service_role";

grant references on table "public"."chats" to "service_role";

grant select on table "public"."chats" to "service_role";

grant trigger on table "public"."chats" to "service_role";

grant truncate on table "public"."chats" to "service_role";

grant update on table "public"."chats" to "service_role";

grant delete on table "public"."location_reviews" to "anon";

grant insert on table "public"."location_reviews" to "anon";

grant references on table "public"."location_reviews" to "anon";

grant select on table "public"."location_reviews" to "anon";

grant trigger on table "public"."location_reviews" to "anon";

grant truncate on table "public"."location_reviews" to "anon";

grant update on table "public"."location_reviews" to "anon";

grant delete on table "public"."location_reviews" to "authenticated";

grant insert on table "public"."location_reviews" to "authenticated";

grant references on table "public"."location_reviews" to "authenticated";

grant select on table "public"."location_reviews" to "authenticated";

grant trigger on table "public"."location_reviews" to "authenticated";

grant truncate on table "public"."location_reviews" to "authenticated";

grant update on table "public"."location_reviews" to "authenticated";

grant delete on table "public"."location_reviews" to "service_role";

grant insert on table "public"."location_reviews" to "service_role";

grant references on table "public"."location_reviews" to "service_role";

grant select on table "public"."location_reviews" to "service_role";

grant trigger on table "public"."location_reviews" to "service_role";

grant truncate on table "public"."location_reviews" to "service_role";

grant update on table "public"."location_reviews" to "service_role";

grant delete on table "public"."map_checkins" to "anon";

grant insert on table "public"."map_checkins" to "anon";

grant references on table "public"."map_checkins" to "anon";

grant select on table "public"."map_checkins" to "anon";

grant trigger on table "public"."map_checkins" to "anon";

grant truncate on table "public"."map_checkins" to "anon";

grant update on table "public"."map_checkins" to "anon";

grant delete on table "public"."map_checkins" to "authenticated";

grant insert on table "public"."map_checkins" to "authenticated";

grant references on table "public"."map_checkins" to "authenticated";

grant select on table "public"."map_checkins" to "authenticated";

grant trigger on table "public"."map_checkins" to "authenticated";

grant truncate on table "public"."map_checkins" to "authenticated";

grant update on table "public"."map_checkins" to "authenticated";

grant delete on table "public"."map_checkins" to "service_role";

grant insert on table "public"."map_checkins" to "service_role";

grant references on table "public"."map_checkins" to "service_role";

grant select on table "public"."map_checkins" to "service_role";

grant trigger on table "public"."map_checkins" to "service_role";

grant truncate on table "public"."map_checkins" to "service_role";

grant update on table "public"."map_checkins" to "service_role";

grant delete on table "public"."match_preferences" to "anon";

grant insert on table "public"."match_preferences" to "anon";

grant references on table "public"."match_preferences" to "anon";

grant select on table "public"."match_preferences" to "anon";

grant trigger on table "public"."match_preferences" to "anon";

grant truncate on table "public"."match_preferences" to "anon";

grant update on table "public"."match_preferences" to "anon";

grant delete on table "public"."match_preferences" to "authenticated";

grant insert on table "public"."match_preferences" to "authenticated";

grant references on table "public"."match_preferences" to "authenticated";

grant select on table "public"."match_preferences" to "authenticated";

grant trigger on table "public"."match_preferences" to "authenticated";

grant truncate on table "public"."match_preferences" to "authenticated";

grant update on table "public"."match_preferences" to "authenticated";

grant delete on table "public"."match_preferences" to "service_role";

grant insert on table "public"."match_preferences" to "service_role";

grant references on table "public"."match_preferences" to "service_role";

grant select on table "public"."match_preferences" to "service_role";

grant trigger on table "public"."match_preferences" to "service_role";

grant truncate on table "public"."match_preferences" to "service_role";

grant update on table "public"."match_preferences" to "service_role";

grant delete on table "public"."matches" to "anon";

grant insert on table "public"."matches" to "anon";

grant references on table "public"."matches" to "anon";

grant select on table "public"."matches" to "anon";

grant trigger on table "public"."matches" to "anon";

grant truncate on table "public"."matches" to "anon";

grant update on table "public"."matches" to "anon";

grant delete on table "public"."matches" to "authenticated";

grant insert on table "public"."matches" to "authenticated";

grant references on table "public"."matches" to "authenticated";

grant select on table "public"."matches" to "authenticated";

grant trigger on table "public"."matches" to "authenticated";

grant truncate on table "public"."matches" to "authenticated";

grant update on table "public"."matches" to "authenticated";

grant delete on table "public"."matches" to "service_role";

grant insert on table "public"."matches" to "service_role";

grant references on table "public"."matches" to "service_role";

grant select on table "public"."matches" to "service_role";

grant trigger on table "public"."matches" to "service_role";

grant truncate on table "public"."matches" to "service_role";

grant update on table "public"."matches" to "service_role";

grant delete on table "public"."message_reads" to "anon";

grant insert on table "public"."message_reads" to "anon";

grant references on table "public"."message_reads" to "anon";

grant select on table "public"."message_reads" to "anon";

grant trigger on table "public"."message_reads" to "anon";

grant truncate on table "public"."message_reads" to "anon";

grant update on table "public"."message_reads" to "anon";

grant delete on table "public"."message_reads" to "authenticated";

grant insert on table "public"."message_reads" to "authenticated";

grant references on table "public"."message_reads" to "authenticated";

grant select on table "public"."message_reads" to "authenticated";

grant trigger on table "public"."message_reads" to "authenticated";

grant truncate on table "public"."message_reads" to "authenticated";

grant update on table "public"."message_reads" to "authenticated";

grant delete on table "public"."message_reads" to "service_role";

grant insert on table "public"."message_reads" to "service_role";

grant references on table "public"."message_reads" to "service_role";

grant select on table "public"."message_reads" to "service_role";

grant trigger on table "public"."message_reads" to "service_role";

grant truncate on table "public"."message_reads" to "service_role";

grant update on table "public"."message_reads" to "service_role";

grant delete on table "public"."messages" to "anon";

grant insert on table "public"."messages" to "anon";

grant references on table "public"."messages" to "anon";

grant select on table "public"."messages" to "anon";

grant trigger on table "public"."messages" to "anon";

grant truncate on table "public"."messages" to "anon";

grant update on table "public"."messages" to "anon";

grant delete on table "public"."messages" to "authenticated";

grant insert on table "public"."messages" to "authenticated";

grant references on table "public"."messages" to "authenticated";

grant select on table "public"."messages" to "authenticated";

grant trigger on table "public"."messages" to "authenticated";

grant truncate on table "public"."messages" to "authenticated";

grant update on table "public"."messages" to "authenticated";

grant delete on table "public"."messages" to "service_role";

grant insert on table "public"."messages" to "service_role";

grant references on table "public"."messages" to "service_role";

grant select on table "public"."messages" to "service_role";

grant trigger on table "public"."messages" to "service_role";

grant truncate on table "public"."messages" to "service_role";

grant update on table "public"."messages" to "service_role";

grant delete on table "public"."notification_preferences" to "anon";

grant insert on table "public"."notification_preferences" to "anon";

grant references on table "public"."notification_preferences" to "anon";

grant select on table "public"."notification_preferences" to "anon";

grant trigger on table "public"."notification_preferences" to "anon";

grant truncate on table "public"."notification_preferences" to "anon";

grant update on table "public"."notification_preferences" to "anon";

grant delete on table "public"."notification_preferences" to "authenticated";

grant insert on table "public"."notification_preferences" to "authenticated";

grant references on table "public"."notification_preferences" to "authenticated";

grant select on table "public"."notification_preferences" to "authenticated";

grant trigger on table "public"."notification_preferences" to "authenticated";

grant truncate on table "public"."notification_preferences" to "authenticated";

grant update on table "public"."notification_preferences" to "authenticated";

grant delete on table "public"."notification_preferences" to "service_role";

grant insert on table "public"."notification_preferences" to "service_role";

grant references on table "public"."notification_preferences" to "service_role";

grant select on table "public"."notification_preferences" to "service_role";

grant trigger on table "public"."notification_preferences" to "service_role";

grant truncate on table "public"."notification_preferences" to "service_role";

grant update on table "public"."notification_preferences" to "service_role";

grant delete on table "public"."payments" to "anon";

grant insert on table "public"."payments" to "anon";

grant references on table "public"."payments" to "anon";

grant select on table "public"."payments" to "anon";

grant trigger on table "public"."payments" to "anon";

grant truncate on table "public"."payments" to "anon";

grant update on table "public"."payments" to "anon";

grant delete on table "public"."payments" to "authenticated";

grant insert on table "public"."payments" to "authenticated";

grant references on table "public"."payments" to "authenticated";

grant select on table "public"."payments" to "authenticated";

grant trigger on table "public"."payments" to "authenticated";

grant truncate on table "public"."payments" to "authenticated";

grant update on table "public"."payments" to "authenticated";

grant delete on table "public"."payments" to "service_role";

grant insert on table "public"."payments" to "service_role";

grant references on table "public"."payments" to "service_role";

grant select on table "public"."payments" to "service_role";

grant trigger on table "public"."payments" to "service_role";

grant truncate on table "public"."payments" to "service_role";

grant update on table "public"."payments" to "service_role";

grant delete on table "public"."push_tokens" to "anon";

grant insert on table "public"."push_tokens" to "anon";

grant references on table "public"."push_tokens" to "anon";

grant select on table "public"."push_tokens" to "anon";

grant trigger on table "public"."push_tokens" to "anon";

grant truncate on table "public"."push_tokens" to "anon";

grant update on table "public"."push_tokens" to "anon";

grant delete on table "public"."push_tokens" to "authenticated";

grant insert on table "public"."push_tokens" to "authenticated";

grant references on table "public"."push_tokens" to "authenticated";

grant select on table "public"."push_tokens" to "authenticated";

grant trigger on table "public"."push_tokens" to "authenticated";

grant truncate on table "public"."push_tokens" to "authenticated";

grant update on table "public"."push_tokens" to "authenticated";

grant delete on table "public"."push_tokens" to "service_role";

grant insert on table "public"."push_tokens" to "service_role";

grant references on table "public"."push_tokens" to "service_role";

grant select on table "public"."push_tokens" to "service_role";

grant trigger on table "public"."push_tokens" to "service_role";

grant truncate on table "public"."push_tokens" to "service_role";

grant update on table "public"."push_tokens" to "service_role";

grant delete on table "public"."social_interactions" to "anon";

grant insert on table "public"."social_interactions" to "anon";

grant references on table "public"."social_interactions" to "anon";

grant select on table "public"."social_interactions" to "anon";

grant trigger on table "public"."social_interactions" to "anon";

grant truncate on table "public"."social_interactions" to "anon";

grant update on table "public"."social_interactions" to "anon";

grant delete on table "public"."social_interactions" to "authenticated";

grant insert on table "public"."social_interactions" to "authenticated";

grant references on table "public"."social_interactions" to "authenticated";

grant select on table "public"."social_interactions" to "authenticated";

grant trigger on table "public"."social_interactions" to "authenticated";

grant truncate on table "public"."social_interactions" to "authenticated";

grant update on table "public"."social_interactions" to "authenticated";

grant delete on table "public"."social_interactions" to "service_role";

grant insert on table "public"."social_interactions" to "service_role";

grant references on table "public"."social_interactions" to "service_role";

grant select on table "public"."social_interactions" to "service_role";

grant trigger on table "public"."social_interactions" to "service_role";

grant truncate on table "public"."social_interactions" to "service_role";

grant update on table "public"."social_interactions" to "service_role";

grant delete on table "public"."subscriptions" to "anon";

grant insert on table "public"."subscriptions" to "anon";

grant references on table "public"."subscriptions" to "anon";

grant select on table "public"."subscriptions" to "anon";

grant trigger on table "public"."subscriptions" to "anon";

grant truncate on table "public"."subscriptions" to "anon";

grant update on table "public"."subscriptions" to "anon";

grant delete on table "public"."subscriptions" to "authenticated";

grant insert on table "public"."subscriptions" to "authenticated";

grant references on table "public"."subscriptions" to "authenticated";

grant select on table "public"."subscriptions" to "authenticated";

grant trigger on table "public"."subscriptions" to "authenticated";

grant truncate on table "public"."subscriptions" to "authenticated";

grant update on table "public"."subscriptions" to "authenticated";

grant delete on table "public"."subscriptions" to "service_role";

grant insert on table "public"."subscriptions" to "service_role";

grant references on table "public"."subscriptions" to "service_role";

grant select on table "public"."subscriptions" to "service_role";

grant trigger on table "public"."subscriptions" to "service_role";

grant truncate on table "public"."subscriptions" to "service_role";

grant update on table "public"."subscriptions" to "service_role";

grant delete on table "public"."typing_indicators" to "anon";

grant insert on table "public"."typing_indicators" to "anon";

grant references on table "public"."typing_indicators" to "anon";

grant select on table "public"."typing_indicators" to "anon";

grant trigger on table "public"."typing_indicators" to "anon";

grant truncate on table "public"."typing_indicators" to "anon";

grant update on table "public"."typing_indicators" to "anon";

grant delete on table "public"."typing_indicators" to "authenticated";

grant insert on table "public"."typing_indicators" to "authenticated";

grant references on table "public"."typing_indicators" to "authenticated";

grant select on table "public"."typing_indicators" to "authenticated";

grant trigger on table "public"."typing_indicators" to "authenticated";

grant truncate on table "public"."typing_indicators" to "authenticated";

grant update on table "public"."typing_indicators" to "authenticated";

grant delete on table "public"."typing_indicators" to "service_role";

grant insert on table "public"."typing_indicators" to "service_role";

grant references on table "public"."typing_indicators" to "service_role";

grant select on table "public"."typing_indicators" to "service_role";

grant trigger on table "public"."typing_indicators" to "service_role";

grant truncate on table "public"."typing_indicators" to "service_role";

grant update on table "public"."typing_indicators" to "service_role";

grant delete on table "public"."user_locations" to "anon";

grant insert on table "public"."user_locations" to "anon";

grant references on table "public"."user_locations" to "anon";

grant select on table "public"."user_locations" to "anon";

grant trigger on table "public"."user_locations" to "anon";

grant truncate on table "public"."user_locations" to "anon";

grant update on table "public"."user_locations" to "anon";

grant delete on table "public"."user_locations" to "authenticated";

grant insert on table "public"."user_locations" to "authenticated";

grant references on table "public"."user_locations" to "authenticated";

grant select on table "public"."user_locations" to "authenticated";

grant trigger on table "public"."user_locations" to "authenticated";

grant truncate on table "public"."user_locations" to "authenticated";

grant update on table "public"."user_locations" to "authenticated";

grant delete on table "public"."user_locations" to "service_role";

grant insert on table "public"."user_locations" to "service_role";

grant references on table "public"."user_locations" to "service_role";

grant select on table "public"."user_locations" to "service_role";

grant trigger on table "public"."user_locations" to "service_role";

grant truncate on table "public"."user_locations" to "service_role";

grant update on table "public"."user_locations" to "service_role";

grant delete on table "public"."verification_audit_log" to "anon";

grant insert on table "public"."verification_audit_log" to "anon";

grant references on table "public"."verification_audit_log" to "anon";

grant select on table "public"."verification_audit_log" to "anon";

grant trigger on table "public"."verification_audit_log" to "anon";

grant truncate on table "public"."verification_audit_log" to "anon";

grant update on table "public"."verification_audit_log" to "anon";

grant delete on table "public"."verification_audit_log" to "authenticated";

grant insert on table "public"."verification_audit_log" to "authenticated";

grant references on table "public"."verification_audit_log" to "authenticated";

grant select on table "public"."verification_audit_log" to "authenticated";

grant trigger on table "public"."verification_audit_log" to "authenticated";

grant truncate on table "public"."verification_audit_log" to "authenticated";

grant update on table "public"."verification_audit_log" to "authenticated";

grant delete on table "public"."verification_audit_log" to "service_role";

grant insert on table "public"."verification_audit_log" to "service_role";

grant references on table "public"."verification_audit_log" to "service_role";

grant select on table "public"."verification_audit_log" to "service_role";

grant trigger on table "public"."verification_audit_log" to "service_role";

grant truncate on table "public"."verification_audit_log" to "service_role";

grant update on table "public"."verification_audit_log" to "service_role";

grant delete on table "public"."verification_requests" to "anon";

grant insert on table "public"."verification_requests" to "anon";

grant references on table "public"."verification_requests" to "anon";

grant select on table "public"."verification_requests" to "anon";

grant trigger on table "public"."verification_requests" to "anon";

grant truncate on table "public"."verification_requests" to "anon";

grant update on table "public"."verification_requests" to "anon";

grant delete on table "public"."verification_requests" to "authenticated";

grant insert on table "public"."verification_requests" to "authenticated";

grant references on table "public"."verification_requests" to "authenticated";

grant select on table "public"."verification_requests" to "authenticated";

grant trigger on table "public"."verification_requests" to "authenticated";

grant truncate on table "public"."verification_requests" to "authenticated";

grant update on table "public"."verification_requests" to "authenticated";

grant delete on table "public"."verification_requests" to "service_role";

grant insert on table "public"."verification_requests" to "service_role";

grant references on table "public"."verification_requests" to "service_role";

grant select on table "public"."verification_requests" to "service_role";

grant trigger on table "public"."verification_requests" to "service_role";

grant truncate on table "public"."verification_requests" to "service_role";

grant update on table "public"."verification_requests" to "service_role";


  create policy "Users can create AI conversations"
  on "public"."ai_vet_conversations"
  as permissive
  for insert
  to public
with check ((user_id = auth.uid()));



  create policy "Users can view own AI conversations"
  on "public"."ai_vet_conversations"
  as permissive
  for select
  to public
using ((user_id = auth.uid()));



  create policy "Users can view messages in own conversations"
  on "public"."ai_vet_messages"
  as permissive
  for select
  to public
using ((conversation_id IN ( SELECT ai_vet_conversations.id
   FROM public.ai_vet_conversations
  WHERE (ai_vet_conversations.user_id = auth.uid()))));



  create policy "Users can view participants of their chats"
  on "public"."chat_participants"
  as permissive
  for select
  to public
using ((chat_id IN ( SELECT chat_participants_1.chat_id
   FROM public.chat_participants chat_participants_1
  WHERE (chat_participants_1.user_id = auth.uid()))));



  create policy "Users can view chats they participate in"
  on "public"."chats"
  as permissive
  for select
  to public
using ((id IN ( SELECT chat_participants.chat_id
   FROM public.chat_participants
  WHERE (chat_participants.user_id = auth.uid()))));



  create policy "Users can view their matches"
  on "public"."matches"
  as permissive
  for select
  to public
using (((user1_id = auth.uid()) OR (user2_id = auth.uid())));



  create policy "Users can send messages in their chats"
  on "public"."messages"
  as permissive
  for insert
  to public
with check (((sender_id = auth.uid()) AND (chat_id IN ( SELECT chat_participants.chat_id
   FROM public.chat_participants
  WHERE (chat_participants.user_id = auth.uid())))));



  create policy "Users can view messages in their chats"
  on "public"."messages"
  as permissive
  for select
  to public
using ((chat_id IN ( SELECT chat_participants.chat_id
   FROM public.chat_participants
  WHERE (chat_participants.user_id = auth.uid()))));



  create policy "Users can update own notifications"
  on "public"."notifications"
  as permissive
  for update
  to public
using ((user_id = auth.uid()));



  create policy "Users can view own notifications"
  on "public"."notifications"
  as permissive
  for select
  to public
using ((user_id = auth.uid()));



  create policy "Users can view own subscriptions"
  on "public"."subscriptions"
  as permissive
  for select
  to public
using ((user_id = auth.uid()));



  create policy "Users can insert own location"
  on "public"."user_locations"
  as permissive
  for insert
  to public
with check ((user_id = auth.uid()));



  create policy "Users can update own location"
  on "public"."user_locations"
  as permissive
  for update
  to public
using ((user_id = auth.uid()));



  create policy "Users can view public locations or own location"
  on "public"."user_locations"
  as permissive
  for select
  to public
using (((is_public = true) OR (user_id = auth.uid())));



  create policy "Users can send waves"
  on "public"."waves"
  as permissive
  for insert
  to public
with check ((sender_id = auth.uid()));



  create policy "Users can update waves they received"
  on "public"."waves"
  as permissive
  for update
  to public
using ((receiver_id = auth.uid()));



  create policy "Users can view waves sent to them or by them"
  on "public"."waves"
  as permissive
  for select
  to public
using (((sender_id = auth.uid()) OR (receiver_id = auth.uid())));



  create policy "chat_messages_insert"
  on "public"."chat_messages"
  as permissive
  for insert
  to public
with check (((sender_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.chat_room_members m
  WHERE ((m.room_id = chat_messages.room_id) AND (m.user_id = auth.uid()))))));



  create policy "chat_messages_select"
  on "public"."chat_messages"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.chat_room_members m
  WHERE ((m.room_id = chat_messages.room_id) AND (m.user_id = auth.uid())))));



  create policy "users_view_own_emergency_logs"
  on "public"."emergency_logs"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.lost_pet_alerts
  WHERE ((lost_pet_alerts.id = emergency_logs.alert_id) AND (lost_pet_alerts.owner_id = auth.uid())))));



  create policy "users_view_own_notification_logs"
  on "public"."notification_logs"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.lost_pet_alerts
  WHERE ((lost_pet_alerts.id = notification_logs.alert_id) AND (lost_pet_alerts.owner_id = auth.uid())))));



  create policy "Admins can update verification status"
  on "public"."verification_uploads"
  as permissive
  for update
  to public
using ((auth.uid() IN ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.user_role = 'admin'::text))));



  create policy "Admins can view verification uploads"
  on "public"."verification_uploads"
  as permissive
  for select
  to public
using ((auth.uid() IN ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.user_role = 'admin'::text))));


CREATE TRIGGER update_ai_vet_conversations_updated_at BEFORE UPDATE ON public.ai_vet_conversations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_chats_updated_at BEFORE UPDATE ON public.chats FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER on_new_match AFTER INSERT ON public.matches FOR EACH ROW EXECUTE FUNCTION public.create_match_chat();

CREATE TRIGGER on_new_message AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION public.update_chat_last_message();

CREATE TRIGGER update_messages_updated_at BEFORE UPDATE ON public.messages FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER on_wave_accepted AFTER UPDATE ON public.waves FOR EACH ROW EXECUTE FUNCTION public.check_for_match();

CREATE TRIGGER trg_alert_interactions_counts_del AFTER DELETE ON public.alert_interactions FOR EACH ROW EXECUTE FUNCTION public.map_alerts_apply_interaction_counts();

CREATE TRIGGER trg_alert_interactions_counts_ins AFTER INSERT ON public.alert_interactions FOR EACH ROW EXECUTE FUNCTION public.map_alerts_apply_interaction_counts();

CREATE TRIGGER trg_map_alerts_auto_hide BEFORE UPDATE OF report_count ON public.map_alerts FOR EACH ROW EXECUTE FUNCTION public.map_alerts_auto_hide_on_reports();

CREATE TRIGGER trg_map_alerts_contract BEFORE INSERT ON public.map_alerts FOR EACH ROW EXECUTE FUNCTION public.enforce_map_alert_contract();

CREATE TRIGGER trg_notify_on_map_alert_insert AFTER INSERT ON public.map_alerts FOR EACH ROW EXECUTE FUNCTION public.notify_on_map_alert_insert();

CREATE TRIGGER award_sitter_vouch_trigger AFTER UPDATE ON public.marketplace_bookings FOR EACH ROW EXECUTE FUNCTION public.award_sitter_vouch();

CREATE TRIGGER set_booking_escrow_release BEFORE INSERT OR UPDATE ON public.marketplace_bookings FOR EACH ROW EXECUTE FUNCTION public.set_escrow_release_date();

CREATE TRIGGER update_bookings_updated_at BEFORE UPDATE ON public.marketplace_bookings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_validate_vaccination_dates BEFORE INSERT OR UPDATE ON public.pets FOR EACH ROW EXECUTE FUNCTION public.validate_vaccination_dates();

CREATE TRIGGER update_pets_updated_at BEFORE UPDATE ON public.pets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER protect_profiles_monetization BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.protect_monetized_fields();

CREATE TRIGGER trg_prevent_sensitive_profile_updates BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.prevent_sensitive_profile_updates();

CREATE TRIGGER trg_queue_identity_cleanup AFTER UPDATE OF verification_status ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.queue_identity_cleanup();

CREATE TRIGGER trg_set_profiles_user_id BEFORE INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_profiles_user_id();

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_reminders_updated_at BEFORE UPDATE ON public.reminders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER update_sitter_profiles_updated_at BEFORE UPDATE ON public.sitter_profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_sync_thread_comment_content BEFORE INSERT OR UPDATE ON public.thread_comments FOR EACH ROW EXECUTE FUNCTION public.sync_thread_comment_content();

CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

drop trigger if exists "on_auth_user_created" on "auth"."users";

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

drop policy "Strict Identity Access" on "storage"."objects";


  create policy "Strict Identity Access"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using (((bucket_id = 'identity_verification'::text) AND ((owner = auth.uid()) OR (( SELECT profiles.role
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::text))));


CREATE TRIGGER protect_buckets_delete BEFORE DELETE ON storage.buckets FOR EACH STATEMENT EXECUTE FUNCTION storage.protect_delete();

CREATE TRIGGER protect_objects_delete BEFORE DELETE ON storage.objects FOR EACH STATEMENT EXECUTE FUNCTION storage.protect_delete();


