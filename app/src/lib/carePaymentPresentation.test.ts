import { describe, expect, it } from "vitest";
import { presentCarePaymentMovement, presentMissingCarePayment } from "./carePaymentPresentation";
import { parseNativeCarePaymentMovement, type NativeCarePaymentMovement } from "./carePaymentMovementParser";

const date = (value: string | null | undefined) => value ? `DATE:${value}` : "";
const base = (overrides: Partial<NativeCarePaymentMovement> = {}): NativeCarePaymentMovement => ({
  serviceChatId: "service-1", id: "movement-1", movementKind: "carer_payout", movementReason: "care_completion",
  amountMinor: 9000, currency: "HKD", status: "pending", requestedAt: null, processedAt: null,
  estimatedArrivalAt: null, paidAt: null, refundReference: null, refundReferenceStatus: null,
  refundReferenceType: null, payoutTraceId: null, payoutTraceStatus: null, actionRequired: false,
  isDelayed: false, lastSyncedAt: null, updatedAt: null, ...overrides,
});

describe("Care payment presentation release gate", () => {
  it("never renders a released payout without paid evidence", () => {
    for (const status of ["submitted", "pending", "in_transit", "failed", "canceled", "requires_review"] as const) {
      expect(presentCarePaymentMovement(base({ status }), date)?.label).not.toBe("Payment released");
    }
    expect(presentMissingCarePayment({ isProvider: true, payoutReleasedAt: null })?.label).toBe("Payment pending");
  });

  it("renders every provider state with authoritative wording", () => {
    expect(presentCarePaymentMovement(base({ status: "submitted" }), date)).toMatchObject({ label: "Payment pending" });
    expect(presentCarePaymentMovement(base({ status: "in_transit", estimatedArrivalAt: "2026-07-15" }), date)).toEqual({ label: "Payment on the way", detail: "Est. DATE:2026-07-15" });
    expect(presentCarePaymentMovement(base({ status: "failed", actionRequired: true }), date)).toEqual({ label: "Payment pending" });
    expect(presentCarePaymentMovement(base({ status: "paid", paidAt: "2026-07-15", payoutTraceId: "trace-123" }), date)).toEqual({ label: "Payment released", detail: "DATE:2026-07-15", referenceLabel: "Trace ID", referenceValue: "trace-123" });
    expect(presentMissingCarePayment({ isProvider: true, payoutReleasedAt: "2026-07-15" })).toEqual({ label: "Payment released" });
  });

  it("renders every owner refund state with authoritative wording", () => {
    expect(presentCarePaymentMovement(base({ movementKind: "owner_refund", status: "pending" }), date)).toEqual({ label: "Refund processing", detail: "Submitted to the payment provider" });
    expect(presentCarePaymentMovement(base({ movementKind: "owner_refund", status: "succeeded", estimatedArrivalAt: "2026-07-23" }), date)).toEqual({ label: "Refund on the way", detail: "Est. DATE:2026-07-23" });
    expect(presentCarePaymentMovement(base({ movementKind: "owner_refund", status: "succeeded", processedAt: "2026-07-19", refundReference: "359572016467656", refundReferenceType: "acquirer_reference_number" }), date)).toEqual({ label: "Refund processed", detail: "DATE:2026-07-19", referenceLabel: "ARN", referenceValue: "359572016467656" });
    expect(presentCarePaymentMovement(base({ movementKind: "owner_refund", status: "pending", isDelayed: true, estimatedArrivalAt: "2026-07-23" }), date)).toEqual({ label: "Refund on the way", detail: "Est. DATE:2026-07-23 (Delayed)" });
    expect(presentMissingCarePayment({ isProvider: false, stripeRefundId: "re_123" })).toEqual({ label: "Refund processing", detail: "Checking the latest refund status" });
  });

  it("parses the live RPC shape and rejects malformed movement truth", () => {
    expect(parseNativeCarePaymentMovement({ id: "m-1", service_chat_id: "s-1", movement_kind: "carer_payout", status: "failed", action_required: true })?.actionRequired).toBe(true);
    expect(parseNativeCarePaymentMovement({ id: "m-2", service_chat_id: "s-1", movement_kind: "carer_payout", status: "released" })).toBeNull();
  });
});
