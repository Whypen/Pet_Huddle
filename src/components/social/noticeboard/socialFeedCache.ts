import type { SocialSortMode } from "@/components/social/NoticeBoard";
import type { Thread } from "@/components/social/noticeboard/types";

const CACHE_VERSION = 1;
const CACHE_MAX_AGE_MS = 10 * 60 * 1000;
const CACHE_REUSE_MS = 45 * 1000;
const CACHE_ROW_LIMIT = 12;

type SocialFeedSnapshot = {
  version: number;
  writtenAt: number;
  rows: Thread[];
  hasMore: boolean;
};

const cacheKey = (userId: string, sortMode: SocialSortMode) =>
  `huddle:web-social-feed:v${CACHE_VERSION}:${userId}:${sortMode}`;

export const readSocialFeedCache = (
  userId: string,
  sortMode: SocialSortMode,
): (SocialFeedSnapshot & { reusable: boolean }) | null => {
  if (typeof window === "undefined" || !userId) return null;
  try {
    const raw = window.localStorage.getItem(cacheKey(userId, sortMode));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SocialFeedSnapshot>;
    const age = Date.now() - Number(parsed.writtenAt || 0);
    if (parsed.version !== CACHE_VERSION || age < 0 || age > CACHE_MAX_AGE_MS || !Array.isArray(parsed.rows)) {
      window.localStorage.removeItem(cacheKey(userId, sortMode));
      return null;
    }
    return {
      version: CACHE_VERSION,
      writtenAt: Number(parsed.writtenAt),
      rows: parsed.rows.slice(0, CACHE_ROW_LIMIT) as Thread[],
      hasMore: parsed.hasMore !== false,
      reusable: age <= CACHE_REUSE_MS,
    };
  } catch {
    return null;
  }
};

export const writeSocialFeedCache = (
  userId: string,
  sortMode: SocialSortMode,
  rows: Thread[],
  hasMore: boolean,
) => {
  if (typeof window === "undefined" || !userId || rows.length === 0) return;
  const snapshot: SocialFeedSnapshot = {
    version: CACHE_VERSION,
    writtenAt: Date.now(),
    rows: rows.slice(0, CACHE_ROW_LIMIT),
    hasMore,
  };
  try {
    window.localStorage.setItem(cacheKey(userId, sortMode), JSON.stringify(snapshot));
  } catch {
    // Cache is an acceleration layer; storage denial must never block Social.
  }
};
