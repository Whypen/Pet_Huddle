import { supabase } from "@/integrations/supabase/client";
import type {
  FeedCursor,
  FeedHydrationRpcRow,
  HydratedRowsResult,
  MentionEntry,
  Thread,
  ThreadComment,
} from "@/components/social/noticeboard/types";

type DeriveAlertType = (notice: Thread) => "Stray" | "Lost" | "Caution" | "Others" | null;

type HydrateRowsOptions = {
  deriveAlertTypeFromNoticeData: DeriveAlertType;
  primeMentionDirectory: (values: string[]) => Promise<void>;
};

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
    last_lat: typeof row.author_last_lat === "number" ? row.author_last_lat : null,
    last_lng: typeof row.author_last_lng === "number" ? row.author_last_lng : null,
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
  const { data, error } = await (supabase.rpc as (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>)(
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
  const { data: focusedThread } = await supabase
    .from("threads" as "profiles")
    .select(`
      id,
      title,
      content,
      tags,
      hashtags,
      images,
      video_provider,
      provider_video_id,
      video_playback_url,
      video_embed_url,
      video_thumbnail_url,
      video_preview_url,
      video_duration_seconds,
      video_status,
      map_id,
      alert_type,
      likes,
      created_at,
      user_id,
      author:profiles!threads_user_id_fkey(
        display_name,
        social_id,
        avatar_url,
        verification_status,
        is_verified,
        non_social,
        location_country,
        last_lat,
        last_lng
      )
    `)
    .eq("id", threadId)
    .maybeSingle();
  if (!focusedThread) return null;
  const focusedRow = focusedThread as unknown as Record<string, unknown>;
  const authorObj = Array.isArray(focusedRow.author) ? focusedRow.author[0] : focusedRow.author;
  return mapFeedRowToThread({
    id: focusedRow.id,
    title: focusedRow.title,
    content: focusedRow.content,
    tags: focusedRow.tags,
    hashtags: focusedRow.hashtags,
    images: focusedRow.images,
    video_provider: focusedRow.video_provider,
    provider_video_id: focusedRow.provider_video_id,
    video_playback_url: focusedRow.video_playback_url,
    video_embed_url: focusedRow.video_embed_url,
    video_thumbnail_url: focusedRow.video_thumbnail_url,
    video_preview_url: focusedRow.video_preview_url,
    video_duration_seconds: focusedRow.video_duration_seconds,
    video_status: focusedRow.video_status,
    like_count: focusedRow.likes,
    support_count: focusedRow.support_count ?? 0,
    comment_count: focusedRow.comment_count ?? 0,
    score: focusedRow.score ?? 0,
    map_id: focusedRow.map_id,
    alert_type: focusedRow.alert_type,
    created_at: focusedRow.created_at,
    user_id: focusedRow.user_id,
    author_display_name: typeof authorObj === "object" && authorObj !== null ? (authorObj as Record<string, unknown>).display_name : null,
    author_social_id: typeof authorObj === "object" && authorObj !== null ? (authorObj as Record<string, unknown>).social_id : null,
    author_avatar_url: typeof authorObj === "object" && authorObj !== null ? (authorObj as Record<string, unknown>).avatar_url : null,
    author_verification_status: typeof authorObj === "object" && authorObj !== null ? (authorObj as Record<string, unknown>).verification_status : null,
    author_is_verified: typeof authorObj === "object" && authorObj !== null ? (authorObj as Record<string, unknown>).is_verified : null,
    author_location_country: typeof authorObj === "object" && authorObj !== null ? (authorObj as Record<string, unknown>).location_country : null,
    author_last_lat: typeof authorObj === "object" && authorObj !== null ? (authorObj as Record<string, unknown>).last_lat : null,
    author_last_lng: typeof authorObj === "object" && authorObj !== null ? (authorObj as Record<string, unknown>).last_lng : null,
    author_non_social: typeof authorObj === "object" && authorObj !== null ? (authorObj as Record<string, unknown>).non_social : false,
  });
};

export const hydrateRowsLegacy = async (
  rows: Thread[],
  { deriveAlertTypeFromNoticeData, primeMentionDirectory }: HydrateRowsOptions,
): Promise<HydratedRowsResult> => {
  const ids = rows.map((n) => n.id);
  if (ids.length === 0) return emptyHydratedRowsResult(rows);

  let hydratedRows = rows;

  const { data: shareRows } = await supabase
    .from("threads" as "profiles")
    .select("id, clicks")
    .in("id", ids);
  if (shareRows && shareRows.length > 0) {
    const shareMap = new Map<string, number>(
      (shareRows as Array<{ id: string; clicks: number | null }>).map((row) => [row.id, Number(row.clicks ?? 0)]),
    );
    hydratedRows = hydratedRows.map((notice) =>
      shareMap.has(notice.id) ? { ...notice, share_count: shareMap.get(notice.id) ?? 0 } : notice,
    );
  }

  const { data: alertRows, error: alertRowsError } = await (supabase.rpc as (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>)(
    "get_social_feed_alert_context",
    { p_thread_ids: ids },
  );
  if (!alertRowsError && Array.isArray(alertRows) && alertRows.length > 0) {
    const alertMap = new Map(
      (alertRows as Array<{ thread_id?: string; map_id?: string | null; alert_type?: string | null; location_district?: string | null }>).map((row) => [
        String(row.thread_id || ""),
        {
          map_id: typeof row.map_id === "string" ? row.map_id : null,
          alert_type: typeof row.alert_type === "string" ? row.alert_type : null,
          location_district: typeof row.location_district === "string" ? row.location_district : null,
          has_alert_link:
            (typeof row.map_id === "string" && row.map_id.trim().length > 0) ||
            (typeof row.alert_type === "string" && row.alert_type.trim().length > 0) ||
            (typeof row.location_district === "string" && row.location_district.trim().length > 0),
        },
      ]),
    );
    hydratedRows = hydratedRows.map((notice) => {
      const linked = alertMap.get(notice.id);
      if (!linked) return notice;
      return {
        ...notice,
        map_id: linked.map_id ?? notice.map_id ?? null,
        alert_type: linked.alert_type ?? notice.alert_type ?? null,
        alert_district: linked.location_district ?? notice.alert_district ?? null,
        has_alert_link: linked.has_alert_link || notice.has_alert_link === true,
      };
    });
  }

  const { data: sensitiveRows } = await supabase
    .from("threads" as "profiles")
    .select("id,is_sensitive")
    .in("id", ids);
  if (sensitiveRows && sensitiveRows.length > 0) {
    const sensitiveMap = new Map<string, boolean>(
      (sensitiveRows as Array<{ id: string; is_sensitive?: boolean | null }>).map((row) => [row.id, row.is_sensitive === true]),
    );
    hydratedRows = hydratedRows.map((notice) => ({
      ...notice,
      is_sensitive: sensitiveMap.get(notice.id) === true,
    }));
  } else {
    hydratedRows = hydratedRows.map((notice) => ({ ...notice, is_sensitive: notice.is_sensitive === true }));
  }

  const userIds = Array.from(new Set(hydratedRows.map((row) => row.user_id).filter(Boolean)));
  if (userIds.length > 0) {
    const { data: profileRows } = await supabase
      .from("profiles")
      .select("id, social_id, display_name, avatar_url, is_verified")
      .in("id", userIds);
    if (profileRows && profileRows.length > 0) {
      const profileMap = new Map(
        (profileRows as Array<{ id: string; social_id?: string | null; display_name?: string | null; avatar_url?: string | null; is_verified?: boolean | null }>).map((row) => [
          row.id,
          row,
        ]),
      );
      hydratedRows = hydratedRows.map((notice) => {
        const author = profileMap.get(notice.user_id);
        if (!author) return notice;
        return {
          ...notice,
          author: {
            ...notice.author,
            display_name: author.display_name ?? notice.author?.display_name ?? null,
            social_id: author.social_id ?? notice.author?.social_id ?? null,
            avatar_url: author.avatar_url ?? notice.author?.avatar_url ?? null,
            is_verified: author.is_verified === true,
          },
        };
      });
    }
  }

  const { data: comments } = await supabase
    .from("thread_comments" as "profiles")
    .select(`
      id,
      thread_id,
      content,
      images,
      created_at,
      user_id,
      author:profiles!thread_comments_user_id_fkey(display_name, social_id, avatar_url)
    `)
    .in("thread_id", ids)
    .order("created_at", { ascending: true });

  const commentsByThread: Record<string, ThreadComment[]> = Object.fromEntries(ids.map((id) => [id, []]));
  (((comments || []) as unknown) as Array<Record<string, unknown>>).forEach((comment) => {
    const authorObj = Array.isArray(comment.author) ? comment.author[0] : comment.author;
    const normalizedComment = {
      id: String(comment.id),
      thread_id: String(comment.thread_id),
      content: String(comment.content || ""),
      images: (comment.images as string[] | null) ?? null,
      created_at: String(comment.created_at || new Date().toISOString()),
      user_id: String(comment.user_id),
      author:
        typeof authorObj === "object" && authorObj !== null
          ? {
              display_name: ((authorObj as Record<string, unknown>).display_name as string | null) ?? null,
              social_id: ((authorObj as Record<string, unknown>).social_id as string | null) ?? null,
              avatar_url: ((authorObj as Record<string, unknown>).avatar_url as string | null) ?? null,
            }
          : null,
    } as ThreadComment;
    commentsByThread[normalizedComment.thread_id] = [...(commentsByThread[normalizedComment.thread_id] || []), normalizedComment];
  });

  const commentIds = ((comments || []) as Array<{ id: string }>).map((comment) => comment.id);
  const [postMentionResult, replyMentionResult] = await Promise.all([
    supabase
      .from("post_mentions" as never)
      .select("post_id, mentioned_user_id, start_idx, end_idx, social_id_at_time")
      .in("post_id", ids)
      .order("start_idx", { ascending: true }),
    commentIds.length > 0
      ? supabase
          .from("reply_mentions" as never)
          .select("reply_id, mentioned_user_id, start_idx, end_idx, social_id_at_time")
          .in("reply_id", commentIds)
          .order("start_idx", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
  ]);

  const threadMentions: Record<string, MentionEntry[]> = {};
  if (!postMentionResult.error) {
    ((postMentionResult.data || []) as Array<{ post_id: string; mentioned_user_id: string; start_idx: number; end_idx: number; social_id_at_time: string }>).forEach((row) => {
      threadMentions[row.post_id] = [
        ...(threadMentions[row.post_id] || []),
        {
          start: Number(row.start_idx),
          end: Number(row.end_idx),
          mentionedUserId: row.mentioned_user_id,
          socialIdAtTime: row.social_id_at_time,
        },
      ];
    });
  } else if (import.meta.env.DEV) {
    console.warn("[social.mentions.post] hydrate fallback failed", postMentionResult.error);
  }

  const replyMentions: Record<string, MentionEntry[]> = {};
  if (!replyMentionResult.error) {
    ((replyMentionResult.data || []) as Array<{ reply_id: string; mentioned_user_id: string; start_idx: number; end_idx: number; social_id_at_time: string }>).forEach((row) => {
      replyMentions[row.reply_id] = [
        ...(replyMentions[row.reply_id] || []),
        {
          start: Number(row.start_idx),
          end: Number(row.end_idx),
          mentionedUserId: row.mentioned_user_id,
          socialIdAtTime: row.social_id_at_time,
        },
      ];
    });
  } else if (import.meta.env.DEV) {
    console.warn("[social.mentions.reply] hydrate fallback failed", replyMentionResult.error);
  }

  await primeMentionDirectory([
    ...hydratedRows.map((row) => row.content || ""),
    ...(((comments || []) as ThreadComment[]).map((comment) => comment.content || "")),
  ]);

  const alertTypes: Record<string, "Stray" | "Lost" | "Caution" | "Others"> = {};
  hydratedRows.forEach((notice) => {
    const derivedType = deriveAlertTypeFromNoticeData(notice);
    if (derivedType) {
      alertTypes[notice.id] = derivedType;
    }
  });

  return {
    rows: hydratedRows,
    commentsByThread,
    threadMentions,
    replyMentions,
    alertTypes,
  };
};

export const hydrateRows = async (
  rows: Thread[],
  options: HydrateRowsOptions,
): Promise<HydratedRowsResult> => {
  const ids = rows.map((notice) => notice.id).filter(Boolean);
  if (ids.length === 0) return emptyHydratedRowsResult(rows);

  const { data, error } = await (supabase.rpc as (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>)(
    "get_social_feed_hydration",
    { p_thread_ids: ids },
  );

  if (error || !Array.isArray(data)) {
    if (error) {
      console.warn("[social.feed] helper hydration unavailable, falling back", error);
    }
    return hydrateRowsLegacy(rows, options);
  }

  const hydrationByThreadId = new Map<string, FeedHydrationRpcRow>(
    (data as FeedHydrationRpcRow[])
      .filter((row) => typeof row?.thread_id === "string" && row.thread_id.trim().length > 0)
      .map((row) => [row.thread_id, row]),
  );

  const commentsByThread: Record<string, ThreadComment[]> = Object.fromEntries(ids.map((id) => [id, []]));
  const threadMentions: Record<string, MentionEntry[]> = {};
  const replyMentions: Record<string, MentionEntry[]> = {};

  const hydratedRows = rows.map((notice) => {
    const hydration = hydrationByThreadId.get(notice.id);
    if (!hydration) return notice;

    const rawComments = Array.isArray(hydration.comments) ? hydration.comments : [];
    commentsByThread[notice.id] = rawComments.map((comment) => {
      const authorObj =
        typeof comment === "object" && comment !== null && typeof (comment as Record<string, unknown>).author === "object"
          ? ((comment as Record<string, unknown>).author as Record<string, unknown> | null)
          : null;
      return {
        id: String((comment as Record<string, unknown>)?.id || ""),
        thread_id: String((comment as Record<string, unknown>)?.thread_id || notice.id),
        content: String((comment as Record<string, unknown>)?.content || ""),
        images: Array.isArray((comment as Record<string, unknown>)?.images)
          ? (((comment as Record<string, unknown>).images as unknown[]).filter((value): value is string => typeof value === "string"))
          : null,
        created_at: String((comment as Record<string, unknown>)?.created_at || new Date().toISOString()),
        user_id: String((comment as Record<string, unknown>)?.user_id || ""),
        author: authorObj
          ? {
              display_name: typeof authorObj.display_name === "string" ? authorObj.display_name : null,
              social_id: typeof authorObj.social_id === "string" ? authorObj.social_id : null,
              avatar_url: typeof authorObj.avatar_url === "string" ? authorObj.avatar_url : null,
            }
          : null,
      } as ThreadComment;
    });

    threadMentions[notice.id] = parseMentionEntries(hydration.thread_mentions);

    const rawReplyMentions =
      hydration.reply_mentions && typeof hydration.reply_mentions === "object"
        ? (hydration.reply_mentions as Record<string, unknown>)
        : {};
    Object.entries(rawReplyMentions).forEach(([replyId, entries]) => {
      const parsedEntries = parseMentionEntries(entries);
      if (parsedEntries.length > 0) {
        replyMentions[replyId] = parsedEntries;
      }
    });

    return {
      ...notice,
      share_count: Number(hydration.share_count ?? notice.share_count ?? 0),
      is_sensitive: hydration.is_sensitive === true,
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
        is_verified: hydration.author_is_verified === true,
      },
    };
  });

  await options.primeMentionDirectory([
    ...hydratedRows.map((row) => row.content || ""),
    ...Object.values(commentsByThread).flat().map((comment) => comment.content || ""),
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
    commentsByThread,
    threadMentions,
    replyMentions,
    alertTypes,
  };
};
