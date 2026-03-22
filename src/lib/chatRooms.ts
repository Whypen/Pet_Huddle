import type { SupabaseClient } from "@supabase/supabase-js";

export async function ensureDirectChatRoom(
  supabase: SupabaseClient,
  actorId: string,
  targetUserId: string,
  targetName: string
): Promise<string> {
  // Canonical path: security-definer RPC that bypasses client-side membership insert restrictions.
  const callRpc = async (fn: string, params?: Record<string, unknown>) =>
    (supabase.rpc as (fnName: string, payload?: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>)(
      fn,
      params
    );
  const isRpcMissing = (message: string) => {
    const v = message.toLowerCase();
    return v.includes("could not find the function") || v.includes("not found") || v.includes("does not exist");
  };
  const payloadVariants: Array<Record<string, unknown>> = [
    { p_target_user_id: targetUserId, p_target_name: targetName },
    { target_user_id: targetUserId, target_name: targetName },
    { p_other_user_id: targetUserId, p_target_name: targetName },
    { other_user_id: targetUserId, target_name: targetName },
    { p_target_user_id: targetUserId, name: targetName },
  ];

  let lastRpcError: string | null = null;
  for (const payload of payloadVariants) {
    const { data, error } = await callRpc("ensure_direct_chat_room", payload);
    if (!error && data) {
      return String(data);
    }
    const message = String(error?.message || "");
    lastRpcError = message || lastRpcError;
    // Keep trying payload variants, then use edge fallback regardless of error type.
  }

  // Primary fallback: edge function with service role to bypass client RLS drift.
  const { data: edgeData, error: edgeError } = await supabase.functions.invoke("ensure-direct-chat-room", {
    body: { targetUserId, targetName },
  });
  if (!edgeError && edgeData) {
    const roomId = String((edgeData as { roomId?: unknown })?.roomId || "");
    if (roomId) return roomId;
  }

  // Last fallback: client readable overlap lookup (best-effort only, never hard-fail before this point).
  try {
    const { data: myMemberships } = await supabase
      .from("chat_room_members")
      .select("chat_id")
      .eq("user_id", actorId);

    const myRoomIds = [...new Set((myMemberships || []).map((m: { chat_id: string }) => m.chat_id).filter(Boolean))];

    if (myRoomIds.length) {
      const { data: targetMemberships } = await supabase
        .from("chat_room_members")
        .select("chat_id")
        .eq("user_id", targetUserId)
        .in("chat_id", myRoomIds);

      const overlaps = [...new Set((targetMemberships || []).map((m: { chat_id: string }) => m.chat_id).filter(Boolean))];
      for (const roomId of overlaps) {
        const { data: members } = await supabase
          .from("chat_room_members")
          .select("user_id")
          .eq("chat_id", roomId);
        const ids = (members || []).map((m: { user_id: string }) => m.user_id);
        if (ids.length === 2 && ids.includes(actorId) && ids.includes(targetUserId)) {
          return roomId;
        }
      }
    }
  } catch {
    // no-op: we'll return normalized upstream error below
  }

  throw new Error(edgeError?.message || lastRpcError || "direct_chat_unavailable");
}
