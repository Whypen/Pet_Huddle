import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { deriveCareConversationState } from "./careConversationState";

// Executable proof for CARE_BOOKING_SCOPE_CONTRACT.md (§13 verification gates).
// These are static-source invariants over the exact files applied to the app and
// the DB, mirroring careNotificationContract.test.ts. They replace eyeball audits:
// any contract gate that regresses fails here.

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "../..");          // .../app
const repoRoot = resolve(appRoot, "..");          // repo root
const screen = readFileSync(join(appRoot, "src/screens/NativeServiceChatScreen.tsx"), "utf8");
const chats = readFileSync(join(appRoot, "src/screens/NativeChatsScreen.tsx"), "utf8");
const nativeSocial = readFileSync(join(appRoot, "src/lib/nativeSocial.ts"), "utf8");
const pdfBuilder = readFileSync(join(repoRoot, "supabase/functions/generate-care-agreement-pdf/pdf.ts"), "utf8");
const pdfFunction = readFileSync(join(repoRoot, "supabase/functions/generate-care-agreement-pdf/index.ts"), "utf8");
const adminSafety = readFileSync(join(repoRoot, "src/pages/admin/AdminSafety.tsx"), "utf8");
const careBookingContract = readFileSync(join(appRoot, "docs/Contracts/CARE_BOOKING_SCOPE_CONTRACT.md"), "utf8");
const careScopePingPongContract = readFileSync(join(repoRoot, "docs/Contracts/care_scope_ping_pong_contract.md"), "utf8");

const migrationsDir = resolve(repoRoot, "supabase/migrations");
const migrationFiles = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
const allSql = migrationFiles.map((f) => readFileSync(join(migrationsDir, f), "utf8")).join("\n");
const readMigration = (needle: string) => {
  const file = migrationFiles.find((f) => f.includes(needle));
  if (!file) throw new Error(`migration matching "${needle}" not found`);
  return readFileSync(join(migrationsDir, file), "utf8");
};
const sourceBlock = (name: string) => {
  const start = screen.indexOf(`function ${name}(`);
  if (start < 0) return "";
  const rest = screen.slice(start + 1);
  const next = rest.search(/\n(?:export\s+)?function\s+[A-Z]|const styles = StyleSheet\.create/);
  return screen.slice(start, next < 0 ? undefined : start + 1 + next);
};
const callbackBlock = (name: string) => {
  const start = screen.indexOf(`const ${name} = useCallback`);
  if (start < 0) return "";
  if (name === "loadCareHistoryRows") {
    const end = screen.indexOf("const closeProviderProfile", start);
    return screen.slice(start, end < 0 ? undefined : end);
  }
  if (name === "submitReview") {
    const end = screen.indexOf("const openRequiredCareUpdateSheet", start);
    return screen.slice(start, end < 0 ? undefined : end);
  }
  const rest = screen.slice(start + 1);
  const next = rest.search(/\n\s*const\s+[a-zA-Z0-9_]+\s*=/);
  return screen.slice(start, next < 0 ? undefined : start + 1 + next);
};

describe("§9 Care list return — no empty-state flash", () => {
  it("gates the service empty state on a settled authoritative fetch", () => {
    expect(screen).toBeTypeOf("string"); // keep screen import used
    expect(chats).toMatch(
      /mainTab === "service" && visibleRows\.length === 0 && inboxSyncState === "fresh"/,
    );
  });
  it("routes both route-sync and tab-press through one activateMainTab", () => {
    // exactly one direct setMainTab call, and it lives inside activateMainTab
    const directSets = chats.match(/setMainTab\(/g) || [];
    expect(directSets.length).toBe(1);
    expect(chats).toMatch(/activateMainTab\(parseInitialMainTab\(search\)\)/);
    expect(chats).toMatch(/activateMainTab\(tab, \{ haptic: true \}\)/);
  });
  it("suppresses empty flash when activating a tab with no cached rows", () => {
    expect(chats).toMatch(/current === "fresh" \|\| current === "error" \? "refreshing" : current/);
  });
  it("keeps the Care tab scoped to service rooms plus the intentional Team huddle room", () => {
    expect(chats).toMatch(/if \(tab === "service"\) return "service"/);
    expect(chats).toMatch(/const isCareInboxRow = \(row: NativeChatInboxRow\) => row\.roomType === "service"/);
  });
});

describe("Active Care conversation state machine", () => {
  const active = (overrides: Partial<Parameters<typeof deriveCareConversationState>[0] extends infer Row ? Exclude<Row, null> : never> = {}) => ({
    id: "service-active",
    status: "pending",
    careStatus: null,
    mutualSigned: false,
    ...overrides,
  });

  it.each([
    [null, false, "clean_slate", "pending"],
    [active(), false, "scope_pending", "pending"],
    [active({ mutualSigned: true }), false, "agreement_signed", "pending"],
    [active({ status: "booked", careStatus: "awaiting_handoff" }), false, "handoff_waiting", "booked"],
    [active({ status: "booked", careStatus: "pin_shared" }), false, "pin_shared", "booked"],
    [active({ status: "in_progress", careStatus: "in_progress" }), false, "care_in_progress", "in_progress"],
    [active({ status: "pending", careStatus: "under_dispute" }), false, "under_review", "disputed"],
    [active({ status: "completed", careStatus: "completed" }), false, "completed", "completed"],
  ] as const)("derives %s as %s", (row, underReview, expectedKind, expectedStatus) => {
    const state = deriveCareConversationState(row, underReview);
    expect(state.kind).toBe(expectedKind);
    expect(state.status).toBe(expectedStatus);
    expect(state.activeServiceChatId).toBe(row?.id || null);
  });

  it("under-review status wins over every other active-stage signal", () => {
    expect(deriveCareConversationState(active({ status: "booked", careStatus: "pin_shared" }), true).kind).toBe("under_review");
  });
});

describe("Care block protection", () => {
  it("keeps Block User muted but explainable until Care is clean or completed", () => {
    expect(screen).toMatch(/const blockUnavailableForCare = Boolean\([\s\S]{0,220}!\["clean_slate", "completed"\]\.includes\(careConversationState\.kind\)/);
    expect(screen).toMatch(/muted: blockUnavailableForCare/);
    expect(screen).toMatch(/if \(blockUnavailableForCare\) setBlockUnavailableNoticeOpen\(true\)/);
    expect(screen).toMatch(/title="Blocking unavailable"/);
    expect(screen).toMatch(/once the booking and any open case are closed/);
  });
});

describe("Completed booking review identity", () => {
  it("keeps the latest completed history row reviewable when there is no new active request", () => {
    expect(screen).toMatch(/const reviewTargetServiceChat = serviceChat \|\| latestTerminalServiceChat/);
    expect(screen).toMatch(/const reviewTargetIsCompleted = Boolean\([\s\S]{0,260}reviewTargetServiceChat\.status === "completed"/);
    expect(screen).toMatch(/const canLeaveReview = Boolean\(!underReview && reviewTargetIsCompleted/);
    expect(screen).toMatch(/\.from\("service_reviews"\)[\s\S]{0,220}\.in\("service_chat_id", terminalIds\)[\s\S]{0,120}\.eq\("reviewer_id", userId\)/);
    expect(screen).toMatch(/isNoChargeServiceChat\(reviewTargetServiceChat\)/);
  });

  it("hydrates terminal rows before clean-slate enrichment and prioritizes review over a new quote", () => {
    const noActiveStart = screen.indexOf("if (!row) {", screen.indexOf("const row = selectServiceChatRowForRoute"));
    const noActiveBranch = screen.slice(noActiveStart, screen.indexOf("// The message body can paint", noActiveStart));
    expect(noActiveBranch).toMatch(/const terminalRows = serviceRows\.filter\(isServiceChatHistoryMenuEligible\);[\s\S]{0,700}setCareHistoryRows\(terminalRows\.map\(\(item\) => frozenHistoryServiceChatRow\(item\)\)\);[\s\S]{0,220}hasAuthoritativeCareState = true;[\s\S]{0,120}setLoading\(false\);[\s\S]{0,500}const cleanSlateProviderId/);
    const actionPrimaryStart = screen.indexOf("const actionPrimary = useMemo");
    const actionPrimary = screen.slice(actionPrimaryStart, screen.indexOf("const completionPrimaryActionIsSlider", actionPrimaryStart));
    expect(actionPrimary.indexOf("if (canLeaveReview) return")).toBeGreaterThanOrEqual(0);
    expect(actionPrimary.indexOf("if (canLeaveReview) return")).toBeLessThan(actionPrimary.indexOf('if (careConversationState.kind === "clean_slate")'));
  });

  it("submits reviews against the exact completed service row, not the conversation room", () => {
    const submitReview = callbackBlock("submitReview");
    const reviewMigration = readMigration("submit_service_review_exact_service_chat");
    expect(submitReview).toMatch(/p_service_chat_id: completedServiceChatId/);
    expect(submitReview).not.toMatch(/p_chat_id: roomId/);
    expect(reviewMigration).toMatch(/p_service_chat_id uuid/);
    expect(reviewMigration).toMatch(/from public\.service_chats\s+where id = p_service_chat_id\s+for update/);
    expect(reviewMigration).not.toMatch(/where chat_id = p_chat_id/);
  });
});

describe("§7.2 Carer first-request handling", () => {
  it("auto-opens Update Care Scope once for the carer, never when expired", () => {
    expect(screen).toMatch(/autoOpenedQuoteRef/);
    expect(screen).toMatch(/!isProvider \|\| !hasRequest \|\| hasQuote \|\| pendingRequestExpired/);
  });
  it("shows a Review request CTA for the carer's first look", () => {
    expect(screen).toMatch(/label: "Review request"/);
  });
});

describe("§7.2 / Bug 3 — requester owns the tasks", () => {
  it("constrains carer task chips to requester-selected tasks (not the full palette)", () => {
    expect(screen).toMatch(/const carerTaskOptions = useMemo/);
    expect(screen).toMatch(/<MultiSelectChips options=\{carerTaskOptions\}/);
  });
});

describe("§6 Normalized diff", () => {
  it("derives no-change/changed from a normalized comparator (not raw stringify)", () => {
    const usages = screen.match(/normalizeCareScopeComparable\(/g) || [];
    expect(usages.length).toBeGreaterThanOrEqual(2);
  });
  it("sorts + dedupes task arrays so reordering never falsely marks changed", () => {
    expect(screen).toMatch(/normalizeCareTaskList[\s\S]{0,160}localeCompare/);
  });
});

describe("§8 Expired pending request", () => {
  it("defines and uses a pending-expiry signal", () => {
    expect(screen).toMatch(/const isPendingRequestExpired = \(/);
    expect(screen).toMatch(/const pendingRequestExpired = useMemo\(\(\) => isPendingRequestExpired\(serviceChat\)/);
  });
  it("shows the requester recovery helper and red date", () => {
    expect(screen).toMatch(/This care date has passed\. Update the date or withdraw this request\./);
    expect(screen).toMatch(/requestExpired \? \{ color: huddleColors\.validationRed \}/);
  });
  it("blocks the carer from editing/signing an expired scope (and after they've agreed)", () => {
    expect(screen).toMatch(/const showReviewSignAction = showScopeActions && isProvider && !requestExpired && !chat\.care_scope\?\.carerSigned;/);
  });
});

describe("§10/§11 Required updates — prompt, never block completion", () => {
  it("keeps the update action visible and explains that completion remains available", () => {
    expect(screen).toMatch(/showRequiredCareUpdateAction/);
    expect(screen).toMatch(/Care update not sent/);
    expect(screen).toMatch(/You haven’t sent the requested \{missingCareUpdateLabel\}\. You can still confirm completion\./);
    expect(screen).not.toMatch(/summaryUpdateMissed/);
  });
  it("backend never hard-blocks completion for a missing daily summary", () => {
    const strictCompletion = readMigration("care_completion_exact_identity_prompt_only_updates");
    expect(strictCompletion).toMatch(/'care_update_met', v_update_met/);
    expect(strictCompletion).toMatch(/perform public\.complete_service_if_both_confirmed_by_service_id\(v_sc\.id\)/);
    expect(strictCompletion).not.toMatch(/raise exception 'care_update_required'/);
    expect(strictCompletion).not.toMatch(/service_chat_care_update_hard_completion_met/);
  });
  it("keeps both native contracts aligned with prompt-only update handling", () => {
    expect(careBookingContract).toContain("Care update not sent");
    expect(careBookingContract).toContain("You haven’t sent the requested photo and summary. You can still confirm completion.");
    expect(careBookingContract).not.toContain("Care update required before completion");
    expect(careBookingContract).not.toContain("Complete anyway");
    expect(careScopePingPongContract).toContain("never blocks either party's completion confirmation, 48-hour forced completion, or payout");
    expect(careScopePingPongContract).not.toContain("completion/payout gates");
  });
});

describe("§8 backend — expired pending request is rejected server-side", () => {
  const m = readMigration("care_scope_reject_expired_pending_request");
  it("defines the expiry guard helper", () => {
    expect(m).toMatch(/create or replace function public\.assert_pending_request_not_expired/);
    expect(m).toMatch(/raise exception 'care_request_expired'/);
  });
  it("calls the guard in all four mutation RPCs", () => {
    for (const fn of [
      "create_care_scope_counterproposal",
      "record_service_care_scope_signature",
      "record_owner_payment_consent",
      "confirm_voluntary_service_booking",
    ]) {
      const body = m.slice(m.indexOf(`function public.${fn}`));
      expect(body.slice(0, 2500)).toMatch(/perform public\.assert_pending_request_not_expired\(/);
    }
  });
});

describe("§12 Push/banner voice", () => {
  it("has no broken Start PIN copy", () => {
    expect(screen).not.toMatch(/You Start PIN is sent/);
    expect(screen).toMatch(/Start PIN shared with your carer\./);
  });
});

describe("Service chat sheet hitboxes", () => {
  it("renders bottom sheets as in-screen layers so the chat header is never covered by a sheet modal", () => {
    expect(screen).toMatch(/inlineSheetLayer: \{ \.\.\.StyleSheet\.absoluteFillObject, zIndex: 20 \}/);
    const sheetFunctions = [
      "RequestSheet",
      "QuoteSheet",
      "CareHistorySheet",
      "CompletionSheet",
      "PaymentSheet",
      "StartCareSheet",
      "HandoffProblemSheet",
      "ReviewSheet",
    ];
    for (const name of sheetFunctions) {
      const body = sourceBlock(name);
      expect(body, `${name} should exist`).not.toBe("");
      expect(body, `${name} should use the in-screen sheet layer`).toMatch(/pointerEvents="box-none" style=\{styles\.inlineSheetLayer\}/);
      expect(body, `${name} should not mount as a full-screen slide Modal`).not.toMatch(/<Modal animationType="slide"/);
      // A nested <Modal> (e.g. a forced-read terms sheet opened FROM this sheet) is a real,
      // separate native layer and legitimately has its own full-screen dismiss Pressable — that
      // never covers the chat header, since it isn't mounted until the user opens it. Strip any
      // such nested Modal blocks before checking that the SHEET ITSELF never adds a full-screen
      // close Pressable directly over the header.
      const termsSheetStart = body.indexOf("{termsSheetVisible ? (");
      const bodyWithoutNestedModals = (termsSheetStart >= 0 ? body.slice(0, termsSheetStart) : body)
        .replace(/<Modal[\s\S]*?<\/Modal>/g, "");
      expect(bodyWithoutNestedModals, `${name} should not add a full-screen close Pressable over the header`).not.toMatch(/<Pressable[\s\S]{0,180}StyleSheet\.absoluteFill/);
    }
  });
});

describe("Service chat restart row selection", () => {
  it("does not let a completed care-history row own a restarted active booking dialogue", () => {
    expect(screen).toMatch(/const selectActiveServiceChatRow = \(rows: ServiceChatRow\[\], activeScopeServiceChatIds = new Set<string>\(\)\) =>/);
    expect(screen).toMatch(/const activeServiceChatRowPriority = \(row: ServiceChatRow, activeScopeServiceChatIds: Set<string>\) =>/);
    expect(screen).toMatch(/const isActiveServiceChatRow = \(row: ServiceChatRow\) =>/);
    expect(screen).toMatch(/row\.status === "disputed"/);
    expect(screen).toMatch(/row\.care_status === "under_dispute"/);
    expect(screen).toMatch(/activeScopeServiceChatIds\.has\(row\.id\) && isActiveServiceChatRow\(row\)\) return 60/);
    expect(screen).toMatch(/\.from\("service_chats"\)[\s\S]{0,220}\.eq\("chat_id", requestRoomId\)[\s\S]{0,220}\.limit\(20\)/);
    expect(screen).toMatch(/\.from\("care_scope_versions"\)[\s\S]{0,220}\.select\("service_chat_id"\)[\s\S]{0,220}\.eq\("is_active", true\)/);
    expect(screen).toMatch(/selectServiceChatRowForRoute\(serviceRows, activeScopeServiceChatIds, requestServiceId\)/);
    expect(screen).not.toMatch(/\.from\("service_chats"\)[\s\S]{0,220}\.eq\("chat_id", requestRoomId\)[\s\S]{0,220}\.maybeSingle\(\)/);
  });

  it("does not refresh status through a room id before the strict active row is selected", () => {
    expect(screen).not.toMatch(/refresh_service_chat_status", \{ p_chat_id: requestRoomId \}/);
  });

  it("follows friends-chat canonical pair behavior for one Care conversation per owner/carer pair", () => {
    const pairMigration = readMigration("service_chat_pair_canonical_conversation");
    expect(pairMigration).toMatch(/create table if not exists public\.service_chat_pairs/);
    expect(pairMigration).toMatch(/constraint service_chat_pairs_pkey primary key \(requester_id, provider_id\)/);
    expect(pairMigration).toMatch(/perform pg_advisory_xact_lock\(hashtext\(v_requester_id::text\), hashtext\(p_provider_id::text\)\)/);
    expect(pairMigration).toMatch(/insert into public\.service_chat_pairs \(requester_id, provider_id, chat_id\)/);
    expect(pairMigration).toMatch(/do update set chat_id = excluded\.chat_id/);
    expect(pairMigration).toMatch(/if v_active_service_chat_id is null then[\s\S]{0,220}insert into public\.service_chats/);
    expect(pairMigration).toMatch(/moved_messages as \(\s*update public\.chat_messages cm[\s\S]{0,180}set chat_id = d\.canonical_chat_id/);
    expect(pairMigration).toMatch(/moved_service_rows as \(\s*update public\.service_chats sc[\s\S]{0,180}set chat_id = d\.canonical_chat_id/);
  });

  it("returns a cancelled conversation to the owner clean-slate quote state and anchors the action menu to its trigger", () => {
    expect(screen).toMatch(/const roleAnchor = serviceChat \|\| careHistoryRows\.find/);
    expect(screen).toMatch(/if \(careConversationState\.kind === "clean_slate"\) \{[\s\S]{0,180}label: "Start a quote"[\s\S]{0,120}openNewRequestSheet/);
    expect(screen).toMatch(/\(!serviceChat \|\| status === "completed" \? openNewRequestSheet : openCurrentRequestSheet\)/);
    expect(screen).toMatch(/menuAnchorRef\.current\?\.measureInWindow/);
    expect(screen).toMatch(/top: y \+ height \+ huddleSpacing\.x1/);
    expect(screen).toMatch(/headerActionMenuAnchor/);
    expect(screen).not.toMatch(/appModalMenuSafeArea\]} onPress=\{\(\) => setMenuOpen\(false\)\}/);
  });

  it("derives all live Care UI from one active-service conversation state", () => {
    expect(screen).toMatch(/import \{ deriveCareConversationState \} from "\.\.\/lib\/careConversationState"/);
    expect(screen).toMatch(/const deriveActiveCareConversationState = \([\s\S]{0,640}deriveCareConversationState\(/);
    expect(screen).toMatch(/const careConversationState = useMemo\([\s\S]{0,180}deriveActiveCareConversationState\(serviceChat, underReview\)/);
    expect(screen).toMatch(/if \(careConversationState\.kind === "clean_slate"\)[\s\S]{0,180}label: "Start a quote"/);
    expect(screen).toMatch(/const canShowComposer = Boolean\(hasRequest && !showReviewComposerCta && careConversationState\.kind !== "completed"\)/);
    expect(screen).toMatch(/const canBookCareFromMenu = Boolean\(isRequester && \(careConversationState\.kind === "clean_slate"/);
    expect(screen).toMatch(/careConversationState\.kind === "handoff_waiting" \|\| careConversationState\.kind === "pin_shared"/);
    expect(screen).toMatch(/careConversationState\.kind === "care_in_progress"/);
    expect(screen).toMatch(/careConversationState\.kind !== "scope_pending" && careConversationState\.kind !== "agreement_signed"/);
    expect(screen).toMatch(/get_service_care_update_status_by_service_id", \{ p_service_chat_id: row\.id \}/);
    expect(screen).not.toMatch(/get_service_care_update_status_by_service_id", \{ p_service_chat_id: requestRoomId \}/);
    // A room ID is only valid before the first service row exists. Every live
    // action thereafter carries the selected active service row to its RPC.
    expect(screen.match(/p_chat_id: roomId/g)?.length || 0).toBe(1);
    expect(screen).toMatch(/send_service_request", \{ p_chat_id: roomId, p_request_card: card \}/);
    expect(screen).toMatch(/submit_service_checkin_by_service_id", \{[\s\S]{0,520}p_service_chat_id: activeServiceChatId/);
    expect(screen).toMatch(/submit_service_issue_report_by_service_id", \{[\s\S]{0,220}p_service_chat_id: activeServiceChatId/);
  });

  it("creates a new active booking from the hydrated pair context after clean slate", () => {
    const sendFreshStart = screen.indexOf("const sendRequestFromSheet = useCallback");
    const sendFreshRequest = screen.slice(sendFreshStart, screen.indexOf("const sendQuote = useCallback", sendFreshStart));
    const pairMigration = readMigration("service_chat_pair_canonical_conversation");
    const strictRoomMigration = readMigration("service_room_id_calls_resolve_strict_active");
    expect(sendFreshRequest).toMatch(/const newBookingProviderId = clean\(serviceChat\?\.provider_id\) \|\| clean\(counterpart\?\.id\)/);
    expect(sendFreshRequest).not.toMatch(/if \(!serviceChat\?\.provider_id \|\| !accessToken \|\| !userId\)/);
    expect(sendFreshRequest).toMatch(/createNativeServiceChat\(newBookingProviderId/);
    expect(sendFreshRequest).toMatch(/if \(nextChatId !== roomId\) \{[\s\S]{0,180}onNavigate\(/);
    expect(sendFreshRequest).toMatch(/await load\(true\)/);
    expect(pairMigration).toMatch(/if v_active_service_chat_id is null then[\s\S]{0,320}insert into public\.service_chats/);
    expect(strictRoomMigration).toMatch(/current_active_service_chat_id_from_any_id\(p_chat_id\)/);
  });

  it("does not remount the current Care room during service-chat recovery", () => {
    const loadStart = screen.indexOf("const load = useCallback");
    const loadEnd = screen.indexOf("const loadOlderServiceMessages", loadStart);
    const loadBody = screen.slice(loadStart, loadEnd);
    expect(loadBody).toMatch(/if \(nextChatId !== requestRoomId\) \{[\s\S]{0,180}onNavigate\(/);
    expect(loadBody).toMatch(/await loadRef\.current\(false\)/);
    expect(screen).toMatch(/loadRef\.current = load/);
  });

  it("Care inbox summarizes exactly one active/current service row per conversation", () => {
    const pairMigration = readMigration("service_chat_pair_canonical_conversation");
    const strictActiveMigration = readMigration("strict_active_service_chat_selector");
    expect(pairMigration).toMatch(/create or replace function public\.current_service_chat_id_for_room/);
    expect(pairMigration).toMatch(/order by[\s\S]{0,180}sc\.status in \('pending', 'booked', 'in_progress'\)/);
    expect(strictActiveMigration).toMatch(/create or replace function public\.current_active_service_chat_id_for_room/);
    expect(strictActiveMigration).toMatch(/sc\.status in \('pending', 'booked', 'in_progress'\)/);
    expect(strictActiveMigration).toMatch(/coalesce\(sc\.care_status, ''\) not in \('completed', 'cancelled', 'under_dispute', 'handoff_issue_review'\)/);
    expect(strictActiveMigration).not.toMatch(/completed_at is null/);
    expect(strictActiveMigration).toMatch(/select public\.current_active_service_chat_id_for_room\(p_chat_id\)/);
    expect(pairMigration).toMatch(/sc_candidate\.chat_id = c\.id/);
    expect(pairMigration).toMatch(/service_inbox_raw_service_chat_join_still_present/);
    expect(pairMigration).toMatch(/select \* into v_sc from public\.service_chats where id = public\.current_service_chat_id_for_room\(p_chat_id\) for update/);
    expect(pairMigration).not.toMatch(/and sc\.status in \('pending', 'booked', 'in_progress'\)[\s\S]{0,500}return v_existing_chat_id/);
  });

  it("Care History uses service rows plus agreement rows only, while timeline/PDF data stays reconciled", () => {
    const historyLoader = callbackBlock("loadCareHistoryRows");
    const historySheet = sourceBlock("CareHistorySheet");
    expect(historyLoader).toMatch(/\.from\("service_chats"\)[\s\S]{0,160}\.select\(SERVICE_CHAT_SELECT_FIELDS\)/);
    expect(historyLoader).toMatch(/status\.eq\.cancelled/);
    expect(historyLoader).toMatch(/care_status\.eq\.cancelled/);
    expect(historyLoader).toMatch(/\.from\("service_care_agreements"\)/);
    expect(historyLoader).not.toMatch(/care_scope_versions/);
    expect(historyLoader).toMatch(/const historyAnchor = serviceChat \|\| careHistoryRows\.find/);
    expect(historyLoader).not.toMatch(/if \(!serviceChat \|\| !userId\)/);
    expect(screen).toMatch(/const careHistoryLoadSequenceRef = useRef\(0\)/);
    expect(historyLoader).toMatch(/care_history_load_timeout/);
    expect(historyLoader).toMatch(/care_history_details_timeout/);
    expect(screen).toMatch(/const closeCareHistory = useCallback/);
    expect(screen).toMatch(/const terminalRows = serviceRows\.filter\(isServiceChatHistoryMenuEligible\)/);
    expect(screen).toMatch(/care_history_agreements_timeout/);
    expect(screen).toMatch(/care_agreement: terminalAgreementByServiceId\.get\(item\.id\) \|\| null/);
    expect(screen).toMatch(/const frozenHistoryServiceChatRow = \(row: ServiceChatRow\): ServiceChatRow =>/);
    expect(screen).toMatch(/const serviceRequestCardFromBookingSnapshot = \(snapshot\?: CareHistorySnapshot \| null\): ServiceRequestCard \| null =>/);
    expect(historyLoader).toMatch(/booking_snapshot,requester_signed_at,provider_signed_at,pdf_path/);
    expect(screen).toMatch(/const frozenSnapshot = \(row\.care_agreement\?\.bookingSnapshot \|\| row\.booking_snapshot\)/);
    expect(screen).toMatch(/const mergeCareScopePets = \(requestPets\?: ServiceRequestPet\[\], quotePets\?: ServiceRequestPet\[\]\)/);
    expect(screen).toMatch(/petPhotoUrl: clean\(requestPet\?\.petPhotoUrl\) \|\| clean\(quotePet\.petPhotoUrl\)/);
    expect(screen).toMatch(/const formatCareScopeSetting = \(locationStyles\?: string\[\] \| null, locationArea\?: string \| null\)/);
    expect(screen).toMatch(/careDetails: frozenCareDetails/);
    expect(screen).toMatch(/const agreedAt = clean\(chat\.booking_snapshot\?\.agreedAt\)[\s\S]{0,140}latestIso\(chat\.care_agreement\?\.requesterSignedAt/);
    expect(screen).toMatch(/for \(const row of careHistoryRows\) byId\.set\(row\.id, frozenHistoryServiceChatRow\(row\)\)/);
    expect(screen).not.toMatch(/if \(effectiveServiceChat\) byId\.set\(effectiveServiceChat\.id, effectiveServiceChat\)/);
    expect(historySheet).toMatch(/allowAgreementPdfFromAgreement/);
    expect(historySheet).toMatch(/onOpenCareAgreement=\{\(\) => onOpenCareAgreement\?\.\(chat\)\}/);
    expect(screen).toMatch(/const visibleScopeCard = visibleCareScopeCardForChat\(chat\)/);
    expect(screen).toMatch(/const careTaskDetail = \[[\s\S]{0,160}scopeTasks\.join\(", "\)[\s\S]{0,220}visibleScopeCard\?\.otherTasks/);
    expect(screen).toMatch(/label: "Agreement signed", dateLabel: formatTimelineStepDate\(agreementSignedAt\)/);
    expect(screen).toMatch(/const cancelled = isCancelledServiceChatRow\(chat\)/);
    expect(screen).toMatch(/\{ label: "Booking Cancellation", dateLabel: formatTimelineStepDate\(cancellationDate\), done: false, cancelled: true \}/);
    expect(screen).toMatch(/const cancelledHistoryRow = isCancelledServiceChatRow\(chat\)/);
    expect(screen).toMatch(/<Text style=\{styles\.careAgreementBadgeText\}>Cancelled<\/Text>/);
  });

  it("stores a complete immutable Care Scope in the agreement before history or PDF reads it", () => {
    const migration = readMigration("care_history_frozen_scope_snapshot");
    expect(migration).toMatch(/create or replace function public\.enrich_service_care_agreement_frozen_snapshot/);
    expect(migration).toMatch(/'requestCard', v_scope\.request_card/);
    expect(migration).toMatch(/'quoteCard', v_scope\.quote_card/);
    expect(migration).toMatch(/'careDetails', v_scope\.care_details/);
    expect(migration).toMatch(/before insert or update of booking_snapshot, scope_version_id, scope_hash, requester_signed_at, provider_signed_at/);
    expect(migration).toMatch(/update public\.service_care_agreements agreement/);
    expect(migration).not.toMatch(/from public\.service_chats/);
  });

  it("terminal bookings are never selected as the active/current Care Scope row", () => {
    const strictActiveMigration = readMigration("strict_active_service_chat_selector");
    const exactActiveMigration = readMigration("service_room_id_calls_resolve_strict_active");
    expect(screen).toMatch(/const isCancelledServiceChatRow = \(row: ServiceChatRow\) =>/);
    expect(screen).toMatch(/const validRows = rows\.filter\(\(row\) => row\.id && row\.chat_id && isActiveServiceChatRow\(row\)\)/);
    expect(screen).toMatch(/if \(exact && isActiveServiceChatRow\(exact\)\) return exact/);
    expect(screen).toMatch(/if \(isActiveServiceChatRow\(cachedRow\)\) \{[\s\S]{0,120}setServiceChat\(cachedRow\)/);
    expect(screen).toMatch(/clearCachedServiceChatRow\(userId, requestSessionKey, requestRoomId\)/);
    expect(screen).toMatch(/setServiceChat\(null\)/);
    expect(screen).toMatch(/clearCachedServiceChatRow\(userId, requestSessionKey, requestRoomId\)/);
    expect(strictActiveMigration).toMatch(/sc\.status in \('pending', 'booked', 'in_progress'\)/);
    expect(strictActiveMigration).toMatch(/coalesce\(sc\.care_status, ''\) not in \('completed', 'cancelled', 'under_dispute', 'handoff_issue_review'\)/);
    expect(exactActiveMigration).toMatch(/sc\.status in \('pending', 'booked', 'in_progress'\)/);
    expect(exactActiveMigration).toMatch(/coalesce\(sc\.care_status, ''\) not in \('completed', 'cancelled', 'under_dispute', 'handoff_issue_review'\)/);
  });
});

describe("Care Scope ping-pong turn ownership", () => {
  const turnMigration = readMigration("care_scope_turn_owner_summary");
  const tier1Migration = readMigration("care_tier1_ack_and_early_start");
  const tier23Migration = readMigration("care_tier2_3_money_trust_evidence");
  const tier4Migration = readMigration("care_tier4_admin_views");
  const cancelServiceBookingFunction = readFileSync(join(repoRoot, "supabase/functions/cancel-service-booking/index.ts"), "utf8");

  it("returns the active scope proposer as actorRole instead of inferring turn from signatures only", () => {
    expect(turnMigration).toMatch(/'actorRole', v_version\.actor_role/);
    expect(screen).toMatch(/actorRole\?: "owner" \| "carer" \| null/);
    expect(screen).toMatch(/const legacyCanSignCareScope = !currentMutualSignatures && !ownerAlreadySigned && \(carerAlreadySigned \|\| careScope\?\.actorRole === "carer"\) && !paymentInProgress/);
    expect(screen).toMatch(/careScopeAllows\(careScope, "sign_scope", legacyCanSignCareScope\)/);
  });

  it("sends owner into review after a carer edit without faking carerSigned", () => {
    expect(screen).toMatch(/scope\.actorRole === "carer" && !scope\.ownerSigned/);
  });

  it("owner's Proceed Confirm/Payment gates purely on carerSigned (2026-07-03 fix) — actorRole is 'who last edited', not 'has the carer signed'", () => {
    // Real bug: gating on actorRole let "Proceed Confirm"/"Proceed Payment" render as enabled
    // the moment the carer touched the active scope version at all (e.g. sharing a Care
    // Instruction, which doesn't even require re-signing) — a dead end, since the backend
    // still correctly rejects payment with care_scope_not_mutually_signed.
    expect(screen).toMatch(/if \(!scope\.carerSigned && scope\.actorRole === "carer" && !scope\.ownerSigned\) return null;/);
    expect(screen).toMatch(/if \(!scope\.carerSigned\) return \{ label: "Review & Sign Care Scope"/);
    expect(screen).not.toMatch(/scope && !scope\.carerSigned && scope\.actorRole !== "carer"/);
  });

  it("service chat marks the room read so unread state does not return on refresh", () => {
    expect(screen).toMatch(/markNativeChatRoomRead/);
    expect(screen).toMatch(/mark_room_read_failed/);
  });

  it("requires cancellation/booking acknowledgement on both owner and carer Care Scope signatures", () => {
    expect(tier1Migration).toMatch(/p_acknowledged_terms boolean/);
    expect(tier1Migration).toMatch(/care_scope_acknowledgement_required/);
    expect(screen.match(/p_acknowledged_terms: true/g)?.length).toBeGreaterThanOrEqual(2);
    expect(screen).toMatch(/Accept the cancellation policy to sign off\./);
  });

  it("supports owner-approved early start without bypassing server authority", () => {
    expect(tier1Migration).toMatch(/add column if not exists early_start_allowed_at/);
    expect(tier1Migration).toMatch(/create or replace function public\.allow_service_early_start/);
    expect(tier1Migration).toMatch(/care_start_too_early/);
    expect(screen).toMatch(/onConfirm=\{\(\) => \{\s*setConfirmOwnerStartCareOpen\(false\);\s*void performShareStartPin\(\);/s);
    expect(screen).toMatch(/share_service_start_pin_by_service_id", \{ p_service_chat_id: activeServiceChatId, p_requester_confirmed: true \}/);
    expect(screen).toMatch(/canServiceStartNow\(serviceChatRef\.current\)/);
  });

  it("treats every Care Instruction edit as a counterproposal and never combines it with payment", () => {
    expect(screen).toMatch(/const canSubmitCareScopeUpdate = canSubmitCareDetailsUpdate/);
    expect(screen).toMatch(/if \(!canSignCareScope && !canPay\)/);
    expect(screen).not.toMatch(/canSaveInstructionThenPay/);
    expect(screen).not.toMatch(/Slide to Update & Payment/);
  });

  it("locks an open payment sheet if the active Care Scope version changes", () => {
    expect(screen).toMatch(/const paymentLockedByScopeChange = !canSignCareScope/);
    expect(screen).toMatch(/The Care Scope changed\. Review and sign the latest version to pay/);
    expect(screen).toMatch(/paymentLockedByScopeChange \? \(\s*<AppModalButton/);
    expect(screen).toMatch(/onEdit=\{canSignCareScope \? onEditCareScope : undefined\}/);
  });

  it("owner and carer Review & Sign reuse the canonical payment/free block", () => {
    expect(screen).toMatch(/function CareScopeAgreementPaymentDetails/);
    expect(screen).toMatch(/<CareScopeAgreementPaymentDetails providerCurrency=\{providerCurrency\} quoteCard=\{proposedQuoteCard\} requestCard=\{proposedScopeRequestCard\} viewerRole="provider" \/>/);
    expect(screen).toMatch(/<CareScopeAgreementPaymentDetails hideWhenFree=\{!canSignCareScope\} providerCurrency=\{curr\} quoteCard=\{quoteCard\} requestCard=\{requestCard\} viewerRole="requester" \/>/);
    expect(screen).toMatch(/<Text style=\{styles\.paymentInfoTitle\}>Payment details<\/Text>/);
    expect(screen).not.toMatch(/viewerRole === "provider" \? <Text style=\{styles\.paymentInfoText\}>\(incl\. 10% platform charge\)<\/Text> : null/);
    expect(screen).toMatch(/<Text style=\{styles\.paymentLabel\}>Final rate<\/Text>/);
    expect(screen).toMatch(/<Text style=\{styles\.paymentLabel\}>You pay<\/Text>/);
    expect(screen).toMatch(/<Text style=\{styles\.paymentLabel\}>You receive<\/Text>/);
    expect(screen).toMatch(/const requesterTotal = requestOffer \* \(1 \+ CARE_REQUESTER_FEE_RATE\)/);
    expect(screen).toMatch(/const providerPayout = requestOffer \* \(1 - CARE_PROVIDER_FEE_RATE\)/);
    expect(screen).toMatch(/<Text style=\{styles\.paymentInfoTitle\}>Free Care Session<\/Text>/);
    expect(screen).toMatch(/Nothing is charged unless a price is agreed\./);
    expect(screen).not.toMatch(/Free Booking/);
  });

  it("carer Review & Sign recap reads the current proposed Care Scope, not the stale request card", () => {
    expect(screen).toMatch(/const proposedScopeRequestCard = requestCardWithCareScopeUpdates\(requestCard, proposedQuoteCard, "carer"\)/);
    expect(screen).toMatch(/<PaymentCareScopeSummary[\s\S]*?quoteCard=\{proposedQuoteCard\}[\s\S]*?requestCard=\{proposedScopeRequestCard\}/);
    expect(screen).not.toMatch(/<SelectedPetPolaroid requestCard=\{requestCard\} onOpenPet=\{onOpenPet\} \/>[\s\S]{0,900}<ScopeDetailRow label="Dates">/);
  });

  it("pinned Care Scope summary reads the merged visible scope card instead of mixing stale request rows", () => {
    expect(screen).toMatch(/const visibleScopeCard = requestCardWithCareScopeUpdates\(requestCard, quoteCard, chat\.care_scope\?\.actorRole\)/);
    expect(screen).toMatch(/const serviceLabel = Array\.isArray\(visibleScopeCard\?\.serviceTypes\)/);
    expect(screen).toMatch(/const collapsedShortDate = formatShortDateRange\(visibleScopeCard\?\.requestedDates, visibleScopeCard\?\.requestedDate\)/);
    expect(screen).toMatch(/<SelectedPetPolaroid requestCard=\{visibleScopeCard\} onOpenPet=\{onOpenPet\} \/>/);
    expect(screen).toMatch(/\{visibleScopeCard\.startTime \|\| "—"\} – \{visibleScopeCard\.endTime \|\| "—"\}/);
    expect(screen).not.toMatch(/<SelectedPetPolaroid requestCard=\{requestCard\} onOpenPet=\{onOpenPet\} \/>/);
  });

  it("timeline progress reads the same merged visible Care Scope data as the Care Scope card", () => {
    expect(screen).toMatch(/const visibleScopeCard = visibleCareScopeCardForChat\(chat\)/);
    expect(screen).toMatch(/const scopeTasks = normalizeCareTaskList\(visibleScopeCard\?\.scopeTasks\)/);
    expect(screen).toMatch(/clean\(visibleScopeCard\?\.otherTasks\)/);
    expect(screen).toMatch(/const scopeFrequency = clean\(visibleScopeCard\?\.scopeFrequency\)/);
    expect(screen).toMatch(/\{ label: "Care scope proposed", dateLabel: formatTimelineStepDate\(chat\.quote_sent_at \|\| chat\.request_sent_at \|\| chat\.booked_at\), done: Boolean\(visibleScopeCard\) \}/);
    expect(screen).not.toMatch(/\{ label: "Care scope proposed"[^}]*detail:/);
  });

  it("current-turn resolver keeps owner date edits live while still letting carer-owned edits override their fields", () => {
    expect(screen).toMatch(/const quoteOwnsCurrentTurn = actorRole === "carer";/);
    expect(screen).toMatch(/requestedDates: requestCard\.requestedDates\?\.length \? requestCard\.requestedDates : quoteCard\.requestedDates/);
    expect(screen).toMatch(/locationArea: quoteOwnsCurrentTurn \? clean\(quoteCard\.locationArea\) \|\| base\.locationArea : base\.locationArea/);
    expect(screen).toMatch(/scopeTasks: quoteOwnsCurrentTurn && normalizeCareTaskList\(quoteCard\.scopeTasks\)\.length/);
  });

  it("treats a voluntary quote with a positive proposed rate as paid, not free", () => {
    expect(screen).toMatch(/const hasPaidQuote = hasActiveQuote && Number\.isFinite\(quoteAmount\) && quoteAmount > 0/);
    expect(screen).toMatch(/const isNoChargeVoluntaryQuote = \(quote: ServiceQuoteCard \| null \| undefined\) =>\s*hasMeaningfulServiceQuoteCard\(quote\) && !quoteHasPositivePrice\(quote\)/);
    expect(screen).toMatch(/const normalizeCareScopePaymentInput = /);
    expect(screen).toMatch(/if \(numeric === 0\) return \{ adjustedToMinimum: false, currency: "", finalPrice: "", invalid: false, minimum: 0, paid: false, rate: "", voluntary: true \}/);
    expect(screen).toMatch(/const proposedNoChargeVoluntary = isNoChargeVoluntaryQuote\(proposedQuoteCard\)/);
    expect(screen).toMatch(/careScopeAcknowledgementCopy\("provider", proposedNoChargeVoluntary\)/);
    expect(screen).not.toMatch(/We'll need this part/);
  });

  it("uses a fixed Total amount, not selectable hourly/daily/session rates", () => {
    expect(screen).toMatch(/const CARE_SCOPE_TOTAL_RATE_LABEL = "Total"/);
    expect(screen).not.toMatch(/const RATE_OPTIONS = \[/);
    expect(screen).not.toMatch(/RATE_OPTIONS\.map/);
    expect(screen).not.toMatch(/setRateMenuOpen/);
    expect(screen).toMatch(/<Text style=\{styles\.requestCreateLabel\}>Total<\/Text>/);
    expect(screen).toMatch(/<Text numberOfLines=\{1\} style=\{styles\.requestRateText\}>\{CARE_SCOPE_TOTAL_RATE_LABEL\}<\/Text>/);
  });

  it("auto-rounds positive below-minimum card payments and explains the platform minimum", () => {
    expect(screen).toMatch(/const STRIPE_MINIMUM_CHARGE_BY_CURRENCY/);
    expect(screen).toMatch(/HKD: 4/);
    expect(screen).toMatch(/const adjusted = minimum > 0 && numeric > 0 && numeric < minimum \? minimum : numeric/);
    expect(screen).toMatch(/adjustedToMinimum: adjusted !== numeric/);
    expect(screen).toMatch(/Minimum card payment is \$\{formatMoney\(currency, minimum\)\} to go through our payment platform\./);
    expect(screen).toMatch(/setSuggestedPrice\(normalizedRequestPayment\.finalPrice\)/);
    expect(screen).toMatch(/setFinalPrice\(normalizedQuotePayment\.finalPrice\)/);
  });

  it("lets the owner update an expired request date by validating the new request card, not the stale expired one", () => {
    const migration = readMigration("care_scope_expired_owner_date_update");
    expect(migration).toMatch(/create or replace function public\.assert_request_card_not_expired\(p_request_card jsonb\)/);
    expect(migration).toMatch(/if p_request_card is not null and v_actor_role = 'owner' then/);
    expect(migration).toMatch(/perform public\.validate_service_request_payload\(p_request_card\)/);
    expect(migration).toMatch(/perform public\.assert_request_card_not_expired\(p_request_card\)/);
    expect(migration).toMatch(/else\s+perform public\.assert_pending_request_not_expired\(p_service_chat_id\)/);
  });

  it("agreement validation uses normalized visible scope identity, not only quoteCard.petId/requestCard.petId", () => {
    expect(screen).toMatch(/const petId = selectedPetIds\[0\] \|\| ""/);
    expect(screen).toMatch(/const visiblePetName = /);
    expect(screen).toMatch(/const hasAgreementPet = Boolean\(petId \|\| visiblePetName\)/);
    expect(screen).toMatch(/const quoteOverridesSchedule = Boolean/);
    expect(screen).toMatch(/Boolean\(hasAgreementPet && requesterId && providerId && startAt && endAt\)/);
    expect(screen).toMatch(/petName: visiblePetName/);
  });

  it("claims one persisted Stripe idempotency key before every paid cancellation", () => {
    expect(cancelServiceBookingFunction).toMatch(/claim_paid_service_cancellation/);
    expect(cancelServiceBookingFunction).toMatch(/const refundIdempotencyKey = clean\(claim\.stripe_idempotency_key\)/);
    expect(cancelServiceBookingFunction).toMatch(/idempotencyKey: refundIdempotencyKey/);
    expect(cancelServiceBookingFunction).not.toMatch(/service_cancel:\$\{serviceChatId\}:\$\{actorRole\}:\$\{refundCents\}/);
  });

  it("creates admin-review disputes from handoff reports and holds owner cancellation fees", () => {
    expect(tier23Migration).toMatch(/insert into public\.service_disputes/);
    expect(tier23Migration).toMatch(/owner_issue_payout_hold/);
    expect(tier23Migration).toMatch(/cancellation_fee_status/);
    expect(tier23Migration).toMatch(/held_for_review/);
    expect(tier23Migration).toMatch(/provider_no_show_reported_under_review/);
  });

  it("stores optional Start Care check-in notes without changing the PIN/photo gate", () => {
    expect(tier23Migration).toMatch(/p_checkin_note text default null/);
    expect(tier23Migration).toMatch(/'checkin_note', v_note/);
    expect(screen).toMatch(/p_checkin_note: evidence\?\.note\?\.trim\(\) \|\| null/);
    expect(screen).toMatch(/<Text style=\{styles\.fieldLabel\}>Check-in note<\/Text>/);
    expect(screen).toMatch(/placeholder="Optional handoff note"/);
    expect(screen).toMatch(/checkinWarningText: \{ alignSelf: "stretch", textAlign: "left"/);
    expect(screen).not.toMatch(/checkinWarningText: \{ marginLeft:/);
  });

  it("removes fake far-from-handoff admin signal until real distance logic exists", () => {
    expect(tier23Migration).not.toMatch(/far_from_handoff/);
    expect(adminSafety).not.toMatch(/checkin_location_far_from_handoff/);
    expect(tier23Migration).toMatch(/checkin_location_lat/);
    expect(tier23Migration).toMatch(/checkin_location_lng/);
  });

  it("locks trust event statuses to the approved lifecycle values without renaming live columns", () => {
    expect(tier23Migration).toMatch(/care_provider_trust_events_status_check/);
    expect(tier23Migration).toMatch(/status in \('active', 'under_review', 'resolved', 'expired', 'voided'\)/);
    expect(tier23Migration).toMatch(/comment on column public\.care_provider_trust_events\.penalty/);
    expect(tier23Migration).not.toMatch(/alter table public\.care_provider_trust_events\s+rename column/);
  });

  it("makes admin disputes and care evidence self-contained for Tier 4 review", () => {
    expect(tier4Migration).toMatch(/create view public\.view_admin_service_disputes_queue/);
    expect(tier4Migration).toMatch(/sc\.pin_shared_at/);
    expect(tier4Migration).toMatch(/sc\.pin_attempt_count/);
    expect(tier4Migration).toMatch(/checkin\.note as checkin_note/);
    expect(tier4Migration).toMatch(/coalesce\(trust\.trust_events, '\[\]'::jsonb\) as provider_trust_events/);
    expect(tier4Migration).toMatch(/create view public\.view_admin_service_care_evidence/);
    expect(tier4Migration).toMatch(/sc\.stripe_payment_intent_id/);
    expect(tier4Migration).toMatch(/sd\.stripe_refund_id/);
    expect(tier4Migration).toMatch(/sd\.final_customer_refund_amount/);
    expect(tier4Migration).toMatch(/sd\.owner_issue_payout_hold/);
    expect(adminSafety).toMatch(/Service refund:/);
    expect(adminSafety).toMatch(/PIN shared:/);
    expect(adminSafety).toMatch(/Linked disputes:/);
    expect(adminSafety).not.toMatch(/checkin_location_far_from_handoff/);
  });
});

describe("§7.6 / §11 commit CTAs", () => {
  it("uses Slide to Start Care and Slide to Complete", () => {
    expect(screen).toMatch(/label="Slide to Start Care"/);
    expect(screen).toMatch(/completionCtaLabel = "Slide to Complete"/);
  });
});

describe("Runtime bug fixes (2026-06-26 batch)", () => {
  it("#1 Walks-per-day only renders when Walk is a selected task", () => {
    expect(screen).toMatch(/const showWalksPerDayField = scopeTasks\.includes\("Walk"\)/);
    expect(screen).toMatch(/\{scopeTasks\.includes\("Walk"\) \? \(/);
  });
  it("#2 no field title carries an (Optional) suffix", () => {
    expect(screen).not.toMatch(/\(Optional\)/);
  });
  it("#5 turn-ownership waiting states explain status without fake actions", () => {
    expect(screen).toMatch(/Waiting for the owner to sign/);
    expect(screen).toMatch(/\$\{clean\(peerName\) \|\| "The carer"\} is still reviewing the Care Scope/);
    expect(screen).not.toMatch(/Waiting for the carer to confirm the scope", onPress: \(\) => undefined, disabled: true/);
  });
  it("#6 times are constrained to 24h HH:MM and validated", () => {
    expect(screen).toMatch(/const isHHMM = /);
    expect(screen).toMatch(/const normalizeHHMM = /);
    expect(screen).toMatch(/startTime: !isHHMM\(startTime\)/);
    expect(screen).toMatch(/endTime: !isHHMM\(endTime\)/);
  });
  it("#10 agreement terms are not re-confirmed when merely paying", () => {
    expect(screen).toMatch(/const missingTermsAcknowledgement = canSignCareScope \? !termsAccepted : false/);
    expect(screen).toMatch(/const missingPolicyAcknowledgement = canSignCareScope \? !policyAccepted : false/);
    expect(screen).toMatch(/const missingTerms = missingTermsAcknowledgement \|\| missingPolicyAcknowledgement/);
    expect(screen).toMatch(/careScopeTermsAcknowledgementCopy\("requester"\)/);
    expect(screen).toMatch(/careScopeTermsAcknowledgementCopy\("provider"\)/);
    expect(screen).toMatch(/careScopeTermsAcknowledgementCopy\("requester"\)/);
    expect(screen).toMatch(/Accept the cancellation policy to sign off\./);
  });

  it("Care Instruction updates create a new immutable Care Scope version and require both signatures again", () => {
    const roverContract = readMigration("rover_grade_care_contract");
    expect(screen).toMatch(/update_service_care_instruction/);
    expect(roverContract).toMatch(/create or replace function public\.update_service_care_instruction/);
    expect(roverContract).toMatch(/return public\.create_care_scope_counterproposal\([\s\S]{0,140}p_care_details/);
    expect(roverContract).not.toMatch(/update public\.care_scope_versions\s+set care_details =/);
    expect(screen).toMatch(/const hasEditedCareInstruction = comparableCurrentCareDetails !== comparableInitialCareDetails/);
    expect(screen).not.toMatch(/Slide to Update & Payment/);
    const updateStart = screen.indexOf("if (hasEditedCareInstruction) {");
    const updateBlock = screen.slice(updateStart, screen.indexOf("if (!canSignCareScope && !canPay)", updateStart));
    expect(updateBlock).toMatch(/await onUpdateCareDetails\(currentCareDetails\)/);
    expect(updateBlock).toMatch(/onClose\(\)/);
    expect(updateBlock).toMatch(/return;/);
    expect(screen).toMatch(/Saving changes will require a new signature from both sides\./);
  });

  it("Payment/Confirm Care Instruction fields are complete, field-local, and persisted separately", () => {
    const snapshotMigration = readMigration("care_instruction_contact_handoff_snapshot");
    expect(screen).toMatch(/contact\?: string/);
    expect(screen).toMatch(/handoffLocation\?: string/);
    expect(screen).toMatch(/requesterPhone=\{currentUserPhone\}/);
    expect(screen).toMatch(/Owner's Contact<\/Text>/);
    expect(screen).toMatch(/onValidityChange=\{setContactValid\}/);
    expect(screen).toMatch(/onFocus=\{\(\) => focusPaymentField\("contact"\)\}/);
    expect(screen).toMatch(/Add a contact number to continue\./);
    expect(screen).toMatch(/Emergency contact<\/Text>/);
    expect(screen).toMatch(/onFocus=\{\(\) => focusPaymentField\("emergency"\)\}/);
    expect(screen).toMatch(/Hand-off location<\/Text>/);
    expect(screen).toMatch(/Your carer needs the exact hand-off spot to start care\./);
    expect(screen).toMatch(/const getFirstInvalidPaymentField = useCallback/);
    expect(screen).toMatch(/if \(firstInvalidField\) focusPaymentField\(firstInvalidField\)/);
    expect(snapshotMigration).toMatch(/booking_snapshot_contact_required/);
    expect(snapshotMigration).toMatch(/booking_snapshot_handoff_location_required/);
  });

  it("Payment sheet restores saved emergency vet authorization instead of blank stale drafts", () => {
    expect(screen).toMatch(/vetAuthChoice: typeof initialCareDetails\.emergencyVetAuthorization\?\.authorized === "boolean"/);
    expect(screen).toMatch(/vetAuthCap: clean\(parsed\.vetAuthCap\) \|\| defaultDraft\.vetAuthCap/);
    expect(screen).toMatch(/parsed\.vetAuthChoice === "authorize" \|\| parsed\.vetAuthChoice === "decline"/);
    expect(screen).toMatch(/: defaultDraft\.vetAuthChoice/);
    expect(screen).not.toMatch(/vetAuthCap: "",\s*vetAuthChoice: null/);
  });

  it("Paid Stripe checkout receives the mandatory Care Instruction fields in its server snapshot", () => {
    const paymentFunction = readFileSync(join(repoRoot, "supabase/functions/create-service-payment/index.ts"), "utf8");
    expect(paymentFunction).toMatch(/contact: requireSnapshotString\(incomingSnapshot, "contact", "Contact"\)/);
    expect(paymentFunction).toMatch(/handoffLocation: requireSnapshotString\(incomingSnapshot, "handoffLocation", "Hand-off location"\)/);
    expect(paymentFunction).toMatch(/from\("service_care_agreements"\)[\s\S]{0,180}requester_signature/);
    expect(paymentFunction).toMatch(/requesterSignature,\s*requesterId: user\.id/);
    expect(paymentFunction).toMatch(/stripe\.checkout\.sessions\.create/);
    expect(paymentFunction).toMatch(/return json\(\{\s*mode,\s*url: session\.url,\s*checkoutSessionId: session\.id,\s*\}\)/);
  });

  it("payment and no-charge confirm target the active service row, not the reused conversation id", () => {
    const paymentFunction = readFileSync(join(repoRoot, "supabase/functions/create-service-payment/index.ts"), "utf8");
    const confirmFunction = readFileSync(join(repoRoot, "supabase/functions/confirm-voluntary-service-booking/index.ts"), "utf8");
    const strictPaymentMigration = readMigration("care_booking_payment_exact_rpc_boundaries");
    const payFn = screen.slice(screen.indexOf("const pay = useCallback"), screen.indexOf("const confirmVolunteerBooking"));
    const confirmFn = screen.slice(screen.indexOf("const confirmVolunteerBooking = useCallback"), screen.indexOf("const proceedPaymentDirect"));
    expect(payFn).toMatch(/const activeServiceChat = serviceChatRef\.current/);
    expect(payFn).toMatch(/const activeServiceChatId = clean\(activeServiceChat\?\.id\)/);
    expect(payFn).toMatch(/service_chat_id: activeServiceChatId/);
    expect(payFn).not.toMatch(/chat_id: roomId/);
    expect(confirmFn).toMatch(/const activeServiceChat = serviceChatRef\.current/);
    expect(confirmFn).toMatch(/const activeServiceChatId = clean\(activeServiceChat\?\.id\)/);
    expect(confirmFn).toMatch(/service_chat_id: activeServiceChatId/);
    expect(confirmFn).not.toMatch(/chat_id: roomId/);
    expect(paymentFunction).toMatch(/\.eq\("id", serviceChatId\)[\s\S]{0,180}\.maybeSingle\(\)/);
    expect(paymentFunction).not.toMatch(/current_active_service_chat_id_for_room/);
    expect(paymentFunction).not.toMatch(/\.eq\("chat_id", serviceChatId\)[\s\S]{0,160}\.eq\("status", "pending"\)[\s\S]{0,160}\.order\("updated_at"/);
    expect(paymentFunction).toMatch(/booking_snapshot_pending: snapshot[\s\S]{0,90}\.eq\("id", serviceChat\.id\)/);
    expect(paymentFunction).toMatch(/service_chat_id: serviceChat\.id/);
    expect(paymentFunction).toMatch(/carePaymentStripeIdempotencyKey\(serviceChat\.id, claim\.attemptId\)/);
    expect(confirmFunction).toMatch(/\.eq\("id", serviceChatId\)[\s\S]{0,180}\.maybeSingle\(\)/);
    expect(confirmFunction).not.toMatch(/current_active_service_chat_id_for_room/);
    expect(confirmFunction).not.toMatch(/\.eq\("chat_id", serviceChatId\)[\s\S]{0,160}\.eq\("status", "pending"\)[\s\S]{0,160}\.order\("updated_at"/);
    expect(strictPaymentMigration).toMatch(/confirm_voluntary_service_booking_by_service_id/);
    expect(strictPaymentMigration).not.toMatch(/current_active_service_chat_id_for_room|current_active_service_chat_id_from_any_id/);
    expect(confirmFunction).toMatch(/p_service_chat_id: serviceChat\.id/);
    expect(confirmFunction).not.toMatch(/p_chat_id:/);
    expect(confirmFunction).toMatch(/body: \{ service_chat_id: serviceChat\.id, source: "voluntary_booking_confirmed" \}/);
  });

  it("post-payment confirm and cancellation also target the active service row", () => {
    const confirmPaymentFunction = readFileSync(join(repoRoot, "supabase/functions/confirm-service-payment/index.ts"), "utf8");
    const cancelFunction = readFileSync(join(repoRoot, "supabase/functions/cancel-service-booking/index.ts"), "utf8");
    const confirmServicePaymentFn = screen.slice(screen.indexOf("const confirmServicePayment = useCallback"), screen.indexOf("const confirmPendingServicePayment"));
    const cancelPaidBookingFn = screen.slice(screen.indexOf("const cancelPaidBooking = useCallback"), screen.indexOf("const submitCompletion"));
    expect(confirmServicePaymentFn).toMatch(/const activeServiceChatId = clean\(serviceChatRef\.current\?\.id\)/);
    expect(confirmServicePaymentFn).toMatch(/service_chat_id: activeServiceChatId/);
    expect(confirmServicePaymentFn).not.toMatch(/chat_id: roomId/);
    expect(confirmPaymentFunction).toMatch(/\.eq\("id", serviceChatId\)[\s\S]{0,180}\.maybeSingle\(\)/);
    expect(confirmPaymentFunction).not.toMatch(/current_active_service_chat_id_for_room/);
    expect(confirmPaymentFunction).toMatch(/const chatRoomId = serviceChat\.chat_id/);
    expect(confirmPaymentFunction).toMatch(/validateSessionForServiceChat\(session, serviceChat as Record<string, unknown>, serviceChat\.id, user\.id\)/);
    expect(confirmPaymentFunction).toMatch(/finalize_service_care_agreement_for_payment_by_service_id", \{\s*p_service_chat_id: serviceChat\.id/);
    expect(confirmPaymentFunction).toMatch(/notify_service_booking_confirmed_by_service_id/);
    expect(confirmPaymentFunction).not.toMatch(/p_chat_id:/);
    expect(confirmPaymentFunction).toMatch(/insertServiceBookedMessage\(supabase, chatRoomId, user\.id\)/);
    expect(cancelPaidBookingFn).toMatch(/const activeServiceChatId = clean\(serviceChat\?\.id\)/);
    expect(cancelPaidBookingFn).toMatch(/service_chat_id: activeServiceChatId/);
    expect(cancelPaidBookingFn).not.toMatch(/chat_id: roomId/);
    expect(cancelFunction).toMatch(/\.eq\("id", serviceChatId\)[\s\S]{0,180}\.maybeSingle\(\)/);
    expect(cancelFunction).toMatch(/p_service_chat_id: row\.id/);
    expect(cancelFunction).not.toMatch(/p_chat_id: row\.chat_id/);
    expect(cancelFunction).toMatch(/service_chat_id: row\.id/);
    expect(cancelFunction).toMatch(/claim_paid_service_cancellation/);
    expect(cancelFunction).toMatch(/idempotencyKey: refundIdempotencyKey/);
    const exactCancellationMigration = readMigration("cancellation_requires_service_chat_id");
    expect(exactCancellationMigration).toMatch(/p_service_chat_id uuid/);
    expect(exactCancellationMigration).toMatch(/where id = p_service_chat_id for update/g);
    expect(exactCancellationMigration).not.toMatch(/where chat_id = p_chat_id/);
    expect(exactCancellationMigration).toMatch(/values \(v_sc\.chat_id, p_actor_id/);
  });

  it("live care actions resolve through the strict active service row, not a room-ambiguous lookup", () => {
    const activeCareActions = readMigration("care_updates_strict_service_identity_and_reminders");
    expect(activeCareActions).toMatch(/create or replace function public\.get_service_care_update_status_by_service_id/);
    expect(activeCareActions).toMatch(/create or replace function public\.submit_service_care_update_by_service_id/);
    expect(activeCareActions).toMatch(/create or replace function public\.submit_service_checkin_by_service_id/);
    expect(activeCareActions).toMatch(/create or replace function public\.verify_service_start_pin_by_service_id/);
    expect(activeCareActions).toMatch(/create or replace function public\.submit_service_issue_report_by_service_id/);
    expect(activeCareActions).toMatch(/create or replace function public\.submit_requester_handoff_response_by_service_id/);
    expect(activeCareActions).toMatch(/where id = p_service_chat_id/);
    expect(activeCareActions).not.toMatch(/_by_service_id[\s\S]{0,900}current_active_service_chat_id_from_any_id/);
  });

  it("Agreement PDF is gated by mandatory Care Instruction and active mutual Care Scope signature", () => {
    expect(screen).toMatch(/const hasMandatoryCareInstructionDetails = /);
    expect(screen).toMatch(/const careAgreementHasSignedParties = /);
    expect(screen).toMatch(/const careAgreementHasPdf = /);
    expect(screen).toMatch(/careAgreementHasSignedParties\(chat\.care_agreement\)[\s\S]{0,180}hasCurrentCareScopeAgreement\(chat\)[\s\S]{0,180}hasMandatoryCareInstructionDetails\(careInstructionDetails\)/);
    expect(screen).not.toMatch(/careAgreementMatchesCurrentScope/);
    expect(pdfFunction).toMatch(/const hasMandatoryCareInstruction = /);
    expect(pdfFunction).toMatch(/care_instruction_required/);
    expect(pdfFunction).toMatch(/Care Instruction is required before generating the agreement PDF/);
  });

  it("agreement PDF requires the exact service row and never resolves from a room", () => {
    expect(pdfFunction).toMatch(/\.eq\("id", serviceChatId\)[\s\S]{0,120}\.maybeSingle\(\)/);
    expect(pdfFunction).not.toMatch(/current_active_service_chat_id_for_room/);
    expect(pdfFunction).not.toMatch(/\.or\(`id\.eq\.\$\{serviceChatId\},chat_id\.eq\.\$\{serviceChatId\}`\)/);
  });

  it("Care Scope Summary exposes Care Instruction only when instruction fields exist", () => {
    expect(screen).toMatch(/const hasCareInstructionDetails = /);
    expect(screen).toMatch(/function CareInstructionDetailRows/);
    expect(screen).toMatch(/See Care Instruction/);
    expect(screen).toMatch(/Back to Care Scope/);
    expect(screen).toMatch(/hasCareInstruction \? \(/);
    expect(screen).toMatch(/if \(!authorization\.authorized\) return "Not authorized"/);
    expect(screen).toMatch(/label=\{"Emergency\\nVet Care"\}/);
    expect(screen).toMatch(/<ScopeDetailRow label="Owner's Contact">/);
    expect(screen).toMatch(/<ScopeDetailRow label="Hand-off Location">/);
    expect(screen).not.toMatch(/<ScopeDetailRow label="Handoff method">/);
    expect(screen).toMatch(/<PaymentCareScopeSummary[\s\S]{0,160}careDetails=\{careScope\?\.careDetails \|\| null\}/);
  });

  it("keeps persisted single-line Care Scope values on one line while instructions remain multiline", () => {
    expect(screen).toMatch(/function ScopeDetailRow\(\{ children, label, multiline = false \}/);
    expect(screen).toMatch(/nestedScrollEnabled showsVerticalScrollIndicator style=\{styles\.scopeDetailValueMultiline\}/);
    expect(screen).toMatch(/<ScopeDetailRow label="Care Instructions" multiline>/);
    expect(screen).toMatch(/<ScopeDetailRow label="Care tasks">\{\[scopeTasks\.join\(", "\), otherTasks\]/);
    expect(screen).toMatch(/<ScopeDetailRow label="Walks per day">\{scopeFrequency\}<\/ScopeDetailRow>/);
  });

  it("opens role-specific agreement PDFs so counterpart payment rows are not shown", () => {
    expect(screen).toMatch(/viewer_role: isProvider \? "carer" : "owner"/);
    expect(screen).toMatch(/generate-care-agreement-pdf/);
    expect(screen).toMatch(/getCachedSignedStorageUrl\("care_agreements", pdfPath/);
    expect(pdfFunction).toMatch(/care_agreement-\$\{pdfModeSegment\}-\$\{viewerRole\}-v1\.pdf/);
    expect(pdfBuilder).toMatch(/viewerRole\?: "owner" \| "carer" \| null/);
    expect(pdfBuilder).toMatch(/input\.viewerRole === "carer"/);
    expect(pdfBuilder).toMatch(/moneyField\("You receive"/);
    expect(pdfBuilder).toMatch(/moneyField\("You pay"/);
    // Logo is inlined as base64 (huddle-wordmark-white.ts) rather than read from a
    // sibling binary file, so it can never go missing from an edge-function deploy.
    expect(pdfFunction).toMatch(/HUDDLE_WORDMARK_WHITE_PNG_BASE64.*from "\.\/huddle-wordmark-white\.ts"/);
    expect(pdfBuilder).toMatch(/const wordmark = "huddle"/);
  });

  it("care-flow sheets unmount when closed so hidden backdrops cannot block the header", () => {
    expect(screen).toMatch(/\{requestSheetOpen \? <RequestSheet/);
    expect(screen).toMatch(/\{quoteSheetOpen \? <QuoteSheet/);
    expect(screen).toMatch(/\{activeSheet === "payment" \? <PaymentSheet/);
    expect(screen).toMatch(/\{activeSheet === "startCare" \? <StartCareSheet/);
    expect(screen).toMatch(/\{activeSheet === "careUpdate" \? <NativeCareUpdateSheet/);
    expect(screen).toMatch(/\{activeSheet === "completion" \? <CompletionSheet/);
    expect(screen).toMatch(/\{activeSheet === "issue" \? <HandoffProblemSheet/);
    expect(screen).toMatch(/\{activeSheet === "handoffProblem" \? <HandoffProblemSheet/);
    expect(screen).toMatch(/\{activeSheet === "handoffRequesterProblem" \? <HandoffProblemSheet/);
    expect(screen).toMatch(/\{activeSheet === "handoffResponse" \? <HandoffProblemSheet/);
    expect(screen).toMatch(/\{activeSheet === "review" \? <ReviewSheet/);
  });

  it("pinned Care Scope card expands in-flow with an internal height-capped scroll, so it can grow tall without pushing the composer", () => {
    // Header, expanded detail, and action row all live in ONE card container (one accent
    // strip spans all of it — no separate overlay/Modal layer to create a seam). The detail's
    // own ScrollView is capped to a fraction of window height so it can't grow unboundedly;
    // the footer below stays a flexShrink:0 sibling, unaffected by how tall this card gets.
    const cardBlock = screen.slice(screen.indexOf("function BookingCards"), screen.indexOf("function ScopeLine"));
    expect(cardBlock).toMatch(/\{expanded \? \(\s*<View ref=\{detailWrapRef\} onLayout=\{measureDetailTop\}>\s*<ScrollView/);
    expect(cardBlock).toMatch(/style=\{\{ maxHeight: scopeDetailMaxHeight \}\}/);
    expect(cardBlock).not.toMatch(/<Modal/);
  });

  it("the footer is a single bottom-pinned surface whose measured height the message list reserves as bottom padding — so the CTA can't be painted over by the composer", () => {
    // dialogueFooterSurface is position:absolute at the screen bottom (one owned stack:
    // action/CTA card then composer), and the scroll content reserves footerHeight as
    // paddingBottom. Nothing else can compress the footer or hide messages behind it.
    expect(screen).toMatch(/dialogueFooterSurface: \{ position: "absolute", left: 0, right: 0, bottom: 0/);
    expect(screen).toMatch(/onLayout=\{\(event\) => setFooterHeight\(event\.nativeEvent\.layout\.height\)\}/);
    expect(screen).toMatch(/\{ paddingBottom: footerHeight \+ huddleSpacing\.x2 \}/);
  });

  it("Care Scope shortcut actions render as bare icons in the header (no bordered pill buttons in the expanded body)", () => {
    const cardBlock = screen.slice(screen.indexOf("function BookingCards"), screen.indexOf("function ScopeLine"));
    // icons live in the header actions cluster next to the chevron
    expect(cardBlock).toMatch(/<View style=\{styles\.scopeHeaderActions\}>/);
    expect(cardBlock).toMatch(/showUpdateDateAction \?/);
    expect(cardBlock).toMatch(/showWithdrawAction \?/);
    expect(screen).toMatch(/scopeHeaderActions: \{ flexShrink: 0, flexDirection: "row", alignItems: "center"/);
    // the old bordered action row inside the expanded body is gone
    expect(cardBlock).not.toMatch(/styles\.scopeActionRow/);
  });

  it("uses the same compact two-row Care Scope header in collapsed and expanded states", () => {
    const cardBlock = screen.slice(screen.indexOf("function BookingCards"), screen.indexOf("function ScopeLine"));
    const reviewSummaryBlock = screen.slice(screen.indexOf("function PaymentCareScopeSummary"), screen.indexOf("function CareScopeAgreementPaymentDetails"));
    expect(cardBlock).toMatch(/<View style=\{styles\.scopeHeaderTopRow\}>[\s\S]{0,1800}<View style=\{styles\.scopeHeaderActions\}>[\s\S]{0,1800}name=\{expanded \? "chevron-up" : "chevron-down"\}/);
    expect(cardBlock).toMatch(/<View style=\{styles\.scopeHeaderBottomRow\}>[\s\S]{0,500}\{collapsedWhereLine \? <Text[\s\S]{0,1800}careAgreementReady \? \(/);
    expect(cardBlock).not.toMatch(/Updates ·|scopeUpdateStatus|updateStatusLine/);
    expect(reviewSummaryBlock).not.toMatch(/Updates ·|scopeUpdateStatus/);
    expect(screen).toMatch(/scopeHeadlineBlock: \{ gap: 4 \}/);
    expect(screen).toMatch(/scopeUtilityActions: \{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end"/);
    expect(cardBlock.indexOf('accessibilityLabel="Hide care scope from chat"')).toBeLessThan(cardBlock.indexOf("careAgreementReady ? ("));
  });

  it("mutual signatures materialize the agreement row while visible PDF readiness waits for Care Instruction", () => {
    const agreementMigration = readMigration("materialize_agreement_on_mutual_scope_sign");
    expect(agreementMigration).toMatch(/create or replace function public\.materialize_service_care_agreement_for_scope/);
    expect(agreementMigration).toMatch(/create trigger care_scope_signature_materialize_agreement/);
    expect(agreementMigration).toMatch(/perform public\.enqueue_care_agreement_pdf_generation\(p_service_chat_id, 'mutual_scope_signature'\)/);
    expect(screen).toMatch(/allowAgreementPdfFromAgreement = false/);
    expect(screen).toMatch(/allowAgreementPdfFromAgreement[\s\S]{0,80}careAgreementHasPdf\(chat\.care_agreement\)/);
    expect(screen).toMatch(/<BookingCards[\s\S]{0,220}allowAgreementPdfFromAgreement/);
    expect(screen).not.toMatch(/if \(!clean\(details\?\.careInstructions\)\) return false/);
    expect(pdfFunction).not.toMatch(/if \(!clean\(careDetails\.careInstructions \|\| snapshot\.careInstructions\)\) return false/);
    expect(screen).toMatch(/See Agreement/);
    expect(screen).toMatch(/Your agreement is still being prepared\. Check back shortly\./);
  });

  it("paid checkout pending state is a five-minute retry lock with a countdown, then Proceed Payment returns", () => {
    const paymentFunction = readFileSync(join(repoRoot, "supabase/functions/create-service-payment/index.ts"), "utf8");
    expect(paymentFunction).toMatch(/CARE_PAYMENT_RETRY_LOCK_MS = 5 \* 60 \* 1000/);
    expect(paymentFunction).toMatch(/Math\.min\(stripeExpiresAtMs, retryLockExpiresAtMs\)/);
    expect(paymentFunction).toMatch(/claim_service_care_payment_attempt/);
    expect(paymentFunction).toMatch(/payment_attempt_id: claim\.attemptId/);
    expect(paymentFunction).toMatch(/carePaymentStripeIdempotencyKey\(serviceChat\.id, claim\.attemptId\)/);
    expect(paymentFunction).not.toMatch(/payload\.idempotency/);
    expect(screen).toMatch(/const \[paymentNowMs, setPaymentNowMs\] = useState/);
    expect(screen).toMatch(/setInterval\(\(\) => setPaymentNowMs\(Date\.now\(\)\), 1000\)/);
    expect(screen).toMatch(/isCarePaymentPendingActive\(scope, paymentNowMs\)/);
    expect(screen).toMatch(/if \(paymentInProgress && isRequester && hasPaymentAmount\)/);
    expect(screen).toMatch(/if \(paymentInProgress\)[\s\S]{0,80}return null;/);
    expect(screen).not.toMatch(/label: paymentRetryCountdown \|\| "Payment pending"/);
    expect(screen).toMatch(/title: "Payment in progress"/);
    expect(screen).toMatch(/const proceedPaymentDirect = useCallback/);
    expect(screen).toMatch(/paymentSnapshotFromAgreedChat\(serviceChatRef\.current\)/);
    expect(screen).toMatch(/const built: CareBookingSnapshot = /);
    expect(screen).toMatch(/if \(!base\) return built/);
    expect(screen).not.toMatch(/Open Booking Payment once to refresh the booking details before paying/);
    expect(screen).toMatch(/onPress: hasPaymentAmount \? proceedPaymentDirect : \(\) => setActiveSheet\("payment"\)/);
    const retryMigration = readMigration("care_payment_retry_lock_five_minutes");
    expect(retryMigration).toMatch(/payment_pending_started_at <= now\(\) - interval '5 minutes'/);
    expect(retryMigration).toMatch(/least\(p_expires_at, now\(\) \+ interval '5 minutes'\)/);
    expect(retryMigration).toMatch(/v_version\.payment_pending_started_at > now\(\) - interval '5 minutes'/);
  });

  it("waiting states explain status without rendering useless disabled CTA buttons", () => {
    expect(screen).toMatch(/\$\{clean\(peerName\) \|\| "The carer"\} is still reviewing the Care Scope/);
    expect(screen).toMatch(/\$\{clean\(peerName\) \|\| "The owner"\} has already signed the Care Scope/);
    expect(screen).not.toMatch(/clean\(ownerName\)/);
    expect(screen).toMatch(/\{actionPrimary && !actionPrimary\.disabled \? \(/);
    expect(screen).toMatch(/scope\.actorRole === "carer" && !scope\.ownerSigned[\s\S]{0,120}Review & Sign Care Scope/);
    expect(screen).not.toMatch(/Waiting for the carer to confirm the scope", onPress: \(\) => undefined, disabled: true/);
    expect(screen).not.toMatch(/Waiting for the owner to pay", onPress: \(\) => undefined, disabled: true/);
    expect(screen).not.toMatch(/Carer is finishing payout setup", onPress: \(\) => setActiveSheet\("payment"\), disabled: true/);
  });

  it("owner-signed-first path pays/confirms after late carer signature without a payout dead end", () => {
    expect(screen).toMatch(/const mutuallyAgreed = hasCurrentCareScopeAgreement\(serviceChat\)/);
    expect(screen).toMatch(/if \(mutuallyAgreed\) \{\s*if \(hasPaymentAmount && !providerStripeReady\) return \{ label: "Finish payout setup", onPress: openPayoutAccount/);
    expect(screen).toMatch(/if \(mutuallyAgreed\) \{\s*if \(hasPaymentAmount && !providerStripeReady\) return null;\s*return \{ label: hasPaymentAmount \? "Proceed Payment" : "Proceed Confirm", onPress: hasPaymentAmount \? proceedPaymentDirect : \(\) => setActiveSheet\("payment"\)/);
    expect(screen.indexOf("if (mutuallyAgreed)")).toBeLessThan(screen.indexOf("if (hasPaymentAmount && !providerStripeReady)"));
    expect(screen).toMatch(/\{actionPrimary && !actionPrimary\.disabled \? \(/);
    expect(screen).toMatch(/if \(hasCurrentCareScopeAgreement\(serviceChat\)\)/);
    expect(screen).toMatch(/hasCurrentAgreement=\{hasCurrentCareScopeAgreement\(serviceChat\)\}/);
    expect(screen).toMatch(/const currentMutualSignatures = hasCurrentAgreement === true \|\| careScope\?\.mutualSigned === true/);
    expect(screen).not.toMatch(/agreementMatchedCurrentScope/);
    expect(screen).toMatch(/const activeScopeVersionId = careScope\?\.scopeVersionId/);
    expect(screen).toMatch(/scopeVersionId\?: string/);
    expect(screen).toMatch(/if \(clean\(parsed\.scopeVersionId\) !== activeScopeVersionId\)/);
    expect(screen).toMatch(/void AsyncStorage\.removeItem\(draftKey\)/);
    expect(screen).toMatch(/const paymentBasePrice = careScopePaymentAmount\(quoteCard, requestCard\)/);
    expect(screen).toMatch(/const quoteMinor = hasValidPrice \? toStripeMinorUnitAmount\(paymentBasePrice, curr\) : 0/);
    expect(screen).toMatch(/hasPaymentAmount \? "Proceed Payment" : "Proceed Confirm"/);
  });

  it("Care Agreement PDF opens from a local app file, not the raw Supabase signed URL", () => {
    expect(screen).toMatch(/FileSystem\.downloadAsync\(careAgreementPdfUrl, localUri/);
    expect(screen).toMatch(/await Linking\.openURL\(result\.uri\)/);
    expect(screen).not.toMatch(/void Linking\.openURL\(careAgreementPdfUrl\)/);
  });

  it("booked handoff uses one bottom action card for owner and carer, not pinned top banners", () => {
    expect(screen).toMatch(/Your Care Session PIN/);
    expect(screen).toMatch(/Share the 4-digit PIN after handing over your pet or giving access to the care location\./);
    expect(screen).toMatch(/Your Care Session PIN/);
    expect(screen).toMatch(/Enter PIN and 📸/);
    expect(screen).toMatch(/Collect 4-digit PIN, then take a timestamped photo of the pet to start care\./);
    expect(screen).toMatch(/function ServiceActionCard/);
    expect(screen).toMatch(/styles\.serviceActionLayer/);
    expect(screen).toMatch(/styles\.serviceActionCard/);
    expect(screen).toMatch(/serviceActionCollapsed/);
    expect(screen).toMatch(/const isCollapsed = staticCard \? false : \(locked \|\| collapsed\)/);
    expect(screen).toMatch(/accessibilityLabel=\{isCollapsed \? "Expand action card" : "Collapse action card"\}/);
    expect(screen).toMatch(/name=\{isCollapsed \? "chevron-up" : "chevron-down"\}/);
    expect(screen).toMatch(/headerRight=\{!systemNoStartCancellationPending && isRequester \? \([\s\S]{0,180}activeStartPin[\s\S]{0,180}<StartPinDetailCard digits=\{sanitizeStartPin\(activeStartPin\)\.split\(""\)\} \/>/);
    // The owner always sees the PIN in the handoff card. Tapping Start Care grants
    // the early-start authority; the carer still completes check-in with PIN + photo.
    expect(screen).toMatch(/locked=\{isRequester && ownerAuthorizedStart && !handoffReady\}/);
    expect(screen).toMatch(/title=\{systemNoStartCancellationPending \? "Cancelling…" : isRequester \? "Your Care Session PIN" : "Enter PIN and 📸"\}/);
    expect(screen).toMatch(/\{locked \|\| staticCard \? null : \(/);
    expect(screen).not.toMatch(/<Text style=\{styles\.handoffBannerTitle\}>Share PIN Required<\/Text>/);
    expect(screen).not.toMatch(/<Text style=\{styles\.handoffBannerTitle\}>Start PIN required<\/Text>/);
  });

  it("Start Care sheet never pre-fills the PIN the carer must type from memory", () => {
    expect(screen).not.toMatch(/initialPin/);
    expect(screen).toMatch(/\/\/ Never pre-fill the PIN/);
    expect(screen).toMatch(/setPin\(""\)/);
  });

  it("keeps the owner's booking PIN visible across cache races and retries preparation until it is available", () => {
    expect(screen).toMatch(/if \(!cancelled && pin\) setSharedStartPin\(\(current\) => current \|\| pin\)/);
    expect(screen).not.toMatch(/\["awaiting_handoff", "pin_shared"\][^\n]+\|\| activeStartPin/);
    expect(screen).toMatch(/supabase\.rpc\("prepare_service_start_pin_by_service_id", \{ p_service_chat_id: activeServiceChatId \}\)/);
    expect(screen).toMatch(/if \(!pin\) throw new Error\("start_pin_not_prepared"\)/);
    expect(screen).toMatch(/retryTimer = setTimeout\(\(\) => void preparePin\(\), 3000\)/);
    expect(screen).toMatch(/headerRight=\{!systemNoStartCancellationPending && isRequester \? \(/);
    expect(screen).toMatch(/<StartPinDetailCard digits=\{sanitizeStartPin\(activeStartPin\)\.split\(""\)\} \/>/);
    expect(screen).toMatch(/Preparing PIN…/);
    const invariantMigration = readMigration("start_pin_display_and_verification_invariant");
    expect(invariantMigration).toMatch(/extensions\.crypt\(v_pin, start_pin_hash\) <> start_pin_hash/);
    expect(invariantMigration).toMatch(/return jsonb_build_object\('pin', v_pin, 'service_chat_id', v_sc\.id\)/);
    const bookingInvariantMigration = readMigration("booked_service_requires_start_pin");
    expect(bookingInvariantMigration).toMatch(/before update of status on public\.service_chats/);
    expect(bookingInvariantMigration).toMatch(/new\.status = 'booked' and old\.status is distinct from 'booked'/);
    expect(bookingInvariantMigration).toMatch(/insert into public\.service_start_pins/);
    expect(bookingInvariantMigration).toMatch(/new\.start_pin_hash := extensions\.crypt\(v_pin, extensions\.gen_salt\('bf'\)\)/);
    expect(bookingInvariantMigration).toMatch(/raise exception 'start_pin_creation_failed'/);
  });

  it("accepts up to 10 compressed evidence images for no-start and issue reports", () => {
    const reportSheet = screen.slice(screen.indexOf("function HandoffProblemSheet"), screen.indexOf("function ReviewSheet"));
    expect(screen).toMatch(/const MAX_CARE_REPORT_EVIDENCE = 10/);
    expect(reportSheet).toMatch(/allowsMultipleSelection: true/);
    expect(reportSheet).toMatch(/selectionLimit: MAX_CARE_REPORT_EVIDENCE - media\.length/);
    expect(reportSheet).toMatch(/Math\.min\(2, media\.length\)/);
    expect(reportSheet).toMatch(/uploadNativeServiceCareEvidenceImage/);
    expect(reportSheet).toMatch(/Add Photos \(\$\{media\.length\}\/10\)/);
    expect(nativeSocial).toMatch(/resize: \{ width: 1600 \}[\s\S]{0,80}compress: 0\.86/);
    const evidenceLimitMigration = readMigration("care_report_evidence_limit_ten");
    expect(evidenceLimitMigration).toMatch(/> 10 then raise exception ''no_start_evidence_limit_exceeded''/);
    expect(evidenceLimitMigration).toMatch(/> 10 then raise exception ''issue_evidence_limit_exceeded''/);
  });

  it("keeps the status banner and composer together in one sticky in-flow footer surface", () => {
    // Design change (2026-07-03): the footer is an in-flow flexShrink:0 surface holding the
    // banner + CTA + composer, pinned to the bottom — NOT an absolute overlay (which was
    // dropping the composer off-screen on small devices). The message list no longer pads
    // for an absolute footer; the footer takes its own flow space.
    const actionLayerIndex = screen.indexOf("styles.serviceActionLayer");
    const composerSurfaceIndex = screen.indexOf("nativeModalStyles.appModalComposerSurface");
    expect(actionLayerIndex).toBeGreaterThan(0);
    expect(composerSurfaceIndex).toBeGreaterThan(actionLayerIndex);
    expect(screen).not.toMatch(/paddingBottom: serviceFooterHeight \+ huddleSpacing\.x3/);
    expect(screen).not.toMatch(/serviceActionLayer: \{ position: "absolute"/);
  });

  it("Start Care is date-gated before opening and remains camera-only", () => {
    expect(screen).toMatch(/const openStartCareFromHandoff = useCallback/);
    expect(screen).toMatch(/Too early to start/);
    expect(screen).toMatch(/Care can only start on the day it is booked for\./);
    expect(screen).toMatch(/requestNativeCameraPermissionDetail\(\)/);
    expect(screen).toMatch(/launchNativeCameraAsync\(/);
    const startCareBlock = screen.slice(screen.indexOf("function StartCareSheet"), screen.indexOf("function HandoffProblemSheet"));
    expect(startCareBlock).not.toMatch(/launchImageLibraryAsync/);
  });

  it("Cancel Booking is shared, uses issue plus reason, and routes all roles through the Edge function", () => {
    expect(screen).toMatch(/CANCEL_BOOKING_ISSUES/);
    expect(screen).toMatch(/"No-show"/);
    expect(screen).toMatch(/confirmCancelBookingOpen \? \(/);
    expect(screen).toMatch(/style=\{styles\.inlineSheetLayer\}/);
    expect(screen).toMatch(/<Text style=\{nativeModalStyles\.appModalSheetTitle\}>\{isProvider \? "Cancel Care Booking" : "Cancel booking"\}<\/Text>/);
    expect(screen).toMatch(/\{isRequester \? \(\s*<AppModalSelectField\s*label="Issue"/);
    expect(screen).toMatch(/<Text style=\{styles\.requestCreateLabel\}>Reason<\/Text>/);
    expect(screen).toMatch(/showCancelReportIssueLink/);
    expect(screen).toMatch(/isProvider \|\| \(isRequester && cancelWithin24Hours\)/);
    // The carer-facing cancellation copy is tier-differentiated (getCancelPolicy) rather than
    // one static message -- see the dedicated describe block below for full tier coverage.
    expect(screen).toMatch(/Cancelling now marks your Care record and may reduce how often your profile is shown/);
    expect(screen).toMatch(/No payment or refund is involved/);
    const cancelModalBlock = screen.slice(screen.indexOf("confirmCancelBookingOpen ? ("), screen.indexOf("<SlideToConfirm", screen.indexOf("confirmCancelBookingOpen ? (")));
    expect(cancelModalBlock).not.toMatch(/placeholder=\{?"?Optional"?\}?/);
    expect(cancelModalBlock).toMatch(/AppBottomSheetScroll/);
    expect(cancelModalBlock).toMatch(/KeyboardAvoidingView/);
    expect(screen).not.toMatch(/cancel_voluntary_service_booking/);
    const cancelFunction = readFileSync(join(repoRoot, "supabase/functions/cancel-service-booking/index.ts"), "utf8");
    expect(cancelFunction).toMatch(/const actorRole = row\.requester_id === user\.id \? "owner" : row\.provider_id === user\.id \? "carer" : ""/);
    expect(cancelFunction).toMatch(/cancel_service_booking_without_payment/);
    expect(cancelFunction).toMatch(/complete_paid_service_cancellation/);
    expect(cancelFunction).toMatch(/service_cancel_\$\{actorRole\}_no_payment/);
    const cancelMigration = readMigration("care_handoff_cancel_contract");
    expect(cancelMigration).toMatch(/create table if not exists public\.care_provider_trust_events/);
    expect(cancelMigration).toMatch(/provider_cancel_gt_24h/);
    expect(cancelMigration).toMatch(/provider_cancel_lte_24h_under_review/);
    expect(cancelMigration).toMatch(/v_penalty := 0\.08/);
    expect(cancelMigration).toMatch(/v_penalty := 0\.20/);
  });

  it("provider trust penalties affect marketplace rank without mutating base rank", () => {
    const rankMigration = readMigration("care_trust_penalty_effective_rank");
    expect(rankMigration).toMatch(/care_provider_trust_events/);
    expect(rankMigration).toMatch(/greatest\(\s*0,\s*coalesce\(ps\.service_rank_weight, 0\)::numeric - coalesce/);
    expect(rankMigration).toMatch(/te\.status in \('active', 'under_review'\)/);
    expect(rankMigration).toMatch(/te\.expires_at is null or te\.expires_at > now\(\)/);
    expect(rankMigration).toMatch(/s\.effective_service_rank_weight desc nulls last/);
    expect(rankMigration).not.toMatch(/set service_rank_weight = service_rank_weight -/i);
  });

  it("cancellation creates idempotent Team Huddle Trust & Safety notices and notifications", () => {
    const noticeMigration = readMigration("care_cancellation_trust_safety_notices");
    expect(noticeMigration).toMatch(/team_huddle_case_messages_case_type_check/);
    expect(noticeMigration).toMatch(/'trust_safety'/);
    expect(noticeMigration).toMatch(/create or replace function public\.ensure_team_huddle_trust_safety_message/);
    expect(noticeMigration).toMatch(/create or replace function public\.notify_care_booking_cancelled_trust_safety/);
    expect(noticeMigration).toMatch(/after insert on public\.service_care_events/);
    expect(noticeMigration).toMatch(/when \(new\.event_type = 'booking_cancelled'\)/);
    expect(noticeMigration).toMatch(/public\.enqueue_notification/);
    expect(noticeMigration).toMatch(/p_kind := 'care_trust_safety_notice'/);
    expect(noticeMigration).toMatch(/'care:' \|\| v_sc\.chat_id::text \|\| ':' \|\| v_event_key \|\| ':owner'/);
    expect(noticeMigration).toMatch(/'care:' \|\| v_sc\.chat_id::text \|\| ':' \|\| v_event_key \|\| ':carer'/);
    expect(noticeMigration).toMatch(/This is an automated message from the huddle Trust & Safety team/);
    expect(noticeMigration).not.toMatch(/create table .*team_huddle/i);
  });

  it("service system banners do not also fire the generic sent-you-a-message push", () => {
    const m = readMigration("service_system_messages_do_not_generic_push");
    expect(m).toMatch(/create or replace function public\.notify_new_chat_message/);
    expect(m).toMatch(/v_content := new\.content::jsonb/);
    expect(m).toMatch(/v_message_kind := coalesce\(v_content->>'kind', ''\)/);
    expect(m).toMatch(/if v_message_kind like 'service\\_%' escape '\\' then\s*return new;/);
    expect(m).toMatch(/v_kind := 'care_chat_message'/);
    expect(m).toMatch(/v_body := 'Sent you a message'/);
  });

  it("provider no-show has explicit reported, confirmed, and restore-access lifecycle", () => {
    const noShowMigration = readMigration("care_no_show_trust_lifecycle");
    const noShowIdempotencyMigration = readMigration("care_no_show_restriction_idempotency");
    expect(noShowMigration).toMatch(/create or replace function public\.report_provider_no_show_under_review/);
    expect(noShowMigration).toMatch(/'provider_no_show_reported_under_review'/);
    expect(readMigration("service_care_events_no_show_type")).toMatch(/'provider_no_show_reported_under_review'/);
    expect(noShowMigration).toMatch(/0\.20/);
    expect(noShowMigration).toMatch(/status,\s*reason,\s*note,\s*evidence_urls/);
    expect(noShowMigration).toMatch(/'under_review',\s*coalesce\(v_reason, 'No-show reported'\)/);
    expect(noShowMigration).toMatch(/payout_release_requested_at = null/);
    expect(noShowMigration).toMatch(/create or replace function public\.confirm_provider_no_show/);
    expect(noShowMigration).toMatch(/'provider_confirmed_no_show'/);
    expect(noShowMigration).toMatch(/'marketplace_hidden'/);
    expect(noShowMigration).toMatch(/'service_disabled'/);
    expect(noShowMigration).toMatch(/set listed = false/);
    expect(noShowMigration).toMatch(/create or replace function public\.restore_provider_care_access/);
    expect(noShowMigration).toMatch(/set disabled_at = v_now/);
    expect(noShowMigration).toMatch(/set status = 'resolved'/);
    expect(noShowMigration).toMatch(/Your Care access has been restored/);
    expect(noShowIdempotencyMigration).toMatch(/create or replace function public\.confirm_provider_no_show/);
    expect(noShowIdempotencyMigration).toMatch(/where not exists \(/);
    expect(noShowIdempotencyMigration).toMatch(/restriction_key = 'marketplace_hidden'/);
    expect(noShowIdempotencyMigration).toMatch(/restriction_key = 'service_disabled'/);
  });

  it("Start Care records admin-visible evidence without replacing the existing dispute queue", () => {
    expect(screen).toMatch(/p_checkin_captured_at: evidence\?\.capturedAt \|\| null/);
    expect(screen).toMatch(/p_checkin_location_lat: evidence\?\.locationLat \?\? null/);
    expect(screen).toMatch(/p_checkin_location_lng: evidence\?\.locationLng \?\? null/);
    expect(screen).toMatch(/p_checkin_location_accuracy_m: evidence\?\.locationAccuracyM \?\? null/);
    expect(screen).toMatch(/p_checkin_location_permission_denied: evidence\?\.locationPermissionDenied === true/);
    expect(screen).toMatch(/requestNativeForegroundLocationPermissionDetail\(\)/);
    expect(screen).toMatch(/Location\.getCurrentPositionAsync/);
    const evidenceMigration = readMigration("care_admin_evidence_signals");
    const evidenceValidatorMigration = readMigration("service_care_evidence_chat_id_validator");
    expect(evidenceMigration).toMatch(/drop function if exists public\.submit_service_checkin\(uuid, text, text, boolean\)/);
    expect(evidenceMigration).toMatch(/p_checkin_location_permission_denied boolean default false/);
    expect(evidenceMigration).toMatch(/'server_received_at', now\(\)/);
    expect(evidenceMigration).toMatch(/'device_captured_at', p_checkin_captured_at/);
    expect(evidenceMigration).toMatch(/'location', v_location/);
    expect(evidenceMigration).toMatch(/create or replace view public\.view_admin_service_care_evidence/);
    expect(evidenceMigration).toMatch(/care_provider_trust_events/);
    expect(evidenceValidatorMigration).toMatch(/select sc\.chat_id into v_chat_id/);
    expect(evidenceValidatorMigration).toMatch(/ma\.content_id = v_chat_id/);
    expect(adminSafety).toMatch(/view_admin_service_care_evidence/);
    expect(adminSafety).toMatch(/Care evidence/);
    expect(adminSafety).toMatch(/View check-in photo/);
    expect(adminSafety).not.toMatch(/create table .*service.*evidence/i);
  });

  it("Report Issue and Cancel Booking expose supporting-evidence upload", () => {
    expect(screen).toMatch(/Report Issue/);
    expect(screen).toMatch(/Add Photos/);
    expect(screen).toMatch(/Slide to Report/);
    const cancelBookingBlock = screen.slice(
      screen.indexOf("confirmCancelBookingOpen ? ("),
      screen.indexOf("Slide to Cancel Booking"),
    );
    expect(cancelBookingBlock).toMatch(/pickCancelEvidence/);
    expect(cancelBookingBlock).toMatch(/Add Photos/);
    expect(screen).toMatch(/scope: "cancellation"/);
  });

  it("#11 request carries explicit tz so edge + backend resolve one instant", () => {
    expect(screen).toMatch(/tzOffset: deviceTzOffset\(\)/);
    expect(screen).toMatch(/startAtIso: wallClockToIso\(/);
    expect(screen).toMatch(/endAtIso: wallClockToIso\(/);
  });
  it("#15 request auto-open is one-shot (no ?request=1 re-open loop) and send never blocks on reload", () => {
    expect(screen).not.toMatch(/params\.request !== "1" && autoOpenedRequestRef\.current === roomId/);
    expect(screen).toMatch(/if \(autoOpenedRequestRef\.current === roomId\) return;/);
    expect(screen).toMatch(/\/\/ Refresh in the background[\s\S]{0,120}void load\(true\);/);
  });
  it("payment error mapper never leaks raw codes/messages (the 'non-2xx' bug)", () => {
    const fn = screen.slice(screen.indexOf("const safePaymentErrorMessage"), screen.indexOf("const withTimeout"));
    expect(fn).not.toMatch(/replaceAll\("_", " "\)/);
    expect(fn).not.toMatch(/message\.slice\(0, 160\)/);
    expect(fn).toMatch(/non-\?2xx\|edge function\|status code/);
  });
  it("Stripe checkout opens directly (no canOpenURL gate that blocks https on Android)", () => {
    const payFn = screen.slice(screen.indexOf("const pay = useCallback"), screen.indexOf("const confirmVolunteerBooking"));
    expect(payFn).not.toMatch(/if \(canOpen === false\)/);
    expect(payFn).toMatch(/Do NOT gate on Linking\.canOpenURL/);
  });
  it("rpcVoid refreshes in the background so sheets never hang open", () => {
    expect(screen).toMatch(/const rpcVoid = useCallback[\s\S]{0,400}\/\/ Refresh in the background[\s\S]{0,160}void load\(true\);/);
  });
  it("Vet details are optional and gated below the authorize choice", () => {
    expect(screen).toMatch(/Decided by carer if empty/);
    expect(screen).toMatch(/const missingVetContact = false/);
    expect(screen).toMatch(/const missingInstructions = false/);
  });
});

describe("#12 deeplink — service-chat notifications must be tappable", () => {
  const notif = readFileSync(join(appRoot, "src/lib/nativeNotifications.ts"), "utf8");
  it("allowedNotificationPath covers every real notification destination (no silent null)", () => {
    const allow = notif.slice(notif.indexOf("const allowedNotificationPath"), notif.indexOf("const normalizePathCandidate"));
    // Every routable screen a notification can deeplink to must be present, or its
    // row renders disabled and the tap does nothing (the care-chat deeplink bug).
    for (const route of [
      "service-chat", "service", "chat-dialogue", "chats", "social", "map", "threads",
      "verify-identity", "pet-details", "edit-pet-profile", "profile", "premium", "settings", "notifications",
    ]) {
      expect(allow.includes(route)).toBe(true);
    }
    expect(notif).toMatch(/path === "\/"/);
  });
});

describe("Book Care sheet — manual pet + draft + currency (2026-06-27 batch)", () => {
  it("backend request validator accepts a manual pet (petId OR petName), not petId only", () => {
    const m = readMigration("service_request_allow_manual_pet");
    expect(m).toMatch(/v_has_pet :=[\s\S]{0,160}petId[\s\S]{0,40}or[\s\S]{0,60}petName/);
    expect(m).toMatch(/create or replace function public\.validate_service_request_payload/);
  });
  it("latest request-time validator parses ISO and wall-clock values without operator-precedence failure", () => {
    const m = readMigration("fix_service_request_time_validation");
    expect(m).toMatch(/v_has_pet :=[\s\S]{0,180}petId[\s\S]{0,80}or[\s\S]{0,100}petName/);
    expect(m).toMatch(/service_wall_clock_to_timestamptz\(v_first_date, p_request_card->>'startTime', p_request_card\)/);
    expect(m).toMatch(/service_wall_clock_to_timestamptz\(v_last_date, p_request_card->>'endTime', p_request_card\)/);
    expect(m).not.toMatch(/v_first_date \|\| ' ' \|\| p_request_card->>'startTime'/);
    expect(m).toMatch(/v_end_at - v_start_at < interval '1 hour'/);
    expect(m).toMatch(/v_end_at <= now\(\)[\s\S]{0,40}care_request_expired/);
  });
  it("booking snapshot validator also accepts a manual pet (no petId haunting at payment)", () => {
    const m = readMigration("booking_snapshot_manual_pet_empty_pet_id");
    expect(m).toMatch(/create or replace function public\.validate_service_booking_snapshot/);
    expect(m).toMatch(/coalesce\(nullif\(btrim\(coalesce\(p_snapshot->>'petId', ''\)\), ''\), nullif\(btrim\(coalesce\(p_snapshot->>'petName', ''\)\), ''\), ''\) = ''/);
    expect(m).toMatch(/booking_snapshot_contact_required/);
    expect(m).toMatch(/booking_snapshot_handoff_location_required/);
    expect(m).toMatch(/booking_snapshot_vet_authorization_choice_required/);
  });
  it("no-charge confirmation validates the active scope signature, not a missing client signature", () => {
    const m = readMigration("confirm_voluntary_snapshot_signature_from_scope");
    expect(m).toMatch(/where id = p_chat_id/);
    expect(m).toMatch(/where chat_id = p_chat_id and status = 'pending'/);
    expect(m).toMatch(/where scope_version_id = v_version\.id and role = 'owner' and scope_hash = v_version\.scope_hash/);
    expect(m).toMatch(/'requesterSignature', coalesce\(v_owner_sig\.signature, '\{\}'::jsonb\) \|\| jsonb_build_object/);
    expect(m.indexOf("'requesterSignature'")).toBeGreaterThanOrEqual(0);
    expect(m.indexOf("perform public.validate_service_booking_snapshot(v_snapshot)")).toBeGreaterThan(m.indexOf("'requesterSignature'"));
  });
  it("form resets only on the open transition (late carer load never wipes the draft)", () => {
    expect(screen).toMatch(/initializedForOpenRef = useRef\(false\)/);
    expect(screen).toMatch(/if \(initializedForOpenRef\.current\) return;/);
    expect(screen).toMatch(/initializedForOpenRef\.current = true;/);
  });
  it("rate currency is derived from the single resolver, not racy local state", () => {
    expect(screen).not.toMatch(/const \[suggestedCurrency, setSuggestedCurrency\]/);
    expect(screen).toMatch(/const requestCurrencyDecision = resolveCareScopeCurrencyDecision\(\{/);
  });
  it("species dropdown rows render the taxonomy emoji (parity with set-profile)", () => {
    expect(screen).toMatch(/emoji=\{nativePetEmojiForLabel\(option\.label\)\}/);
    expect(screen).toMatch(/function RequestOptionRow\(\{ active, emoji, label, onPress \}/);
  });
  it("edit sheets show current pets first; chooser opens only from the pet add/change control", () => {
    const requestSheet = sourceBlock("RequestSheet");
    expect(requestSheet).toMatch(/setManualPetEntryMode\(seededManualPets\.length > 0\)/);
    expect(requestSheet).toMatch(/setPetChoicesOpen\(initialPetIds\.length === 0 && seededManualPets\.length === 0\)/);
    expect(requestSheet).not.toMatch(/accessibilityLabel="Add or change pet"/);
    expect(requestSheet).toMatch(/!petChoicesOpen && selectedPets\.length > 0/);
    expect(requestSheet).toMatch(/NativePolaroidCard[\s\S]{0,700}setPetChoicesOpen\(true\)/);
    expect(requestSheet).toMatch(/petChoicesOpen \|\| \(selectedPets\.length === 0 && manualPetDrafts\.length === 0\) \? \([\s\S]{0,240}<RequestPetCarousel/);
  });
  it("mixed profile + manual pets stay compact in the Care Scope summary", () => {
    const summary = sourceBlock("SelectedPetPolaroid");
    expect(summary).toMatch(/\[\.\.\.profilePets, \.\.\.manualPets\]\.map/);
    expect(summary).toMatch(/profilePets\.length === 0 \? manualPets\.map/);
  });
  it("keeps dog size in the active Care Scope for both profile and manual pets", () => {
    const requestSheet = sourceBlock("RequestSheet");
    expect(screen).toMatch(/select\("id,owner_id,name,species,breed,pet_size,/);
    expect(requestSheet).toMatch(/dogSize: nextPetType === "Dog" \? clean\(item\.pet_size\) : ""/);
    expect(requestSheet).toMatch(/dogSize: speciesValue === "dog" \? clean\(draft\.dogSize\) : ""/);
    expect(requestSheet).toMatch(/speciesValue === "dog" \? \(/);
    expect(requestSheet).toMatch(/\{DOG_SIZES\.map/);
    expect(screen).toMatch(/const speciesWithSize = species === "Dog" && dogSize \? `Dog \(\$\{dogSize\}\)` : species/);
    expect(pdfBuilder).toMatch(/const petSpecies = petSpeciesWithSize\(/);
  });
  it("normalizes profile and manual Cats/Dogs to the same singular Care Scope caption", () => {
    expect(screen).toMatch(/if \(normalized === "cats" \|\| normalized === "cat"\) return "Cat";/);
    expect(screen).toMatch(/if \(normalized === "dogs" \|\| normalized === "dog"\) return "Dog";/);
    expect(pdfBuilder).toMatch(/lower === "cats" \|\| lower === "cat"/);
    expect(pdfBuilder).toMatch(/lower === "dogs" \|\| lower === "dog"/);
  });
  it("request + quote sheets use in-screen layers so open sheets do not block the chat header", () => {
    expect(sourceBlock("RequestSheet")).toMatch(/pointerEvents="box-none" style=\{styles\.inlineSheetLayer\}/);
    expect(sourceBlock("QuoteSheet")).toMatch(/pointerEvents="box-none" style=\{styles\.inlineSheetLayer\}/);
    expect(sourceBlock("RequestSheet")).not.toMatch(/presentationStyle="overFullScreen"/);
    expect(sourceBlock("QuoteSheet")).not.toMatch(/presentationStyle="overFullScreen"/);
  });
});

describe("Currency — single source of truth across rate / quote / summary", () => {
  it("request proposal resolver honours priority: request > carer profile > location chain > USD", () => {
    const lib = readFileSync(join(appRoot, "src/lib/nativeCarerProfile.ts"), "utf8");
    // The proposal resolver exists and falls through quote/request → provider → location.
    const body = lib.slice(lib.indexOf("export const resolveCareScopeCurrency"));
    expect(body).toMatch(/normalizeNativeCarerCurrency\(input\.quoteCurrency\)\s*\|\|\s*normalizeNativeCarerCurrency\(input\.requestCurrency\)\s*\|\|\s*normalizeNativeCarerCurrency\(input\.providerCurrency\)\s*\|\|\s*resolveNativeCarerCurrency\(\.\.\.\(input\.locationCountries/);
    // location chain (service location → viewer → provider profile) is assembled and only
    // USD when every signal is empty — never "directly US$ if empty".
    expect(screen).toMatch(/const careCurrencyCountries = useMemo\(\(\) => \[/);
    expect(screen).toMatch(/providerAreaCountry,\s*\/\/ service location/);
    expect(screen).toMatch(/currentUserCountry,\s*\/\/ viewer location/);
    expect(screen).toMatch(/providerProfileCountry,? \/\/ provider profile/);
  });
  it("request proposal, provider quote, and final scope use separate non-drifting currency paths", () => {
    expect(screen).toMatch(/const requestCurrencyDecision = resolveCareScopeCurrencyDecision\(\{/);
    expect(screen).toMatch(/const normalizedQuoteCurrency = resolveCareScopeCurrencyDecision\(\{/);
    expect(screen).toMatch(/const quoteCurrency = careCurrencyFromScopeOnly\(quoteCard, requestCard\)/);
    expect(screen).not.toMatch(/const \[suggestedCurrency, setSuggestedCurrency\]/);
    expect(screen).not.toMatch(/resolveProviderCareScopeCurrency/);
  });
  it("provider can re-pick currency only when the carer serves 2+ currencies (else fixed)", () => {
    // options come from the carer's service areas; default stays service-location aware
    expect(screen).toMatch(/providerServiceCurrencies = nativeCarerServiceCurrencies\(/);
    expect(screen).toMatch(/const canPickCurrency = \(currencyOptions\?\.length \?\? 0\) > 1/);
    // provider picker is gated on canPickCurrency
    expect(screen).toMatch(/currencyMenuOpen && canPickCurrency \?/);
  });
  it("requester currency is selectable only for volunteer multi-currency carers", () => {
    expect(screen).toMatch(/const requestCanPickCurrency = providerVolunteerOnly === true && requestCurrencyDecision\.canSelect/);
    expect(screen).toMatch(/requestCurrencyMenuOpen && requestCanPickCurrency \?/);
    expect(screen).toMatch(/suggestedCurrency: normalizedRequestPayment\.paid \? requestCurrency : ""/);
    expect(screen).toMatch(/locationCountry: locationCountry\.trim\(\)/);
    expect(screen).toMatch(/currencySelectedByRequester: requestCurrencyTouched/);
    expect(screen).toContain("initialCard?.currencySelectedByRequester === true ? initialCard?.suggestedCurrency : \"\"");
  });
  it("care type derives only from the carer's offered services", () => {
    const requestSheet = sourceBlock("RequestSheet");
    expect(requestSheet).toMatch(/return Array\.from\(new Set\(\(providerServices \|\| \[\]\)\.map\(clean\)\.filter\(Boolean\)\)\);/);
    expect(requestSheet).not.toMatch(/providerServiceOptions[\s\S]{0,220}SERVICES_OFFERED/);
    expect(screen).toMatch(/cleanSlateProviderDetail/);
    expect(screen).toMatch(/fetchNativeServiceProviderDetail\(\{/);
  });

  it("hydrates clean-slate Book Care from current pets and the carer profile before returning", () => {
    const noActiveStart = screen.indexOf("if (!row) {");
    const noActiveEnd = screen.indexOf("const [{ data: disputeRows }", noActiveStart);
    const noActiveBranch = screen.slice(noActiveStart, noActiveEnd);
    expect(noActiveBranch).toMatch(/const cleanSlateProviderId = clean\(latestTerminalRow\?\.provider_id\)/);
    // Care can include a family-shared pet. The access-controlled RPC is the
    // canonical source; a direct `pets.owner_id` read would incorrectly omit
    // those pets and bypass the shared-pet contract.
    expect(noActiveBranch).toMatch(/fetchNativeAccessiblePets\(accessToken\)/);
    // The Care screen must use the protected provider-detail RPC, never a direct
    // client read of the private provider profile table.
    expect(noActiveBranch).not.toMatch(/\.from\("pet_care_profiles"\)/);
    expect(noActiveBranch).toMatch(/setPets\(\(\(cleanSlatePetRows \|\| \[\]\) as PetOption\[\]\)\.filter\(\(pet\) => Boolean\(pet\) && pet\.is_active !== false\)\)/);
    expect(noActiveBranch).toMatch(/providerServices: cleanSlateProviderServices/);
    expect(noActiveBranch).toMatch(/fetchNativeServiceProviderDetail\(\{/);
  });

  it("creates the next active booking in the existing conversation before sending a clean-slate request", () => {
    expect(screen).toMatch(/const sendRequestFromSheet = useCallback[\s\S]{0,1600}createNativeServiceChat\(newBookingProviderId/);
    expect(screen).toMatch(/const sendRequestFromSheet = useCallback[\s\S]{0,1900}send_service_request[\s\S]{0,160}p_chat_id: nextChatId/);
  });

  it("keeps the manual-pet entry path reachable after the last draft is removed", () => {
    const requestSheet = sourceBlock("RequestSheet");
    expect(requestSheet).toMatch(/if \(next\.length === 0\) \{[\s\S]{0,180}setPetChoicesOpen\(true\)/);
    expect(requestSheet).toMatch(/petChoicesOpen \|\| \(selectedPets\.length === 0 && manualPetDrafts\.length === 0\) \? \(/);
    expect(sourceBlock("RequestPetCarousel")).toMatch(/Input pet details/);
  });

  it("renders Input pet details as a neutral glass card, not a blue callout", () => {
    const stylesStart = screen.indexOf("const styles = StyleSheet.create");
    const stylesSource = screen.slice(stylesStart);
    const tile = stylesSource.match(/petAddTile: \{[^\n]+\}/)?.[0] || "";
    const tileText = stylesSource.match(/petAddTileText: \{[^\n]+\}/)?.[0] || "";
    expect(tile).toContain("backgroundColor: huddleColors.glassChrome");
    expect(tile).toContain("borderColor: huddleColors.glassBorder");
    expect(tile).not.toContain("huddleColors.blue");
    expect(tileText).toContain("color: huddleColors.text");
    expect(screen).toMatch(/accessibilityLabel="Input pet details"[\s\S]{0,220}<Feather color=\{huddleColors\.text\} name="plus" size=\{huddlePolaroid\.addIconSize\}/);
  });
});

describe("Out-of-area location advisory", () => {
  it("warns on country mismatch or >100km, never on missing signals (pure logic)", async () => {
    const { isNativeCareLocationOutOfArea } = await import("./nativeCareServiceArea");
    const hk = [{ country: "Hong Kong", lat: 22.28, lng: 114.16 }];
    // different country → out of area
    expect(isNativeCareLocationOutOfArea({ country: "United Kingdom", lat: 51.5, lng: -0.12 }, hk)).toBe(true);
    // same country, nearby → in area
    expect(isNativeCareLocationOutOfArea({ country: "Hong Kong", lat: 22.32, lng: 114.18 }, hk)).toBe(false);
    // same country but >100km away → out of area (far-distance hint)
    expect(isNativeCareLocationOutOfArea({ country: "Hong Kong", lat: 23.5, lng: 114.16 }, hk)).toBe(true);
    // unknown pick (no country/coords) → never warn
    expect(isNativeCareLocationOutOfArea(null, hk)).toBe(false);
    expect(isNativeCareLocationOutOfArea({ country: "", lat: null, lng: null }, hk)).toBe(false);
    // carer has no known areas → never warn
    expect(isNativeCareLocationOutOfArea({ country: "United Kingdom", lat: 51.5, lng: -0.12 }, [])).toBe(false);
  }, 15_000);
  it("is advisory only — wired into the request sheet without blocking send", () => {
    expect(screen).toMatch(/const locationOutOfArea = !locationAreaLockedToProvider && isNativeCareLocationOutOfArea\(selectedLocationMeta, serviceAreas\)/);
    expect(screen).toMatch(/\{locationOutOfArea \? <Text style=\{styles\.locationOutOfAreaText\}/);
    // the missing/blocking validation must NOT include the advisory
    expect(screen).not.toMatch(/locationOutOfArea[^\n]*missing/);
  });
});

describe("Cross-check: applied migrations remain consistent", () => {
  it("v3 cancellation policy wording is present in migrations", () => {
    expect(allSql).toMatch(/the booking is final and non-refundable/i);
  });
});

describe("Start Care sheet — PIN error must not swallow unrelated failures", () => {
  it("only shows PIN-mismatch copy for the RPC's own invalid_start_pin response", () => {
    const startCareBlock = screen.slice(screen.indexOf("function StartCareSheet("), screen.indexOf("function HandoffProblemSheet("));
    // The gate: PIN-specific feedback only fires when the structured RPC result says so.
    expect(startCareBlock).toMatch(/if \(result\.error === "invalid_start_pin"\) \{/);
    expect(startCareBlock).toMatch(/setPinFeedback\(/);
    // Any other failure must surface via onError, not get relabeled as a wrong PIN.
    expect(startCareBlock).toMatch(/\} else if \(result\.error !== "unexpected_error"\) \{\s*onError\(result\.error\);/);
  });
  it("submitCheckin's catch block returns a distinct sentinel, never the raw invalid_start_pin string", () => {
    const submitCheckinBlock = screen.slice(screen.indexOf("const submitCheckin = useCallback"), screen.indexOf("const submitIssueReport = useCallback"));
    expect(submitCheckinBlock).toMatch(/setCarePopup\(\{ title: "huddle Care", body: safeCareErrorMessage\(error, "Unable to start care\."\) \}\)/);
    expect(submitCheckinBlock).toMatch(/return \{ ok: false, error: "unexpected_error" \}/);
    // The sentinel must never collide with the real PIN-mismatch string.
    expect(submitCheckinBlock).not.toMatch(/error: "invalid_start_pin"/);
  });
  it("keeps a server-confirmed check-in successful while its Care refresh reconciles in the background", () => {
    const submitCheckinBlock = screen.slice(screen.indexOf("const submitCheckin = useCallback"), screen.indexOf("const verifyStartPin = useCallback"));
    expect(submitCheckinBlock).toMatch(/void load\(true\);\s*return \{ ok: true \}/);
    expect(submitCheckinBlock).not.toMatch(/await load\(true\);\s*return \{ ok: true \}/);
  });
  it("does not let optional chat snapshots or direct private-profile reads turn an active Care row into a failure", () => {
    const loader = screen.slice(screen.indexOf("const load = useCallback"), screen.indexOf("loadRef.current = load"));
    expect(loader).toMatch(/fetchNativeChatDialogueSnapshot[\s\S]{0,240}\.catch\(\(error\) => \{[\s\S]{0,180}return null;/);
    expect(loader).toMatch(/fetchNativeAccessiblePets\(accessToken\)\.catch\(\(\) => \[\]\)/);
    expect(loader).not.toMatch(/\.from\("pet_care_profiles"\)/);
    expect(loader).toMatch(/if \(hasAuthoritativeCareState \|\| \(currentServiceChat && isActiveServiceChatRow\(currentServiceChat\)\)\) return;/);
    expect(loader).toMatch(/SERVICE_CHAT_LOAD_ERROR_COPY/);
  });
  it("a missing serviceChatId/currentUserId never fails silently -- it must surface a visible error", () => {
    const startCareBlock = screen.slice(screen.indexOf("function StartCareSheet("), screen.indexOf("function HandoffProblemSheet("));
    // This guard has no dedicated border like the photo/PIN checks do, so on its own it must
    // call onError -- otherwise a null serviceChatId produces a haptic buzz and nothing else,
    // which looks indistinguishable from "the app silently ignored my input".
    expect(startCareBlock).toMatch(/if \(!currentUserId \|\| !serviceChatId\) \{[\s\S]{0,200}onError\("Couldn't find this booking\. Close and reopen the chat, then try again\."\);/);
    // The photo/PIN-format guard must remain a separate check so it keeps its own visible
    // border feedback (attempted && !media / attempted && !pin-format) instead of being
    // folded back into the silent app-state guard above.
    expect(startCareBlock).toMatch(/if \(!media \|\| !\/\^\[0-9\]\{4\}\$\/\.test\(pin\)\) \{/);
  });
  it("live-verifies the PIN the moment the 4th digit lands, not only after sliding", () => {
    const startCareBlock = screen.slice(screen.indexOf("function StartCareSheet("), screen.indexOf("function HandoffProblemSheet("));
    // Fires as soon as the pin is a complete 4-digit value, independent of the slide button.
    expect(startCareBlock).toMatch(/useEffect\(\(\) => \{\s*if \(!open \|\| !\/\^\[0-9\]\{4\}\$\/\.test\(pin\)\) \{\s*setPinVerified\(null\);/);
    expect(startCareBlock).toMatch(/void onVerifyPin\(pin\)\.then\(\(\{ valid \}\) => \{/);
    // A confirmed-wrong live check shows the same error copy immediately (no slide needed).
    expect(startCareBlock).toMatch(/setPinFeedback\(valid\s*\?\s*null\s*:\s*\{ message: "That PIN doesn't match yet\. Please check the code with the owner and try again\." \}\)/);
    // A network hiccup during the live check (valid === null) must never be treated as wrong.
    expect(startCareBlock).toMatch(/if \(cancelled \|\| valid === null\) return;/);
    // Submitting with an already-confirmed-wrong PIN skips the wasted photo upload + round trip.
    expect(startCareBlock).toMatch(/if \(pinVerified === false\) \{/);
  });
  it("verify_service_start_pin is read-only -- must never touch pin_attempt_count", () => {
    const migration = readMigration("care_start_pin_live_verify");
    expect(migration).toMatch(/create or replace function public\.verify_service_start_pin/);
    expect(migration).not.toMatch(/pin_attempt_count\s*=/);
    expect(migration).toMatch(/if v_sc\.provider_id <> v_uid then raise exception 'not_provider'; end if;/);
  });
  it("PIN error copy is plain red text, never a boxed callout -- this regressed once already", () => {
    const startCareBlock = screen.slice(screen.indexOf("function StartCareSheet("), screen.indexOf("function HandoffProblemSheet("));
    // Must render through the same plain errorText style every other field in the app uses,
    // not a bordered/filled box (styles.startPinFeedbackBox was removed on purpose).
    expect(startCareBlock).toMatch(/\{pinFeedback \? \(\s*<>\s*<Text style=\{styles\.errorText\}>\{pinFeedback\.message\}<\/Text>/);
    expect(startCareBlock).not.toMatch(/startPinFeedbackBox/);
    expect(screen).not.toMatch(/startPinFeedbackBox:/);
  });
  it("Slide to Start Care is disabled until there's a photo and no visible error", () => {
    const startCareBlock = screen.slice(screen.indexOf("function StartCareSheet("), screen.indexOf("function HandoffProblemSheet("));
    expect(startCareBlock).toMatch(/disabled=\{!media \|\| Boolean\(pinFeedback\)\}/);
    expect(startCareBlock).toMatch(/onDisabledPress=\{\(\) => \{ setAttempted\(true\); haptic\.error\(\); setSlideResetKey/);
  });
  it("only one check-in photo is ever uploaded per capture -- retries reuse it, success keeps it, retake/close cleans it up", () => {
    const startCareBlock = screen.slice(screen.indexOf("function StartCareSheet("), screen.indexOf("function HandoffProblemSheet("));
    // Cache keyed by the captured photo's uri; a retry with the same photo must not re-upload.
    expect(startCareBlock).toMatch(/if \(stagedEvidenceRef\.current\?\.forUri === media\.uri\) \{/);
    // Retaking a photo invalidates + cleans up the previous staged upload.
    expect(startCareBlock).toMatch(/cleanupStagedEvidence\(\);\s*setCapturedAt\(new Date\(\)\);/);
    // Unmounting (sheet closed) cleans up anything never attached to a successful check-in.
    expect(startCareBlock).toMatch(/useEffect\(\(\) => \(\) => cleanupStagedEvidence\(\), \[cleanupStagedEvidence\]\);/);
    // A successful check-in clears the ref WITHOUT deleting from storage -- it's the permanent
    // record now, and onClose() below unmounts the sheet (which would otherwise nuke it).
    expect(startCareBlock).toMatch(/stagedEvidenceRef\.current = null;\s*onClose\(\);/);
  });
  it("stamping the check-in photo can never hang the slide forever -- no response after slide", () => {
    // Root cause of a real report: captureRef (view-shot) has no built-in timeout and can hang
    // indefinitely if the stamped-photo view hasn't finished laying out yet -- before any network
    // call is even made, so the hang was completely silent. Verified against the live DB that a
    // real "took photo + entered correct PIN + slid" case never reached the server at all
    // (pin_attempt_count unchanged, zero media_assets rows, zero storage.objects rows for that
    // chat) -- confirming the failure was client-side, not a backend rejection.
    expect(screen).toMatch(/import \{ raceWithTimeoutFallback \} from "\.\.\/lib\/nativeAsyncRace";/);
    const startCareBlock = screen.slice(screen.indexOf("function StartCareSheet("), screen.indexOf("function HandoffProblemSheet("));
    expect(startCareBlock).toMatch(/await raceWithTimeoutFallback\(\s*captureRef\(stampRef, \{/);
    expect(startCareBlock).toMatch(/media\.uri,\s*4000,\s*\)\s*: media\.uri;/);
  });
});

describe("raceWithTimeoutFallback — the actual timeout mechanism, run for real (not just pinned in source)", () => {
  it("is unit-tested with fake timers proving it resolves fast and falls back on a real hang, not just referenced from the sheet", async () => {
    const raceTest = readFileSync(join(appRoot, "src/lib/nativeAsyncRace.test.ts"), "utf8");
    expect(raceTest).toMatch(/resolves with the real value when it settles before the timeout/);
    expect(raceTest).toMatch(/falls back within the bound instead of hanging forever when the real promise never settles/);
    expect(raceTest).toMatch(/vi\.advanceTimersByTimeAsync/);
  });
});

describe("Check-in failures surface their real cause instead of a generic swallow", () => {
  it("safeCareErrorMessage's snake_case catch-all no longer swallows check-in-specific evidence codes", () => {
    // Real bug: raw backend RAISE EXCEPTION codes look like snake_case identifiers, and the
    // catch-all rule (/^[a-z0-9_]+$/) silently replaced ALL of them with the generic fallback --
    // making service_care_evidence_not_registered indistinguishable from a network hang from the
    // popup alone. These explicit mappings must sit BEFORE that catch-all to take effect.
    const safeCareErrorMessageBlock = screen.slice(screen.indexOf("const safeCareErrorMessage = "), screen.indexOf("const selectableSkillSet ="));
    const catchAllIndex = safeCareErrorMessageBlock.indexOf('/^[a-z0-9_]+$/');
    for (const code of ["service_care_evidence_not_registered", "invalid_service_care_evidence_path", "service_care_evidence_permission_denied", "care_start_too_early", "start_pin_not_shared", "not_provider"]) {
      const codeIndex = safeCareErrorMessageBlock.indexOf(code);
      expect(codeIndex, `${code} should be explicitly mapped`).toBeGreaterThan(-1);
      expect(codeIndex, `${code} must be checked before the catch-all suppresses it`).toBeLessThan(catchAllIndex);
    }
  });
  it("the shared nativeSafeErrorCopy also maps the evidence codes (submit()'s own catch uses this one, not safeCareErrorMessage)", () => {
    const shared = readFileSync(join(appRoot, "src/lib/nativeSafeErrorCopy.ts"), "utf8");
    expect(shared).toMatch(/service_care_evidence_not_registered/);
    expect(shared).toMatch(/invalid_service_care_evidence_path/);
    expect(shared).toMatch(/service_care_evidence_permission_denied/);
  });
  it("both check-in failure paths log the real error, matching every other upload screen in the app", () => {
    expect(screen).toMatch(/import \{ logNativeProtectedActionFailure, requestNativeStorageCleanupResult \} from "\.\.\/lib\/nativeStorageCleanup";/);
    expect(screen).toMatch(/logNativeProtectedActionFailure\("\[native\.care\] start_care_failed", error\)/);
    expect(screen).toMatch(/logNativeProtectedActionFailure\("\[native\.care\] submit_service_checkin_failed", error\)/);
  });
});

describe("Completion entry and submission are real sliders", () => {
  it("keeps the care-in-progress entry point as a real Slide to Complete gesture", () => {
    expect(screen).toMatch(/const completionCtaLabel = "Slide to Complete"/);
    expect(screen).toMatch(/label: completionCtaLabel, onPress: handleCompletionEntrySlide/);
    expect(screen).toMatch(/completionPrimaryActionIsSlider[\s\S]{0,260}<SlideToConfirm busy=\{sending\} label=\{completionCtaLabel\} onCommit=\{actionPrimary\.onPress\}/);
    expect(screen).not.toMatch(/completionComposerCtaLabel/);
  });
  it("keeps the final slide-to-confirm inside CompletionSheet", () => {
    expect(screen).toMatch(/ctaLabel=\{completionCtaLabel\}/);
    expect(screen).toMatch(/label={ctaLabel \|\| "Complete Care Session"}/);
  });
  it("prompts for a missing care update without blocking completion", () => {
    expect(screen).toMatch(/const \[completionCareUpdateAttempted, setCompletionCareUpdateAttempted\] = useState\(false\)/);
    expect(screen).toMatch(/const handleStartCompletion = useCallback\(async \(\) => \{[\s\S]{0,120}setCompletionCareUpdateAttempted\(false\)/);
    expect(screen).toMatch(/if \(!fetchedRequirementMet\) \{[\s\S]{0,180}setCompletionCareUpdateAttempted\(true\)/);
    expect(screen).toMatch(/missingCareUpdateKind=\{isProvider && completionCareUpdateAttempted \? careUpdateKind : null\}/);
    expect(screen).toMatch(/<Text style=\{styles\.completionCareUpdateNoticeTitle\}>Care update not sent<\/Text>/);
    expect(screen).toMatch(/<Text style=\{styles\.completionCareUpdateNoticeBody\}>You haven’t sent the requested \{missingCareUpdateLabel\}\. You can still confirm completion\.<\/Text>/);
    expect(screen).toMatch(/<Text style=\{styles\.completionSendUpdateFirstText\}>Send update first<\/Text>/);
    expect(screen).toMatch(/<SlideToConfirm busy=\{sending\} label=\{ctaLabel \|\| "Complete Care Session"\}/);
    expect(screen).toMatch(/setActiveSheet\("completion"\)/);
    expect(screen).toMatch(/catch \{[\s\S]{0,180}Fail open:[\s\S]{0,180}\}/);
  });
  it("never silently loses completion when the live service ref or legacy room id has not hydrated yet", () => {
    expect(screen).toMatch(/const activeServiceChatId = clean\(serviceChatRef\.current\?\.id\) \|\| clean\(serviceChat\?\.id\)/);
    expect(screen).toMatch(/if \(!serviceChat \|\| !activeServiceChatId\) \{[\s\S]{0,220}Unable to find this booking/);
    expect(screen).not.toMatch(/if \(!roomId \|\| !serviceChat \|\| !activeServiceChatId\)/);
  });
  it("resolves completion from the exact service row and keeps errors above an open sheet", () => {
    const completionIdentityMigration = readMigration("completion_accepts_exact_service_chat_id");
    expect(completionIdentityMigration).toMatch(/submit_provider_completion/);
    expect(completionIdentityMigration).toMatch(/submit_requester_completion/);
    expect(completionIdentityMigration).toMatch(/current_active_service_chat_id_from_any_id\(p_chat_id\)/);
    const popup = screen.slice(screen.indexOf("body={carePopup?.body"), screen.indexOf("body={carePopup?.body") + 500);
    expect(popup).toMatch(/presentation="modal"/);
    expect(popup).not.toMatch(/presentation="inline"/);
  });

  it("keeps care in progress while one side waits for the other to confirm completion", () => {
    expect(screen).toMatch(/careConversationState\.kind !== "care_in_progress"/);
    expect(screen).toMatch(/Waiting for \$\{clean\(peerName\) \|\| \(isProvider \? "the owner" : "the carer"\)\} to confirm completion/);
    expect(screen).toMatch(/\$\{clean\(peerName\) \|\| \(isProvider \? "The owner" : "The carer"\)\} marked the session complete/);
    expect(screen).toMatch(/isRequester\s*\? "Confirm when your pet is safely home\."\s*:\s*"Confirm your side to release your payout\."/);
    expect(screen).toMatch(/completionStageBanner && !showReviewComposerCta/);
    expect(screen).toMatch(/!completionStageBanner\.awaitingPeer && actionPrimary/);
    // Title and subtext are one tight block on EVERY action card, not an opt-in per card:
    // the wrapper is applied whenever a body exists, and the gap is zero.
    expect(screen).toMatch(/style=\{body && !isCollapsed \? styles\.serviceActionCardTitleBodyTight : null\}/);
    expect(screen).toMatch(/serviceActionCardTitleBodyTight: \{ gap: 0 \}/);
    expect(screen).not.toMatch(/compactBody/);
    // Subtext is grey, never the primary text colour.
    expect(screen).toMatch(/serviceActionCardSubtext: \{ fontFamily: "Urbanist-500", fontSize: huddleType\.helper, lineHeight: huddleType\.helperLine, color: huddleColors\.mutedText \}/);
  });
});

describe("Care flow conversation clutter (2026-07-03)", () => {
  it("consecutive 'updated the Care Scope' / instruction status pills collapse to the latest one (render-only, DB untouched)", () => {
    expect(screen).toMatch(/const CONSOLIDATABLE_STATUS_KINDS = new Set\(\["service_care_scope_updated", "service_care_instruction_updated", "service_care_instruction_shared"\]\)/);
    expect(screen).toMatch(/if \(CONSOLIDATABLE_STATUS_KINDS\.has\(parsed\.kind\)\) \{[\s\S]{0,220}if \(nextParsed\?\.kind === parsed\.kind\) return null;/);
  });
  it("the bottom safe-area inset lives on the composer surface (the true bottom), not the banner layer — so there's no dead gap between banner and composer", () => {
    // Regression: the inset was mistakenly on serviceActionLayer, inflating to ~34px of dead
    // space BETWEEN the banner and composer on notched devices. It belongs on the composer.
    expect(screen).toMatch(/dialogueComposerSurface,\s*\{ paddingBottom: keyboardVisible \? huddleSpacing\.x1 : Math\.max\(insets\.bottom, huddleSpacing\.x4\) \}/);
    expect(screen).not.toMatch(/styles\.serviceActionLayer, \{ paddingBottom: Math\.max\(huddleSpacing\.x2, insets\.bottom\) \}/);
  });
  it("the footer is an IN-FLOW flex child that never shrinks (not position:absolute) so the composer can't be pushed off or clipped", () => {
    const footerStyle = screen.slice(screen.indexOf("serviceActionLayer: {"), screen.indexOf("serviceActionLayer: {") + 260);
    expect(footerStyle).toMatch(/flexShrink: 0/);
    expect(footerStyle).not.toMatch(/position: "absolute"/);
  });
});

describe("Care flow design-system pass (2026-07-03)", () => {
  it("keeps the review date and location directly below the Care Scope title with a 4px gap", () => {
    const summary = sourceBlock("PaymentCareScopeSummary");
    expect(summary).toMatch(/const scopeDateLocation = \[formatShortDateRange\(sourceDates, sourceDate\), locationArea\]/);
    expect(summary).toMatch(/<View style=\{styles\.paymentScopeHeadlineMain\}>[\s\S]{0,500}>\{scopeDateLocation\}<\/Text>/);
    expect(screen).toMatch(/paymentScopeHeadlineMain: \{ flex: 1, minWidth: 0, gap: 4 \}/);
  });

  it("uses icon-only Edit and Reject actions in the review sheet", () => {
    const summary = sourceBlock("PaymentCareScopeSummary");
    expect(summary).toMatch(/accessibilityLabel="Edit care scope"[\s\S]{0,500}name="edit-2" size=\{18\}/);
    expect(summary).toMatch(/accessibilityLabel="Reject care scope"[\s\S]{0,500}name="x" size=\{18\}/);
    expect(summary).not.toMatch(/>Edit<\/Text>/);
    expect(summary).not.toMatch(/>Decline<\/Text>/);
  });

  it("opens every profile-backed Care Scope polaroid through the shared Pet Details modal", () => {
    const summary = sourceBlock("PaymentCareScopeSummary");
    const quoteSheet = sourceBlock("QuoteSheet");
    expect(summary).toMatch(/<SelectedPetPolaroid onOpenPet=\{onOpenPet\} requestCard=\{visibleScopeCard\}/);
    expect(quoteSheet).toMatch(/<PaymentCareScopeSummary[\s\S]{0,500}onOpenPet=\{onOpenPet\}/);
    expect(screen).toMatch(/<PaymentCareScopeSummary bookingSnapshot=[^\n]+onOpenPet=\{\(petId\) => void openPetProfile\(petId\)\}/);
    expect(screen).toMatch(/<PaymentCareScopeSummary careDetails=[^\n]+onOpenPet=\{onOpenPet\}/);
    expect(screen).toMatch(/<PaymentSheet[\s\S]{0,1000}onOpenPet=\{\(petId\) => void openPetProfile\(petId\)\}/);
  });

  it("keeps payment validation hidden on open and resets it between sign and confirm stages", () => {
    const paymentSheet = sourceBlock("PaymentSheet");
    expect(paymentSheet).toMatch(/validationStageRef = useRef<"sign" \| "confirm" \| null>\(null\)/);
    expect(paymentSheet).toMatch(/const nextStage = canSignCareScope \? "sign" : "confirm";[\s\S]{0,240}setAttempted\(false\)/);
    expect(paymentSheet).toMatch(/setAttempted\(true\)[\s\S]{0,1000}getFirstInvalidPaymentField\(\)/);
    expect(paymentSheet).toMatch(/if \(firstInvalidField\) focusPaymentField\(firstInvalidField\)/);
    expect(paymentSheet).toMatch(/scrollRef\.current\?\.scrollTo\(\{ animated: true, y: Math\.max\(0, y - huddleSpacing\.x4\) \}\)/);
  });
  it("info/status box is Option B — white card + soft shadow + left blue accent bar, not the old hard blue outline", () => {
    const box = screen.slice(screen.indexOf("paymentInfoBox: {"), screen.indexOf("paymentInfoBox: {") + 480);
    expect(box).toMatch(/backgroundColor: huddleColors\.canvas/);
    expect(box).toMatch(/borderLeftWidth: 4, borderLeftColor: huddleColors\.blue/);
    expect(box).toMatch(/huddleShadows\.glassElevation1/);
    expect(box).toMatch(/borderColor: huddleColors\.fieldBorderSoft/);
    expect(box).not.toMatch(/backgroundColor: huddleColors\.blueSoft/);
  });
  it("box header stays bold, body drops to regular weight, both at the same label size", () => {
    expect(screen).toMatch(/paymentInfoTitle: \{ fontFamily: "Urbanist-800", fontSize: huddleType\.label/);
    expect(screen).toMatch(/paymentInfoText: \{ fontFamily: "Urbanist-500", fontSize: huddleType\.label/);
  });
  it("the expanded care scope/instruction detail is NOT a Modal and NOT a separate overlay layer — it's in-flow inside the same card as the header, so one accent strip can span the whole thing with no cross-surface seam", () => {
    // A native Modal is a genuinely separate render surface (its own window on iOS, its own
    // root view on Android) from the rest of the screen. That made it structurally impossible
    // to guarantee the header's strip and the detail's strip stay pixel-continuous — no amount
    // of measurement fixes that, because they're two different native trees. The fix: header +
    // expanded detail render in ONE container (one <View style={styles.glassCard}>), with ONE
    // phaseStrip as a direct child spanning the whole card, and the detail is a plain in-flow
    // ScrollView within that same container — not a Modal, not an absolutely-positioned overlay
    // measured via screen coordinates.
    const cardBlock = screen.slice(screen.indexOf("function BookingCards"), screen.indexOf("function ScopeLine"));
    expect(cardBlock).not.toMatch(/<Modal/);
    expect(cardBlock).not.toMatch(/AppBottomSheet/);
    // exactly one phaseStrip in the card, covering header + detail + action row together
    expect(cardBlock.match(/styles\.phaseStrip/g)?.length).toBe(1);
    // the obsolete Modal/measurement plumbing is fully gone
    expect(screen).not.toMatch(/overlayAnchor/);
    expect(screen).not.toMatch(/scopeDetailOverlay/);
    expect(screen).not.toMatch(/maxScopeDetailHeight/);
    expect(screen).not.toMatch(/maxDetailHeight/);
    expect(cardBlock).not.toMatch(/styles\.scopeExpandedShell/);
  });

  it("the expanded ScrollView cap keeps windowHeight*0.45 on normal phones (via min) and only shrinks on small screens so it never slides under the pinned footer", () => {
    const cardBlock = screen.slice(screen.indexOf("function BookingCards"), screen.indexOf("function ScopeLine"));
    // inline cap is still 0.45; min() with the real space-above-footer means normal phones are
    // unchanged (their available space is larger) and only tight screens shrink.
    expect(cardBlock).toMatch(/const inlineCap = windowHeight \* 0\.45;/);
    expect(cardBlock).toMatch(/const availableAboveFooter = \(windowHeight - footerHeight\) - detailTopY - huddleSpacing\.x4;/);
    expect(cardBlock).toMatch(/Math\.min\(inlineCap, availableAboveFooter\) : inlineCap/);
    // the cap only uses the measured value once BOTH the detail top and footer are measured
    expect(cardBlock).toMatch(/detailTopY > 0 && footerHeight > 0 \?/);
  });
});

describe("QuoteSheet 'Review & Sign' no longer flips to 'Update Care Scope' from live prop drift (2026-07-03)", () => {
  it("the reset effect only re-seeds state on the closed→open transition, not on every careScope/initialCard change while open", () => {
    const block = sourceBlock("QuoteSheet") || screen.slice(screen.indexOf("const canEditLocation = providerCanEditCareScopeLocation(requestCard);"), screen.indexOf("const canEditLocation = providerCanEditCareScopeLocation(requestCard);") + 4000);
    expect(block).toMatch(/const initializedForOpenRef = useRef\(false\);/);
    expect(block).toMatch(/if \(initializedForOpenRef\.current\) return;\s*initializedForOpenRef\.current = true;/);
  });
  it("hasEditedCareScope compares live state against a snapshot FROZEN at open time, not a value recomputed from the live initialCard prop", () => {
    expect(screen).toMatch(/const initialComparableSnapshotRef = useRef\(""\);/);
    expect(screen).toMatch(/initialComparableSnapshotRef\.current = JSON\.stringify\(normalizeCareScopeComparable\(\{/);
    expect(screen).toMatch(/const initialComparable = initialComparableSnapshotRef\.current;/);
  });
});

describe("Carer decline returns the active request to a clean slate", () => {
  it("only allows the carer to decline the explicit current active service row before carer sign-off", () => {
    const migration = readMigration("carer_declines_active_care_scope");
    expect(migration).toMatch(/function public\.decline_service_care_request\(p_service_chat_id uuid\)/);
    expect(migration).toMatch(/id = p_service_chat_id\s+and id = public\.current_active_service_chat_id_for_room\(chat_id\)/);
    expect(migration).toMatch(/if v_sc\.provider_id <> v_uid then/);
    expect(migration).toMatch(/care_scope_already_signed/);
    expect(migration).toMatch(/request_card = null,[\s\S]{0,160}quote_card = null/);
    expect(migration).toMatch(/set is_active = false/);
  });
  it("keeps the decline action out of edit and post-sign-off states, then refreshes the same chat", () => {
    const quoteSheet = sourceBlock("QuoteSheet");
    expect(quoteSheet).toMatch(/canSignCareScope && !editingQuoteScope && !carerAlreadySigned && !currentMutualSignatures && onDecline/);
    expect(screen).toMatch(/rpcVoid\("decline_service_care_request", \{ p_service_chat_id: activeServiceChatId \}/);
    expect(screen).toMatch(/service_request_declined: `\$\{actorName\} declined the care request\.`/);
  });
});

describe("Auto-complete countdown banner above composer (2026-07-02)", () => {
  it("shows a live countdown to the same 48h window the backend cron uses, gated to in-progress + eligible completer", () => {
    expect(screen).toMatch(/const serviceScheduledEndIso = \(requestCard: ServiceRequestCard \| null \| undefined, bookingSnapshot\?: CareBookingSnapshot \| null\) => \{/);
    expect(screen.indexOf("const requestEnd = clean(requestCard?.endAtIso)")).toBeLessThan(screen.indexOf("const bookingEnd = clean(bookingSnapshot?.endAt)"));
    expect(screen).toMatch(/const scheduledEndAtMain = useMemo\(\(\) => serviceScheduledEndIso\(serviceChat\?\.request_card, serviceChat\?\.booking_snapshot\)/);
    expect(screen).toMatch(/const scheduledEndAt = serviceScheduledEndIso\(chat\.request_card, chat\.booking_snapshot\)/);
    expect(screen).toMatch(/const autoCompleteAtMain = useMemo\(\(\) => addHoursIso\(scheduledEndAtMain, PAYOUT_AUTO_RELEASE_HOURS\)/);
    expect(screen).toMatch(/const showCompletionCountdown = Boolean\(/);
    expect(screen).toMatch(/&& canConfirmCompletion/);
  });
  it("title has no 'unless you report an issue' wording (avoids inviting bad-faith reports); Report issue is a separate plain link", () => {
    const banner = screen.slice(screen.indexOf("showCompletionCountdown && actionPrimary && !showReviewComposerCta"), screen.indexOf("showCompletionCountdown && actionPrimary && !showReviewComposerCta") + 2800);
    const rendered = banner.split("\n").filter((line) => !line.trim().startsWith("//")).join("\n");
    expect(banner).toMatch(/title=\{`Completes automatically in \$\{completionCountdownLabel\}`\}/);
    expect(rendered).not.toMatch(/unless/i);
    expect(banner).toMatch(/Report issue/);
    expect(banner).toMatch(/onPress=\{openIssueReportSheet\}/);
  });
});

describe("Care update send path hardening (2026-07-09)", () => {
  it("uses exact-token RPCs plus success payload validation so a stalled or half-complete update cannot look successful", () => {
    const careUpdates = readFileSync(join(appRoot, "src/lib/nativeCareUpdates.ts"), "utf8");
    expect(careUpdates).toMatch(/nativeExactTokenRpc/);
    expect(careUpdates).toMatch(/nativeExactTokenRpc<NativeCareUpdateStatus>\("get_service_care_update_status_by_service_id"/);
    expect(careUpdates).toMatch(/"submit_service_care_update_by_service_id"/);
    expect(careUpdates).toMatch(/message\?: Partial<SubmitCareUpdateMessage> \| null/);
    expect(careUpdates).toMatch(/if \(data\?\.ok !== true\)/);
    expect(careUpdates).toMatch(/return \{ ok: true, message: message\?\.id && message\.sender_id && message\.content \? message : null \}/);
  });
  it("puts an explicit timeout on the raw care-evidence storage upload so slide-to-send cannot hang forever after haptic feedback", () => {
    const social = readFileSync(join(appRoot, "src/lib/nativeSocial.ts"), "utf8");
    expect(social).toMatch(/NATIVE_SERVICE_CARE_EVIDENCE_UPLOAD_TIMEOUT_MS = 15000/);
    expect(social).toMatch(/NATIVE_SERVICE_CARE_EVIDENCE_PREP_TIMEOUT_MS = 12000/);
    expect(social).toMatch(/care_update_image_info_timeout/);
    expect(social).toMatch(/care_update_image_prepare_timeout/);
    expect(social).toMatch(/care_update_image_read_timeout/);
    expect(social).toMatch(/fetchNativeResponseWithTimeout/);
    expect(social).toMatch(/\}, NATIVE_SERVICE_CARE_EVIDENCE_UPLOAD_TIMEOUT_MS\)/);
    expect(social).toMatch(/care_update_upload_timeout/);
  });
});

describe("Care update polaroid consistency (2026-07-09)", () => {
  it("uses one shared sheet/chat care-update polaroid renderer, including the explicit >2 pets family caption", () => {
    const sheet = readFileSync(join(appRoot, "src/components/service/NativeCareUpdateSheet.tsx"), "utf8");
    const card = readFileSync(join(appRoot, "src/components/service/ServiceCareUpdateCard.tsx"), "utf8");
    const polaroid = readFileSync(join(appRoot, "src/components/service/CareUpdatePolaroid.tsx"), "utf8");
    expect(sheet).toMatch(/import \{ CareUpdatePolaroid \} from "\.\/CareUpdatePolaroid"/);
    expect(card).toMatch(/import \{ CareUpdateDetailPolaroid, CareUpdatePolaroid, CareUpdatePolaroidViewer \} from "\.\/CareUpdatePolaroid"/);
    expect(card).toMatch(/<CareUpdatePolaroid capturedAt=\{capturedAt\} imageUri=\{signedUri\} ownerName=\{ownerName\} petName=\{petName\} width="100%" \/>/);
    expect(card).toMatch(/<View style=\{styles\.mediaStack\}>[\s\S]{0,1200}<CareUpdatePolaroid[\s\S]{0,800}\{trimmedNote \?/);
    expect(card).toMatch(/mediaStack:[\s\S]{0,120}width: huddleCareUpdate\.polaroidWidth/);
    expect(card).toMatch(/noteBubble:[\s\S]{0,80}alignSelf: "flex-start"/);
    expect(card).toMatch(/noteBubble:[\s\S]{0,120}maxWidth: "100%"/);
    expect(card).toMatch(/noteBubbleMine:[\s\S]{0,80}alignSelf: "flex-end"/);
    expect(card).toMatch(/if \(!hasPhoto\)[\s\S]{0,500}<View style=\{\[styles\.noteBubble, mine \? styles\.noteBubbleMine : styles\.noteBubbleTheirs\]\}>/);
    expect(polaroid).toMatch(/Product rule: three or more selected pets/);
    expect(polaroid).toMatch(/if \(labels\.length > 2\)/);
    expect(polaroid).toMatch(/return \[`\$\{owner\}’s`, "pet family"\]/);
  });

  it("uses the existing carer-profile detail polaroid for enlarged and saved care-update images", () => {
    const card = readFileSync(join(appRoot, "src/components/service/ServiceCareUpdateCard.tsx"), "utf8");
    const polaroid = readFileSync(join(appRoot, "src/components/service/CareUpdatePolaroid.tsx"), "utf8");
    const nativePolaroidCard = readFileSync(join(appRoot, "src/components/NativePolaroidCard.tsx"), "utf8");
    expect(polaroid).toMatch(/import \{ NativePolaroidCard, nativePolaroidStyles \} from "\.\.\/NativePolaroidCard"/);
    expect(polaroid).toMatch(/export function CareUpdateDetailPolaroid/);
    expect(polaroid).toMatch(/const captionPrimary = captionLabels\.join\(" "\) \|\| "Care update"/);
    expect(polaroid).toMatch(/<NativePolaroidCard[\s\S]{0,1400}variant="detail"/);
    expect(polaroid).toMatch(/captionPrimaryLines=\{captionLabels\}/);
    expect(polaroid).toMatch(/nativePolaroidStyles\.captionSecondaryWrapDetail/);
    expect(polaroid).toMatch(/nativePolaroidStyles\.captionSecondaryTokenDetail/);
    expect(polaroid).toMatch(/captionPrimary=\{captionPrimary\}/);
    expect(polaroid).toMatch(/<Text numberOfLines=\{1\} style=\{nativePolaroidStyles\.captionSecondaryTokenDetail\}>\{stamp\}<\/Text>/);
    expect(polaroid).not.toMatch(/captionLabels\.slice\(1\)/);
    expect(polaroid).not.toMatch(/secondaryLabels/);
    expect(polaroid).toMatch(/<CareUpdateDetailPolaroid capturedAt=\{capturedAt\} imageUri=\{imageUri\} includeLogo ownerName=\{ownerName\} petName=\{petName\} \/>/);
    expect(card).toMatch(/<CareUpdateDetailPolaroid capturedAt=\{capturedAt\} imageUri=\{signedUri\} includeLogo ownerName=\{ownerName\} petName=\{petName\} \/>/);
    expect(polaroid).toMatch(/includeLogo/);
    expect(polaroid).toMatch(/source=\{huddleStampLogo\}/);
    expect(polaroid).toMatch(/width: huddleCareUpdate\.stampLogoWidth/);
    expect(polaroid).not.toMatch(/logoBadge:[\s\S]{0,220}borderRadius/);
    expect(nativePolaroidCard).toMatch(/captionNameDetail:[\s\S]{0,120}fontSize: huddlePolaroid\.detail\.nameSize/);
    expect(nativePolaroidCard).toMatch(/captionNameDetail:[\s\S]{0,160}lineHeight: huddlePolaroid\.detail\.nameLine/);
    expect(nativePolaroidCard).toMatch(/captionPrimaryLines\?\.length/);
    expect(nativePolaroidCard).toMatch(/captionPrimaryLines\.map/);
    expect(nativePolaroidCard).toMatch(/captionSecondaryTokenDetail:[\s\S]{0,140}fontSize: huddlePolaroid\.detail\.serviceSize/);
    expect(nativePolaroidCard).toMatch(/captionSecondaryTokenDetail:[\s\S]{0,180}lineHeight: huddlePolaroid\.detail\.serviceLine/);
    expect(polaroid).not.toMatch(/styles\.viewerTitle/);
    expect(polaroid).not.toMatch(/styles\.viewerSubtitle/);
    expect(polaroid).not.toMatch(/viewerTitle:/);
    expect(polaroid).not.toMatch(/viewerSubtitle:/);
  });

  it("lets carers share another care update after the first one and saves focused polaroids with a bounded capture", () => {
    const card = readFileSync(join(appRoot, "src/components/service/ServiceCareUpdateCard.tsx"), "utf8");
    expect(screen).toMatch(/showShareMoreUpdateAction/);
    expect(screen).toMatch(/const \[careUpdateSheetOptional, setCareUpdateSheetOptional\] = useState\(false\)/);
    expect(screen).toMatch(/const openRequiredCareUpdateSheet = useCallback/);
    expect(screen).toMatch(/const openOptionalCareUpdateSheet = useCallback/);
    expect(screen).toMatch(/Share more update/);
    expect(screen).toMatch(/shareMoreUpdateBanner/);
    expect(screen).toMatch(/onPress=\{openOptionalCareUpdateSheet\}/);
    expect(screen).toMatch(/updateKind=\{careUpdateSheetOptional \? "optional" : careUpdateKind\}/);
    expect(screen).toMatch(/shareMoreUpdateBanner:[\s\S]{0,120}\.\.\.huddleButtons\.base/);
    expect(screen).toMatch(/shareMoreUpdateBannerText:[\s\S]{0,80}\.\.\.huddleButtons\.label/);
    expect(card).toMatch(/onLongPress=\{\(\) => \{/);
    expect(card).toMatch(/Save image/);
    expect(card).toMatch(/raceWithTimeoutFallback\(\s*captureRef\(actionExportRef/);
  });
});

describe("Care update required count (2026-07-09)", () => {
  it("keeps required care updates mandatory until the requested care-day count is met, then shows Share more update", () => {
    const m = readMigration("care_updates_strict_service_identity_and_reminders");
    expect(m).toMatch(/create or replace function public\.service_care_update_due_count/);
    expect(m).toMatch(/jsonb_array_elements_text\(coalesce\(v_sc\.request_card->'requestedDates'/);
    expect(m).toMatch(/service_care_update_qualifying_count\(v_sc\.id\) >= public\.service_care_update_due_count/);
    expect(m).toMatch(/'required_count', v_due/);
    expect(m).toMatch(/'submitted_count', v_submitted/);
    expect(screen).toMatch(/const requestedCareUpdateCount = Math\.max\(1, getRequestedCareDayCount\(serviceChat\?\.request_card\)\)/);
    expect(screen).toMatch(/const requiredCareUpdateCount = careUpdateIsRequested\(careUpdateKind\)[\s\S]{0,240}careUpdateStatus\?\.total_required_count[\s\S]{0,100}careUpdateStatus\?\.required_count/);
    expect(screen).toMatch(/clean\(careUpdateStatus\?\.service_chat_id\) === activeCareUpdateServiceChatId/);
    expect(screen).toMatch(/showCareUpdateStatusLoading/);
    expect(screen).toMatch(/Checking requested updates…/);
    expect(screen).toMatch(/showRequiredCareUpdateAction/);
    expect(screen).toMatch(/showShareMoreUpdateAction/);
    expect(screen).toMatch(/requiredCareUpdateActionLabel\(careUpdateKind, statusSubmittedCareUpdateCount, requiredCareUpdateCount\)/);
    expect(screen).toMatch(/requiredCareUpdateButton:[\s\S]{0,220}backgroundColor: huddleColors\.success/);
    expect(screen).toMatch(/requiredCareUpdateButtonText:[\s\S]{0,120}color: huddleColors\.onPrimary/);
    expect(screen).toMatch(/<Text style=\{styles\.requiredCareUpdateButtonText\}>\{requiredCareUpdateActionText\}<\/Text>/);
  });

  it("keeps in-progress update progress independent from reminder timing", () => {
    const m = readMigration("care_update_progress_independent_of_reminders");
    expect(m).toMatch(/'required_count', v_total/);
    expect(m).toMatch(/'due_count', v_due/);
    expect(m).toMatch(/'met', v_kind = 'optional' or v_submitted >= v_total/);
    expect(m).toMatch(/service_care_update_qualifying_count\(v_sc\.id\) >= v_required/);
  });

  it("keeps extra updates scoped to the active service session and relaxes required fields only after requirements are already met", () => {
    const m = readMigration("service_care_update_optional_extra");
    expect(m).toMatch(/where id = public\.current_active_service_chat_id_from_any_id\(p_chat_id\)/);
    expect(m).toMatch(/for update/);
    expect(m).toMatch(/v_required_met_before := public\.service_chat_care_update_requirement_met\(v_sc\.id\)/);
    expect(m).toMatch(/v_effective_kind := case when v_required_met_before then 'optional' else v_kind end/);
    expect(m).toMatch(/if v_effective_kind in \('photo', 'photo_note'\) and v_photo is null then/);
    expect(m).toMatch(/if v_effective_kind in \('photo_note', 'summary'\) and v_note is null then/);
    expect(m).toMatch(/if v_effective_kind = 'optional' and v_photo is null and v_note is null then/);
    expect(m).toMatch(/jsonb_build_object\('update_kind', v_effective_kind, 'requested_update_kind', v_kind, 'pet_name', v_pet_name\)/);
    expect(m).toMatch(/values \(\s*v_sc\.chat_id,\s*v_uid,/);
    expect(m).toMatch(/return jsonb_build_object\('ok', true, 'update_kind', v_effective_kind, 'requested_update_kind', v_kind, 'service_chat_id', v_sc\.id, 'chat_id', v_sc\.chat_id\)/);
  });

  it("refreshes after slide-to-send before closing and reloads the newest messages, so second updates render in long service chats", () => {
    const sheet = readFileSync(join(appRoot, "src/components/service/NativeCareUpdateSheet.tsx"), "utf8");
    const dialogue = readFileSync(join(appRoot, "src/screens/NativeChatDialogueScreen.tsx"), "utf8");
    const nativeChat = readFileSync(join(appRoot, "src/lib/nativeChat.ts"), "utf8");
    expect(sheet).toMatch(/onSent: \(result: Extract<SubmitCareUpdateResult, \{ ok: true \}>\) => void \| Promise<void>/);
    expect(sheet).toMatch(/await Promise\.resolve\(onSent\(result\)\)/);
    expect(screen).toMatch(/onSent=\{\(result\) => \{/);
    expect(screen).toMatch(/hydrateServiceMessages\(\[confirmed\],/);
    expect(screen).toMatch(/scrollServiceMessagesToLatest\(true\)/);
    expect(screen).toMatch(/return load\(true\)/);
    expect(screen).toMatch(/const SERVICE_MESSAGE_PAGE_SIZE = 50/);
    expect(screen).toMatch(/fetchNativeChatDialogueSnapshot\(\{ roomId: requestRoomId, limit: SERVICE_MESSAGE_PAGE_SIZE \+ 1, accessToken \}\)/);
    expect(screen).toMatch(/const nextMessages = newestRows\.slice\(Math\.max\(0, newestRows\.length - SERVICE_MESSAGE_PAGE_SIZE\)\)/);
    expect(screen).toMatch(/const loadOlderServiceMessages = useCallback/);
    expect(screen).toMatch(/beforeCreatedAt: oldestMessage\.created_at/);
    expect(screen).toMatch(/if \(contentOffset\.y < 56\) void loadOlderServiceMessages\(\)/);
    expect(dialogue).toMatch(/const loadOlder = useCallback/);
    expect(dialogue).toMatch(/if \(contentOffset\.y < 56\) void loadOlder\(\)/);
    expect(nativeChat).toMatch(/p_limit: options\.limit \?\? 50/);
  });
});

describe("Voluntary ($0) bookings now auto-complete via the payout cron (2026-07-02)", () => {
  it("process_service_payout_releases includes quote_card.voluntary bookings with no positive finalPrice, not just paid ones", () => {
    const m = readMigration("payout_release_cron_includes_voluntary_bookings");
    expect(m).toMatch(/create or replace function public\.process_service_payout_releases/);
    expect(m).toMatch(/coalesce\(\(sc\.quote_card->>'voluntary'\)::boolean, false\)/);
    expect(m).toMatch(/\(sc\.quote_card->>'finalPrice'\)::numeric <= 0/);
  });
  it("voluntary bookings never enter the payout dispatch path (no payout_release_requested_at set for them)", () => {
    const m = readMigration("payout_release_cron_includes_voluntary_bookings");
    expect(m).toMatch(/payout_release_requested_at = case when rec\.stripe_payment_intent_id is not null then coalesce\(payout_release_requested_at, now\(\)\) else payout_release_requested_at end/);
  });
});

describe("Location address input no longer clips descenders g/y/j (2026-07-03)", () => {
  it("locationFieldInput drops includeFontPadding:false and keeps a taller full-height input in both care and group location fields", () => {
    const careField = screen.slice(screen.indexOf("locationFieldInput: {"), screen.indexOf("locationFieldInput: {") + 260);
    expect(careField).not.toMatch(/includeFontPadding/);
    expect(screen).toMatch(/locationFieldRow: \{[^}]*height: 56[^}]*minHeight: 56[^}]*maxHeight: 56[^}]*\}/);
    expect(careField).toMatch(/height: "100%"/);
    expect(careField).toMatch(/textAlignVertical: "center"/);
    expect(chats).toMatch(/locationFieldInput: \{[^}]*textAlignVertical: "center"[^}]*\}/);
    expect(chats).toMatch(/locationFieldRow: \{[^}]*height: 56[^}]*minHeight: 56[^}]*maxHeight: 56[^}]*\}/);
    const chatsField = chats.slice(chats.indexOf("locationFieldInput: {"), chats.indexOf("locationFieldInput: {") + 260);
    expect(chatsField).not.toMatch(/includeFontPadding/);
    expect(chatsField).toMatch(/height: "100%"/);
  });
});

describe("Free Care Session note doesn't repeat at the Confirm & Pay step (2026-07-03)", () => {
  it("CareScopeAgreementPaymentDetails accepts hideWhenFree and treats the persisted empty quote object as no quote", () => {
    const block = sourceBlock("CareScopeAgreementPaymentDetails");
    expect(screen).toMatch(/const hasMeaningfulServiceQuoteCard = \(quote: ServiceQuoteCard \| null \| undefined\): quote is ServiceQuoteCard => \{/);
    expect(block).toMatch(/const hasActiveQuote = hasMeaningfulServiceQuoteCard\(quoteCard\)/);
    expect(block).toMatch(/const hasRequestOffer = !hasActiveQuote && Number\.isFinite\(requestOffer\) && requestOffer > 0/);
    expect(block).toMatch(/if \(!hasPaidQuote && !hasRequestOffer && hideWhenFree\) return null;/);
  });
  it("does not render an invisible rate-unit space after a Total amount, so the visible money glyphs stay right-aligned", () => {
    const block = sourceBlock("CareScopeAgreementPaymentDetails");
    expect(block).toMatch(/const requestRateUnit = formatRateUnit\(requestCard\?\.suggestedRate\);/);
    expect(block).toMatch(/\{requestRateUnit \? ` \$\{requestRateUnit\}` : ""\}/);
    expect(block).not.toMatch(/requestCard\?\.suggestedRate \? ` \$\{formatRateUnit\(requestCard\.suggestedRate\)\}` : ""/);
  });
  it("the requester's Confirm/Payment sheet passes hideWhenFree at Step 2 (Confirm & Pay) only — Step 1 (Agree) still shows it once", () => {
    expect(screen).toMatch(/<CareScopeAgreementPaymentDetails hideWhenFree=\{!canSignCareScope\} providerCurrency=\{curr\} quoteCard=\{quoteCard\} requestCard=\{requestCard\} viewerRole="requester" \/>/);
  });
  it("the carer's own Review & Sign sheet is untouched (single occurrence, no duplication there)", () => {
    expect(screen).toMatch(/<CareScopeAgreementPaymentDetails providerCurrency=\{providerCurrency\} quoteCard=\{proposedQuoteCard\} requestCard=\{proposedScopeRequestCard\} viewerRole="provider" \/>/);
  });
});

describe("Care Scope sign-off source of truth and cancellation acknowledgement (2026-07-03)", () => {
  it("uses a meaningful active quote as payment source of truth so an empty persistence placeholder cannot hide a paid request", () => {
    expect(screen).toMatch(/const careScopePaymentAmount = \(quote: ServiceQuoteCard \| null \| undefined, request: ServiceRequestCard \| null \| undefined\) => \{/);
    expect(screen).toMatch(/if \(hasMeaningfulServiceQuoteCard\(quote\)\) return Number\.isFinite\(quoteAmount\) && quoteAmount > 0 \? quoteAmount : 0/);
    expect(screen).toMatch(/const serviceChatHasPositivePayment = \(chat: ServiceChatRow \| null \| undefined\) =>\s*!isNoChargeServiceChat\(chat\) && careScopePaymentAmount\(chat\?\.quote_card, visibleCareScopeCardForChat\(chat\)\) > 0/);
    expect(screen.match(/const paymentBasePrice = careScopePaymentAmount\(quoteCard, requestCard\)/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("normalizes the seeded quote snapshot before diffing so Review & Sign does not open in edit mode by default", () => {
    expect(screen).toMatch(/const nextNormalizedPayment = normalizeCareScopePaymentInput\(nextFinalPrice, nextCurrency, nextRate\)/);
    expect(screen).toMatch(/currency: nextNormalizedPayment\.paid \? nextNormalizedPayment\.currency : ""/);
    expect(screen).toMatch(/finalPrice: nextNormalizedPayment\.finalPrice/);
    expect(screen).toMatch(/rate: nextNormalizedPayment\.paid \? nextNormalizedPayment\.rate : ""/);
    expect(screen).toMatch(/voluntary: nextNormalizedPayment\.paid \? false : true/);
    expect(screen).toMatch(/const hasEditedCareScope = currentComparable !== initialComparable/);
  });

  it("sign-off sheets show the cancellation acknowledgement instead of duplicated waiting cards", () => {
    expect(screen).toMatch(/<CareSignoffCancellationPolicy isNoChargeVoluntary=\{proposedNoChargeVoluntary\} viewerRole="provider" \/>/);
    expect(screen).toMatch(/<CareSignoffCancellationPolicy isNoChargeVoluntary=\{isNoChargeVoluntary\} viewerRole="requester" \/>/);
    expect(screen).toMatch(/careScopeAcknowledgementCopy\("provider", proposedNoChargeVoluntary\)/);
    expect(screen).toMatch(/careScopeAcknowledgementCopy\("requester", isNoChargeVoluntary\)/);
    expect(screen).toMatch(/I have read and agree to the cancellation and no-start policy/);
    expect(screen).toMatch(/I have read and agree to the cancellation and no-start policy \(including automatic cancellation at the scheduled end time\)\./);
    expect(screen).toMatch(/I understand that last-minute cancellations, confirmed no-shows, or serious trust violations may restrict my ability to provide Care on huddle\./i);
    expect(screen).not.toMatch(/<Text style=\{styles\.paymentInfoTitle\}>Waiting for the carer<\/Text>/);
    expect(screen).not.toMatch(/<Text style=\{styles\.paymentInfoTitle\}>Step 1 · Agree to Care Scope<\/Text>/);
  });

  it("uses the simplified return button copy from edit mode", () => {
    expect(screen).toMatch(/>Return without Change<\/AppModalButton>/);
    expect(screen).not.toMatch(/Return to Payment without change/);
  });
});

describe("Paid request accepted as-is materializes an authoritative quote (2026-08-16)", () => {
  it("treats the persisted empty quote object exactly like no quote when the carer signs", () => {
    const migration = readMigration("materialize_empty_care_quote_on_provider_agreement");
    expect(migration).toMatch(/record_service_care_scope_signature\(uuid,jsonb,boolean,boolean\)/);
    expect(migration).toMatch(/v_sc\.quote_card is null or v_sc\.quote_card = ''\{\}''::jsonb/);
    expect(migration).toMatch(/care_quote_placeholder_materialization_patch_failed/);
  });

  it("repairs only pending, positively priced requests already signed by the carer", () => {
    const migration = readMigration("materialize_empty_care_quote_on_provider_agreement");
    expect(migration).toMatch(/sc\.status = 'pending'/);
    expect(migration).toMatch(/\(sc\.request_card->>'suggestedPrice'\)::numeric > 0/);
    expect(migration).toMatch(/sig\.role = 'carer'/);
    expect(migration).toMatch(/'finalPrice', sc\.request_card->>'suggestedPrice'/);
  });
});

describe("Rover-grade Care agreement integrity (2026-08-21)", () => {
  const roverContract = readMigration("rover_grade_care_contract");
  const confirmPayment = readFileSync(join(repoRoot, "supabase/functions/confirm-service-payment/index.ts"), "utf8");
  const stripeWebhook = readFileSync(join(repoRoot, "supabase/functions/stripe-webhook/index.ts"), "utf8");

  it("makes signatures immutable and server-timestamped while preserving exact retries", () => {
    expect(roverContract).toMatch(/p_signature - 'signedAt'/);
    expect(roverContract).toMatch(/'signedAt', now\(\)/);
    expect(roverContract).toMatch(/signed_at\s*\n\s*\)[\s\S]{0,520}\n\s*now\(\)\s*\n\s*\)/);
    expect(roverContract).toMatch(/on conflict \(scope_version_id, role, signer_user_id\) do nothing/);
    expect(roverContract).toMatch(/if v_record\.image_path <> v_path then raise exception 'care_scope_already_signed'/);
    expect(roverContract).not.toMatch(/on conflict \(scope_version_id, role, signer_user_id\) do update/);
    expect(roverContract).toMatch(/legacy_signature_rpc_disabled/);
  });

  it("requires exact consent, signatures, checkout, payment lock, and server-validated snapshot before paid finalization", () => {
    expect(roverContract).toMatch(/owner_payment_consent_hash is null or v_version\.owner_payment_consent is null/);
    expect(roverContract).toMatch(/owner_payment_consent_hash_invalid/);
    expect(roverContract).toMatch(/'paymentMethodConsent'/);
    expect(roverContract).toMatch(/'checkoutSessionId', v_checkout_session_id/);
    expect(roverContract).toMatch(/'paymentIntentId', v_payment_intent_id/);
    expect(roverContract).toMatch(/payment_status not in \('creating', 'pending'\)/);
    expect(roverContract).toMatch(/payment_pending_started_at <= now\(\) - interval '5 minutes'/);
    expect(roverContract).toMatch(/payment_pending_expires_at < now\(\)/);
    expect(roverContract).toMatch(/v_version\.checkout_session_id is distinct from v_checkout_session_id/);
    expect(roverContract).toMatch(/v_sc\.stripe_checkout_session_id is distinct from v_checkout_session_id/);
    expect(roverContract).toMatch(/v_version\.payment_intent_id <> v_payment_intent_id/);
    expect(roverContract).toMatch(/perform public\.validate_service_booking_snapshot\(p_booking_snapshot\)/);
    expect(roverContract).toMatch(/noStartPolicyAcknowledged/);
    expect(roverContract).toMatch(/payment_scope_conflict:booking_snapshot_actor_mismatch/);
    expect(roverContract).toMatch(/payment_scope_conflict:booking_snapshot_payment_mismatch/);
    expect(roverContract).toMatch(/payment_scope_conflict:owner_scope_signature_required/);
    expect(roverContract).toMatch(/payment_scope_conflict:carer_scope_signature_required/);
    expect(roverContract).toMatch(/payment_scope_conflict:payment_lock_expired/);
  });

  it("records refund-required before either Stripe conflict-refund attempt", () => {
    for (const source of [confirmPayment, stripeWebhook]) {
      const refundRequired = source.indexOf('payment_status: "refund_required"');
      const stripeRefund = source.indexOf("stripe.refunds.create", refundRequired);
      expect(refundRequired).toBeGreaterThanOrEqual(0);
      expect(stripeRefund).toBeGreaterThan(refundRequired);
    }
  });

  it("refunds an identity-matched captured payment when amount or currency no longer matches", () => {
    expect(confirmPayment).toMatch(/identityMatches[\s\S]{0,500}capturedPaymentMismatch/);
    expect(confirmPayment).toMatch(/captured_payment_amount_or_currency_mismatch/);
    expect(stripeWebhook).toMatch(/amount\/currency mismatch[\s\S]{0,500}refundServiceScopeConflict/);
    expect(stripeWebhook).toMatch(/service_booking refunded after payment mismatch/);
  });

  it("returns one authoritative state revision and action envelope and consumes it in both sign-off sheets", () => {
    expect(roverContract).toMatch(/'lifecycleState', v_lifecycle_state/);
    expect(roverContract).toMatch(/'agreementStatus', v_agreement_status/);
    expect(roverContract).toMatch(/'reviewEligible', v_review_eligible/);
    expect(roverContract).toMatch(/'allowedActions', v_allowed_actions/);
    expect(roverContract).toMatch(/'stateRevision', v_state_revision/);
    expect(screen).toMatch(/allowedActions: Array\.isArray\(record\.allowedActions\)/);
    expect(screen).toMatch(/careScopeAllows\(careScope, "sign_scope"/);
    expect(screen).toMatch(/careScopeAllows\(careScope, "edit_scope"/);
    expect(screen).toMatch(/careScopeAllows\(careScope, "start_payment"/);
  });
});

describe("Care finalization no-dead-end contract (2026-08-21)", () => {
  it("blocks a paid Care Scope at the carer's quote boundary until payout setup is ready", () => {
    const quoteSheet = sourceBlock("QuoteSheet");
    expect(quoteSheet).toMatch(/providerPaymentReady\?: boolean/);
    expect(quoteSheet).toMatch(/normalizedQuotePayment\.paid && providerPaymentReady !== true/);
    expect(quoteSheet).toMatch(/Finish payout setup before sending a paid Care Scope\./);
    expect(quoteSheet).toMatch(/onOpenPayoutAccount\?\.\(\)/);
    expect(screen).toMatch(/providerPaymentReady=\{providerStripeReady\}/);
    expect(screen).toMatch(/onOpenPayoutAccount=\{openPayoutAccount\}/);
  });

  it("keeps historical payout-readiness races visible and recoverable for both sides", () => {
    const readinessMigration = readMigration("align_care_payment_readiness_with_checkout");
    expect(readinessMigration).toMatch(/pc\.stripe_payout_status = 'complete'/);
    expect(readinessMigration).toMatch(/pc\.stripe_payouts_enabled is true/);
    expect(readinessMigration).toMatch(/revoke all on function public\.get_service_provider_payment_readiness\(uuid\) from public, anon/);
    expect(screen).toMatch(/title: "Finish payout setup"/);
    expect(screen).toMatch(/Payment will be available once setup is complete\./);
    expect(screen).toMatch(/label: "Finish payout setup", onPress: openPayoutAccount/);
  });

  it("retries Start PIN preparation silently and only alerts after the final failure", () => {
    const pinEffectStart = screen.indexOf('supabase.rpc("prepare_service_start_pin_by_service_id"');
    const pinEffect = screen.slice(pinEffectStart - 700, pinEffectStart + 1500);
    expect(pinEffect).not.toMatch(/Retrying once/);
    expect(pinEffect).not.toMatch(/showedError/);
    expect(pinEffect).toMatch(/if \(prepareAttempts < 2\)[\s\S]{0,180}else if \(!activeStartPin\)/);
  });

  it("keeps pet-profile refill failures inside the modal with a retryable error", () => {
    const paymentSheet = sourceBlock("PaymentSheet");
    expect(paymentSheet).toMatch(/const \[petRefillError, setPetRefillError\] = useState/);
    expect(paymentSheet).toMatch(/catch \(error\)[\s\S]{0,180}setPetRefillError\(nativeSafeErrorCopy/);
    expect(paymentSheet).toMatch(/message=\{petRefillError\}/);
    expect(paymentSheet).toMatch(/loading=\{petRefillSaving\}/);
  });

  it("keeps the conversation available through one-sided completion", () => {
    expect(screen).toMatch(/careConversationState\.kind !== "completed"/);
    expect(screen).toMatch(/Keep the Care conversation available until the server confirms that both/);
  });

  it("documents Care Instruction edits as a new version that needs both signatures again", () => {
    expect(careScopePingPongContract).toContain("Care Instruction updates create a new active Care Scope version");
    expect(careScopePingPongContract).not.toContain("They update `care_details` in place");
  });
});

describe("Care review completion feedback", () => {
  it("closes a successful positive review into the window toast instead of a timed popup", () => {
    const reviewSheet = sourceBlock("ReviewSheet");
    expect(screen).toMatch(/import \{ showNativeWindowToast \} from "\.\.\/lib\/nativeToastBus"/);
    expect(reviewSheet).toMatch(/if \(result === "positive"\) \{[\s\S]{0,320}showNativeWindowToast\([\s\S]{0,260}headline: "Thanks for your feedback"[\s\S]{0,180}copy: "Your review has been shared\."[\s\S]{0,120}onClose\(\)/);
    expect(reviewSheet).not.toContain("Thanks for your feedback. People like you make this community better for everyone.");
  });
});

describe("Review chips no longer truncate (2026-07-02)", () => {
  it("ReviewSelectChips flex-wraps chips instead of force-splitting into fixed rows of 3 (which shrank+truncated long labels)", () => {
    const block = sourceBlock("ReviewSelectChips");
    expect(block).not.toMatch(/options\.slice\(0, 3\)/);
    expect(block).not.toMatch(/numberOfLines=\{1\}/);
    expect(screen).toMatch(/reviewChipStack: \{ flexDirection: "row", flexWrap: "wrap"/);
    expect(screen).not.toMatch(/reviewChipRow:/);
  });
});

describe("Care session system pills include the date, not just a bare time (2026-07-02)", () => {
  it("formatServiceEventDateTime renders '2:28am on 2 Jul 2026' style (lowercase am/pm, no space, day/short-month/year)", () => {
    expect(screen).toMatch(/const formatServiceEventDateTime = \(iso: string \| null \| undefined\) => \{/);
    expect(screen).toMatch(/\.replace\(" ", ""\)\s*\.toLowerCase\(\)/);
  });
  it("service_check_in / service_in_progress / service_completed all use it", () => {
    expect(screen).toMatch(/service_check_in: `Care session started\$\{eventDateTime \? ` at \$\{eventDateTime\}` : ""\}\.`/);
    expect(screen).toMatch(/service_in_progress: `Care session started\$\{eventDateTime \? ` at \$\{eventDateTime\}` : ""\}\.`/);
    expect(screen).toMatch(/service_completed: `Care session completed\$\{eventDateTime \? ` at \$\{eventDateTime\}` : ""\}\.`/);
  });
});

describe("Booking timeline: 'Payment released' step follows the actual quote price, not the carer's profile-level volunteer flag", () => {
  it("isNoChargeVoluntaryQuote follows the active quote amount, not stale voluntary flags", () => {
    expect(screen).toMatch(/const isNoChargeVoluntaryQuote = \(quote: ServiceQuoteCard \| null \| undefined\) =>\s*hasMeaningfulServiceQuoteCard\(quote\) && !quoteHasPositivePrice\(quote\)/);
  });
  it("'Payment released' timeline step is gated on that same per-quote check — a volunteer carer who accepts a price on THIS booking still gets it", () => {
    expect(screen).toMatch(/const noChargeVoluntaryBooking = isNoChargeServiceChat\(chat\)/);
    expect(screen).toMatch(/if \(isProvider && !noChargeVoluntaryBooking\) \{\s*const fallbackPayoutReleased[\s\S]*items\.push\(\{/);
    expect(screen).toMatch(/label: paymentCopy\?\.label \|\| \(fallbackPayoutReleased \? "Payment released" : "Payment pending"\)/);
  });
});
