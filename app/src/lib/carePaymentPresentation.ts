import type { NativeCarePaymentMovement } from "./nativeCarePayments";

export type CarePaymentPresentation = {
  detail?: string;
  label: string;
  referenceLabel?: "ARN" | "Refund reference" | "Trace ID";
  referenceValue?: string;
};

type FormatDate = (value: string | null | undefined) => string;

// This is the single native rendering authority for Care payment language. A
// successful label is deliberately impossible without authoritative movement
// evidence from Stripe/Huddle.
export const presentCarePaymentMovement = (
  movement: NativeCarePaymentMovement | null | undefined,
  formatDate: FormatDate,
): CarePaymentPresentation | null => {
  if (!movement) return null;
  if (movement.movementKind === "owner_refund") {
    if (movement.status === "succeeded") {
      return movement.refundReference
        ? {
          label: "Refund processed",
          detail: formatDate(movement.processedAt),
          referenceLabel: movement.refundReferenceType === "acquirer_reference_number" ? "ARN" : "Refund reference",
          referenceValue: movement.refundReference,
        }
        : {
          label: "Refund on the way",
          detail: movement.estimatedArrivalAt
            ? `Est. ${formatDate(movement.estimatedArrivalAt)}${movement.isDelayed ? " (Delayed)" : ""}`
            : movement.isDelayed ? "Delayed" : "Processing with your bank",
        };
    }
    if (movement.isDelayed) {
      return {
        label: "Refund on the way",
        detail: movement.estimatedArrivalAt ? `Est. ${formatDate(movement.estimatedArrivalAt)} (Delayed)` : "Delayed",
      };
    }
    return {
      label: "Refund processing",
      detail: movement.estimatedArrivalAt ? `Est. ${formatDate(movement.estimatedArrivalAt)}` : "Submitted to the payment provider",
    };
  }
  if (movement.status === "paid") {
    return {
      label: "Payment released",
      detail: formatDate(movement.paidAt || movement.estimatedArrivalAt),
      referenceLabel: movement.payoutTraceId ? "Trace ID" : undefined,
      referenceValue: movement.payoutTraceId || undefined,
    };
  }
  if (["failed", "canceled", "requires_review"].includes(movement.status)) return { label: "Payment pending" };
  if (movement.estimatedArrivalAt) return { label: "Payment on the way", detail: `Est. ${formatDate(movement.estimatedArrivalAt)}` };
  return { label: "Payment pending", detail: "Processing to your payout account" };
};

export const presentMissingCarePayment = ({
  isProvider,
  payoutReleasedAt,
  stripeRefundId,
}: {
  isProvider: boolean;
  payoutReleasedAt?: string | null;
  stripeRefundId?: string | null;
}): CarePaymentPresentation | null => {
  if (!isProvider) {
    return stripeRefundId ? { label: "Refund processing", detail: "Checking the latest refund status" } : null;
  }
  return payoutReleasedAt
    ? { label: "Payment released" }
    : { label: "Payment pending", detail: "Checking the latest payment status" };
};
