import type { NativeChatMessage } from "./nativeChat";

export type NativeChatOutboxTransition = {
  messages: NativeChatMessage[];
  transitioned: boolean;
};

export type NativeChatOutboxRetryResult = NativeChatOutboxTransition & {
  outcome: "ignored" | "failed" | "sent";
};

const NATIVE_CHAT_CLIENT_MESSAGE_ID_KEY = "client_message_id";

export const createNativeChatClientMessageId = () => (
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
);

export const readNativeChatClientMessageId = (content: string): string | null => {
  try {
    const envelope = JSON.parse(content) as Record<string, unknown>;
    const value = envelope[NATIVE_CHAT_CLIENT_MESSAGE_ID_KEY];
    return typeof value === "string" && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
};

export const isPendingNativeChatMessage = (message: NativeChatMessage) => message.id.startsWith("pending:");

// A send is committed only when the server has returned a complete message
// identity. Treat a malformed response exactly like a failed transport so the
// user keeps a retryable bubble instead of seeing a false "sent" state.
export const isNativeChatMessageConfirmation = (value: unknown): value is NativeChatMessage => {
  if (!value || typeof value !== "object") return false;
  const message = value as Record<string, unknown>;
  return ["id", "chatId", "senderId", "content", "createdAt"].every((key) => (
    typeof message[key] === "string" && message[key].trim().length > 0
  ));
};

const matchingPendingIds = (
  messages: NativeChatMessage[],
  confirmed: NativeChatMessage,
) => {
  const confirmedClientMessageId = readNativeChatClientMessageId(confirmed.content);
  const candidates = messages.filter((message) => (
    isPendingNativeChatMessage(message) &&
    message.chatId === confirmed.chatId &&
    message.senderId === confirmed.senderId
  ));
  if (confirmedClientMessageId) {
    return candidates
      .filter((message) => readNativeChatClientMessageId(message.content) === confirmedClientMessageId)
      .map((message) => message.id);
  }
  // Older messages remain readable, and their send-success callback still knows
  // the exact pending ID. Realtime must not guess based on identical content.
  return [];
};

export const reconcileNativeChatRealtimeMessage = (
  messages: NativeChatMessage[],
  confirmed: NativeChatMessage,
): NativeChatMessage[] => {
  const pendingIds = new Set(matchingPendingIds(messages, confirmed));
  return [...messages.filter((message) => !pendingIds.has(message.id) && message.id !== confirmed.id), confirmed]
    .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
};

export const beginNativeChatOutboxRetry = (
  messages: NativeChatMessage[],
  pendingId: string,
): NativeChatOutboxTransition => {
  let transitioned = false;
  const next = messages.map((message) => {
    if (message.id !== pendingId || message.localStatus !== "failed") return message;
    transitioned = true;
    return { ...message, localStatus: "pending" as const };
  });
  return { messages: transitioned ? next : messages, transitioned };
};

export const failNativeChatOutboxMessage = (
  messages: NativeChatMessage[],
  pendingId: string,
): NativeChatOutboxTransition => {
  let transitioned = false;
  const next = messages.map((message) => {
    if (message.id !== pendingId || message.localStatus !== "pending") return message;
    transitioned = true;
    return { ...message, localStatus: "failed" as const };
  });
  return { messages: transitioned ? next : messages, transitioned };
};

export const dismissNativeChatOutboxMessage = (
  messages: NativeChatMessage[],
  pendingId: string,
): NativeChatOutboxTransition => {
  const target = messages.find((message) => message.id === pendingId);
  if (target?.localStatus !== "failed") return { messages, transitioned: false };
  return {
    messages: messages.filter((message) => message.id !== pendingId),
    transitioned: true,
  };
};

export const reconcileNativeChatOutboxMessage = (
  messages: NativeChatMessage[],
  pendingId: string,
  confirmed: NativeChatMessage,
): NativeChatOutboxTransition => {
  if (!messages.some((message) => message.id === pendingId)) {
    return { messages, transitioned: false };
  }
  return {
    messages: [...messages.filter((message) => message.id !== pendingId && message.id !== confirmed.id), confirmed]
      .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()),
    transitioned: true,
  };
};

export const executeNativeChatOutboxRetry = async ({
  messages,
  pendingId,
  onPending,
  send,
}: {
  messages: NativeChatMessage[];
  pendingId: string;
  onPending?: (messages: NativeChatMessage[]) => void;
  send: (message: NativeChatMessage) => Promise<NativeChatMessage>;
}): Promise<NativeChatOutboxRetryResult> => {
  const retry = beginNativeChatOutboxRetry(messages, pendingId);
  if (!retry.transitioned) return { ...retry, outcome: "ignored" };
  onPending?.(retry.messages);
  const pending = retry.messages.find((message) => message.id === pendingId)!;
  try {
    const confirmed = await send(pending);
    if (!isNativeChatMessageConfirmation(confirmed)) throw new Error("invalid_chat_message_response");
    return { ...reconcileNativeChatOutboxMessage(retry.messages, pendingId, confirmed), outcome: "sent" };
  } catch {
    return { ...failNativeChatOutboxMessage(retry.messages, pendingId), outcome: "failed" };
  }
};
