import { supabase } from "@/integrations/supabase/client";
import type {
  FeedCursor,
  FeedHydrationRpcRow,
  HydratedRowsResult,
  MentionEntry,
  Thread,
} from "@/components/social/noticeboard/types";

type DeriveAlertType = (notice: Thread) => "Stray" | "Lost" | "Caution" | "Others" | null;

type HydrateRowsOptions = {
  deriveAlertTypeFromNoticeData: DeriveAlertType;
  primeMentionDirectory: (values: string[]) => Promise<void>;
};

const rpc = supabase.rpc.bind(supabase) as unknown as (
  fn: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;

const emptyHydratedRowsResult = (rows: Thread[]): HydratedRowsResult => ({
  rows,
  commentsByThread: {},
  threadMentions: {},
  replyMentions: {},
  alertTypes: {},
});

const parseMentionEntries = (entries: unknown): MentionEntry[] => {
  if (!Array.isArray(entries)) return [];
  return entries
    .map((entry) => ({
      start: Number((entry as Record<string, unknown>)?.start ?? 0),
      end: Number((entry as Record<string, unknown>)?.end ?? 0),
      mentionedUserId: String((entry as Record<string, unknown>)?.mentionedUserId || ""),
      socialIdAtTime: String((entry as Record<string, unknown>)?.socialIdAtTime || ""),
    }))
    .filter((entry) => entry.mentionedUserId && entry.socialIdAtTime);
};

export const mapFeedRowToThread = (row: Record<string, unknown>): Thread => ({
  id: String(row.id),
  title: String(row.title || ""),
  content: String(row.content || ""),
  tags: (row.tags as string[] | null) ?? null,
  hashtags: (row.hashtags as string[] | null) ?? null,
  images: (row.images as string[] | null) ?? null,
  likes: Number(row.like_count ?? 0),
  like_count: Number(row.like_count ?? 0),
  support_count: Number(row.support_count ?? 0),
  comment_count: Number(row.comment_count ?? 0),
  share_count: Number(row.share_count ?? row.clicks ?? 0),
  score: typeof row.score === "number" ? row.score : Number(row.score ?? 0),
  map_id: typeof row.map_id === "string" ? row.map_id : null,
  alert_type: typeof row.alert_type === "string" ? row.alert_type : null,
  alert_district: typeof row.alert_district === "string" ? row.alert_district : null,
  has_alert_link: Boolean(row.has_alert_link),
  is_sensitive: row.is_sensitive === true,
  video_provider: row.video_provider === "bunny_stream" ? "bunny_stream" : null,
  provider_video_id: typeof row.provider_video_id === "string" ? row.provider_video_id : null,
  video_playback_url: typeof row.video_playback_url === "string" ? row.video_playback_url : null,
  video_embed_url: typeof row.video_embed_url === "string" ? row.video_embed_url : null,
  video_thumbnail_url: typeof row.video_thumbnail_url === "string" ? row.video_thumbnail_url : null,
  video_preview_url: typeof row.video_preview_url === "string" ? row.video_preview_url : null,
  video_duration_seconds: typeof row.video_duration_seconds === "number" ? row.video_duration_seconds : Number(row.video_duration_seconds ?? 0) || null,
  video_status: typeof row.video_status === "string" ? row.video_status : null,
  created_at: String(row.created_at || new Date().toISOString()),
  user_id: String(row.user_id),
  author: {
    display_name: (row.author_display_name as string | null) ?? null,
    social_id: (row.author_social_id as string | null) ?? null,
    avatar_url: (row.author_avatar_url as string | null) ?? null,
    verification_status: (row.author_verification_status as string | null) ?? null,
    is_verified: (row.author_is_verified as boolean | null) ?? false,
    location_country: (row.author_location_country as string | null) ?? null,
    non_social: Boolean(row.author_non_social),
  },
});

export const fetchFeedPage = async ({
  applyFeedFilters,
  cursor = null,
  sortMode,
  viewerId,
}: {
  applyFeedFilters: (rows: Thread[]) => Thread[];
  cursor?: FeedCursor | null;
  sortMode: "" | "Trending" | "Latest" | "Saves";
  viewerId: string;
}) => {
  const { data, error } = await rpc(
    "get_social_feed",
    {
      p_viewer_id: viewerId,
      p_sort: sortMode === "Saves" || !sortMode ? "Latest" : sortMode,
      p_limit: 20,
      p_cursor: cursor,
    },
  );
  if (error) throw error;
  const rpcRows = (Array.isArray(data) ? data : []) as Array<Record<string, unknown>>;
  return applyFeedFilters(rpcRows.map(mapFeedRowToThread));
};

export const fetchFocusedThreadRow = async (threadId: string) => {
  if (!threadId) return null;
  const { data, error } = await rpc(
    "get_native_social_thread_by_id",
    { p_thread_id: threadId },
  );
  if (error) return null;
  const focusedRow = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
  return focusedRow ? mapFeedRowToThread(focusedRow) : null;
};

export const hydrateRows = async (
  rows: Thread[],
  options: HydrateRowsOptions,
): Promise<HydratedRowsResult> => {
  const ids = rows.map((notice) => notice.id).filter(Boolean);
  if (ids.length === 0) return emptyHydratedRowsResult(rows);

  const [{ data, error }, engagementResult] = await Promise.all([
    rpc("get_social_feed_hydration", { p_thread_ids: ids }),
    rpc("get_user_engagement_tiers", { p_user_ids: Array.from(new Set(rows.map((row) => row.user_id).filter(Boolean))) }),
  ]);

  if (error || !Array.isArray(data)) {
    if (error) {
      console.warn("[social.feed] safety hydration unavailable; media remains concealed", error);
    }
    // `get_social_feed` does not own the safety flag; the app resolves it from
    // this hydration RPC. If that authority is unavailable, rendering media as
    // non-sensitive would be a disclosure bug. Keep copy readable but fail the
    // media treatment closed until a confirmed row arrives.
    return emptyHydratedRowsResult(rows.map((row) => ({ ...row, is_sensitive: true })));
  }

  const hydrationByThreadId = new Map<string, FeedHydrationRpcRow>(
    (data as FeedHydrationRpcRow[])
      .filter((row) => typeof row?.thread_id === "string" && row.thread_id.trim().length > 0)
      .map((row) => [row.thread_id, row]),
  );
  const engagementByUserId = new Map<string, NonNullable<NonNullable<Thread["author"]>["engagement"]>>();
  if (!engagementResult.error && Array.isArray(engagementResult.data)) {
    (engagementResult.data as Array<Record<string, unknown>>).forEach((row) => {
      const userId = String(row.user_id || "").trim();
      const tier = String(row.engagement_tier || "").trim().toLowerCase();
      if (!userId || !["active", "trusted", "pillar"].includes(tier)) return;
      const percentile = Number(row.engagement_percentile_rank);
      engagementByUserId.set(userId, {
        tier: tier as "active" | "trusted" | "pillar",
        percentileRank: Number.isFinite(percentile) ? percentile : null,
        computedAt: typeof row.engagement_computed_at === "string" ? row.engagement_computed_at : null,
      });
    });
  }

  const threadMentions: Record<string, MentionEntry[]> = {};

  const hydratedRows = rows.map((notice) => {
    const hydration = hydrationByThreadId.get(notice.id);
    // A partial hydration response is also unknown, not proof of "safe".
    if (!hydration) return { ...notice, is_sensitive: true };

    threadMentions[notice.id] = parseMentionEntries(hydration.thread_mentions);

    return {
      ...notice,
      share_count: Number(hydration.share_count ?? notice.share_count ?? 0),
      // Hydration is optional enrichment. Older deployments can omit this
      // field; that must never erase the canonical feed row's safety flag and
      // expose media the app keeps blurred.
      is_sensitive:
        typeof hydration.is_sensitive === "boolean"
          ? hydration.is_sensitive
          : notice.is_sensitive === true,
      map_id: typeof hydration.map_id === "string" ? hydration.map_id : notice.map_id ?? null,
      alert_type: typeof hydration.alert_type === "string" ? hydration.alert_type : notice.alert_type ?? null,
      alert_district: typeof hydration.alert_district === "string" ? hydration.alert_district : notice.alert_district ?? null,
      has_alert_link: hydration.has_alert_link === true || notice.has_alert_link === true,
      video_provider: hydration.video_provider === "bunny_stream" ? "bunny_stream" : notice.video_provider ?? null,
      provider_video_id: hydration.provider_video_id ?? notice.provider_video_id ?? null,
      video_playback_url: hydration.video_playback_url ?? notice.video_playback_url ?? null,
      video_embed_url: hydration.video_embed_url ?? notice.video_embed_url ?? null,
      video_thumbnail_url: hydration.video_thumbnail_url ?? notice.video_thumbnail_url ?? null,
      video_preview_url: hydration.video_preview_url ?? notice.video_preview_url ?? null,
      video_duration_seconds: hydration.video_duration_seconds ?? notice.video_duration_seconds ?? null,
      video_status: hydration.video_status ?? notice.video_status ?? null,
      author: {
        ...notice.author,
        display_name:
          typeof hydration.author_display_name === "string"
            ? hydration.author_display_name
            : notice.author?.display_name ?? null,
        social_id:
          typeof hydration.author_social_id === "string"
            ? hydration.author_social_id
            : notice.author?.social_id ?? null,
        avatar_url:
          typeof hydration.author_avatar_url === "string"
            ? hydration.author_avatar_url
            : notice.author?.avatar_url ?? null,
        is_verified:
          hydration.author_is_verified === true ||
          String(hydration.author_verification_status || "").toLowerCase() === "verified" ||
          notice.author?.is_verified === true,
        engagement: engagementByUserId.get(notice.user_id) ?? notice.author?.engagement ?? null,
      },
    };
  });

  await options.primeMentionDirectory([
    ...hydratedRows.map((row) => row.content || ""),
  ]);

  const alertTypes: Record<string, "Stray" | "Lost" | "Caution" | "Others"> = {};
  hydratedRows.forEach((notice) => {
    const derivedType = options.deriveAlertTypeFromNoticeData(notice);
    if (derivedType) {
      alertTypes[notice.id] = derivedType;
    }
  });

  return {
    rows: hydratedRows,
    commentsByThread: {},
    threadMentions,
    replyMentions: {},
    alertTypes,
  };
};
