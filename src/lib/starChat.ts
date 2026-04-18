import { quotaConfig } from "@/config/quotaConfig";
import { supabase } from "@/integrations/supabase/client";
import { areUsersBlocked } from "@/lib/blocking";
import { ensureDirectChatRoom } from "@/lib/chatRooms";
import { getRemainingStarsFromSnapshot, resolveStarQuotaTier } from "@/lib/starQuota";

export type StarIntroPayload = {
  kind: "star_intro";
  sender_id: string;
  recipient_id: string;
  text: string;
  created_at: string;
};

export type ParsedStarChatContent = {
  text: string;
  kind: string | null;
  senderId: string | null;
  recipientId: string | null;
  createdAt: string | null;
};

export const buildStarIntroPayload = (senderId: string, recipientId: string): string =>
  JSON.stringify({
    kind: "star_intro",
    sender_id: senderId,
    recipient_id: recipientId,
    text: "Star connection started.",
    created_at: new Date().toISOString(),
  } satisfies StarIntroPayload);

export const parseStarChatContent = (rawContent: string | null | undefined): ParsedStarChatContent => {
  const fallback = {
    text: String(rawContent || "").trim(),
    kind: null,
    senderId: null,
    recipientId: null,
    createdAt: null,
  };
  if (!fallback.text) return fallback;
  try {
    const parsed = JSON.parse(fallback.text) as Partial<StarIntroPayload> & { text?: unknown };
    const kind = typeof parsed.kind === "string" ? parsed.kind : null;
    const text = typeof parsed.text === "string" ? parsed.text : "";
    return {
      text: text || fallback.text,
      kind,
      senderId: typeof parsed.sender_id === "string" ? parsed.sender_id : null,
      recipientId: typeof parsed.recipient_id === "string" ? parsed.recipient_id : null,
      createdAt: typeof parsed.created_at === "string" ? parsed.created_at : null,
    };
  } catch {
    return fallback;
  }
};

export const isStarIntroKind = (kind: string | null | undefined) => String(kind || "").trim() === "star_intro";

export type SendStarChatResult =
  | { status: "sent"; roomId: string }
  | { status: "free_tier"; roomId: null }
  | { status: "exhausted"; roomId: null; upgradeTier: "gold" | null }
  | { status: "blocked"; roomId: null }
  | { status: "failed"; roomId: null };

export const sendStarChat = async ({
  senderId,
  senderTier,
  targetUserId,
  targetName,
}: {
  senderId: string;
  senderTier: string | null | undefined;
  targetUserId: string;
  targetName: string;
}): Promise<SendStarChatResult> => {
  const tier = resolveStarQuotaTier(senderTier);
  if (tier === "free") {
    return { status: "free_tier", roomId: null };
  }

  try {
    const snapshot = await (supabase.rpc as (fn: string) => Promise<{ data: unknown; error: { message?: string } | null }>)(
      "get_quota_snapshot"
    );
    if (snapshot.error) throw snapshot.error;
    const row = Array.isArray(snapshot.data) ? snapshot.data[0] : snapshot.data;
    const typed = (row || {}) as { tier?: string; stars_used_cycle?: number; extra_stars?: number };
    const resolvedTier = resolveStarQuotaTier(senderTier, typed.tier);
    const remaining = getRemainingStarsFromSnapshot(senderTier, typed);
    if (remaining <= 0) {
      return {
        status: "exhausted",
        roomId: null,
        upgradeTier: resolvedTier === "plus" ? "gold" : null,
      };
    }

    const blocked = await areUsersBlocked(senderId, targetUserId);
    if (blocked) {
      return { status: "blocked", roomId: null };
    }

    const roomId = await ensureDirectChatRoom(supabase, senderId, targetUserId, targetName);
    if (!roomId) throw new Error("room_not_created");

    const quotaResult = await (supabase.rpc as (
      fn: string,
      params?: Record<string, unknown>,
    ) => Promise<{ error: { message?: string } | null }>)("check_and_increment_quota", {
      action_type: "star",
    });
    if (quotaResult.error) {
      return {
        status: "exhausted",
        roomId: null,
        upgradeTier: tier === "plus" ? "gold" : null,
      };
    }

    const { error: starMessageError } = await supabase.from("chat_messages").insert({
      chat_id: roomId,
      sender_id: senderId,
      content: buildStarIntroPayload(senderId, targetUserId),
    });
    if (starMessageError) throw starMessageError;

    void (supabase.rpc as (
      fn: string,
      params?: Record<string, unknown>,
    ) => Promise<{ error: { message?: string } | null }>)("enqueue_notification", {
      p_user_id: targetUserId,
      p_category: "chats",
      p_kind: "star",
      p_title: "New star",
      p_body: "Someone sent you a Star ⭐ Tap to find out who.",
      p_href: `/chat-dialogue?room=${roomId}&with=${senderId}`,
      p_data: { room_id: roomId, from_user_id: senderId, type: "star" },
    });

    return { status: "sent", roomId };
  } catch {
    return { status: "failed", roomId: null };
  }
};
