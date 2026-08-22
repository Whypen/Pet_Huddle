import { useCallback, useEffect, useMemo, useRef, useState, type TouchEvent, type UIEvent } from "react";
import { Hash, Loader2, Search, Users } from "lucide-react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { GlobalHeader } from "@/components/layout/GlobalHeader";
import { ExploreGroupCard, type ExploreGroupCardCTA, type ExploreGroupCardData } from "@/components/chat/ExploreGroupCard";
import { CreateGroupSheet } from "@/components/chat/CreateGroupSheet";
import { GroupDetailsPanel } from "@/components/chat/GroupDetailsPanel";
import { JoinWithCodeSheet } from "@/components/chat/JoinWithCodeSheet";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { isVerifiedProfile } from "@/lib/verification";
import { buildGroupExploreViewerScope, type GroupExploreViewerScopeRow } from "@/lib/groupExploreViewerScope";
import { cn } from "@/lib/utils";
import { ExpandableSearchField } from "@/components/ui/ExpandableSearchField";
import emptyChatImage from "@/assets/Notifications/Empty Chat.png";
import { peekVisibleUserPinIds, subscribeVisibleUserPinIds } from "@/lib/visibleMapPinCache";

type InboxRow = {
  chat_id?: string;
  room_type?: string;
  peer_user_id?: string | null;
  peer_name?: string | null;
  peer_avatar_url?: string | null;
  peer_is_verified?: boolean | null;
  peer_social_id?: string | null;
  blocked_by_me?: boolean | null;
  blocked_by_them?: boolean | null;
  unmatched_by_me?: boolean | null;
  unmatched_by_them?: boolean | null;
  matched_at?: string | null;
  chat_name?: string | null;
  avatar_url?: string | null;
  last_message_content?: string | null;
  last_message_sender_id?: string | null;
  last_message_at?: string | null;
  unread_count?: number | null;
  member_count?: number | null;
  visibility?: string | null;
  location_label?: string | null;
  created_at?: string | null;
  created_by?: string | null;
  room_code?: string | null;
  join_method?: string | null;
  pet_focus?: string[] | null;
  description?: string | null;
  shape_issue?: string | null;
  activity_ts?: string | null;
  status?: string | null;
  closed_at?: string | null;
  is_active?: boolean | null;
};

type MatchedRailRow = {
  peer_user_id?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  social_id?: string | null;
  is_verified?: boolean | null;
  chat_id?: string | null;
  matched_at?: string | null;
};

type ExploreRow = {
  id: string;
  name: string;
  avatar_url?: string | null;
  member_count?: number | null;
  pet_focus?: string[] | null;
  location_label?: string | null;
  description?: string | null;
  join_method?: string | null;
  next_event_title?: string | null;
  next_event_starts_at?: string | null;
  next_event_ends_at?: string | null;
  created_at?: string | null;
  last_message_at?: string | null;
  location_country?: string | null;
};

type InviteRow = ExploreRow & { chat_id?: string; chat_name?: string; invite_id?: string | null; inviter_name?: string | null };

/**
 * Native Explore deliberately merges joined public group rows from the inbox
 * with the public Explore projection. Keep that merge pure so a joined group
 * cannot disappear merely because the public projection excludes memberships.
 */
export const mergeJoinedPublicGroups = (joinedRows: InboxRow[], publicRows: ExploreRow[]) => {
  const byId = new Map<string, ExploreRow>();
  joinedRows
    .filter((row) => row.room_type === "group" && row.visibility === "public" && row.chat_id)
    .forEach((row) => {
      const id = String(row.chat_id);
      byId.set(id, {
        id,
        name: String(row.chat_name || "Group"),
        avatar_url: row.avatar_url || null,
        member_count: Number(row.member_count || 0),
        pet_focus: row.pet_focus || [],
        location_label: row.location_label || null,
        description: row.description || null,
        join_method: row.join_method || null,
      });
    });
  publicRows.forEach((row) => {
    if (row.id && !byId.has(row.id)) byId.set(row.id, row);
  });
  return Array.from(byId.values());
};

const boundRpc = supabase.rpc.bind(supabase) as unknown as (
  fn: string,
  params?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message?: string } | null }>;
const rpc = (name: string, args?: Record<string, unknown>) => boundRpc(name, args);

const INBOX_FIRST_PAGE = 10;
const INBOX_NEXT_PAGE = 20;
const CHAT_READ_CACHE_MS = 30_000;

type InboxCacheEntry = { cachedAt: number; rows: InboxRow[] };
const inboxReadCache = new Map<string, InboxCacheEntry>();
const inboxReadInFlight = new Map<string, Promise<InboxRow[]>>();

const inboxCacheKey = (input: {
  userId: string;
  sessionKey: string;
  scope: "friends" | "groups";
  onlyWithActivity: boolean | null;
  limit: number;
  cursor: string | null;
}) => JSON.stringify(input);

const dateRankValue = (value?: string | null) => {
  const timestamp = value ? new Date(value).getTime() : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const groupActivityRankValue = (lastMessageAt?: string | null, createdAt?: string | null) => (
  dateRankValue(lastMessageAt) || dateRankValue(createdAt)
);

const rowActivity = (row: InboxRow) => {
  const value = row.activity_ts || row.last_message_at || row.created_at;
  const timestamp = value ? new Date(value).getTime() : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
};

export const isRenderableInboxRow = (row: InboxRow) => {
  if (!row.chat_id) return false;
  if (row.room_type !== "direct") return true;
  if (Number(row.member_count || 0) !== 2) return false;
  if (!row.peer_user_id) return false;
  if (row.shape_issue) return false;
  return true;
};

const preferConversationRow = (current: InboxRow | undefined, candidate: InboxRow) => {
  if (!current) return candidate;
  const currentHasMessage = Boolean(current.last_message_at) || Boolean(String(current.last_message_content || "").trim());
  const candidateHasMessage = Boolean(candidate.last_message_at) || Boolean(String(candidate.last_message_content || "").trim());
  if (candidateHasMessage !== currentHasMessage) return candidateHasMessage ? candidate : current;
  const currentUnread = Number(current.unread_count || 0);
  const candidateUnread = Number(candidate.unread_count || 0);
  if (candidateUnread !== currentUnread) return candidateUnread > currentUnread ? candidate : current;
  return rowActivity(candidate) > rowActivity(current) ? candidate : current;
};

export const dedupeInboxRowsByPeer = (rows: InboxRow[]) => {
  const directByPeer = new Map<string, InboxRow>();
  const nonDirect: InboxRow[] = [];
  rows.filter(isRenderableInboxRow).forEach((row) => {
    if (row.room_type !== "direct" || !row.peer_user_id) {
      nonDirect.push(row);
      return;
    }
    const peerId = String(row.peer_user_id);
    directByPeer.set(peerId, preferConversationRow(directByPeer.get(peerId), row));
  });
  return [...nonDirect, ...directByPeer.values()].sort((left, right) => rowActivity(right) - rowActivity(left));
};

export const parseInboxPreview = (content?: string | null) => {
  const text = String(content || "").trim();
  if (!text) return "";
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const kind = String(parsed.kind || parsed.type || "").trim();
    if (kind === "star_intro") return String(parsed.text || "Sent a Star to connect.").trim();
    if (kind === "huddle_share") {
      const share = parsed.share && typeof parsed.share === "object" ? parsed.share as Record<string, unknown> : {};
      return String(share.chatHeadline || share.title || "Shared from huddle").trim();
    }
    if (kind === "service_care_update") {
      const note = String(parsed.note || parsed.text || "").trim();
      if (note) return note;
      return parsed.photo || String(parsed.photoUrl || "").trim() ? "Shared a photo update" : "Shared a care update";
    }
    const messageText = String(parsed.text || "").trim();
    if (messageText) return messageText;
    const attachments = Array.isArray(parsed.attachments) ? parsed.attachments : [];
    if (attachments.length > 0) {
      return attachments.some((item) => String((item as Record<string, unknown>)?.mime || "").startsWith("image/")) ? "Photo" : "Attachment";
    }
    return "";
  } catch {
    return text.replace(/\s+/g, " ");
  }
};

const displayInboxPreview = (row: InboxRow, scope: "friends" | "groups") => {
  if (row.blocked_by_me) return "Blocked";
  if (row.blocked_by_them) return "Unavailable";
  if (row.unmatched_by_me || row.unmatched_by_them) return "Unmatched";
  return parseInboxPreview(row.last_message_content) || (scope === "groups" ? `${Number(row.member_count || 0)} members` : "Say hi");
};

const isAvatarOnlyMatch = (row: InboxRow) => (
  row.room_type !== "group" &&
  row.room_type !== "service" &&
  Boolean(row.peer_user_id) &&
  !row.blocked_by_me &&
  !row.blocked_by_them &&
  !row.unmatched_by_me &&
  !row.unmatched_by_them &&
  !["inactive", "closed", "archived", "deleted"].includes(String(row.status || "").toLowerCase()) &&
  !row.closed_at &&
  row.is_active !== false &&
  Boolean(row.matched_at) &&
  !row.last_message_at &&
  !String(row.last_message_content || "").trim()
);

const isMatchedRailRow = (row: InboxRow, activeMatchedPeerIds: Set<string>) => (
  isAvatarOnlyMatch(row) || (
    row.room_type === "direct" &&
    Boolean(row.peer_user_id) &&
    activeMatchedPeerIds.has(String(row.peer_user_id)) &&
    !row.blocked_by_me &&
    !row.blocked_by_them &&
    !row.unmatched_by_me &&
    !row.unmatched_by_them &&
    !row.last_message_at &&
    !String(row.last_message_content || "").trim()
  )
);

const isPriorityStarRow = (row: InboxRow, viewerId?: string | null) => {
  if (row.room_type === "group" || row.room_type === "service" || row.last_message_sender_id === viewerId) return false;
  try {
    const parsed = JSON.parse(String(row.last_message_content || "")) as Record<string, unknown>;
    return String(parsed.kind || parsed.type || "") === "star_intro";
  } catch {
    return false;
  }
};

const matchedSummaryToInboxRow = (row: MatchedRailRow): InboxRow => ({
  chat_id: row.chat_id || undefined,
  room_type: "direct",
  peer_user_id: row.peer_user_id,
  peer_name: row.display_name,
  peer_avatar_url: row.avatar_url,
  peer_is_verified: row.is_verified,
  peer_social_id: row.social_id,
  member_count: 2,
  matched_at: row.matched_at,
  created_at: row.matched_at,
  activity_ts: row.matched_at,
  unread_count: 0,
});

const formatTime = (value?: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
};

const InboxAvatar = ({ src, label }: { src?: string | null; label: string }) => (
  <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full border border-border bg-muted text-sm font-bold text-brandBlue">
    {src ? <img src={src} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" /> : label.slice(0, 1).toUpperCase()}
  </span>
);

export default function ScopedChats() {
  const { user, session, profile } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const groupsExplore = pathname.startsWith("/groups");
  const inboxScope = searchParams.get("tab") === "groups" ? "groups" : "friends";
  const selectedRoomId = searchParams.get("room");
  const [inbox, setInbox] = useState<InboxRow[]>([]);
  const [groups, setGroups] = useState<ExploreRow[]>([]);
  const [viewerPetSpecies, setViewerPetSpecies] = useState<string[]>([]);
  const [joinedGroups, setJoinedGroups] = useState<InboxRow[]>([]);
  const [activeMatchedPeerIds, setActiveMatchedPeerIds] = useState<Set<string>>(new Set());
  const [matchedRailSummaries, setMatchedRailSummaries] = useState<MatchedRailRow[]>([]);
  const [matchedRailExpanded, setMatchedRailExpanded] = useState(false);
  const [hasMoreInbox, setHasMoreInbox] = useState(false);
  const [inboxCursor, setInboxCursor] = useState<string | null>(null);
  const [loadingMoreInbox, setLoadingMoreInbox] = useState(false);
  const [visibleOutIds, setVisibleOutIds] = useState<Set<string>>(() => peekVisibleUserPinIds());
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [requestedIds, setRequestedIds] = useState<Set<string>>(new Set());
  const [joinedIds, setJoinedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchRows, setSearchRows] = useState<InboxRow[] | null>(null);
  const [joinCodeOpen, setJoinCodeOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<ExploreRow | null>(null);
  const [dismissedInviteIds, setDismissedInviteIds] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const loadSequenceRef = useRef(0);
  const pullStartY = useRef<number | null>(null);
  const [pullOffset, setPullOffset] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const verified = isVerifiedProfile(profile);

  useEffect(() => subscribeVisibleUserPinIds(setVisibleOutIds), []);

  // NativeChatsScreen uses the protected matched-rail projection for the
  // Explore face stack. Keep the same authenticated-only source here; the
  // public Groups surface remains count-only because this effect is gated by
  // the signed-in viewer.
  useEffect(() => {
    if (!user?.id) {
      setActiveMatchedPeerIds(new Set());
      setMatchedRailSummaries([]);
      return;
    }
    let cancelled = false;
    void rpc("get_native_matched_rail_summary", { p_limit: 500 }).then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        console.warn("[groups.matches.failed]", error);
        setActiveMatchedPeerIds(new Set());
        return;
      }
      const ids = (Array.isArray(data) ? data : [])
        .map((row) => (row && typeof row === "object" ? String((row as { peer_user_id?: unknown }).peer_user_id || "") : ""))
        .filter(Boolean);
      setActiveMatchedPeerIds(new Set(ids));
      setMatchedRailSummaries((Array.isArray(data) ? data : []) as MatchedRailRow[]);
    });
    return () => { cancelled = true; };
  }, [user?.id]);

  const loadInbox = useCallback(async (
    scope: "friends" | "groups",
    onlyWithActivity: boolean | null,
    limit = 80,
    cursor: string | null = null,
    force = false,
  ) => {
    if (!user?.id) return [];
    const key = inboxCacheKey({
      userId: user.id,
      sessionKey: String(session?.expires_at || "session"),
      scope,
      onlyWithActivity,
      limit,
      cursor,
    });
    const cached = inboxReadCache.get(key);
    if (!force && cached && Date.now() - cached.cachedAt < CHAT_READ_CACHE_MS) return cached.rows;
    const existing = inboxReadInFlight.get(key);
    if (existing) return existing;
    const request = (async () => {
      const { data, error } = await rpc("get_chat_inbox_summaries", {
        p_scope: scope,
        p_chat_ids: null,
        p_only_with_activity: onlyWithActivity,
        p_limit: limit,
        p_cursor: cursor,
      });
      if (error) throw error;
      const rows = ((Array.isArray(data) ? data : []) as InboxRow[]).filter(isRenderableInboxRow);
      inboxReadCache.set(key, { cachedAt: Date.now(), rows });
      return rows;
    })().finally(() => {
      if (inboxReadInFlight.get(key) === request) inboxReadInFlight.delete(key);
    });
    inboxReadInFlight.set(key, request);
    return request;
  }, [session?.expires_at, user?.id]);

  const load = useCallback(async (force = false) => {
    if (!user?.id) return;
    const sequence = ++loadSequenceRef.current;
    setLoading(true);
    setLoadError(false);
    try {
      if (!groupsExplore) {
        const [baseRows, activeRows] = await Promise.all([
          loadInbox(inboxScope, inboxScope === "friends" ? false : null, 80, null, force),
          inboxScope === "friends" ? loadInbox("friends", true, INBOX_FIRST_PAGE, null, force) : Promise.resolve([] as InboxRow[]),
        ]);
        const rows = inboxScope === "friends" ? dedupeInboxRowsByPeer([...baseRows, ...activeRows]) : baseRows;
        if (sequence !== loadSequenceRef.current) return;
        setInbox(rows);
        const cursorSource = activeRows.length > 0 ? activeRows : rows;
        setInboxCursor(cursorSource[cursorSource.length - 1]?.activity_ts || cursorSource[cursorSource.length - 1]?.last_message_at || null);
        setHasMoreInbox(inboxScope === "friends" && activeRows.length >= INBOX_FIRST_PAGE);
        return;
      }
      const [contextResult, scopeResult, inviteResult, joinedResult] = await Promise.allSettled([
        rpc("get_native_viewer_group_context"),
        rpc("get_native_viewer_scope"),
        rpc("get_my_group_invite_previews"),
        loadInbox("groups", null, 80, null, force),
      ]);
      const settledRpc = (label: string, result: PromiseSettledResult<{ data: unknown; error: { message?: string } | null }>) => {
        if (result.status === "rejected") {
          console.warn(`[groups.${label}.failed]`, result.reason);
          return null;
        }
        if (result.value.error) {
          console.warn(`[groups.${label}.failed]`, result.value.error);
          return null;
        }
        return result.value.data;
      };
      const contextData = settledRpc("context", contextResult);
      const scopeData = settledRpc("viewer_scope", scopeResult);
      const inviteData = settledRpc("invites", inviteResult);
      const joined = joinedResult.status === "fulfilled" ? joinedResult.value : [];
      if (joinedResult.status === "rejected") console.warn("[groups.joined.failed]", joinedResult.reason);
      const context = (contextData && typeof contextData === "object" ? contextData : {}) as {
        requested_chat_ids?: string[];
        profile?: { location_country?: string | null };
        pets?: Array<{ species?: string | null }>;
      };
      const viewerScopeRow = (Array.isArray(scopeData) ? scopeData[0] : scopeData) as GroupExploreViewerScopeRow | null;
      const viewerScope = buildGroupExploreViewerScope(viewerScopeRow);
      const country = viewerScope.country || context.profile?.location_country || null;
      const resolvedPublic = await rpc("get_public_groups_for_viewer", { p_country: country, p_viewer_scope: viewerScope.payload });
      if (sequence !== loadSequenceRef.current) return;
      setRequestedIds(new Set(Array.isArray(context.requested_chat_ids) ? context.requested_chat_ids : []));
      setViewerPetSpecies((context.pets || []).map((pet) => String(pet.species || "").trim()).filter(Boolean));
      setInvites((Array.isArray(inviteData) ? inviteData : []) as InviteRow[]);
      setJoinedGroups(joined);
      setJoinedIds(new Set(joined.map((row) => String(row.chat_id || "")).filter(Boolean)));
      if (resolvedPublic.error) {
        // An Explore enrichment failure must not erase actionable invitations
        // that the app returned successfully through its separate RPC.
        console.warn("[groups.public.failed]", resolvedPublic.error);
        setGroups([]);
        setLoadError(true);
        if (!Array.isArray(inviteData) || inviteData.length === 0) toast.error("Couldn't load groups.");
        return;
      }
      setGroups((Array.isArray(resolvedPublic.data) ? resolvedPublic.data : []) as ExploreRow[]);
    } catch (error) {
      if (sequence !== loadSequenceRef.current) return;
      console.warn("[chats] load failed", error);
      setLoadError(true);
      if (groupsExplore) setGroups([]);
      else setInbox([]);
      toast.error(groupsExplore ? "Couldn't load groups." : "Couldn't load chats.");
    } finally {
      if (sequence === loadSequenceRef.current) setLoading(false);
    }
  }, [groupsExplore, inboxScope, loadInbox, user?.id]);

  useEffect(() => { void load(false); }, [load]);

  useEffect(() => {
    if (groupsExplore || !user?.id) return;
    const needle = query.trim();
    if (needle.length < 2) {
      setSearchRows(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const result = await rpc("search_chat_inbox", { p_query: needle });
      if (cancelled) return;
      if (result.error) {
        console.warn("[chats.search.failed]", result.error);
        setSearchRows([]);
        return;
      }
      setSearchRows(dedupeInboxRowsByPeer((Array.isArray(result.data) ? result.data : []) as InboxRow[]));
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [groupsExplore, query, user?.id]);

  useEffect(() => {
    if (groupsExplore || !user?.id) return;
    let timer: number | null = null;
    const reconcile = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => void load(true), 120);
    };
    const channel = supabase
      .channel(`user:${user.id}:inbox`, { config: { private: true } })
      .on("broadcast", { event: "changed" }, reconcile)
      .subscribe();
    return () => {
      if (timer !== null) window.clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [groupsExplore, load, user?.id]);

  const refresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await load(true);
    } finally {
      setRefreshing(false);
      setPullOffset(0);
      pullStartY.current = null;
    }
  }, [load, refreshing]);

  const onPullStart = (event: TouchEvent<HTMLDivElement>) => {
    if ((scrollRef.current?.scrollTop || 0) > 0 || refreshing) return;
    pullStartY.current = event.touches[0]?.clientY ?? null;
  };

  const onPullMove = (event: TouchEvent<HTMLDivElement>) => {
    if (pullStartY.current === null || (scrollRef.current?.scrollTop || 0) > 0) return;
    const distance = Math.max(0, (event.touches[0]?.clientY || 0) - pullStartY.current);
    setPullOffset(Math.min(76, distance * 0.42));
  };

  const onPullEnd = () => {
    if (pullOffset >= 54) {
      void refresh();
      return;
    }
    pullStartY.current = null;
    setPullOffset(0);
  };

  const filteredInbox = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const sourceRows = dedupeInboxRowsByPeer(searchRows ?? inbox);
    const scopedRows = sourceRows.filter((row) => inboxScope === "groups" ? row.room_type === "group" : row.room_type !== "group");
    const locallyFiltered = searchRows === null && needle
      ? scopedRows.filter((row) => [row.peer_name, row.chat_name, row.last_message_content].some((value) => String(value || "").toLowerCase().includes(needle)))
      : scopedRows;
    if (inboxScope !== "friends") return locallyFiltered;
    const conversations = locallyFiltered.filter((row) => !isMatchedRailRow(row, activeMatchedPeerIds));
    const priority = conversations.filter((row) => isPriorityStarRow(row, user?.id));
    const regular = conversations.filter((row) => !isPriorityStarRow(row, user?.id));
    return [...priority, ...regular];
  }, [activeMatchedPeerIds, inbox, inboxScope, query, searchRows, user?.id]);

  const matchedRailRows = useMemo(() => {
    if (groupsExplore || inboxScope !== "friends") return [];
    const sourceRows = dedupeInboxRowsByPeer(searchRows ?? inbox);
    const conversationPeerIds = new Set(sourceRows
      .filter((row) => row.room_type === "direct" && row.peer_user_id && (row.last_message_at || String(row.last_message_content || "").trim()))
      .map((row) => String(row.peer_user_id)));
    const byPeer = new Map<string, InboxRow>();
    sourceRows.forEach((row) => {
      const peerId = String(row.peer_user_id || "");
      if (!peerId || conversationPeerIds.has(peerId) || !isMatchedRailRow(row, activeMatchedPeerIds)) return;
      byPeer.set(peerId, row);
    });
    matchedRailSummaries.forEach((summary) => {
      const peerId = String(summary.peer_user_id || "");
      if (!peerId || conversationPeerIds.has(peerId) || byPeer.has(peerId)) return;
      const row = matchedSummaryToInboxRow(summary);
      if (row.chat_id) byPeer.set(peerId, row);
    });
    return [...byPeer.values()].sort((left, right) => rowActivity(right) - rowActivity(left));
  }, [activeMatchedPeerIds, groupsExplore, inbox, inboxScope, matchedRailSummaries, searchRows]);

  const loadMoreInbox = useCallback(async () => {
    if (groupsExplore || inboxScope !== "friends" || !hasMoreInbox || loadingMoreInbox || searchRows !== null) return;
    setLoadingMoreInbox(true);
    try {
      const nextRows = await loadInbox("friends", true, INBOX_NEXT_PAGE, inboxCursor);
      setInbox((current) => dedupeInboxRowsByPeer([...current, ...nextRows]));
      setInboxCursor(nextRows[nextRows.length - 1]?.activity_ts || nextRows[nextRows.length - 1]?.last_message_at || inboxCursor);
      setHasMoreInbox(nextRows.length >= INBOX_NEXT_PAGE);
    } catch (error) {
      console.warn("[chats.load_more.failed]", error);
    } finally {
      setLoadingMoreInbox(false);
    }
  }, [groupsExplore, hasMoreInbox, inboxCursor, inboxScope, loadInbox, loadingMoreInbox, searchRows]);

  const onInboxScroll = useCallback((event: UIEvent<HTMLElement>) => {
    const target = event.currentTarget;
    if (target.scrollHeight - target.scrollTop - target.clientHeight > 180) return;
    void loadMoreInbox();
  }, [loadMoreInbox]);

  const inviteById = useMemo(() => new Map(invites.map((row) => [String(row.chat_id || row.id), row])), [invites]);
  const pendingInvite = useMemo(
    () => invites.find((row) => !dismissedInviteIds.has(String(row.invite_id || row.chat_id || row.id))) || null,
    [dismissedInviteIds, invites],
  );
  const visibleGroups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const joined = mergeJoinedPublicGroups(joinedGroups, groups);
    const merged = [...invites.map((row) => ({ ...row, id: String(row.chat_id || row.id), name: String(row.chat_name || row.name) })), ...joined]
      .filter((row, index, all) => row.id && all.findIndex((candidate) => candidate.id === row.id) === index);
    const viewerWords = String(profile?.location_district || profile?.location_name || "")
      .toLowerCase()
      .split(/[\s,]+/)
      .filter((word) => word.length > 2);
    const species = viewerPetSpecies.map((item) => item.toLowerCase());
    const rankGroup = (group: ExploreRow) => {
      const focus = (group.pet_focus || []).map((item) => item.toLowerCase());
      const petScore = focus.includes("all pets")
        ? 1
        : species.some((item) => focus.some((value) => value.includes(item) || item.includes(value))) ? 3 : 0;
      const lastMessageMs = dateRankValue(group.last_message_at);
      const age = lastMessageMs > 0 ? Date.now() - lastMessageMs : Number.POSITIVE_INFINITY;
      const activeScore = age < 86_400_000 ? 2 : age < 604_800_000 ? 1 : 0;
      const groupWords = String(group.location_label || "")
        .toLowerCase()
        .split(/[\s,]+/)
        .filter((word) => word.length > 2);
      const proximityScore = viewerWords.length > 0 && groupWords.some((word) => viewerWords.includes(word)) ? 4 : 0;
      return proximityScore + petScore * 3 + activeScore;
    };
    const filtered = needle
      ? merged.filter((row) => [row.name, row.description, row.location_label, ...(row.pet_focus || [])].some((value) => String(value || "").toLowerCase().includes(needle)))
      : merged;
    const inviteIds = new Set(invites.map((row) => String(row.chat_id || row.id)));
    return filtered.sort((left, right) => (
      Number(inviteIds.has(right.id)) - Number(inviteIds.has(left.id)) ||
      (inviteIds.has(left.id) && inviteIds.has(right.id)
        ? groupActivityRankValue(right.last_message_at, right.created_at) - groupActivityRankValue(left.last_message_at, left.created_at)
        : 0) ||
      Number(joinedIds.has(right.id)) - Number(joinedIds.has(left.id)) ||
      rankGroup(right) - rankGroup(left) ||
      groupActivityRankValue(right.last_message_at, right.created_at) - groupActivityRankValue(left.last_message_at, left.created_at) ||
      dateRankValue(right.created_at) - dateRankValue(left.created_at)
    ));
  }, [groups, invites, joinedGroups, joinedIds, profile?.location_district, profile?.location_name, query, viewerPetSpecies]);

  const openRoom = (row: InboxRow) => {
    const room = String(row.chat_id || "");
    if (!room) return;
    const name = row.room_type === "direct" ? row.peer_name : row.chat_name;
    navigate(`/chat-dialogue?room=${encodeURIComponent(room)}&name=${encodeURIComponent(name || "Conversation")}&tab=${inboxScope}${row.peer_user_id ? `&with=${encodeURIComponent(row.peer_user_id)}` : ""}`);
  };

  const updateTab = (tab: "friends" | "groups") => {
    setQuery("");
    setSearchRows(null);
    setMatchedRailExpanded(false);
    const next = new URLSearchParams(searchParams);
    next.set("tab", tab);
    next.delete("view");
    setSearchParams(next);
  };

  const createGroup = () => verified ? setCreateOpen(true) : setVerifyOpen(true);

  useEffect(() => {
    if (!groupsExplore || searchParams.get("create") !== "group" || loading) return;
    createGroup();
    const next = new URLSearchParams(searchParams);
    next.delete("create");
    setSearchParams(next, { replace: true });
  }, [groupsExplore, loading, searchParams, setSearchParams, verified]);

  const performGroupAction = async (group: ExploreRow) => {
    const invite = inviteById.get(group.id);
    try {
      if (invite) {
        const result = invite.invite_id
          ? await rpc("accept_group_chat_invite_by_id", { p_invite_id: invite.invite_id })
          : await rpc("accept_group_chat_invite", { p_chat_id: group.id });
        if (result.error) throw result.error;
        navigate(`/chat-dialogue?room=${encodeURIComponent(group.id)}&name=${encodeURIComponent(group.name)}&tab=groups`);
        return;
      }
      if (group.join_method === "instant") {
        const result = await rpc("join_native_group_member", { p_chat_id: group.id, p_user_id: user?.id, p_role: "member" });
        if (result.error) throw result.error;
        void rpc("notify_group_join", { p_chat_id: group.id, p_user_id: user?.id });
        navigate(`/chat-dialogue?room=${encodeURIComponent(group.id)}&name=${encodeURIComponent(group.name)}&tab=groups`);
        return;
      }
      const result = await rpc("request_native_group_join", { p_chat_id: group.id });
      if (result.error) throw result.error;
      setRequestedIds((current) => new Set(current).add(group.id));
    } catch (error) {
      console.warn("[groups] action failed", error);
      toast.error("Please try again.");
    }
  };

  const leadingActions = groupsExplore ? (
    <div className="flex items-center gap-1">
      <button type="button" onClick={() => setSearchOpen((value) => !value)} aria-label="Search groups" className="grid h-11 w-11 place-items-center rounded-full hover:bg-muted"><Search className="h-5 w-5" /></button>
      <button type="button" onClick={() => setJoinCodeOpen(true)} aria-label="Join group with code" className="grid h-11 w-11 place-items-center rounded-full hover:bg-muted"><Hash className="h-5 w-5" /></button>
      <button type="button" onClick={createGroup} aria-label="Create group" className="grid h-11 w-11 place-items-center rounded-full hover:bg-muted"><Users className="h-5 w-5" /></button>
    </div>
  ) : undefined;

  return (
    <div className="flex min-h-full flex-col bg-background">
      <GlobalHeader desktopRail accountLeadingActions={leadingActions} />
      <main
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain touch-pan-y"
        onTouchStart={onPullStart}
        onTouchMove={onPullMove}
        onTouchEnd={onPullEnd}
        onTouchCancel={onPullEnd}
        onScroll={onInboxScroll}
      >
        <div
          className="flex items-center justify-center gap-2 overflow-hidden text-[11px] text-muted-foreground transition-[height,opacity] duration-150"
          style={{ height: refreshing ? 30 : pullOffset, opacity: refreshing || pullOffset > 0 ? 1 : 0 }}
          aria-live="polite"
        >
          <Loader2 className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
          <span>{refreshing ? "Refreshing…" : pullOffset >= 54 ? "Release to refresh" : "Pull to refresh"}</span>
        </div>
        {groupsExplore ? (
          <div className="mx-auto w-full px-4 pb-24 pt-3 lg:px-8 2xl:px-12">
            {searchOpen ? <ExpandableSearchField value={query} onChange={setQuery} onClose={() => { setQuery(""); setSearchOpen(false); }} label="Search groups" placeholder="Search groups" className="mb-3" /> : null}
            {pendingInvite ? (
              <div role="status" className="mb-4 flex items-center gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3">
                <div className="min-w-0 flex-1 text-sm text-brandText">
                  <strong>{pendingInvite.inviter_name || "Someone"}</strong> invited you to join a group.
                </div>
                <button
                  type="button"
                  className="shrink-0 rounded-full px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted"
                  onClick={() => setDismissedInviteIds((current) => new Set(current).add(String(pendingInvite.invite_id || pendingInvite.chat_id || pendingInvite.id)))}
                >
                  Not now
                </button>
                <button type="button" className="shrink-0 rounded-full bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground" onClick={() => void performGroupAction(pendingInvite)}>
                  Join group
                </button>
              </div>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {!loading && visibleGroups.map((group) => {
                const invited = inviteById.has(group.id);
                const joined = joinedIds.has(group.id);
                const requested = requestedIds.has(group.id);
                const cta: ExploreGroupCardCTA = invited
                  ? { kind: "invited", onAccept: () => void performGroupAction(group) }
                  : joined
                    ? { kind: "open", onOpen: () => navigate(`/chat-dialogue?room=${encodeURIComponent(group.id)}&name=${encodeURIComponent(group.name)}&tab=groups`) }
                  : requested
                    ? { kind: "requested" }
                    : group.join_method === "instant"
                      ? { kind: "join", onJoin: () => void performGroupAction(group) }
                      : { kind: "request", onRequest: () => void performGroupAction(group) };
                const card: ExploreGroupCardData = { id: group.id, name: group.name, avatarUrl: group.avatar_url, memberCount: Number(group.member_count || 0), petFocus: group.pet_focus, locationLabel: group.location_label, description: group.description, nextEventTitle: group.next_event_title, nextEventStartsAt: group.next_event_starts_at, nextEventEndsAt: group.next_event_ends_at };
                return <ExploreGroupCard key={group.id} group={card} cta={cta} onCardOpen={() => setSelectedGroup(group)} friendIds={activeMatchedPeerIds} outIds={visibleOutIds} hydratePreviewMembers={Boolean(user?.id)} />;
              })}
            </div>
            {!loading && !loadError && visibleGroups.length === 0 ? (
              <div className="mx-auto flex w-full max-w-md flex-col items-center py-10 text-center">
                <img src={emptyChatImage} alt="" aria-hidden="true" className="w-full max-w-[320px] object-contain" loading="lazy" decoding="async" />
                <p className="mt-2 px-2 text-[15px] leading-relaxed text-muted-foreground">No public groups nearby yet. Be the first to start a local pack!</p>
              </div>
            ) : null}
            {!loading && loadError ? (
              <div className="mx-auto flex min-h-40 w-full max-w-md flex-col items-center justify-center px-6 text-center">
                <p className="text-[14px] font-semibold text-brandText">Couldn't load groups.</p>
                <button type="button" onClick={() => void load()} className="mt-3 min-h-11 rounded-full px-5 text-[14px] font-bold text-brandBlue hover:bg-muted/55">Try again</button>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="flex min-h-0 flex-col">
            <div className="sticky top-0 z-10 border-b border-border bg-background/95 px-4 pt-2 backdrop-blur-xl">
              <div className="flex items-center gap-7">
                <button onClick={() => updateTab("friends")} className={cn("border-b-2 px-1 py-3 text-sm font-semibold", inboxScope === "friends" ? "border-primary text-primary" : "border-transparent text-muted-foreground")}>Friends</button>
                <button onClick={() => updateTab("groups")} className={cn("border-b-2 px-1 py-3 text-sm font-semibold", inboxScope === "groups" ? "border-primary text-primary" : "border-transparent text-muted-foreground")}>Groups</button>
                <button onClick={() => setSearchOpen((value) => !value)} aria-label="Search chats" className="ml-auto grid h-11 w-11 place-items-center rounded-full hover:bg-muted"><Search className="h-5 w-5" /></button>
              </div>
              {searchOpen ? <ExpandableSearchField value={query} onChange={setQuery} onClose={() => { setQuery(""); setSearchOpen(false); }} label="Search chats" className="mb-3" /> : null}
            </div>
            {matchedRailRows.length > 0 ? (
              <div className="flex gap-3 overflow-x-auto px-4 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Matched friends">
                {(matchedRailExpanded ? matchedRailRows : matchedRailRows.slice(0, 10)).map((row) => {
                  const label = String(row.peer_name || "Friend");
                  return (
                    <button
                      key={`match:${row.peer_user_id || row.chat_id}`}
                      type="button"
                      aria-label={`Open match with ${label}`}
                      onClick={() => openRoom(row)}
                      className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                    >
                      <InboxAvatar src={row.peer_avatar_url} label={label} />
                    </button>
                  );
                })}
                {!matchedRailExpanded && matchedRailRows.length > 10 ? (
                  <button
                    type="button"
                    aria-label={`Show ${matchedRailRows.length - 10} more matches`}
                    onClick={() => setMatchedRailExpanded(true)}
                    className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-muted text-xs font-bold text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                  >
                    +{matchedRailRows.length - 10}
                  </button>
                ) : null}
              </div>
            ) : null}
            <div className="divide-y divide-border">
              {!loading && filteredInbox.map((row) => {
                const label = String(row.room_type === "direct" ? row.peer_name : row.chat_name || "Conversation");
                const avatar = row.room_type === "direct" ? row.peer_avatar_url : row.avatar_url;
                const selected = selectedRoomId === row.chat_id;
                const preview = displayInboxPreview(row, inboxScope);
                return <button key={row.chat_id} type="button" data-selected={selected ? "true" : undefined} onClick={() => openRoom(row)} className={cn("flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:bg-muted focus-visible:outline-none", selected && "bg-muted")}><InboxAvatar src={avatar} label={label} /><span className="min-w-0 flex-1"><span className="flex items-center gap-2"><strong className="truncate text-[15px] font-semibold">{label}</strong><time className="ml-auto shrink-0 text-[11px] text-muted-foreground">{formatTime(row.last_message_at)}</time></span><span className="mt-0.5 flex items-center"><span className="truncate text-[13px] text-muted-foreground">{preview}</span>{Number(row.unread_count || 0) > 0 ? <span className="ml-auto grid min-h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-white">{row.unread_count}</span> : null}</span></span></button>;
              })}
            </div>
            {!loading && !loadError && filteredInbox.length === 0 ? (
              <div className="mx-auto flex w-full max-w-md flex-col items-center py-10 text-center">
                <img src={emptyChatImage} alt="" aria-hidden="true" className="w-full max-w-[320px] object-contain" loading="lazy" decoding="async" />
                <p className="mt-2 px-2 text-[15px] leading-relaxed text-muted-foreground">
                  {inboxScope === "groups" ? "Better in a pack! Create or join a group to start coordinating local meetups." : "Meet friends on Social, then start a chat here."}
                </p>
              </div>
            ) : null}
            {!loading && loadError ? (
              <div className="mx-auto flex min-h-40 w-full max-w-md flex-col items-center justify-center px-6 text-center">
                <p className="text-[14px] font-semibold text-brandText">Couldn't load chats.</p>
                <button type="button" onClick={() => void load()} className="mt-3 min-h-11 rounded-full px-5 text-[14px] font-bold text-brandBlue hover:bg-muted/55">Try again</button>
              </div>
            ) : null}
          </div>
        )}
      </main>
      <JoinWithCodeSheet isOpen={joinCodeOpen} onClose={() => setJoinCodeOpen(false)} />
      <CreateGroupSheet isOpen={createOpen} onClose={() => setCreateOpen(false)} onGroupCreated={(chatId) => navigate(`/chat-dialogue?room=${encodeURIComponent(chatId)}&tab=groups`)} />
      <Dialog open={Boolean(selectedGroup)} onOpenChange={(open) => { if (!open) setSelectedGroup(null); }}>
        <DialogContent className="max-h-[min(86dvh,760px)] overflow-y-auto p-0 sm:max-w-[520px]">
          {selectedGroup ? (
            <>
              <DialogHeader className="sr-only"><DialogTitle>{selectedGroup.name}</DialogTitle><DialogDescription>Group details</DialogDescription></DialogHeader>
              <GroupDetailsPanel
                name={selectedGroup.name}
                memberCount={Number(selectedGroup.member_count || 0)}
                avatarUrl={selectedGroup.avatar_url}
                subtitle={selectedGroup.location_label}
                description={selectedGroup.description}
                mediaUrls={[]}
                actions={[{
                  key: "group-action",
                  label: inviteById.has(selectedGroup.id)
                    ? "Accept invite"
                    : requestedIds.has(selectedGroup.id)
                      ? "Requested"
                      : selectedGroup.join_method === "instant" ? "Join" : "Request to join",
                  icon: <Users className="h-5 w-5" />,
                  onClick: () => {
                    if (requestedIds.has(selectedGroup.id)) return;
                    void performGroupAction(selectedGroup);
                  },
                }]}
              />
            </>
          ) : null}
        </DialogContent>
      </Dialog>
      <Dialog open={verifyOpen} onOpenChange={setVerifyOpen}><DialogContent className="sm:max-w-[420px]"><DialogHeader><DialogTitle>Verify to create a group</DialogTitle><DialogDescription>Complete identity verification in the huddle app to unlock group creation.</DialogDescription></DialogHeader></DialogContent></Dialog>
    </div>
  );
}
