import type { NativeChatInboxRow } from "./nativeChat";

type NativeChatsTab = "friends" | "groups" | "service";

type InboxHandoff = {
  rows: NativeChatInboxRow[];
  sessionKey: string | null;
  tab: NativeChatsTab;
  ts: number;
  userId: string | null;
};

type RowHandoff = {
  row: NativeChatInboxRow;
  sessionKey: string | null;
  ts: number;
  userId: string | null;
};

const HANDOFF_TTL_MS = 5 * 60 * 1000;
const inboxByTab = new Map<NativeChatsTab, InboxHandoff>();
let selectedRow: RowHandoff | null = null;
let lastTab: { sessionKey: string | null; tab: NativeChatsTab; ts: number; userId: string | null } | null = null;

const sameScope = (
  cached: { sessionKey: string | null; ts: number; userId: string | null },
  options: { sessionKey?: string | null; userId?: string | null },
) => (
  Date.now() - cached.ts <= HANDOFF_TTL_MS &&
  cached.userId === (options.userId || null) &&
  cached.sessionKey === (options.sessionKey || null)
);

export const writeNativeChatsInboxHandoff = (options: {
  rows: NativeChatInboxRow[];
  sessionKey?: string | null;
  tab: NativeChatsTab;
  userId?: string | null;
}) => {
  lastTab = {
    sessionKey: options.sessionKey || null,
    tab: options.tab,
    ts: Date.now(),
    userId: options.userId || null,
  };
  if (options.rows.length === 0) return;
  inboxByTab.set(options.tab, {
    rows: options.rows,
    sessionKey: options.sessionKey || null,
    tab: options.tab,
    ts: Date.now(),
    userId: options.userId || null,
  });
};

export const readNativeChatsInboxHandoff = (options: {
  sessionKey?: string | null;
  tab: NativeChatsTab;
  userId?: string | null;
}) => {
  const cached = inboxByTab.get(options.tab);
  if (!cached || !sameScope(cached, options)) return null;
  return cached.rows;
};

export const writeNativeChatsLastTabHandoff = (options: {
  sessionKey?: string | null;
  tab: NativeChatsTab;
  userId?: string | null;
}) => {
  lastTab = {
    sessionKey: options.sessionKey || null,
    tab: options.tab,
    ts: Date.now(),
    userId: options.userId || null,
  };
};

export const readNativeChatsLastTabHandoff = (options: {
  sessionKey?: string | null;
  userId?: string | null;
}) => {
  if (!lastTab || !sameScope(lastTab, options)) return null;
  return lastTab.tab;
};

export const writeNativeChatSelectedRowHandoff = (options: {
  row: NativeChatInboxRow;
  sessionKey?: string | null;
  userId?: string | null;
}) => {
  selectedRow = {
    row: options.row,
    sessionKey: options.sessionKey || null,
    ts: Date.now(),
    userId: options.userId || null,
  };
};

export const readNativeChatSelectedRowHandoff = (options: {
  roomId?: string | null;
  sessionKey?: string | null;
  userId?: string | null;
}) => {
  if (!selectedRow || !sameScope(selectedRow, options)) return null;
  const roomId = String(options.roomId || "").trim();
  if (roomId && selectedRow.row.chatId !== roomId) return null;
  return selectedRow.row;
};
