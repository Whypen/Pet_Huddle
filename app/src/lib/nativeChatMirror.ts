export type NativeValidatedMirrorSource = "db" | "realtime";

export type NativeValidatedMirrorEnvelope<T> = {
  userId: string;
  sessionKey: string;
  surface: string;
  cachedAt: number;
  dbConfirmedAt: number;
  source: NativeValidatedMirrorSource;
  rows: T;
};

export type NativeChatMirrorInboxRow = {
  avatarUrl?: string | null;
  chatId: string;
  chatName?: string | null;
  blockedByMe: boolean;
  blockedByThem: boolean;
  lastMessageAt: string | null;
  lastMessageContent: string | null;
  lastMessageId: string | null;
  lastMessageReadByOther: boolean;
  lastMessageSenderId: string | null;
  lastMessageSenderName: string | null;
  peerAvatarUrl?: string | null;
  peerAvailabilityLabel?: string | null;
  peerIsVerified?: boolean;
  peerName?: string | null;
  serviceProviderSkills?: string[];
  unmatchedByMe: boolean;
  unmatchedByThem: boolean;
  unreadCount: number;
};

export const isNativeValidatedMirrorEnvelope = <T,>(value: unknown, options: { sessionKey: string; surface: string; userId: string }): value is NativeValidatedMirrorEnvelope<T> => {
  const row = value && typeof value === "object" ? value as Partial<NativeValidatedMirrorEnvelope<T>> : null;
  return Boolean(
    row &&
    row.userId === options.userId &&
    row.sessionKey === options.sessionKey &&
    row.surface === options.surface &&
    typeof row.cachedAt === "number" &&
    typeof row.dbConfirmedAt === "number" &&
    (row.source === "db" || row.source === "realtime") &&
    row.rows !== undefined
  );
};

export const liveSafeHydratedInboxRow = <T extends NativeChatMirrorInboxRow>(row: T): T => ({
  ...row,
  blockedByMe: false,
  blockedByThem: false,
  lastMessageAt: null,
  lastMessageContent: null,
  lastMessageId: null,
  lastMessageReadByOther: false,
  lastMessageSenderId: null,
  lastMessageSenderName: null,
  unmatchedByMe: false,
  unmatchedByThem: false,
  unreadCount: 0,
});

const inboxRowSignature = (row: NativeChatMirrorInboxRow) => JSON.stringify({
  avatarUrl: row.avatarUrl ?? null,
  blockedByMe: row.blockedByMe,
  chatId: row.chatId,
  chatName: row.chatName ?? null,
  lastMessageAt: row.lastMessageAt,
  lastMessageContent: row.lastMessageContent,
  lastMessageId: row.lastMessageId,
  lastMessageReadByOther: row.lastMessageReadByOther,
  lastMessageSenderId: row.lastMessageSenderId,
  lastMessageSenderName: row.lastMessageSenderName,
  peerAvatarUrl: row.peerAvatarUrl ?? null,
  peerAvailabilityLabel: row.peerAvailabilityLabel ?? null,
  peerIsVerified: row.peerIsVerified ?? false,
  peerName: row.peerName ?? null,
  serviceProviderSkills: row.serviceProviderSkills ?? [],
  unmatchedByMe: row.unmatchedByMe,
  unmatchedByThem: row.unmatchedByThem,
  unreadCount: row.unreadCount,
});

export const reconcileInboxRowsByRoomId = <T extends NativeChatMirrorInboxRow>(currentRows: T[], dbRows: T[]) => {
  const currentById = new Map(currentRows.map((row) => [row.chatId, row]));
  let changed = currentRows.length !== dbRows.length;
  const rows = dbRows.map((dbRow) => {
    const current = currentById.get(dbRow.chatId);
    if (current && inboxRowSignature(current) === inboxRowSignature(dbRow)) return current;
    changed = true;
    return dbRow;
  });
  return { changed, rows: changed ? rows : currentRows };
};

export const shouldAcceptFreshInboxWrite = (options: { currentKey: string | null; requestKey: string; currentSeq: number; requestSeq: number }) => (
  Boolean(options.currentKey && options.currentKey === options.requestKey && options.currentSeq === options.requestSeq)
);

export const unreadTotalWithReadOverlay = <T extends Pick<NativeChatMirrorInboxRow, "chatId" | "unreadCount">>(rows: T[], readOverlay: Map<string, number>) => (
  rows.reduce((sum, row) => sum + (readOverlay.has(row.chatId) ? 0 : Math.max(0, row.unreadCount)), 0)
);

export const shouldHydrateCachedMessagesBeforeMembership = (params: { withUserId?: string | null }) => Boolean(params.withUserId);
