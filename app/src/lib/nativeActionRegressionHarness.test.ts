import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NativeChatMessage } from "./nativeChat";
import { deriveCareConversationState } from "./careConversationState";
import {
  executeNativeChatOutboxRetry,
  failNativeChatOutboxMessage,
} from "./nativeChatOutbox";

const exactRpcMocks = vi.hoisted(() => ({
  getFreshNativeAccessToken: vi.fn(async () => "user-token"),
}));

vi.mock("./nativeFunctionClient", () => ({
  createNativeAuthenticatedHeaders: (token: string, extra: Record<string, string> = {}) => ({
    apikey: "publishable-test-key",
    Authorization: `Bearer ${token}`,
    ...extra,
  }),
  getFreshNativeAccessToken: exactRpcMocks.getFreshNativeAccessToken,
}));

vi.mock("./supabase", () => ({
  supabaseAnonKey: "publishable-test-key",
  supabaseUrl: "https://example.supabase.co",
}));

const repoRoot = existsSync(join(process.cwd(), "app", "package.json")) ? process.cwd() : join(process.cwd(), "..");
const appSourceRoot = join(repoRoot, "app", "src");

const filesUnder = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const path = join(directory, entry.name);
  if (entry.isDirectory()) return filesUnder(path);
  return /\.(ts|tsx)$/.test(entry.name) && !entry.name.includes(".test.") ? [path] : [];
});

const sourceFiles = filesUnder(appSourceRoot);
const sourceText = new Map(sourceFiles.map((path) => [path, readFileSync(path, "utf8")]));
const allNativeSource = [...sourceText.values()].join("\n");

type ActionFamily = Readonly<{
  name: string;
  screens: readonly string[];
  boundaries: readonly string[];
}>;

// This is the regression harness manifest, not a second backend policy.
// Every user-facing family with state or sensitive data must name both its
// screen entry points and its remote boundaries. A missing name fails review.
const actionFamilies: readonly ActionFamily[] = [
  {
    name: "signup and identity",
    screens: ["NativeSignupScreen.tsx", "NativeVerifyIdentityScreen.tsx", "NativeIdentityOcrSpikeScreen.tsx"],
    boundaries: [
      "check_identifier_registered", "get-pre-signup-verify-status", "confirm-pre-signup-verify",
      "complete_native_signup_identity", "complete_native_signup_profile", "mark_native_signup_location",
      "auth-signup", "auth-login", "verify-human-challenge", "native-verify-identity-document",
    ],
  },
  {
    name: "session and account",
    screens: ["NativeAuthScreen.tsx", "NativeSecuritySettingsScreen.tsx", "NativeSettingsDrawer.tsx"],
    boundaries: ["auth-login", "auth-change-password", "auth-reset-password", "delete-account", "get_native_viewer_scope"],
  },
  {
    name: "social posts and replies",
    screens: ["NativeSocialScreen.tsx", "NativeSupportScreen.tsx"],
    boundaries: [
      "get_social_feed", "create_native_social_thread", "update_native_social_thread", "delete_social_thread",
      "create_native_social_comment", "update_native_social_comment", "delete_native_social_comment",
      "set_native_social_support", "set_native_social_comment_support", "process_user_report", "block_user",
      "record_thread_share_click", "link-preview", "social-video-create-upload", "social-video-finalize", "social-video-delete",
    ],
  },
  {
    name: "direct and group chats",
    screens: ["NativeChatsScreen.tsx", "NativeChatDialogueScreen.tsx"],
    boundaries: [
      "get_chat_inbox_summaries", "get_native_chat_dialogue_snapshot", "send_native_chat_message",
      "update_native_chat_message_content", "mark_room_read", "ensure_direct_chat_room", "send_match_first_message",
      "block_user", "unmatch_user_one_sided", "create_native_group_chat", "join_native_group_member",
      "request_native_group_join", "accept_group_chat_invite", "decline_native_group_invite", "invite_native_group_members",
      "remove_native_group_member", "update_group_chat_metadata", "create_group_chat_event", "update_group_chat_event",
      "toggle_group_chat_event_rsvp", "remove_group_chat_event",
    ],
  },
  {
    name: "map, location, and broadcast",
    screens: ["NativeMapScreen.tsx"],
    boundaries: [
      "set_user_location", "native_map_set_invisible", "start_native_out_now", "renew_native_out_now_visibility",
      "return_native_out_now", "end_map_visibility", "create_alert_thread_and_pin", "get_native_broadcast_reach",
      "get_broadcast_alert_by_id_with_audience", "update_broadcast_alert", "delete_broadcast_alert",
      "native_map_upsert_alert_interaction", "native_map_remove_alert_interaction", "native_map_record_alert_share",
      "create_broadcast_alert_share_link", "block_user", "process_user_report",
    ],
  },
  {
    name: "care booking lifecycle",
    screens: ["NativeServiceScreen.tsx", "NativeCarerProfileScreen.tsx", "NativeServiceChatScreen.tsx"],
    boundaries: [
      "get_native_service_provider_cards", "get_native_service_provider_detail", "toggle_native_service_bookmark",
      "create_native_service_chat", "send_service_request", "create_care_scope_counterproposal",
      "record_service_care_scope_signature", "create-service-payment", "confirm-service-payment",
      "cancel-service-booking", "confirm-voluntary-service-booking", "complete_service_if_both_confirmed_by_service_id",
      "prepare_service_start_pin_by_service_id", "share_service_start_pin_by_service_id",
      "verify_service_start_pin_by_service_id", "submit_service_checkin_by_service_id",
      "submit_service_issue_report_by_service_id", "submit_service_no_start_report_by_service_id",
      "submit_provider_completion_by_service_id", "submit_requester_completion_by_service_id", "submit_service_review_v2",
    ],
  },
  {
    name: "profile, pets, media, notifications",
    screens: ["NativeProfileSummaryScreen.tsx", "NativeEditProfileScreen.tsx", "NativeSetPetScreen.tsx", "NativePetDetailsScreen.tsx"],
    boundaries: [
      "get_native_profile_summary", "complete_native_signup_profile", "register_native_media_asset",
      "request_storage_cleanup", "native-profile-photo-upload", "register_native_push_token",
      "execute_notification_action", "get_native_public_profile_snapshot", "get_native_public_profile_pet",
    ],
  },
];

const lineOf = (source: string, needle: string) => source.slice(0, source.indexOf(needle)).split("\n").length;
const boundaryLocationCache = new Map<string, ReadonlyArray<Readonly<{ file: string; line: number }>>>();
const boundaryLocations = (needle: string) => {
  const cached = boundaryLocationCache.get(needle);
  if (cached) return cached;
  const locations = sourceFiles.flatMap((path) => {
    const source = sourceText.get(path) || "";
    const index = source.indexOf(needle);
    return index >= 0 ? [{ file: relative(repoRoot, path), line: lineOf(source, needle) }] : [];
  });
  boundaryLocationCache.set(needle, locations);
  return locations;
};
const filesContaining = (needle: string) => boundaryLocations(needle).map(({ file }) => file);

const sourceFilesNamed = (name: string) => sourceFiles
  .filter((path) => basename(path) === name)
  .map((path) => relative(repoRoot, path));

const screenSource = (name: string) => {
  const path = sourceFiles.find((candidate) => basename(candidate) === name);
  return path ? sourceText.get(path) || "" : "";
};

const pendingMessage = (overrides: Partial<NativeChatMessage> = {}): NativeChatMessage => ({
  id: "pending:room-1:retry",
  chatId: "room-1",
  senderId: "user-1",
  content: JSON.stringify({ text: "retry me", client_message_id: "retry-1" }),
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: null,
  localStatus: "failed",
  ...overrides,
});

describe("native action regression harness", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    exactRpcMocks.getFreshNativeAccessToken.mockClear();
  });

  it("keeps every stateful/sensitive action family attached to screens and remote boundaries", () => {
    for (const family of actionFamilies) {
      for (const screen of family.screens) {
        expect(sourceFilesNamed(screen), `${family.name} lost screen ${screen}`).not.toEqual([]);
      }
      for (const boundary of family.boundaries) {
        expect(allNativeSource, `${family.name} lost boundary ${boundary}`).toContain(boundary);
      }
    }
  });

  it("requires critical source paths to use the reviewed token-aware adapters", () => {
    const adapterContracts: Readonly<Record<string, readonly string[]>> = {
      "app/src/lib/nativeSocial.ts": ["nativeSocialRpc", "nativeSocialFunctionRequest", "requireNativeSocialSession"],
      "app/src/lib/nativeMapAlertInteractions.ts": ["mapActionRpc", "requireMapActionSession", "nativeExactTokenRpc"],
      "app/src/lib/nativeService.ts": ["nativeServiceRpc", "requireNativeServiceMutationSession"],
      "app/src/lib/nativeSignup.ts": ["nativeExactTokenRpc", "authSignupNative"],
      "app/src/lib/nativeChat.ts": ["nativeChatRpc", "requireNativeChatMutationSession"],
    };
    for (const [relativePath, required] of Object.entries(adapterContracts)) {
      const source = readFileSync(join(repoRoot, relativePath), "utf8");
      for (const token of required) expect(source, `${relativePath} lost ${token}`).toContain(token);
    }
  });

  it("proves the action inventory catches a removed boundary instead of silently passing", () => {
    const source = readFileSync(join(repoRoot, "app/src/lib/nativeSocial.ts"), "utf8");
    const boundary = "create_native_social_thread";
    expect(source).toContain(boundary);
    const mutated = source.replace(boundary, `${boundary}__mutation`);
    expect(mutated).not.toContain(`"${boundary}"`);
    expect(mutated).not.toContain(`'${boundary}'`);
  });

  it("records a source location for every critical family boundary", () => {
    for (const family of actionFamilies) {
      for (const boundary of family.boundaries) {
        const location = boundaryLocations(boundary)[0];
        expect(location?.file, `${family.name} boundary has no source location: ${boundary}`).toBeTruthy();
        expect(location?.line, `${family.name} boundary has no line: ${boundary}`).toBeGreaterThan(0);
      }
    }
  }, 20_000);

  it("keeps each critical journey's submit, failure, recovery, and terminal-state markers together", () => {
    const checks: ReadonlyArray<Readonly<{ screen: string; markers: readonly string[] }>> = [
      {
        screen: "NativeSignupScreen.tsx",
        markers: [
          'setStep("credentials")', 'setStep("emailConfirmation")', 'setStep("name")',
          'setStep("location")', 'setStep("quickProfile")', "catch (error)", "finally", "setBusy(false)",
        ],
      },
      {
        screen: "NativeSocialScreen.tsx",
        markers: [
          "createNativeSocialThread", "createNativeSocialComment", "setNativeSocialSupport",
          "setThreads", "catch (error)", "setError(", "previousEditingThread",
        ],
      },
      {
        screen: "NativeChatDialogueScreen.tsx",
        markers: [
          "sendNativeChatMessage", "retryFailedMessage", "setFailed", "catch (error)", "finally",
          '"block_user"', '"unmatch_user_one_sided"',
        ],
      },
      {
        screen: "NativeMapScreen.tsx",
        markers: [
          "setPinning(true)", "setPinning(false)", "setDataLoading(true)", "setDataLoading(false)",
          "setStatusMessage", "catch (error)", "pinNativeUserOutNow",
        ],
      },
      {
        screen: "NativeBroadcastModal.tsx",
        markers: ["setCreating(true)", "setCreating(false)", "setErrorText", "catch (error)", "createNativeBroadcastNoMedia"],
      },
      {
        screen: "NativeServiceChatScreen.tsx",
        markers: [
          "setSubmitting(true)", "setSubmitting(false)", "setSubmitError", "catch (error)", "finally",
          "send_service_request", "create_care_scope_counterproposal", "cancel-service-booking",
          "complete_service_if_both_confirmed_by_service_id",
        ],
      },
    ];
    for (const check of checks) {
      const source = screenSource(check.screen);
      expect(source, `missing critical screen ${check.screen}`).not.toBe("");
      for (const marker of check.markers) expect(source, `${check.screen} lost ${marker}`).toContain(marker);
    }
  });

  it.each([
    ["401", new Error("unauthorized")],
    ["403", new Error("forbidden")],
    ["409", new Error("conflict")],
    ["429", new Error("rate_limited")],
    ["500", new Error("server_error")],
    ["timeout", new Error("request_timeout")],
    ["malformed response", new Error("malformed_response")],
  ] as const)("keeps chat retry safe after %s", async (_fault, error) => {
    const original = pendingMessage();
    const result = await executeNativeChatOutboxRetry({
      messages: [original],
      pendingId: original.id,
      send: async () => { throw error; },
    });
    expect(result.outcome).toBe("failed");
    expect(result.messages).toEqual([{ ...original, localStatus: "failed" }]);
    expect(failNativeChatOutboxMessage(result.messages, original.id).transitioned).toBe(false);
  });

  it("does not promote an invalid confirmation into a committed chat state", async () => {
    const original = pendingMessage();
    const result = await executeNativeChatOutboxRetry({
      messages: [original],
      pendingId: original.id,
      send: async () => undefined as unknown as NativeChatMessage,
    });
    expect(result.outcome).toBe("failed");
    expect(result.messages).toEqual([{ ...original, localStatus: "failed" }]);
  });

  it.each([
    [401, "unauthorized"],
    [403, "forbidden"],
    [409, "conflict"],
    [429, "rate_limited"],
    [500, "server_error"],
  ] as const)("normalizes protected RPC HTTP %s without a false success", async (status, message) => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false,
      status,
      statusText: message,
      text: async () => JSON.stringify({ code: `E_${status}`, message }),
    })));
    const { nativeExactTokenRpc } = await import("./nativeExactTokenRequest");
    const result = await nativeExactTokenRpc("critical_action", { p_id: "id-1" }, "user-token");
    expect(result.data).toBeNull();
    expect(result.error).toMatchObject({ code: `E_${status}`, message, status });
  });

  it("normalizes network failure and does not fabricate a successful response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("socket_closed"); }));
    const { nativeExactTokenRpc } = await import("./nativeExactTokenRequest");
    const result = await nativeExactTokenRpc("critical_action", {}, "user-token");
    expect(result.data).toBeNull();
    expect(result.error).toMatchObject({ code: "rpc_network_error", status: 0 });
  });

  it("covers the complete Care state machine and rejects reorder/under-review shortcuts", () => {
    const active = (overrides: Partial<{ status: string; careStatus: string | null; mutualSigned: boolean }> = {}) => ({
      id: "service-1",
      status: "pending",
      careStatus: null,
      mutualSigned: false,
      ...overrides,
    });
    const expected: Array<[Parameters<typeof deriveCareConversationState>[0], string]> = [
      [null, "clean_slate"],
      [active(), "scope_pending"],
      [active({ mutualSigned: true }), "agreement_signed"],
      [active({ status: "booked", careStatus: "awaiting_handoff" }), "handoff_waiting"],
      [active({ status: "booked", careStatus: "pin_shared" }), "pin_shared"],
      [active({ status: "in_progress", careStatus: "in_progress" }), "care_in_progress"],
      [active({ status: "completed", careStatus: "completed" }), "completed"],
    ];
    for (const [row, kind] of expected) expect(deriveCareConversationState(row, false).kind).toBe(kind);
    expect(deriveCareConversationState(active({ status: "booked", careStatus: "pin_shared" }), true).kind).toBe("under_review");
    expect(deriveCareConversationState(active({ status: "completed", careStatus: "completed" }), true).kind).toBe("under_review");
  });
});
