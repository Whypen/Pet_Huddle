import { supabase } from "@/integrations/supabase/client";
import type { MentionEntry, ThreadComment } from "@/components/social/noticeboard/types";

const rpc = supabase.rpc.bind(supabase) as unknown as (
  fn: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message?: string } | null }>;

const throwRpcError = (error: { message?: string } | null, fallback: string) => {
  if (error) throw new Error(error.message || fallback);
};

const normalizePoint = (value: unknown) => {
  if (!value || typeof value !== "object") return null;
  const point = value as { lat?: unknown; lng?: unknown };
  const lat = Number(point.lat);
  const lng = Number(point.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
};

export const getSocialViewerScope = async () => {
  const { data, error } = await rpc("get_native_viewer_scope");
  throwRpcError(error, "Unable to resolve posting scope.");
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  if (!row) return null;
  const cachedPoint = normalizePoint(row.cached_device_point) || normalizePoint(row.recent_user_point);
  const ownPinPoint = normalizePoint(row.own_pin_point);
  const profilePoint = normalizePoint(row.profile_point);
  const point = cachedPoint || ownPinPoint || profilePoint;
  return {
    city: typeof row.city === "string" ? row.city : null,
    country: typeof row.country === "string" ? row.country : null,
    countryCode: null,
    countryName: typeof row.country === "string" ? row.country : null,
    district: typeof row.district === "string" ? row.district : null,
    lat: point?.lat ?? null,
    lng: point?.lng ?? null,
    source: cachedPoint ? "cached_device_gps" : ownPinPoint ? "active_pinned_location" : profilePoint ? "profile_location_geog" : "country_district_fallback",
  };
};

export const fetchSupportedSocialThreadIds = async (threadIds: string[]) => {
  if (threadIds.length === 0) return new Set<string>();
  const { data, error } = await rpc("get_native_social_supported_thread_ids", { p_thread_ids: threadIds });
  throwRpcError(error, "Unable to load support state.");
  return new Set(
    (Array.isArray(data) ? data : [])
      .map((row) => String((row as Record<string, unknown>).thread_id || ""))
      .filter(Boolean),
  );
};

export const setSocialThreadSupport = async (threadId: string, supportedBefore: boolean) => {
  const { data, error } = await rpc("set_native_social_support", {
    p_thread_id: threadId,
    p_supported_before: supportedBefore,
  });
  throwRpcError(error, "Unable to update support.");
  const row = Array.isArray(data) ? data[0] : data;
  return Number(typeof row === "number" ? row : (row as Record<string, unknown> | null)?.support_count ?? 0);
};

const parseMentions = (value: unknown): MentionEntry[] =>
  (Array.isArray(value) ? value : [])
    .map((entry) => {
      const row = entry as Record<string, unknown>;
      return {
        start: Number(row.start ?? 0),
        end: Number(row.end ?? 0),
        mentionedUserId: String(row.mentionedUserId ?? row.mentioned_user_id ?? ""),
        socialIdAtTime: String(row.socialIdAtTime ?? row.social_id_at_time ?? ""),
      };
    })
    .filter((entry) => Boolean(entry.mentionedUserId));

export const fetchSocialComments = async (threadId: string) => {
  const { data, error } = await rpc("get_native_social_comments", {
    p_thread_id: threadId,
    p_before_created_at: null,
    p_limit: 25,
  });
  throwRpcError(error, "Unable to load comments.");
  return (Array.isArray(data) ? data : []).map((entry) => {
    const row = entry as Record<string, unknown>;
    return {
      id: String(row.id || ""),
      thread_id: String(row.thread_id || threadId),
      parent_comment_id: typeof row.parent_comment_id === "string" ? row.parent_comment_id : null,
      content: String(row.content || ""),
      images: Array.isArray(row.images) ? row.images.map(String) : [],
      created_at: String(row.created_at || new Date().toISOString()),
      user_id: String(row.user_id || ""),
      support_count: Number(row.support_count ?? 0),
      viewer_supported: row.viewer_supported === true,
      mentions: parseMentions(row.reply_mentions),
      author: {
        display_name: typeof row.author_display_name === "string" ? row.author_display_name : null,
        social_id: typeof row.author_social_id === "string" ? row.author_social_id : null,
        avatar_url: typeof row.author_avatar_url === "string" ? row.author_avatar_url : null,
        is_verified: row.author_is_verified === true || String(row.author_verification_status || "").toLowerCase() === "verified",
      },
    } satisfies ThreadComment;
  });
};

export const createSocialComment = async ({
  threadId,
  parentCommentId,
  content,
  images,
}: {
  threadId: string;
  parentCommentId: string | null;
  content: string;
  images: string[];
}) => {
  const { data, error } = await rpc("create_native_social_comment", {
    p_thread_id: threadId,
    p_parent_comment_id: parentCommentId,
    p_content: content,
    p_images: images,
    p_image_metadata: [],
  });
  throwRpcError(error, "Unable to post reply.");
  const row = Array.isArray(data) ? data[0] : data;
  return typeof row === "string" ? row : String((row as Record<string, unknown> | null)?.id || "");
};

export const updateSocialComment = async (comment: ThreadComment, content: string) => {
  const { data, error } = await rpc("update_native_social_comment", {
    p_comment_id: comment.id,
    p_content: content,
    p_images: comment.images || [],
    p_image_metadata: [],
  });
  throwRpcError(error, "Unable to update reply.");
  return data === true || (typeof data === "object" && data !== null);
};

export const deleteSocialComment = async (commentId: string) => {
  const { data, error } = await rpc("delete_native_social_comment", { p_comment_id: commentId });
  throwRpcError(error, "Unable to delete reply.");
  return data === true || (typeof data === "object" && data !== null && (data as Record<string, unknown>).deleted === true);
};

export const replaceSocialPostMentions = async (postId: string, mentions: MentionEntry[]) => {
  const { error } = await rpc("replace_native_social_post_mentions", { p_post_id: postId, p_mentions: mentions });
  throwRpcError(error, "Unable to sync mentions.");
};

export const replaceSocialReplyMentions = async (replyId: string, mentions: MentionEntry[]) => {
  const { error } = await rpc("replace_native_social_reply_mentions", { p_reply_id: replyId, p_mentions: mentions });
  throwRpcError(error, "Unable to sync mentions.");
};

export const setSocialCommentSupport = async (commentId: string, supported: boolean) => {
  const { data, error } = await rpc("set_native_social_comment_support", {
    p_comment_id: commentId,
    p_supported: supported,
  });
  throwRpcError(error, "Unable to update comment support.");
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  return {
    supported: row?.supported === true,
    supportCount: Number(row?.support_count ?? 0),
  };
};

export const registerSocialMediaAsset = async (objectPath: string, scope: "thread" | "reply") => {
  const { error } = await rpc("register_native_media_asset", {
    p_bucket: "notices",
    p_object_path: objectPath,
    p_content_type: scope === "reply" ? "social_comment" : "social_thread",
    p_content_id: null,
    p_expires_at: null,
  });
  throwRpcError(error, "Unable to register uploaded media.");
};

export const requestSocialMediaCleanup = async (objectPath: string, reason: string) => {
  const { error } = await rpc("request_storage_cleanup", {
    p_bucket: "notices",
    p_object_path: objectPath,
    p_reason: reason,
  });
  throwRpcError(error, "Unable to clean up uploaded media.");
};
