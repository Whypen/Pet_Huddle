import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appRoot = resolve(__dirname, "../..");
const repoRoot = resolve(appRoot, "..");
const read = (path: string) => readFileSync(join(repoRoot, path), "utf8");
const migration = read("supabase/migrations/20260716210000_care_payment_movement_ledger.sql");
const reconciliation = read("supabase/migrations/20260716223000_care_payment_movement_reconciliation_notifications.sql");
const notificationGuard = read("supabase/migrations/20260716224500_care_payment_notification_concurrency_guard.sql");
const serviceIdNotificationRoute = read("supabase/migrations/20260716230000_care_payment_service_id_notification_routes.sql");
const payoutDispatchFallback = read("supabase/migrations/20260717001000_care_payout_dispatch_vault_fallback.sql");
const payoutAttemptHistory = read("supabase/migrations/20260717002000_care_payout_history_attempt_record.sql");
const sync = read("supabase/functions/sync-care-payment-movements/index.ts");
const webhook = read("supabase/functions/stripe-webhook/index.ts");
const releasePayout = read("supabase/functions/release-service-payout/index.ts");
const releaseCancellationPayout = read("supabase/functions/release-service-cancellation-payout/index.ts");
const nativePayments = read("app/src/lib/nativeCarePayments.ts");
const screen = read("app/src/screens/NativeServiceChatScreen.tsx");
const admin = read("src/pages/admin/AdminSafety.tsx");

describe("Care payment movement contract", () => {
  it("captures every Care refund and transfer writer against the exact service row", () => {
    for (const source of ["service_chats", "care_scope_versions", "service_disputes", "care_money_flow_execution_attempts"]) {
      expect(migration).toContain(source);
    }
    expect(migration).toMatch(/external_key\s+text\s+not\s+null\s+unique/i);
    expect(migration).toContain("service_chat_id uuid not null references public.service_chats(id)");
    expect(migration).not.toContain("current_active_service_chat_id_from_any_id");
  });

  it("maps payouts only through Stripe's destination payment balance transaction", () => {
    expect(sync).toContain("source === destinationPaymentId");
    expect(sync).toContain("destinationPaymentsForPayout");
    expect(sync).toContain("stripe_connected_balance_transaction_id");
    expect(sync).toContain("payout_connected_account_mismatch");
    expect(sync).not.toContain("payouts.length < 1000");
    expect(sync).not.toMatch(/amount\s*===\s*transfer\.amount/);
  });

  it("uses webhooks first, immediate exact sync, hourly due-only recovery, and terminal stop", () => {
    expect(reconciliation).toContain("queue_care_payment_movement_sync");
    expect(reconciliation).toContain("sync-care-payment-movements-hourly");
    expect(reconciliation).toContain("where exists");
    expect(reconciliation).toContain("alter column next_sync_at drop not null");
    expect(sync).toContain("next_sync_at: nextSyncAt");
    expect(sync).toContain("reconciliation_attention_at");
    expect(sync).toContain("retryDelayMs === null ? null");
  });

  it("keeps owner refund and carer payout details role-separated", () => {
    expect(migration).toContain("sc.requester_id = v_uid and m.movement_kind = 'owner_refund'");
    expect(migration).toContain("sc.provider_id = v_uid and m.movement_kind = 'carer_payout'");
    expect(nativePayments).toContain("get_my_service_care_payment_statuses");
    expect(nativePayments).toContain("serviceChatId: clean(row.service_chat_id)");
    expect(reconciliation).toContain("'last_synced_at', m.last_synced_at");
    expect(reconciliation).toContain("'action_required'");
  });

  it("renders live arrival and trace details without claiming estimated money has arrived", () => {
    expect(screen).toContain('label: "Refund on the way"');
    expect(screen).toContain('label: "Refund processed"');
    expect(screen).toContain('label: "Payment on the way"');
    expect(screen).toContain('label: "Payment released"');
    expect(screen).toContain('label: "Payment pending"');
    expect(screen).not.toContain('label: "Payment on the way", detail: "Status updating"');
    expect(screen).toContain("Clipboard.setStringAsync");
    expect(screen).toContain("paymentMovementByServiceId");
    expect(screen).toContain("Last updated at ${time} on ${date}");
    expect(screen).toContain("Payment setup needed");
    expect(screen).toContain("Review payout account");
    expect(sync).toContain("const arrivalAt = payout ? iso(payout.arrival_date) : null");
    expect(sync).toContain("estimated_arrival_at: arrivalAt");
    expect(sync).toContain('paid_at: status === "paid" ? arrivalAt : null');
    expect(sync).toContain("estimated_arrival_at: status === \"succeeded\" ? addBusinessDays(stripeCreatedAt, 10) : null");
    expect(sync).toContain("last_synced_at: new Date().toISOString()");
  });

  it("sends only the approved transition notifications and removes premature release copy", () => {
    expect(reconciliation).toContain("Care Refund: On the way");
    expect(reconciliation).toContain("Care Refund: Delayed");
    expect(reconciliation).toContain("Care Payment: On the way");
    expect(reconciliation).toContain("Care Payment: Released");
    expect(reconciliation).toContain("Payment setup needed");
    expect(reconciliation).not.toContain("Reference available");
    expect(notificationGuard).toContain("pg_advisory_xact_lock");
    expect(notificationGuard).toContain("service_notify_once_serialized");
    expect(releasePayout).not.toContain('p_title: "Payout released"');
    expect(releaseCancellationPayout).not.toContain('p_title: "Payout released"');
  });

  it("keeps payment identity and notification routing on the immutable service id", () => {
    expect(serviceIdNotificationRoute).toContain("/service-chat?service=");
    expect(serviceIdNotificationRoute).toContain("&historyService=");
    expect(serviceIdNotificationRoute).not.toContain("room=");
    expect(serviceIdNotificationRoute).not.toContain("'chatId'");
    expect(screen).toContain('historyService: clean(params.get("historyService")');
    expect(screen).toContain('.eq("id", params.service)');
    expect(releasePayout).toContain("claim_service_payout_release_by_service_id");
    expect(releaseCancellationPayout).toContain("claim_service_payout_release_by_service_id");
    expect(releaseCancellationPayout).not.toContain('rpc("claim_service_payout_release"');
  });

  it("dispatches due payouts with the configured Vault credentials and exact service id", () => {
    expect(payoutDispatchFallback).toContain("vault.decrypted_secrets");
    expect(payoutDispatchFallback).toContain("supabase_project_url");
    expect(payoutDispatchFallback).toContain("supabase_service_role_key");
    expect(payoutDispatchFallback).toContain("jsonb_build_object('service_chat_id', rec.id)");
    expect(payoutDispatchFallback).not.toContain("jsonb_build_object('service_chat_id', rec.chat_id)");
  });

  it("keeps a service-keyed History record even when Stripe rejects the payout before transfer creation", () => {
    expect(payoutAttemptHistory).toContain("payout-service:' || p_service_chat_id::text");
    expect(payoutAttemptHistory).toContain("payout_release_requested_at is not null");
    expect(payoutAttemptHistory).toContain("payout_account_unavailable");
    expect(payoutAttemptHistory).toContain("update public.service_chats");
    expect(releasePayout).toContain("p_amount_minor: providerPayoutCents");
    expect(releaseCancellationPayout).toContain("p_amount_minor: cancellationPayoutCents");
    expect(sync).toContain("skipped_pre_transfer");
    expect(sync).toContain("!clean(movement.stripe_transfer_id)");
    expect(releasePayout).not.toContain("roomChatId");
    expect(releaseCancellationPayout).not.toContain("roomChatId");
  });

  it("puts complete Stripe movement evidence and failures in the admin Care case", () => {
    expect(admin).toContain("admin_get_service_care_payment_movements");
    expect(admin).toContain("Money movements");
    expect(admin).toContain("Payout trace ID");
    expect(admin).toContain("failure_message_safe");
    expect(admin).toContain("admin_request_care_payment_movement_refresh");
    expect(webhook).toContain('case "refund.updated"');
    expect(webhook).toContain('case "payout.paid"');
  });
});
