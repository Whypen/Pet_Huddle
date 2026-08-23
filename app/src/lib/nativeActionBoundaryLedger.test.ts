import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

type Surface = "account" | "signup" | "identity" | "billing" | "support" | "social" | "chats" | "map" | "care" | "media" | "profile" | "notifications";
type BoundaryKind = "rpc" | "edge";

type Boundary = Readonly<{
  name: string;
  kind: BoundaryKind;
  surface: Surface;
  operation: "read" | "write";
  remoteRule: "authenticated boundary" | "pre-signup boundary";
}>;

type DirectRelation = Readonly<{
  name: string;
  surface: Surface;
  operation: "read" | "write" | "read/write";
  remoteRule: "RLS must authorize remotely";
}>;

type RealtimeRelation = Readonly<{
  name: string;
  surface: Surface;
  remoteRule: "Realtime authorization must authorize remotely";
}>;

// Calls through small client adapters are still production backend boundaries.
// Keep this explicit inventory separate from the individual adapter names so a
// new literal target must be classified before the client contract can pass.
const supplementalRpcNames = [
  "accept_group_chat_invite", "accept_group_chat_invite_by_id", "accept_mutual_wave", "archive_chat_for_current_user",
  "cancel_group_event_occurrence", "cancel_group_event_series", "cancel_native_group_invite", "check_native_direct_relationship",
  "clear_user_location_pin", "create_broadcast_alert_share_link", "create_group_chat_event", "create_native_add_friend_invite_token", "create_native_group_chat",
  "create_native_service_chat", "create_native_social_comment", "create_native_social_thread", "create_recurring_group_chat_event",
  "create_thread_mention_notifications", "decline_native_group_invite", "decline_service_care_request", "delete_broadcast_alert",
  "delete_native_social_comment", "delete_social_thread", "end_map_visibility", "ensure_direct_chat_room", "freeze_chat_for_report",
  "get_active_service_provider_ids_for_viewer", "get_app_location_fallback", "get_broadcast_alert_by_id_with_audience",
  "get_broadcast_alert_by_share_token", "get_broadcast_alert_verified_only", "get_chat_inbox_summaries", "get_chat_inbox_unread_total", "get_discovery_cards", "get_group_chat_events",
  "get_live_activity_nearby_companions", "get_my_group_invite_previews", "get_my_pet_care_stripe_fields",
  "get_my_professional_credentials", "get_my_service_care_payment_statuses", "get_native_active_care_sessions",
  "get_native_chat_dialogue_snapshot", "get_native_chat_read_receipts", "get_native_chat_viewer_snapshot", "get_native_family_account_state",
  "get_native_group_invite_chat_id", "get_native_group_management_snapshot", "get_native_map_blocked_user_ids",
  "get_native_map_people_v2", "get_native_map_people_v3", "get_native_matched_fallback_target", "get_native_matched_rail_summary", "get_native_onboarding_snapshot", "get_native_out_now_session_clock",
  "get_native_profile_engagement_stats", "get_native_profile_summary", "get_native_public_profile_pet", "get_native_public_profile_relationship",
  "get_native_public_profile_snapshot", "get_native_social_block_relationship", "get_native_social_blocked_user_ids",
  "get_native_service_provider_cards", "get_native_service_provider_detail", "get_native_social_comment_image_metadata",
  "get_native_social_comments", "get_native_social_post_preferences", "get_native_social_supported_thread_ids",
  "get_native_social_thread_image_metadata", "get_native_verify_identity_profile_snapshot", "get_native_viewer_group_context",
  "get_or_create_native_add_code", "get_provider_rating_summary", "get_public_group_preview_members",
  "get_public_groups_for_viewer",
  "get_service_care_payment_status_by_service_id", "get_share_targets", "get_social_feed_alert_context",
  "get_store_entitlement_summary", "get_user_engagement_tiers", "get_viewer_upcoming_group_events", "get_visible_map_pin_shells_with_audience",
  "get_visible_pet_pois", "is_user_blocked", "join_native_group_member", "join_private_group_by_code", "mark_room_read",
  "mark_room_read_messages", "native_map_actor_name", "native_map_alert_support_count", "native_map_alert_supported",
  "native_map_record_alert_share", "native_map_remove_alert_interaction", "native_map_set_invisible", "native_map_upsert_alert_interaction",
  "process_user_report", "record_native_service_analytics", "record_native_service_provider_view", "record_social_feed_event",
  "record_thread_share_click", "redeem_native_add_code", "redeem_native_add_friend_invite_token", "refresh_identity_verification_status", "refresh_my_phone_verification_status",
  "remove_group_chat_event", "renew_native_out_now_visibility", "renew_native_out_now_visibility_with_clock",
  "replace_native_social_post_mentions", "replace_native_social_reply_mentions", "request_native_group_join",
  "resolve_native_oauth_account", "resolve_native_social_mentions", "return_native_out_now", "rotate_native_add_code", "search_chat_inbox",
  "search_native_family_invite_candidates", "search_native_social_mentions", "send_native_chat_message", "send_native_discovery_wave_atomic",
  "send_native_social_share_to_chat", "set_native_social_comment_support", "set_native_social_post_pinned", "set_native_social_post_saved", "set_native_social_support",
  "set_user_location", "start_native_out_now", "submit_professional_credential", "toggle_group_chat_event_rsvp",
  "toggle_native_service_bookmark", "update_broadcast_alert", "update_group_chat_event", "update_group_chat_metadata",
  "update_group_event_series", "update_native_social_comment", "update_native_social_thread", "update_service_care_instruction",
  "submit_service_care_update_by_service_id",
  "upsert_notification_window", "withdraw_service_request_by_service_id",
] as const;

const supplementalEdgeNames = [
  "auth-change-password", "auth-login", "auth-reset-password", "auth-signup", "create-identity-setup-intent",
  "create-stripe-connect-link", "credential-registry-check", "link-preview", "native-profile-photo-upload", "native-verify-identity-document",
  "refresh-stripe-account-status", "send-phone-otp", "send-pre-signup-verify", "social-video-finalize",
  "submit-support-ticket", "verify-apple-subscription", "verify-device-fingerprint", "verify-google-subscription",
  "verify-human-challenge", "verify-phone-otp",
] as const;

const preSignupBoundaries = new Set<string>([
  "auth-login", "auth-reset-password", "auth-signup", "check_identifier_registered", "confirm-pre-signup-verify",
  "get-pre-signup-verify-status", "is_social_id_taken", "send-phone-otp", "send-pre-signup-verify",
]);

const surfaceForBoundary = (name: string): Surface => {
  if (preSignupBoundaries.has(name) || name.includes("onboarding") || name.includes("oauth")) return "signup";
  if (name.includes("identity") || name.includes("phone") || name.includes("credential") || name.includes("fingerprint") || name.includes("human")) return "identity";
  if (name.includes("care") || name.includes("service") || name.includes("provider") || name.includes("stripe")) return "care";
  if (name.includes("subscription") || name.includes("store")) return "billing";
  if (name.includes("support")) return "support";
  if (name.includes("social") || name.includes("thread") || name.includes("comment") || name.includes("report")) return "social";
  if (name.includes("map") || name.includes("alert") || name.includes("location") || name.includes("out_now") || name.includes("pois")) return "map";
  if (name.includes("group") || name.includes("chat") || name.includes("wave") || name.includes("match") || name.includes("add_code") || name.includes("room")) return "chats";
  if (name.includes("notification")) return "notifications";
  return "profile";
};

const isReadBoundary = (name: string) => /^(check|get|has|is|search|current|refresh)_/.test(name) || /^native_map_(actor_name|alert_support_count|alert_supported)$/.test(name);

const inferredBoundaries = (names: readonly string[], kind: BoundaryKind): readonly Boundary[] => names.map((name) => ({
  name,
  kind,
  surface: surfaceForBoundary(name),
  operation: isReadBoundary(name) ? "read" : "write",
  remoteRule: preSignupBoundaries.has(name) ? "pre-signup boundary" : "authenticated boundary",
}));

// This is deliberately an inventory, not a reimplementation of server policy.
// A native client boundary must be explicitly classified before it can ship.
const boundaryLedger: readonly Boundary[] = [
  { name: "block_user", kind: "rpc", surface: "profile", operation: "write", remoteRule: "authenticated boundary" },
  { name: "check_identifier_registered", kind: "rpc", surface: "signup", operation: "read", remoteRule: "pre-signup boundary" },
  { name: "complete_native_signup_identity", kind: "rpc", surface: "signup", operation: "write", remoteRule: "authenticated boundary" },
  { name: "complete_native_signup_profile", kind: "rpc", surface: "signup", operation: "write", remoteRule: "authenticated boundary" },
  { name: "complete_service_if_both_confirmed_by_service_id", kind: "rpc", surface: "care", operation: "write", remoteRule: "authenticated boundary" },
  { name: "create_alert_thread_and_pin", kind: "rpc", surface: "map", operation: "write", remoteRule: "authenticated boundary" },
  // Reviewed: security definer; creator-or-admin only; rejects any type other than Lost;
  // revoked from public/anon and granted only to authenticated/service_role.
  { name: "mark_broadcast_alert_found", kind: "rpc", surface: "map", operation: "write", remoteRule: "authenticated boundary" },
  { name: "create_care_scope_counterproposal", kind: "rpc", surface: "care", operation: "write", remoteRule: "authenticated boundary" },
  { name: "current_care_scope_summary", kind: "rpc", surface: "care", operation: "read", remoteRule: "authenticated boundary" },
  { name: "enqueue_native_group_joined_notification", kind: "rpc", surface: "notifications", operation: "write", remoteRule: "authenticated boundary" },
  { name: "execute_notification_action", kind: "rpc", surface: "notifications", operation: "write", remoteRule: "authenticated boundary" },
  { name: "get_discovery_cycle_state", kind: "rpc", surface: "chats", operation: "read", remoteRule: "authenticated boundary" },
  { name: "get_my_care_market", kind: "rpc", surface: "care", operation: "read", remoteRule: "authenticated boundary" },
  { name: "get_native_broadcast_reach", kind: "rpc", surface: "map", operation: "read", remoteRule: "authenticated boundary" },
  { name: "get_native_chat_profile_summaries", kind: "rpc", surface: "chats", operation: "read", remoteRule: "authenticated boundary" },
  { name: "get_native_accessible_pet", kind: "rpc", surface: "profile", operation: "read", remoteRule: "authenticated boundary" },
  { name: "get_native_accessible_pets", kind: "rpc", surface: "profile", operation: "read", remoteRule: "authenticated boundary" },
  { name: "get_native_family_pet_context", kind: "rpc", surface: "profile", operation: "read", remoteRule: "authenticated boundary" },
  { name: "get_native_family_shared_pet_candidates", kind: "rpc", surface: "profile", operation: "read", remoteRule: "authenticated boundary" },
  { name: "get_native_group_manage_snapshot", kind: "rpc", surface: "chats", operation: "read", remoteRule: "authenticated boundary" },
  { name: "get_native_group_member_state", kind: "rpc", surface: "chats", operation: "read", remoteRule: "authenticated boundary" },
  { name: "get_native_public_avatar_presentations", kind: "rpc", surface: "profile", operation: "read", remoteRule: "authenticated boundary" },
  { name: "get_native_social_thread_by_id", kind: "rpc", surface: "social", operation: "read", remoteRule: "authenticated boundary" },
  { name: "get_native_social_thread_counts", kind: "rpc", surface: "social", operation: "read", remoteRule: "authenticated boundary" },
  { name: "get_native_viewer_scope", kind: "rpc", surface: "profile", operation: "read", remoteRule: "authenticated boundary" },
  { name: "get_public_provider_credential_badges", kind: "rpc", surface: "care", operation: "read", remoteRule: "authenticated boundary" },
  { name: "get_quota_snapshot", kind: "rpc", surface: "profile", operation: "read", remoteRule: "authenticated boundary" },
  { name: "get_service_care_pet_scope", kind: "rpc", surface: "care", operation: "read", remoteRule: "authenticated boundary" },
  { name: "get_service_care_update_status_by_service_id", kind: "rpc", surface: "care", operation: "read", remoteRule: "authenticated boundary" },
  { name: "get_service_provider_distances", kind: "rpc", surface: "care", operation: "read", remoteRule: "authenticated boundary" },
  { name: "get_service_provider_payment_readiness", kind: "rpc", surface: "care", operation: "read", remoteRule: "authenticated boundary" },
  { name: "get_social_feed", kind: "rpc", surface: "social", operation: "read", remoteRule: "authenticated boundary" },
  { name: "get_social_feed_hydration", kind: "rpc", surface: "social", operation: "read", remoteRule: "authenticated boundary" },
  { name: "has_native_reciprocal_wave", kind: "rpc", surface: "chats", operation: "read", remoteRule: "authenticated boundary" },
  { name: "invite_native_group_members", kind: "rpc", surface: "chats", operation: "write", remoteRule: "authenticated boundary" },
  { name: "is_social_id_taken", kind: "rpc", surface: "signup", operation: "read", remoteRule: "pre-signup boundary" },
  { name: "mark_native_discover_match_seen", kind: "rpc", surface: "chats", operation: "write", remoteRule: "authenticated boundary" },
  { name: "mark_native_signup_location", kind: "rpc", surface: "signup", operation: "write", remoteRule: "authenticated boundary" },
  { name: "mark_native_signup_notification_handled", kind: "rpc", surface: "signup", operation: "write", remoteRule: "authenticated boundary" },
  { name: "mark_native_signup_welcome_seen", kind: "rpc", surface: "signup", operation: "write", remoteRule: "authenticated boundary" },
  { name: "prepare_service_start_pin_by_service_id", kind: "rpc", surface: "care", operation: "read", remoteRule: "authenticated boundary" },
  { name: "add_native_family_shared_pets", kind: "rpc", surface: "profile", operation: "write", remoteRule: "authenticated boundary" },
  { name: "create_native_family_invite", kind: "rpc", surface: "profile", operation: "write", remoteRule: "authenticated boundary" },
  { name: "record_service_care_scope_signature", kind: "rpc", surface: "care", operation: "write", remoteRule: "authenticated boundary" },
  { name: "refresh_huddle_promo_progress_v9", kind: "rpc", surface: "profile", operation: "read", remoteRule: "authenticated boundary" },
  { name: "register_native_media_asset", kind: "rpc", surface: "media", operation: "write", remoteRule: "authenticated boundary" },
  { name: "register_native_family_pet_media_asset", kind: "rpc", surface: "media", operation: "write", remoteRule: "authenticated boundary" },
  { name: "register_native_push_token", kind: "rpc", surface: "notifications", operation: "write", remoteRule: "authenticated boundary" },
  { name: "remove_group_chat", kind: "rpc", surface: "chats", operation: "write", remoteRule: "authenticated boundary" },
  { name: "remove_group_member", kind: "rpc", surface: "chats", operation: "write", remoteRule: "authenticated boundary" },
  { name: "remove_my_care_interest", kind: "rpc", surface: "care", operation: "write", remoteRule: "authenticated boundary" },
  { name: "remove_native_group_member", kind: "rpc", surface: "chats", operation: "write", remoteRule: "authenticated boundary" },
  { name: "remove_native_family_shared_pet", kind: "rpc", surface: "profile", operation: "write", remoteRule: "authenticated boundary" },
  { name: "request_native_family_pet_storage_cleanup", kind: "rpc", surface: "media", operation: "write", remoteRule: "authenticated boundary" },
  { name: "request_storage_cleanup", kind: "rpc", surface: "media", operation: "write", remoteRule: "authenticated boundary" },
  { name: "save_my_care_interest", kind: "rpc", surface: "care", operation: "write", remoteRule: "authenticated boundary" },
  { name: "send_match_first_message", kind: "rpc", surface: "chats", operation: "write", remoteRule: "authenticated boundary" },
  { name: "send_native_discovery_star_atomic", kind: "rpc", surface: "profile", operation: "write", remoteRule: "authenticated boundary" },
  { name: "send_service_request", kind: "rpc", surface: "care", operation: "write", remoteRule: "authenticated boundary" },
  { name: "set_group_mute_state", kind: "rpc", surface: "chats", operation: "write", remoteRule: "authenticated boundary" },
  { name: "set_native_social_thread_image_metadata", kind: "rpc", surface: "map", operation: "write", remoteRule: "authenticated boundary" },
  { name: "set_private_user_location", kind: "rpc", surface: "map", operation: "write", remoteRule: "authenticated boundary" },
  { name: "share_service_start_pin_by_service_id", kind: "rpc", surface: "care", operation: "write", remoteRule: "authenticated boundary" },
  { name: "submit_handoff_problem_by_service_id", kind: "rpc", surface: "care", operation: "write", remoteRule: "authenticated boundary" },
  { name: "submit_provider_completion_by_service_id", kind: "rpc", surface: "care", operation: "write", remoteRule: "authenticated boundary" },
  { name: "submit_requester_completion_by_service_id", kind: "rpc", surface: "care", operation: "write", remoteRule: "authenticated boundary" },
  { name: "submit_requester_handoff_response_by_service_id", kind: "rpc", surface: "care", operation: "write", remoteRule: "authenticated boundary" },
  { name: "submit_service_checkin_by_service_id", kind: "rpc", surface: "care", operation: "write", remoteRule: "authenticated boundary" },
  { name: "submit_service_issue_report_by_service_id", kind: "rpc", surface: "care", operation: "write", remoteRule: "authenticated boundary" },
  { name: "submit_service_no_start_report_by_service_id", kind: "rpc", surface: "care", operation: "write", remoteRule: "authenticated boundary" },
  { name: "submit_service_review_v2", kind: "rpc", surface: "care", operation: "write", remoteRule: "authenticated boundary" },
  { name: "touch_discovery_cycle", kind: "rpc", surface: "chats", operation: "write", remoteRule: "authenticated boundary" },
  { name: "touch_profile_activity", kind: "rpc", surface: "profile", operation: "write", remoteRule: "authenticated boundary" },
  { name: "unmatch_user_one_sided", kind: "rpc", surface: "chats", operation: "write", remoteRule: "authenticated boundary" },
  { name: "update_native_chat_message_content", kind: "rpc", surface: "chats", operation: "write", remoteRule: "authenticated boundary" },
  { name: "verify_service_start_pin_by_service_id", kind: "rpc", surface: "care", operation: "write", remoteRule: "authenticated boundary" },
  { name: "cancel-service-booking", kind: "edge", surface: "care", operation: "write", remoteRule: "authenticated boundary" },
  { name: "confirm-pre-signup-verify", kind: "edge", surface: "signup", operation: "write", remoteRule: "pre-signup boundary" },
  { name: "confirm-service-payment", kind: "edge", surface: "care", operation: "write", remoteRule: "authenticated boundary" },
  { name: "confirm-voluntary-service-booking", kind: "edge", surface: "care", operation: "write", remoteRule: "authenticated boundary" },
  { name: "create-service-payment", kind: "edge", surface: "care", operation: "write", remoteRule: "authenticated boundary" },
  { name: "delete-account", kind: "edge", surface: "account", operation: "write", remoteRule: "authenticated boundary" },
  { name: "generate-care-agreement-pdf", kind: "edge", surface: "care", operation: "read", remoteRule: "authenticated boundary" },
  { name: "get-pre-signup-verify-status", kind: "edge", surface: "signup", operation: "read", remoteRule: "pre-signup boundary" },
  { name: "social-video-create-upload", kind: "edge", surface: "social", operation: "write", remoteRule: "authenticated boundary" },
  { name: "social-video-delete", kind: "edge", surface: "social", operation: "write", remoteRule: "authenticated boundary" },
  ...inferredBoundaries(supplementalRpcNames, "rpc"),
  ...inferredBoundaries(supplementalEdgeNames, "edge"),
];

const storageBuckets = [
  "alerts", "avatars", "care_agreements", "care_attachments", "chat_attachments", "notices", "pets",
  "private_pet_photos", "profile_photos", "service_care_evidence", "social_album",
] as const;

// These are the native client's direct PostgREST reads/writes. Other data
// access is deliberately required to enter through the RPC/Function ledger.
const directRelationLedger: readonly DirectRelation[] = [
  { name: "care_scope_versions", surface: "care", operation: "read", remoteRule: "RLS must authorize remotely" },
  { name: "chat_room_members", surface: "chats", operation: "read", remoteRule: "RLS must authorize remotely" },
  { name: "message_reads", surface: "chats", operation: "read", remoteRule: "RLS must authorize remotely" },
  { name: "notification_preferences", surface: "notifications", operation: "read/write", remoteRule: "RLS must authorize remotely" },
  { name: "notifications", surface: "notifications", operation: "read/write", remoteRule: "RLS must authorize remotely" },
  { name: "pet_care_profiles", surface: "care", operation: "read/write", remoteRule: "RLS must authorize remotely" },
  { name: "pets", surface: "care", operation: "read/write", remoteRule: "RLS must authorize remotely" },
  { name: "profiles", surface: "signup", operation: "read/write", remoteRule: "RLS must authorize remotely" },
  { name: "reminders", surface: "profile", operation: "read", remoteRule: "RLS must authorize remotely" },
  { name: "service_care_agreements", surface: "care", operation: "read", remoteRule: "RLS must authorize remotely" },
  { name: "service_chats", surface: "care", operation: "read", remoteRule: "RLS must authorize remotely" },
  { name: "service_disputes", surface: "care", operation: "read", remoteRule: "RLS must authorize remotely" },
  { name: "service_reviews", surface: "care", operation: "read", remoteRule: "RLS must authorize remotely" },
  { name: "user_blocks", surface: "care", operation: "read", remoteRule: "RLS must authorize remotely" },
];

// Realtime does not use PostgREST, but it exposes the same table data to the
// native client. Keep it separately ledgered so a new subscription cannot
// bypass remote-authorization review.
const realtimeRelationLedger: readonly RealtimeRelation[] = [
  { name: "broadcast_alert_interactions", surface: "map", remoteRule: "Realtime authorization must authorize remotely" },
  { name: "group_chat_invites", surface: "chats", remoteRule: "Realtime authorization must authorize remotely" },
  { name: "message_reads", surface: "chats", remoteRule: "Realtime authorization must authorize remotely" },
  { name: "notifications", surface: "notifications", remoteRule: "Realtime authorization must authorize remotely" },
  { name: "pet_care_profiles", surface: "care", remoteRule: "Realtime authorization must authorize remotely" },
  { name: "pets", surface: "profile", remoteRule: "Realtime authorization must authorize remotely" },
  { name: "profiles", surface: "profile", remoteRule: "Realtime authorization must authorize remotely" },
  { name: "service_bookmarks", surface: "care", remoteRule: "Realtime authorization must authorize remotely" },
  { name: "service_care_events", surface: "care", remoteRule: "Realtime authorization must authorize remotely" },
  { name: "service_chats", surface: "care", remoteRule: "Realtime authorization must authorize remotely" },
  { name: "service_disputes", surface: "care", remoteRule: "Realtime authorization must authorize remotely" },
  { name: "service_reviews", surface: "care", remoteRule: "Realtime authorization must authorize remotely" },
  { name: "thread_comments", surface: "social", remoteRule: "Realtime authorization must authorize remotely" },
  { name: "thread_supports", surface: "social", remoteRule: "Realtime authorization must authorize remotely" },
  { name: "threads", surface: "social", remoteRule: "Realtime authorization must authorize remotely" },
  { name: "user_moderation", surface: "profile", remoteRule: "Realtime authorization must authorize remotely" },
  { name: "user_moderation_restrictions", surface: "profile", remoteRule: "Realtime authorization must authorize remotely" },
];

const appRoot = join(existsSync(join(process.cwd(), "app", "package.json")) ? join(process.cwd(), "app") : process.cwd(), "src");

function filesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) && !entry.name.includes(".test.") ? [path] : [];
  });
}

function nativeBoundariesInSource(): Map<BoundaryKind, Set<string>> {
  const found = new Map<BoundaryKind, Set<string>>([["rpc", new Set()], ["edge", new Set()]]);
  // nativeChatReadRpc wraps nativeChatRpc with a token-less retry. It is a distinct
  // identifier, so it must be listed here in its own right -- "nativeChatRpc" does not
  // match "nativeChatReadRpc(", and every call made through it was invisible to this
  // scan (which is how get_public_groups_for_viewer reached production unreviewed).
  const rpcPattern = /(?:\.rpc|nativeExactTokenRpc|nativeServiceRpc|nativeChatReadRpc|nativeChatRpc|nativePublicProfileRpc|nativeSocialRpc|nativeMapRpc|mapActionRpc|mapMutationRpc|nativeCredentialRpc|nativeFamilyRpc|authedRpc|rpcVoid)\s*(?:<[^()]{0,240}>)?\s*\(\s*["']([^"']+)["']/g;
  const edgePattern = /(?:\.functions\.invoke|nativeSocialFunctionRequest|postNativeFunction|postNativeOtpFunction|invokeWithTransient503Retry)\s*(?:<[^()]{0,240}>)?\s*\(\s*["']([^"']+)["']/g;
  for (const path of filesUnder(appRoot)) {
    const source = readFileSync(path, "utf8");
    for (const match of source.matchAll(rpcPattern)) found.get("rpc")?.add(match[1]);
    for (const match of source.matchAll(edgePattern)) found.get("edge")?.add(match[1]);
    for (const match of source.matchAll(/callNativeEditRpcWithToken\s*\(\s*[^,]+,\s*["']([^"']+)["']/g)) found.get("rpc")?.add(match[1]);
    for (const match of source.matchAll(/\/rest\/v1\/rpc\/([A-Za-z0-9_-]+)/g)) found.get("rpc")?.add(match[1]);
    for (const match of source.matchAll(/\/functions\/v1\/([A-Za-z0-9_-]+)/g)) found.get("edge")?.add(match[1]);
  }
  // The store verifier selects one of these literals at runtime; keep both
  // registered and prove they remain present in production source.
  const source = filesUnder(appRoot).map((path) => readFileSync(path, "utf8")).join("\n");
  for (const name of ["verify-apple-subscription", "verify-google-subscription", "link-preview", "social-video-create-upload", "social-video-finalize"]) {
    expect(source, `dynamic Edge Function literal removed without ledger review: ${name}`).toContain(name);
    found.get("edge")?.add(name);
  }
  return found;
}

function directRelationsInSource(): Set<string> {
  const found = new Set<string>();
  const fromPattern = /\.from\s*\(\s*["']([^"']+)["']/g;
  const restPattern = /\/rest\/v1\/(?!rpc\/)([A-Za-z0-9_]+)/g;
  const source = filesUnder(appRoot).map((path) => readFileSync(path, "utf8")).join("\n");
  const dynamicRestHelpers = [...source.matchAll(/(?:const|function)\s+([A-Za-z0-9_]+)\s*=\s*\(table:\s*string\)\s*=>\s*new URL\(`\$\{supabaseUrl\}\/rest\/v1\/\$\{table\}`\)/g)].map((match) => match[1]);
  for (const path of filesUnder(appRoot)) {
    const source = readFileSync(path, "utf8");
    for (const match of source.matchAll(fromPattern)) found.add(match[1]);
    for (const match of source.matchAll(restPattern)) found.add(match[1]);
  }
  for (const helper of dynamicRestHelpers) {
    const helperPattern = new RegExp(`\\b${helper}\\s*\\(\\s*["']([^"']+)["']`, "g");
    for (const match of source.matchAll(helperPattern)) found.add(match[1]);
  }
  return found;
}

function realtimeRelationsInSource(): Set<string> {
  const found = new Set<string>();
  const pattern = /\.on\s*\(\s*["']postgres_changes["']\s*,\s*\{[\s\S]{0,400}?\btable\s*:\s*["']([^"']+)["']/g;
  for (const path of filesUnder(appRoot)) {
    const source = readFileSync(path, "utf8");
    for (const match of source.matchAll(pattern)) found.add(match[1]);
  }
  return found;
}

describe("native action-to-boundary ledger", () => {
  it("maps every direct RPC and Edge Function call to one reviewed remote boundary", () => {
    const found = nativeBoundariesInSource();
    for (const kind of ["rpc", "edge"] as const) {
      const expected = boundaryLedger.filter((boundary) => boundary.kind === kind).map((boundary) => boundary.name).sort();
      expect([...found.get(kind)!].sort(), `${kind} boundary added without a ledger row`).toEqual(expected);
    }
  }, 20_000);

  it("keeps native Storage cleanup paths inside the reviewed bucket inventory", () => {
    const source = readFileSync(join(appRoot, "lib", "nativeStorageCleanup.ts"), "utf8");
    const bucketType = source.match(/export type NativeStorageCleanupBucket\s*=\s*([^;]+);/s)?.[1] || "";
    const declared = [...bucketType.matchAll(/"([a-z_]+)"/g)].map((match) => match[1]).sort();
    expect(declared).toEqual([...storageBuckets].sort());
    expect(storageBuckets).toContain("private_pet_photos");
  });

  it("maps every direct PostgREST relation so RLS review cannot be skipped", () => {
    const expected = directRelationLedger.map((relation) => relation.name).sort();
    expect([...directRelationsInSource()].sort(), "direct relation added without an RLS ledger row").toEqual(expected);
  });

  it("maps every Realtime relation so remote-authorization review cannot be skipped", () => {
    const expected = realtimeRelationLedger.map((relation) => relation.name).sort();
    expect([...realtimeRelationsInSource()].sort(), "Realtime relation added without an authorization ledger row").toEqual(expected);
  });
});
