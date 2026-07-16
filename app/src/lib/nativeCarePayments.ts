import { getFreshNativeAccessToken } from "./nativeFunctionClient";
import { supabaseAnonKey, supabaseUrl } from "./supabase";
import { parseNativeCarePaymentMovement, type NativeCarePaymentMovement, type NativeCarePaymentRpcRow } from "./carePaymentMovementParser";

export { parseNativeCarePaymentMovement, type NativeCarePaymentMovement } from "./carePaymentMovementParser";

export async function getNativeCarePaymentStatus(
  serviceChatId: string,
  accessToken?: string | null,
): Promise<NativeCarePaymentMovement[]> {
  const exactServiceChatId = String(serviceChatId || "").trim();
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
  return payload.movements.map((row) => parseNativeCarePaymentMovement({ ...row, service_chat_id: exactServiceChatId })).filter((item): item is NativeCarePaymentMovement => Boolean(item));
}

export async function getNativeCarePaymentStatuses(
  serviceChatIds: string[],
  accessToken?: string | null,
): Promise<NativeCarePaymentMovement[]> {
  const exactServiceChatIds = Array.from(new Set(serviceChatIds.map((value) => String(value || "").trim()).filter(Boolean))).slice(0, 20);
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
  return (payload as NativeCarePaymentRpcRow[]).map(parseNativeCarePaymentMovement).filter((item): item is NativeCarePaymentMovement => Boolean(item));
}
