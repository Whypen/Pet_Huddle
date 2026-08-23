import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Narrow regression proof for the final native Care policy alignment. This deliberately
// checks only the policy/legal/payment surfaces changed in this pass; it does not duplicate
// the broader Care UI state-machine suite.
const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "../..");
const repoRoot = resolve(appRoot, "..");
const read = (path: string) => readFileSync(join(repoRoot, path), "utf8");

const nativeLegal = read("app/src/content/nativeLegalPages.ts");
const screen = read("app/src/screens/NativeServiceChatScreen.tsx");
const pingPong = read("docs/Contracts/care_scope_ping_pong_contract.md");
const payment = read("supabase/functions/create-service-payment/index.ts");
const cancellation = read("supabase/functions/cancel-service-booking/index.ts");
const pdf = read("supabase/functions/generate-care-agreement-pdf/pdf.ts");
const noStartMigration = read("supabase/migrations/20260714120000_care_no_start_rover_outcome_matrix.sql");

describe("final Care policy contract parity", () => {
  it("keeps the native legal source global and Huddle-protective", () => {
    expect(nativeLegal).not.toMatch(/\b(?:HK|Hong Kong)\b/i);
    expect(nativeLegal).toContain("These Terms apply globally");
    expect(nativeLegal).toContain("final and binding individual arbitration");
    expect(nativeLegal).toContain("These Terms, together with the policies and booking terms they incorporate, are the entire agreement");
    expect(nativeLegal).toContain("If any provision is held invalid or unenforceable");
    expect(nativeLegal).toContain("A chargeback made in bad faith or instead of that process is a material breach");
    expect(nativeLegal).toMatch(/voids all huddle platform protections, dispute rights, payout guarantees, and booking safeguards/i);
    expect(nativeLegal).toContain("the carer may take reasonable protective steps and, within 12 hours after the booked end");
    expect(nativeLegal).toContain("A cancellation trust penalty is a marketplace-ranking consequence, not an undisclosed cash deduction");
  });

  it("states the no-start responsibility matrix without promising a refund or payout", () => {
    expect(nativeLegal).toContain("A paid no-start outcome is determined under the applicable evidence-based no-start policy and may be a full refund, no refund, a reserved-time payout to the carer, a retained amount, or review");
    expect(nativeLegal).toContain("The 50% retained amount described below applies to the applicable owner-requested self-cancellation tier, not as a fixed system no-start result.");
    expect(nativeLegal).toContain("For a no-payment booking, no payment, refund, retention, or payout occurs");
    expect(nativeLegal).toContain("Silence does not guarantee a refund");
    expect(screen).toContain("If the carer is a no-show, you must report it before the scheduled end time");
    expect(screen).toContain("Please start care immediately or report any issue before the scheduled end time");
    expect(screen).toContain("will automatically cancel under the no-start policy");
    expect(screen).toMatch(/I have read and agree to the cancellation and no-start policy \(including automatic cancellation at the scheduled end time\)\. I understand that last-minute cancellations, confirmed no-shows, or serious trust violations may restrict my ability to provide Care on huddle\./i);
    expect(screen).toContain("A refund is not guaranteed.");
    expect(screen).toContain("Payout is not guaranteed.");
    expect(screen).toContain("huddle may hold payment during review.");
    expect(screen).not.toContain("We'll hold payment during review.");
    expect(screen).not.toContain("so we can hold payment while we review it");
    expect(screen).toContain("no carer cancellation payout is released");
    expect(screen).not.toContain("you keep 50%");
    expect(screen).not.toContain("you keep the full amount");
    expect(screen).toContain("This is a no-charge booking, so no payment or payout is involved");
    expect(screen).not.toContain("with no impact on your Care record");
    expect(pingPong).toContain("A no-payment booking has no financial movement");
    expect(screen).toContain('setSharedStartPin("")');
    expect(screen).toContain('title={systemNoStartCancellationPending ? "Cancelling…"');
    expect(screen).toContain('title="Care session cancelled"');
    expect(screen).toContain("onPress={hideCurrentCareHistory}");
  });

  it("keeps 50% owner cancellation, PDF, and payment snapshots aligned", () => {
    expect(screen).toContain("50% refund to your original payment method. huddle retains the remaining 50%.");
    expect(payment).toContain("24 to 72 hours before care starts - you receive a 50% refund. HUDDLE retains the remaining 50%.");
    expect(cancellation).toContain("const providerCancellationPayoutCents");
    expect(cancellation).toMatch(/: hours >= 24\s*\n\s*\? 0/);
    expect(pdf).toContain("24 to 72 hours before care starts - you receive a 50% refund. HUDDLE retains the remaining 50%.");
    expect(pdf).toContain("A booking with no payment has nothing to move");
    expect(pdf).toContain("A cancellation affects how you rank in the marketplace; it is never a hidden deduction from your earnings");
  });

  it("keeps the system cancellation notification and money guards intact", () => {
    expect(noStartMigration).toContain("The care session is overdue and was cancelled under the no-start policy.");
    expect(noStartMigration).toContain("Care Session: No-start Cancellation");
    expect(noStartMigration).toMatch(/perform public\.service_notify\(rec\.requester_id/);
    expect(noStartMigration).toMatch(/perform public\.service_notify\(rec\.provider_id/);
    expect(noStartMigration).toContain("cancellation_provider_payout_cents = 0");
    expect(screen).toContain("const MAX_CARE_REPORT_EVIDENCE = 10");
  });

  it("gives an expired handoff refund review a direct support exit without claiming money moved", () => {
    expect(screen).toContain('const manualRefundReview = careStatus === "handoff_expired_manual_refund_required"');
    expect(screen).toMatch(/manualRefundReview[\s\S]{0,1200}title="Refund under review"/);
    expect(screen).toMatch(/manualRefundReview[\s\S]{0,1600}onPress=\{\(\) => onNavigate\("\/support"\)\}/);
    expect(screen).toContain("A refund is not final until your bank confirms it.");
  });
});
