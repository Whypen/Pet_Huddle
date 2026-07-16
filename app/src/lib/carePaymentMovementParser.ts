export type NativeCarePaymentMovement = {
  serviceChatId: string;
  id: string;
  movementKind: "owner_refund" | "carer_payout";
  movementReason: string;
  amountMinor: number | null;
  currency: string | null;
  status: "submitted" | "pending" | "in_transit" | "succeeded" | "paid" | "failed" | "canceled" | "requires_review";
  requestedAt: string | null;
  processedAt: string | null;
  estimatedArrivalAt: string | null;
  paidAt: string | null;
  refundReference: string | null;
  refundReferenceStatus: string | null;
  refundReferenceType: string | null;
  payoutTraceId: string | null;
  payoutTraceStatus: string | null;
  actionRequired: boolean;
  isDelayed: boolean;
  lastSyncedAt: string | null;
  updatedAt: string | null;
};

export type NativeCarePaymentRpcRow = {
  service_chat_id?: unknown;
  id?: unknown;
  movement_kind?: unknown;
  movement_reason?: unknown;
  amount_minor?: unknown;
  currency?: unknown;
  status?: unknown;
  requested_at?: unknown;
  processed_at?: unknown;
  estimated_arrival_at?: unknown;
  paid_at?: unknown;
  refund_reference?: unknown;
  refund_reference_status?: unknown;
  refund_reference_type?: unknown;
  payout_trace_id?: unknown;
  payout_trace_status?: unknown;
  action_required?: unknown;
  is_delayed?: unknown;
  last_synced_at?: unknown;
  updated_at?: unknown;
};

const clean = (value: unknown) => String(value || "").trim();
const nullableText = (value: unknown) => clean(value) || null;
const nullableNumber = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

export const parseNativeCarePaymentMovement = (row: NativeCarePaymentRpcRow): NativeCarePaymentMovement | null => {
  const id = clean(row.id);
  const movementKind = clean(row.movement_kind);
  const status = clean(row.status);
  if (!id || !["owner_refund", "carer_payout"].includes(movementKind)) return null;
  if (!["submitted", "pending", "in_transit", "succeeded", "paid", "failed", "canceled", "requires_review"].includes(status)) return null;
  return {
    serviceChatId: clean(row.service_chat_id), id,
    movementKind: movementKind as NativeCarePaymentMovement["movementKind"],
    movementReason: clean(row.movement_reason), amountMinor: nullableNumber(row.amount_minor),
    currency: nullableText(row.currency), status: status as NativeCarePaymentMovement["status"],
    requestedAt: nullableText(row.requested_at), processedAt: nullableText(row.processed_at),
    estimatedArrivalAt: nullableText(row.estimated_arrival_at), paidAt: nullableText(row.paid_at),
    refundReference: nullableText(row.refund_reference), refundReferenceStatus: nullableText(row.refund_reference_status),
    refundReferenceType: nullableText(row.refund_reference_type), payoutTraceId: nullableText(row.payout_trace_id),
    payoutTraceStatus: nullableText(row.payout_trace_status), actionRequired: row.action_required === true,
    isDelayed: row.is_delayed === true, lastSyncedAt: nullableText(row.last_synced_at), updatedAt: nullableText(row.updated_at),
  };
};
