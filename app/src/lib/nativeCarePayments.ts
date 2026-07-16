import { getFreshNativeAccessToken } from "./nativeFunctionClient";
import { supabaseAnonKey, supabaseUrl } from "./supabase";

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

type NativeCarePaymentRpcRow = {
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

const parseMovement = (row: NativeCarePaymentRpcRow): NativeCarePaymentMovement | null => {
  const id = clean(row.id);
  const movementKind = clean(row.movement_kind);
  const status = clean(row.status);
  if (!id || !["owner_refund", "carer_payout"].includes(movementKind)) return null;
  if (!["submitted", "pending", "in_transit", "succeeded", "paid", "failed", "canceled", "requires_review"].includes(status)) return null;
  return {
    serviceChatId: clean(row.service_chat_id),
    id,
    movementKind: movementKind as NativeCarePaymentMovement["movementKind"],
    movementReason: clean(row.movement_reason),
    amountMinor: nullableNumber(row.amount_minor),
    currency: nullableText(row.currency),
    status: status as NativeCarePaymentMovement["status"],
    requestedAt: nullableText(row.requested_at),
    processedAt: nullableText(row.processed_at),
    estimatedArrivalAt: nullableText(row.estimated_arrival_at),
    paidAt: nullableText(row.paid_at),
    refundReference: nullableText(row.refund_reference),
    refundReferenceStatus: nullableText(row.refund_reference_status),
    refundReferenceType: nullableText(row.refund_reference_type),
    payoutTraceId: nullableText(row.payout_trace_id),
    payoutTraceStatus: nullableText(row.payout_trace_status),
    actionRequired: row.action_required === true,
    isDelayed: row.is_delayed === true,
    lastSyncedAt: nullableText(row.last_synced_at),
    updatedAt: nullableText(row.updated_at),
  };
};

export async function getNativeCarePaymentStatus(
  serviceChatId: string,
  accessToken?: string | null,
): Promise<NativeCarePaymentMovement[]> {
  const exactServiceChatId = clean(serviceChatId);
  if (!exactServiceChatId) return [];
  const token = await getFreshNativeAccessToken(accessToken);
  if (!token) return [];
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/get_service_care_payment_status_by_service_id`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: supabaseAnonKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({ p_service_chat_id: exactServiceChatId }),
  });
  if (!response.ok) throw new Error("care_payment_status_unavailable");
  const payload = await response.json().catch(() => null) as { movements?: NativeCarePaymentRpcRow[] } | null;
  if (!Array.isArray(payload?.movements)) return [];
  return payload.movements.map((row) => parseMovement({ ...row, service_chat_id: exactServiceChatId })).filter((item): item is NativeCarePaymentMovement => Boolean(item));
}
export async function getNativeCarePaymentStatuses(
  serviceChatIds: string[],
  accessToken?: string | null,
): Promise<NativeCarePaymentMovement[]> {
  const exactServiceChatIds = Array.from(new Set(serviceChatIds.map(clean).filter(Boolean))).slice(0, 20);
  if (exactServiceChatIds.length === 0) return [];
  const token = await getFreshNativeAccessToken(accessToken);
  if (!token) return [];
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/get_my_service_care_payment_statuses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: supabaseAnonKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({ p_service_chat_ids: exactServiceChatIds }),
  });
  if (!response.ok) throw new Error("care_payment_statuses_unavailable");
  const payload = await response.json().catch(() => null);
  if (!Array.isArray(payload)) return [];
  return (payload as NativeCarePaymentRpcRow[]).map(parseMovement).filter((item): item is NativeCarePaymentMovement => Boolean(item));
}
