import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appRoot = resolve(__dirname, "../..");
const repoRoot = resolve(appRoot, "..");
const screen = readFileSync(join(appRoot, "src/screens/NativeServiceChatScreen.tsx"), "utf8");
const updates = readFileSync(join(appRoot, "src/lib/nativeCareUpdates.ts"), "utf8");
const social = readFileSync(join(appRoot, "src/lib/nativeSocial.ts"), "utf8");
const strictMigration = readFileSync(join(repoRoot, "supabase/migrations/20260714210000_care_updates_strict_service_identity_and_reminders.sql"), "utf8");
const strictCompletionMigration = readFileSync(join(repoRoot, "supabase/migrations/20260714212000_care_completion_exact_identity_prompt_only_updates.sql"), "utf8");
const strictPaymentMigration = readFileSync(join(repoRoot, "supabase/migrations/20260714213000_care_booking_payment_exact_rpc_boundaries.sql"), "utf8");
const strictPinMigration = readFileSync(join(repoRoot, "supabase/migrations/20260714214000_prepare_start_pin_exact_service_identity.sql"), "utf8");
const payoutMigration = readFileSync(join(repoRoot, "supabase/migrations/20260714211000_care_payout_exact_service_identity.sql"), "utf8");
const namedPayoutMigration = readFileSync(join(repoRoot, "supabase/migrations/20260714215000_care_payout_named_exact_rpc_boundaries.sql"), "utf8");
const payoutFunction = readFileSync(join(repoRoot, "supabase/functions/release-service-payout/index.ts"), "utf8");
const edgeFunctions = [
  "create-service-payment",
  "confirm-service-payment",
  "confirm-voluntary-service-booking",
  "generate-care-agreement-pdf",
  "stripe-webhook",
].map((name) => readFileSync(join(repoRoot, `supabase/functions/${name}/index.ts`), "utf8")).join("\n");

describe("Care booking identity boundary", () => {
  it("uses a room id only to create a new booking", () => {
    const roomInputs = screen.match(/p_chat_id:\s*(roomId|nextChatId)/g) || [];
    expect(roomInputs).toEqual(["p_chat_id: roomId", "p_chat_id: nextChatId"]);
    expect(screen.match(/send_service_request/g)?.length).toBe(2);
  });

  it("keeps ordinary chat media room-scoped while every Care evidence path is service-row-scoped", () => {
    expect(screen).toContain("uploadNativeServiceChatAttachmentImage({ accessToken, chatRoomId: roomId");
    expect(social).toMatch(/uploadNativeServiceChatAttachmentImage\(options: \{[\s\S]{0,160}chatRoomId: string/);
    expect(social).toMatch(/service-chat\/\$\{chatRoomId\}/);
    expect(social).not.toMatch(/uploadNativeServiceChatAttachmentImage\(options: \{[\s\S]{0,160}serviceChatId: string/);

    expect(social).toMatch(/uploadNativeServiceCareEvidenceImage\(options: \{[\s\S]{0,220}serviceChatId: string/);
    expect(social).toMatch(/service-care\/\$\{serviceChatId\}/);
    expect(updates).toContain("serviceChatId: options.serviceChatId");
    expect(updates).not.toContain("chatId: options.serviceChatId");
  });

  it("routes every existing-booking native mutation through exact service-id RPCs", () => {
    for (const rpc of [
      "get_service_care_update_status_by_service_id",
      "submit_service_care_update_by_service_id",
      "prepare_service_start_pin_by_service_id",
      "share_service_start_pin_by_service_id",
      "submit_service_checkin_by_service_id",
      "verify_service_start_pin_by_service_id",
      "submit_provider_completion_by_service_id",
      "submit_requester_completion_by_service_id",
      "complete_service_if_both_confirmed_by_service_id",
      "withdraw_service_request_by_service_id",
      "submit_service_issue_report_by_service_id",
      "submit_handoff_problem_by_service_id",
      "submit_service_no_start_report_by_service_id",
      "submit_requester_handoff_response_by_service_id",
    ]) {
      expect(`${screen}\n${updates}`).toContain(rpc);
      expect(`${strictMigration}\n${strictCompletionMigration}\n${strictPinMigration}`).toContain(`public.${rpc}`);
    }
    expect(strictMigration).not.toMatch(/_by_service_id[\s\S]{0,900}current_active_service_chat_id_from_any_id/);
    expect(strictCompletionMigration).not.toMatch(/perform public\.(?:submit_requester_completion|complete_service_if_both_confirmed|withdraw_service_request)\(v_sc\.chat_id/);
    expect(strictCompletionMigration).not.toMatch(/where chat_id = p_service_chat_id/);
  });

  it("never blocks an existing Care action merely because the legacy room id is stale or absent", () => {
    expect(screen).not.toMatch(/if \(!roomId \|\| !serviceChat \|\| !activeServiceChatId\)/);
    expect(screen).not.toMatch(/if \(!roomId \|\| !activeServiceChatId\)/);
    expect(screen).not.toMatch(/if \(!roomId \|\| !activeServiceChat \|\| !activeServiceChatId/);
    expect(screen).not.toMatch(/if \(!roomId \|\| !activeServiceChatId \|\| !hasPaymentAmount\)/);
  });

  it("does not let payment, PDF, or Stripe webhook functions resolve a room to a booking", () => {
    expect(edgeFunctions).not.toContain("current_active_service_chat_id_for_room");
    expect(edgeFunctions).not.toContain("current_active_service_chat_id_from_any_id");
    expect(edgeFunctions).toContain("finalize_service_care_agreement_for_payment_by_service_id");
    expect(edgeFunctions).toContain("confirm_voluntary_service_booking_by_service_id");
    expect(edgeFunctions).toContain("notify_service_booking_confirmed_by_service_id");
    expect(edgeFunctions).not.toContain('rpc("finalize_service_care_agreement_for_payment",');
    expect(edgeFunctions).not.toContain('rpc("confirm_voluntary_service_booking",');
    expect(edgeFunctions).not.toContain('rpc("notify_service_booking_confirmed",');
    expect(strictPaymentMigration).not.toContain("current_active_service_chat_id_for_room");
    expect(strictPaymentMigration).not.toContain("current_active_service_chat_id_from_any_id");
  });

  it("dispatches payout by service row and never updates every booking in a room", () => {
    expect(payoutMigration).toMatch(/select sc\.id, sc\.chat_id[\s\S]{0,1800}body := jsonb_build_object\('service_chat_id', rec\.id\)/);
    expect(payoutMigration).not.toContain("where chat_id = rec.chat_id");
    expect(payoutMigration).not.toContain("'service_chat_id', rec.chat_id");
    expect(`${payoutMigration}\n${payoutFunction}`).not.toMatch(/care_update_required|service_chat_care_update_requirement_met|service_chat_care_update_hard_completion_met/);
    for (const rpc of [
      "claim_service_payout_release_by_service_id",
      "unlock_service_payout_release_by_service_id",
      "mark_service_payout_release_failed_by_service_id",
      "mark_service_payout_manual_recovery_by_service_id",
      "mark_service_payout_released_by_service_id",
    ]) {
      expect(payoutFunction).toContain(rpc);
      expect(namedPayoutMigration).toContain(`public.${rpc}`);
    }
    expect(payoutFunction).not.toMatch(/p_chat_id\s*:/);
  });
});

describe("Care chat structural regressions", () => {
  it("keeps both completion entry and final confirmation as sliders", () => {
    expect(screen).toMatch(/completionPrimaryActionIsSlider[\s\S]{0,280}<SlideToConfirm/);
    expect(screen).toMatch(/<CompletionSheet[\s\S]{0,900}ctaLabel=\{completionCtaLabel\}/);
  });

  it("renders the header menu in window coordinates and keeps Care Scope above the message scroller", () => {
    expect(screen).toMatch(/measureInWindow/);
    expect(screen).toMatch(/<Modal animationType="fade"[\s\S]{0,500}styles\.headerActionMenuAnchor/);
    const banner = screen.indexOf("<View style={styles.timelineBannerWrap}>");
    const messageScroll = screen.indexOf("<ScrollView", banner);
    expect(banner).toBeGreaterThan(0);
    expect(messageScroll).toBeGreaterThan(banner);
    expect(screen.slice(messageScroll, messageScroll + 2500)).not.toContain("styles.timelineBannerWrap");
  });
});
