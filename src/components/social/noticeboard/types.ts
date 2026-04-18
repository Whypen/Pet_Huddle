export interface Thread {
  id: string;
  title: string;
  content: string;
  tags: string[] | null;
  hashtags: string[] | null;
  images: string[] | null;
  created_at: string;
  user_id: string;
  likes?: number | null;
  like_count?: number | null;
  support_count?: number | null;
  comment_count?: number | null;
  share_count?: number | null;
  score?: number | null;
  map_id?: string | null;
  alert_type?: string | null;
  alert_district?: string | null;
  has_alert_link?: boolean;
  is_sensitive?: boolean | null;
  author: {
    display_name: string | null;
    social_id?: string | null;
    avatar_url: string | null;
    verification_status?: string | null;
    is_verified?: boolean | null;
    location_country?: string | null;
    last_lat?: number | null;
    last_lng?: number | null;
    non_social?: boolean | null;
  } | null;
}

export interface ThreadComment {
  id: string;
  thread_id: string;
  content: string;
  images?: string[] | null;
  created_at: string;
  user_id: string;
  author: {
    display_name: string | null;
    social_id?: string | null;
    avatar_url?: string | null;
  } | null;
}

export type MentionEntry = {
  start: number;
  end: number;
  mentionedUserId: string;
  socialIdAtTime: string;
};

export type MentionSuggestion = {
  userId: string;
  socialId: string;
  displayName: string;
  avatarUrl: string | null;
};

export type ActiveMentionQuery = {
  query: string;
  tokenStart: number;
  tokenEnd: number;
  caret: number;
};

export type LinkPreview = {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  loading?: boolean;
  failed?: boolean;
  resolved?: boolean;
  error?: string;
};

export type LinkPreviewPayload = {
  url?: unknown;
  title?: unknown;
  description?: unknown;
  image?: unknown;
  siteName?: unknown;
  failed?: unknown;
};

export type HydratedRowsResult = {
  rows: Thread[];
  commentsByThread: Record<string, ThreadComment[]>;
  threadMentions: Record<string, MentionEntry[]>;
  replyMentions: Record<string, MentionEntry[]>;
  alertTypes: Record<string, "Stray" | "Lost" | "Caution" | "Others">;
};

export type FeedHydrationRpcRow = {
  thread_id: string;
  share_count?: number | null;
  is_sensitive?: boolean | null;
  author_display_name?: string | null;
  author_social_id?: string | null;
  author_avatar_url?: string | null;
  author_is_verified?: boolean | null;
  map_id?: string | null;
  alert_type?: string | null;
  alert_district?: string | null;
  has_alert_link?: boolean | null;
  comments?: unknown;
  thread_mentions?: unknown;
  reply_mentions?: unknown;
};

export type FeedCursor = {
  created_at: string;
  id: string;
  score?: number | null;
};

export type ComposerMedia = {
  file: File;
  kind: "image" | "video";
  previewUrl: string;
};

export type UploadLifecycleStatus = "idle" | "uploading" | "success" | "error";

export type ComposerUploadState = {
  scope: "thread" | "reply" | null;
  status: UploadLifecycleStatus;
  progress: number;
};
