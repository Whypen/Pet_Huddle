import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Executable proof for CARE_BOOKING_SCOPE_CONTRACT.md (§13 verification gates).
// These are static-source invariants over the exact files applied to the app and
// the DB, mirroring careNotificationContract.test.ts. They replace eyeball audits:
// any contract gate that regresses fails here.

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "../..");          // .../app
const repoRoot = resolve(appRoot, "..");          // repo root
const screen = readFileSync(join(appRoot, "src/screens/NativeServiceChatScreen.tsx"), "utf8");
const chats = readFileSync(join(appRoot, "src/screens/NativeChatsScreen.tsx"), "utf8");
const pdfBuilder = readFileSync(join(repoRoot, "supabase/functions/generate-care-agreement-pdf/pdf.ts"), "utf8");
const pdfFunction = readFileSync(join(repoRoot, "supabase/functions/generate-care-agreement-pdf/index.ts"), "utf8");
const adminSafety = readFileSync(join(repoRoot, "src/pages/admin/AdminSafety.tsx"), "utf8");

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
  it("loads Care conversations with the service inbox scope, not all-inbox plus client filtering", () => {
    expect(chats).toMatch(/if \(tab === "service"\) return "service"/);
    expect(chats).not.toMatch(/if \(tab === "service"\) return "all"/);
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

describe("§10/§11 Daily summary — warn, never hard block", () => {
  it("surfaces a persistent missed-summary banner above the composer", () => {
    expect(screen).toMatch(/summaryUpdateMissed/);
    expect(screen).toMatch(/You missed a daily summary\./);
    expect(screen).toMatch(/Complete anyway/);
    expect(screen).toMatch(/Send summary/);
    expect(screen).toMatch(/summaryUpdateMissed \? \(\s*<ServiceActionCard/);
    expect(screen).not.toMatch(/summaryUpdateMissed \? \(\s*<View style=\{styles\.paymentInfoBox\}>/);
  });
  it("backend never hard-blocks completion for a missing daily summary", () => {
    // submit_provider_completion only raises care_update_required when the required
    // update kind is NOT optional/summary — summary completes and is logged.
    expect(allSql).toMatch(/v_update_kind not in \('optional', 'summary'\)[\s\S]{0,80}raise exception 'care_update_required'/);
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
      const bodyWithoutNestedModals = body.replace(/<Modal[\s\S]*?<\/Modal>/g, "");
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
    expect(screen).toMatch(/selectActiveServiceChatRow\(serviceRows, activeScopeServiceChatIds\)/);
    expect(screen).not.toMatch(/\.from\("service_chats"\)[\s\S]{0,220}\.eq\("chat_id", requestRoomId\)[\s\S]{0,220}\.maybeSingle\(\)/);
  });

  it("keeps the legacy status refresh best-effort so an ambiguous old row cannot block active row loading", () => {
    expect(screen).toMatch(/refresh_status_failed/);
    expect(screen).toMatch(/try \{\s*const \{ error \} = await supabase\.rpc\("refresh_service_chat_status", \{ p_chat_id: requestRoomId \}\)/);
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
    expect(historyLoader).toMatch(/\.from\("service_care_agreements"\)/);
    expect(historyLoader).not.toMatch(/care_scope_versions/);
    expect(screen).toMatch(/const frozenHistoryServiceChatRow = \(row: ServiceChatRow\): ServiceChatRow =>/);
    expect(screen).toMatch(/const serviceRequestCardFromBookingSnapshot = \(snapshot\?: CareBookingSnapshot \| null\): ServiceRequestCard \| null =>/);
    expect(screen).toMatch(/for \(const row of careHistoryRows\) byId\.set\(row\.id, frozenHistoryServiceChatRow\(row\)\)/);
    expect(screen).not.toMatch(/if \(effectiveServiceChat\) byId\.set\(effectiveServiceChat\.id, effectiveServiceChat\)/);
    expect(historySheet).toMatch(/allowAgreementPdfFromAgreement/);
    expect(historySheet).toMatch(/onOpenCareAgreement=\{\(\) => onOpenCareAgreement\?\.\(chat\)\}/);
    expect(screen).toMatch(/const visibleScopeCard = visibleCareScopeCardForChat\(chat\)/);
    expect(screen).toMatch(/const careTaskDetail = \[[\s\S]{0,160}scopeTasks\.join\(", "\)[\s\S]{0,220}visibleScopeCard\?\.otherTasks/);
    expect(screen).toMatch(/label: "Agreement signed", dateLabel: formatTimelineStepDate\(agreementSignedAt\)/);
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
    expect(screen).toMatch(/const canSignCareScope = !currentMutualSignatures && !ownerAlreadySigned && \(carerAlreadySigned \|\| careScope\?\.actorRole === "carer"\)/);
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
    expect(screen).toMatch(/Cancellation policy acknowledgement is required before sign off\./);
  });

  it("supports owner-approved early start without bypassing server authority", () => {
    expect(tier1Migration).toMatch(/add column if not exists early_start_allowed_at/);
    expect(tier1Migration).toMatch(/create or replace function public\.allow_service_early_start/);
    expect(tier1Migration).toMatch(/care_start_too_early/);
    expect(screen).toMatch(/Allow Early Start/);
    expect(screen).toMatch(/allow_service_early_start/);
    expect(screen).toMatch(/canServiceStartNow\(serviceChatRef\.current\)/);
  });

  it("splits Care Instruction edits from Care Scope edits so save-then-pay is not blocked", () => {
    expect(screen).toMatch(/const canSaveInstructionThenPay = paymentReadyBase && hasEditedCareInstruction/);
    expect(screen).toMatch(/if \(!canSignCareScope && !canPay && !canSaveInstructionThenPay\)/);
    expect(screen).not.toMatch(/Save the Care Instruction before paying\./);
  });

  it("locks an open payment sheet if the active Care Scope version changes", () => {
    expect(screen).toMatch(/const paymentLockedByScopeChange = !canSignCareScope/);
    expect(screen).toMatch(/This payment is paused because the Care Scope changed/);
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
    expect(screen).toMatch(/No payment will be collected for voluntary booking unless a paid total is proposed\./);
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
    expect(screen).toMatch(/const isNoChargeVoluntaryQuote = \(quote: ServiceQuoteCard \| null \| undefined\) =>\s*Boolean\(quote\) && !quoteHasPositivePrice\(quote\)/);
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

  it("uses stable Stripe idempotency for carer full-refund cancellation", () => {
    expect(cancelServiceBookingFunction).toMatch(/service_cancel_provider:\$\{row\.id\}:full/);
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
    expect(screen).toMatch(/Waiting for the owner to review & sign/);
    expect(screen).toMatch(/Care Scope is still under \$\{clean\(peerName\) \|\| "the carer"\}'s review/);
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
    expect(screen).toMatch(/Booking terms acknowledgement is required before sign off\./);
    expect(screen).toMatch(/Cancellation policy acknowledgement is required before sign off\./);
  });

  it("Care Instruction updates never create a new Care Scope version or reset signatures", () => {
    const instructionMigration = readMigration("care_instruction_in_place_update");
    const instructionSnapshotMigration = readMigration("care_instruction_agreement_snapshot_sync");
    expect(screen).toMatch(/update_service_care_instruction/);
    expect(screen).not.toMatch(/p_care_details: careDetails \}[\s\S]{0,120}create_care_scope_counterproposal/);
    expect(instructionMigration).toMatch(/create or replace function public\.update_service_care_instruction/);
    expect(instructionMigration).toMatch(/update public\.care_scope_versions\s+set care_details =/);
    expect(instructionMigration).not.toMatch(/insert_care_scope_version_for_service_chat/);
    expect(instructionSnapshotMigration).toMatch(/update public\.care_scope_versions\s+set care_details =/);
    expect(instructionSnapshotMigration).toMatch(/update public\.service_care_agreements/);
    expect(instructionSnapshotMigration).toMatch(/jsonb_build_object\('careDetails', v_version\.care_details\)/);
    expect(instructionSnapshotMigration).toMatch(/pdf_path = null/);
    expect(instructionSnapshotMigration).not.toMatch(/insert_care_scope_version_for_service_chat/);
    expect(instructionMigration).toMatch(/service_care_instruction_shared/);
    expect(instructionMigration).toMatch(/service_care_instruction_updated/);
    expect(screen).toMatch(/service_care_instruction_shared: `\$\{actorName\} shared the Care Instruction\.`/);
    expect(screen).toMatch(/service_care_instruction_updated: `\$\{actorName\} updated the Care Instruction\.`/);
    expect(screen).toMatch(/const hasEditedCareInstruction = comparableCurrentCareDetails !== comparableInitialCareDetails/);
    expect(screen).not.toMatch(/hasEditedCareScope[\s\S]{0,160}onUpdateCareDetails/);
    expect(screen).toMatch(/Slide to Update & Payment/);
    expect(screen).toMatch(/await onUpdateCareDetails\(currentCareDetails\)[\s\S]{0,220}currentMutualSignatures/);
  });

  it("Payment/Confirm Care Instruction fields are complete, field-local, and persisted separately", () => {
    const snapshotMigration = readMigration("care_instruction_contact_handoff_snapshot");
    expect(screen).toMatch(/contact\?: string/);
    expect(screen).toMatch(/handoffLocation\?: string/);
    expect(screen).toMatch(/requesterPhone=\{currentUserPhone\}/);
    expect(screen).toMatch(/Owner's Contact<\/Text>/);
    expect(screen).toMatch(/onValidityChange=\{setContactValid\}/);
    expect(screen).toMatch(/onFocus=\{\(\) => focusPaymentField\("contact"\)\}/);
    expect(screen).toMatch(/Add a valid owner's contact before confirming\./);
    expect(screen).toMatch(/Emergency contact<\/Text>/);
    expect(screen).toMatch(/onFocus=\{\(\) => focusPaymentField\("emergency"\)\}/);
    expect(screen).toMatch(/Hand-off location<\/Text>/);
    expect(screen).toMatch(/Carer need the exact hand-off location to begin Care session\./);
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
    const strictVoluntaryMigration = readMigration("confirm_voluntary_uses_strict_active_row");
    const payFn = screen.slice(screen.indexOf("const pay = useCallback"), screen.indexOf("const confirmVolunteerBooking"));
    const confirmFn = screen.slice(screen.indexOf("const confirmVolunteerBooking = useCallback"), screen.indexOf("const proceedPaymentDirect"));
    expect(payFn).toMatch(/const activeServiceChat = serviceChatRef\.current/);
    expect(payFn).toMatch(/const activeServiceChatId = clean\(activeServiceChat\?\.id\)/);
    expect(payFn).toMatch(/service_chat_id: activeServiceChatId/);
    expect(payFn).toMatch(/chat_id: roomId/);
    expect(confirmFn).toMatch(/const activeServiceChat = serviceChatRef\.current/);
    expect(confirmFn).toMatch(/const activeServiceChatId = clean\(activeServiceChat\?\.id\)/);
    expect(confirmFn).toMatch(/service_chat_id: activeServiceChatId/);
    expect(confirmFn).toMatch(/chat_id: roomId/);
    expect(paymentFunction).toMatch(/\.eq\("id", serviceChatId\)[\s\S]{0,180}\.maybeSingle\(\)/);
    expect(paymentFunction).toMatch(/current_active_service_chat_id_for_room/);
    expect(paymentFunction).not.toMatch(/\.eq\("chat_id", serviceChatId\)[\s\S]{0,160}\.eq\("status", "pending"\)[\s\S]{0,160}\.order\("updated_at"/);
    expect(paymentFunction).toMatch(/booking_snapshot_pending: snapshot[\s\S]{0,90}\.eq\("id", serviceChat\.id\)/);
    expect(paymentFunction).toMatch(/service_chat_id: serviceChat\.id/);
    expect(paymentFunction).toMatch(/idempotencyKey: `svc_pay_\$\{serviceChat\.id\}_/);
    expect(confirmFunction).toMatch(/\.eq\("id", serviceChatId\)[\s\S]{0,180}\.maybeSingle\(\)/);
    expect(confirmFunction).toMatch(/current_active_service_chat_id_for_room/);
    expect(confirmFunction).not.toMatch(/\.eq\("chat_id", serviceChatId\)[\s\S]{0,160}\.eq\("status", "pending"\)[\s\S]{0,160}\.order\("updated_at"/);
    expect(strictVoluntaryMigration).toMatch(/where id = public\.current_active_service_chat_id_for_room\(p_chat_id\)/);
    expect(strictVoluntaryMigration).not.toMatch(/where chat_id = p_chat_id and status = 'pending'[\s\S]{0,120}order by updated_at desc/);
    expect(confirmFunction).toMatch(/p_chat_id: serviceChat\.id/);
    expect(confirmFunction).not.toMatch(/p_chat_id: serviceChat\.chat_id/);
    expect(confirmFunction).toMatch(/body: \{ service_chat_id: serviceChat\.id, source: "voluntary_booking_confirmed" \}/);
    const voluntaryActiveRowMigration = readMigration("confirm_voluntary_active_service_row");
    expect(voluntaryActiveRowMigration).toMatch(/from public\.service_chats[\s\S]{0,80}where id = p_chat_id[\s\S]{0,80}for update/);
    expect(voluntaryActiveRowMigration).toMatch(/where chat_id = p_chat_id and status = 'pending'[\s\S]{0,120}order by updated_at desc[\s\S]{0,80}limit 1/);
    expect(voluntaryActiveRowMigration).toMatch(/values \(v_sc\.chat_id, v_uid/);
    expect(voluntaryActiveRowMigration).toMatch(/update public\.chats set last_message_at = now\(\) where id = v_sc\.chat_id/);
    expect(voluntaryActiveRowMigration).toMatch(/'\/service-chat\?room=' \|\| v_sc\.chat_id::text/);
  });

  it("post-payment confirm and cancellation also target the active service row", () => {
    const confirmPaymentFunction = readFileSync(join(repoRoot, "supabase/functions/confirm-service-payment/index.ts"), "utf8");
    const cancelFunction = readFileSync(join(repoRoot, "supabase/functions/cancel-service-booking/index.ts"), "utf8");
    const confirmServicePaymentFn = screen.slice(screen.indexOf("const confirmServicePayment = useCallback"), screen.indexOf("const confirmPendingServicePayment"));
    const cancelPaidBookingFn = screen.slice(screen.indexOf("const cancelPaidBooking = useCallback"), screen.indexOf("const submitCompletion"));
    expect(confirmServicePaymentFn).toMatch(/const activeServiceChatId = clean\(serviceChatRef\.current\?\.id\)/);
    expect(confirmServicePaymentFn).toMatch(/service_chat_id: activeServiceChatId/);
    expect(confirmServicePaymentFn).toMatch(/chat_id: roomId/);
    expect(confirmPaymentFunction).toMatch(/\.eq\("id", serviceChatId\)[\s\S]{0,180}\.maybeSingle\(\)/);
    expect(confirmPaymentFunction).toMatch(/current_active_service_chat_id_for_room/);
    expect(confirmPaymentFunction).toMatch(/const chatRoomId = serviceChat\.chat_id/);
    expect(confirmPaymentFunction).toMatch(/validateSessionForServiceChat\(session, serviceChat as Record<string, unknown>, \[serviceChat\.id, chatRoomId\], user\.id\)/);
    expect(confirmPaymentFunction).toMatch(/p_chat_id: chatRoomId/);
    expect(confirmPaymentFunction).toMatch(/insertServiceBookedMessage\(supabase, chatRoomId, user\.id\)/);
    expect(cancelPaidBookingFn).toMatch(/const activeServiceChatId = clean\(serviceChat\?\.id\)/);
    expect(cancelPaidBookingFn).toMatch(/service_chat_id: activeServiceChatId/);
    expect(cancelPaidBookingFn).toMatch(/chat_id: roomId/);
    expect(cancelFunction).toMatch(/\.eq\("id", serviceChatId\)[\s\S]{0,180}\.maybeSingle\(\)/);
    expect(cancelFunction).toMatch(/Old app builds sent the conversation chat_id/);
    expect(cancelFunction).toMatch(/p_chat_id: row\.chat_id/);
    expect(cancelFunction).toMatch(/service_chat_id: row\.id/);
    expect(cancelFunction).toMatch(/idempotencyKey: actorRole === "carer" \? `service_cancel_provider:\$\{row\.id\}:full`/);
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

  it("live agreement PDF room fallback resolves only the active service row, never an arbitrary history row", () => {
    expect(pdfFunction).toMatch(/\.eq\("id", serviceChatId\)[\s\S]{0,120}\.maybeSingle\(\)/);
    expect(pdfFunction).toMatch(/current_active_service_chat_id_for_room/);
    expect(pdfFunction).toMatch(/snapshotModeInput === "live" && canonicalId/);
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
    // the old bordered action row inside the expanded body is gone
    expect(cardBlock).not.toMatch(/styles\.scopeActionRow/);
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
    expect(screen).toMatch(/The agreement is being prepared\. Please check again shortly\./);
  });

  it("paid checkout pending state is a five-minute retry lock with a countdown, then Proceed Payment returns", () => {
    const paymentFunction = readFileSync(join(repoRoot, "supabase/functions/create-service-payment/index.ts"), "utf8");
    expect(paymentFunction).toMatch(/CARE_PAYMENT_RETRY_LOCK_MS = 5 \* 60 \* 1000/);
    expect(paymentFunction).toMatch(/Math\.min\(stripeExpiresAtMs, retryLockExpiresAtMs\)/);
    expect(paymentFunction).toMatch(/const paymentAttemptId = crypto\.randomUUID\(\)/);
    expect(paymentFunction).toMatch(/payment_attempt_id: paymentAttemptId/);
    expect(paymentFunction).toMatch(/idempotencyKey: `svc_pay_\$\{serviceChat\.id\}_\$\{mode\}_\$\{customerId\}_\$\{currency\}_\$\{customerTotal\}_\$\{scopeVersionId\}_\$\{scopeHash\}_\$\{paymentAttemptId\}`/);
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
    expect(screen).toMatch(/Care Scope is still under \$\{clean\(peerName\) \|\| "the carer"\}'s review/);
    expect(screen).toMatch(/\$\{clean\(peerName\) \|\| "The owner"\} already agreed to this Care Scope/);
    expect(screen).not.toMatch(/clean\(ownerName\)/);
    expect(screen).toMatch(/\{actionPrimary && !actionPrimary\.disabled \? \(/);
    expect(screen).toMatch(/scope\.actorRole === "carer" && !scope\.ownerSigned[\s\S]{0,120}Review & Sign Care Scope/);
    expect(screen).not.toMatch(/Waiting for the carer to confirm the scope", onPress: \(\) => undefined, disabled: true/);
    expect(screen).not.toMatch(/Waiting for the owner to pay", onPress: \(\) => undefined, disabled: true/);
    expect(screen).not.toMatch(/Carer is finishing payout setup", onPress: \(\) => setActiveSheet\("payment"\), disabled: true/);
  });

  it("owner-signed-first path pays/confirms after late carer signature without stale update mode", () => {
    expect(screen).toMatch(/const mutuallyAgreed = hasCurrentCareScopeAgreement\(serviceChat\)/);
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
    expect(screen).toMatch(/Share Care Session PIN/);
    expect(screen).toMatch(/Enter PIN and 📸/);
    expect(screen).toMatch(/Collect 4-digit PIN, then take a timestamped photo of the pet to start care\./);
    expect(screen).toMatch(/function ServiceActionCard/);
    expect(screen).toMatch(/styles\.serviceActionLayer/);
    expect(screen).toMatch(/styles\.serviceActionCard/);
    expect(screen).toMatch(/serviceActionCollapsed/);
    expect(screen).toMatch(/const isCollapsed = staticCard \? false : \(locked \|\| collapsed\)/);
    expect(screen).toMatch(/accessibilityLabel=\{isCollapsed \? "Expand action card" : "Collapse action card"\}/);
    expect(screen).toMatch(/name=\{isCollapsed \? "chevron-up" : "chevron-down"\}/);
    expect(screen).toMatch(/headerRight=\{isRequester && activeStartPin \? <StartPinDetailCard digits=\{sanitizeStartPin\(activeStartPin\)\.split\(""\)\} \/> : null\}/);
    // Once the owner shares the PIN, their card locks (no toggle affordance, forced
    // collapsed) and the header title itself becomes the "Share Care Session PIN"
    // confirmation label -- the CTA/cancel-booking actions are only visible pre-share.
    expect(screen).toMatch(/locked=\{isRequester && careStatus === "pin_shared"\}/);
    expect(screen).toMatch(/title=\{isRequester \? \(careStatus === "pin_shared" \? "Share Care Session PIN" : "Your Care Session PIN"\) : "Enter PIN and 📸"\}/);
    expect(screen).toMatch(/\{locked \|\| staticCard \? null : \(/);
    expect(screen).not.toMatch(/<Text style=\{styles\.handoffBannerTitle\}>Share PIN Required<\/Text>/);
    expect(screen).not.toMatch(/<Text style=\{styles\.handoffBannerTitle\}>Start PIN required<\/Text>/);
  });

  it("Start Care sheet never pre-fills the PIN the carer must type from memory", () => {
    expect(screen).not.toMatch(/initialPin/);
    expect(screen).toMatch(/\/\/ Never pre-fill the PIN/);
    expect(screen).toMatch(/setPin\(""\)/);
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
    expect(screen).toMatch(/Care can only begin on the scheduled service date\./);
    expect(screen).toMatch(/ImagePicker\.requestCameraPermissionsAsync\(\)/);
    expect(screen).toMatch(/ImagePicker\.launchCameraAsync/);
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
    const cancelModalBlock = screen.slice(screen.indexOf("confirmCancelBookingOpen ? ("), screen.indexOf("<AppSlideConfirm", screen.indexOf("confirmCancelBookingOpen ? (")));
    expect(cancelModalBlock).not.toMatch(/placeholder=\{?"?Optional"?\}?/);
    expect(cancelModalBlock).toMatch(/AppBottomSheetScroll/);
    expect(cancelModalBlock).toMatch(/KeyboardAvoidingView/);
    expect(screen).not.toMatch(/cancel_voluntary_service_booking/);
    const cancelFunction = readFileSync(join(repoRoot, "supabase/functions/cancel-service-booking/index.ts"), "utf8");
    expect(cancelFunction).toMatch(/const actorRole = row\.requester_id === user\.id \? "owner" : row\.provider_id === user\.id \? "carer" : ""/);
    expect(cancelFunction).toMatch(/cancel_service_booking_without_payment/);
    expect(cancelFunction).toMatch(/cancel_paid_booking_by_provider_after_refund/);
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
    expect(screen).toMatch(/Location\.requestForegroundPermissionsAsync\(\)/);
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

  it("Report Issue has visible evidence upload; Cancel Booking evidence upload is carer-only", () => {
    expect(screen).toMatch(/Report Issue/);
    expect(screen).toMatch(/Add Supporting Information/);
    expect(screen).toMatch(/Slide to Report/);
    const cancelBookingBlock = screen.slice(
      screen.indexOf("confirmCancelBookingOpen ? ("),
      screen.indexOf("Slide to Cancel Booking"),
    );
    // Carer cancellations can attach supporting evidence for the trust/dispute review;
    // the field is gated behind isProvider so owner cancellations never see it.
    expect(cancelBookingBlock).toMatch(/isProvider \? \(/);
    expect(cancelBookingBlock).toMatch(/pickCancelEvidence/);
    expect(cancelBookingBlock).toMatch(/Add Supporting Information/);
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
    const m = notif.match(/allowedNotificationPath = \(path: string\) =>\s*\/\^([\s\S]*?)\/\.test/);
    expect(m).toBeTruthy();
    const allow = m![1];
    // Every routable screen a notification can deeplink to must be present, or its
    // row renders disabled and the tap does nothing (the care-chat deeplink bug).
    for (const route of [
      "service-chat", "service", "chat-dialogue", "chats", "social", "map", "threads",
      "verify-identity", "pet-details", "edit-pet-profile", "profile", "premium", "settings", "notifications",
    ]) {
      expect(allow.includes(route)).toBe(true);
    }
  });
});

describe("Book Care sheet — manual pet + draft + currency (2026-06-27 batch)", () => {
  it("backend request validator accepts a manual pet (petId OR petName), not petId only", () => {
    const m = readMigration("service_request_allow_manual_pet");
    expect(m).toMatch(/v_has_pet :=[\s\S]{0,160}petId[\s\S]{0,40}or[\s\S]{0,60}petName/);
    expect(m).toMatch(/create or replace function public\.validate_service_request_payload/);
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
    expect(requestSheet).toMatch(/petChoicesOpen \? \([\s\S]{0,240}<RequestPetCarousel/);
  });
  it("mixed profile + manual pets stay compact in the Care Scope summary", () => {
    const summary = sourceBlock("SelectedPetPolaroid");
    expect(summary).toMatch(/\[\.\.\.profilePets, \.\.\.manualPets\]\.map/);
    expect(summary).toMatch(/profilePets\.length === 0 \? manualPets\.map/);
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
  it("care type derives from the carer's offered services (full palette only as not-loaded fallback)", () => {
    expect(screen).toMatch(/const scoped = Array\.from\(new Set\(\(providerServices \|\| \[\]\)\.map\(clean\)\.filter\(Boolean\)\)\);\s*return scoped\.length > 0 \? scoped : \[\.\.\.SERVICES_OFFERED\]/);
    expect(screen).toMatch(/if \(providerServices\.length === 0 && accessToken\)/);
    expect(screen).toMatch(/fetchNativeServiceProviderDetail\(\{/);
    // no leftover loading-gate that would blank the dropdown
    expect(screen).not.toMatch(/providerServicesLoading/);
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
  });
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

describe("Completion CTA is a tap that opens the real slider (2026-07-02 fix)", () => {
  it("composer entry point is honestly labeled 'Complete Care Session', not 'Slide to Complete'", () => {
    expect(screen).toMatch(/const completionComposerCtaLabel = "Complete Care Session"/);
    expect(screen).toMatch(/label: completionComposerCtaLabel, onPress: handleStartCompletion/);
  });
  it("the REAL slide-to-confirm inside CompletionSheet is untouched", () => {
    expect(screen).toMatch(/const completionCtaLabel = "Slide to Complete"/);
    expect(screen).toMatch(/ctaLabel=\{completionCtaLabel\}/);
    expect(screen).toMatch(/label={ctaLabel \|\| "Complete Care Session"}/);
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

describe("Auto-complete countdown banner above composer (2026-07-02)", () => {
  it("shows a live countdown to the same 48h window the backend cron uses, gated to in-progress + eligible completer", () => {
    expect(screen).toMatch(/const autoCompleteAtMain = useMemo\(\(\) => addHoursIso\(scheduledEndAtMain, PAYOUT_AUTO_RELEASE_HOURS\)/);
    expect(screen).toMatch(/const showCompletionCountdown = Boolean\(/);
    expect(screen).toMatch(/&& canConfirmCompletion/);
  });
  it("title has no 'unless you report an issue' wording (avoids inviting bad-faith reports); Report issue is a separate plain link", () => {
    const banner = screen.slice(screen.indexOf("showCompletionCountdown && actionPrimary && !showReviewComposerCta"), screen.indexOf("showCompletionCountdown && actionPrimary && !showReviewComposerCta") + 900);
    const rendered = banner.split("\n").filter((line) => !line.trim().startsWith("//")).join("\n");
    expect(banner).toMatch(/title=\{`Auto-completes in \$\{completionCountdownLabel\}`\}/);
    expect(rendered).not.toMatch(/unless/i);
    expect(banner).toMatch(/Report issue/);
    expect(banner).toMatch(/onPress=\{openIssueReportSheet\}/);
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
  it("CareScopeAgreementPaymentDetails accepts hideWhenFree and skips the free-session note when set", () => {
    const block = sourceBlock("CareScopeAgreementPaymentDetails");
    expect(block).toMatch(/const hasActiveQuote = Boolean\(quoteCard\)/);
    expect(block).toMatch(/const hasRequestOffer = !hasActiveQuote && Number\.isFinite\(requestOffer\) && requestOffer > 0/);
    expect(block).toMatch(/if \(!hasPaidQuote && !hasRequestOffer && hideWhenFree\) return null;/);
  });
  it("the requester's Confirm/Payment sheet passes hideWhenFree at Step 2 (Confirm & Pay) only — Step 1 (Agree) still shows it once", () => {
    expect(screen).toMatch(/<CareScopeAgreementPaymentDetails hideWhenFree=\{!canSignCareScope\} providerCurrency=\{curr\} quoteCard=\{quoteCard\} requestCard=\{requestCard\} viewerRole="requester" \/>/);
  });
  it("the carer's own Review & Sign sheet is untouched (single occurrence, no duplication there)", () => {
    expect(screen).toMatch(/<CareScopeAgreementPaymentDetails providerCurrency=\{providerCurrency\} quoteCard=\{proposedQuoteCard\} requestCard=\{proposedScopeRequestCard\} viewerRole="provider" \/>/);
  });
});

describe("Care Scope sign-off source of truth and cancellation acknowledgement (2026-07-03)", () => {
  it("uses the active quote as payment source of truth so a $0 quote cannot fall back to stale request payment", () => {
    expect(screen).toMatch(/const careScopePaymentAmount = \(quote: ServiceQuoteCard \| null \| undefined, request: ServiceRequestCard \| null \| undefined\) => \{/);
    expect(screen).toMatch(/if \(quote\) return Number\.isFinite\(quoteAmount\) && quoteAmount > 0 \? quoteAmount : 0/);
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
    expect(screen).toMatch(/I understand the cancellation policy for this Care booking\./);
    expect(screen).toMatch(/I understand that confirmed Care bookings are a commitment, even when no payment is involved\./);
    expect(screen).toMatch(/I understand that last-minute cancellations, confirmed no-shows, or serious trust violations may restrict my ability to provide Care on huddle\./);
    expect(screen).not.toMatch(/<Text style=\{styles\.paymentInfoTitle\}>Waiting for the carer<\/Text>/);
    expect(screen).not.toMatch(/<Text style=\{styles\.paymentInfoTitle\}>Step 1 · Agree to Care Scope<\/Text>/);
  });

  it("uses the simplified return button copy from edit mode", () => {
    expect(screen).toMatch(/>Return without Change<\/AppModalButton>/);
    expect(screen).not.toMatch(/Return to Payment without change/);
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
    expect(screen).toMatch(/const isNoChargeVoluntaryQuote = \(quote: ServiceQuoteCard \| null \| undefined\) =>\s*Boolean\(quote\) && !quoteHasPositivePrice\(quote\)/);
  });
  it("'Payment released' timeline step is gated on that same per-quote check — a volunteer carer who accepts a price on THIS booking still gets it", () => {
    expect(screen).toMatch(/const noChargeVoluntaryBooking = isNoChargeServiceChat\(chat\)/);
    expect(screen).toMatch(/if \(isProvider && !noChargeVoluntaryBooking\) \{\s*items\.push\(\{\s*label: "Payment released"/);
  });
});
