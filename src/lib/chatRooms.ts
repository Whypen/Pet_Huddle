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
  const isContractRejection = (message: string) => {
    const v = message.toLowerCase();
    return (
      v.includes("active_match_required") ||
      v.includes("blocked_relationship") ||
      v.includes("unmatched_relationship") ||
      v.includes("cannot_chat_with_self") ||
      v.includes("target_required") ||
      v.includes("not_authenticated")
    );
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
    if (message && !isRpcMissing(message) && isContractRejection(message)) {
      throw new Error(message);
    }
    // Keep trying payload variants, then use edge fallback for availability drift.
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
      if (overlaps.length) {
        const { data: overlapChats } = await supabase
          .from("chats")
          .select("id, type, last_message_at, created_at")
          .in("id", overlaps)
          .eq("type", "direct")
          .order("last_message_at", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false });
        for (const room of (overlapChats || []) as Array<{ id: string }>) {
          const { data: members } = await supabase
            .from("chat_room_members")
            .select("user_id")
            .eq("chat_id", room.id);
          const ids = (members || []).map((m: { user_id: string }) => m.user_id);
          if (ids.length === 2 && ids.includes(actorId) && ids.includes(targetUserId)) {
            return room.id;
          }
        }
      }
    }
  } catch {
    // no-op: we'll return normalized upstream error below
  }

  throw new Error(edgeError?.message || lastRpcError || "direct_chat_unavailable");
}
