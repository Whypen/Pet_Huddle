const getSeenStorageKey = (userId: string) => `chat_room_seen_${userId}`;

export const getChatRoomSeenMap = (userId: string): Record<string, string> => {
  if (!userId) return {};
  try {
    const raw = localStorage.getItem(getSeenStorageKey(userId));
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
};

export const markChatRoomSeen = (userId: string, roomId: string, seenAt?: string | null) => {
  if (!userId || !roomId) return;
  const nextSeenAt = String(seenAt || "").trim() || new Date().toISOString();
  const seenByRoom = getChatRoomSeenMap(userId);
  const currentRaw = String(seenByRoom[roomId] || "").trim();
  const currentMs = currentRaw ? new Date(currentRaw).getTime() : Number.NaN;
  const nextMs = new Date(nextSeenAt).getTime();
  if (Number.isFinite(currentMs) && Number.isFinite(nextMs) && currentMs >= nextMs) return;
  try {
    const next = { ...seenByRoom, [roomId]: nextSeenAt };
    localStorage.setItem(getSeenStorageKey(userId), JSON.stringify(next));
  } catch {
    // ignore local storage failure
  }
  window.dispatchEvent(new CustomEvent("huddle:chat-room-seen", { detail: { roomId, seenAt: nextSeenAt } }));
};
