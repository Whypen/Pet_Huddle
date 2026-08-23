/**
 * The logged-out surfaces' ONLY data path.
 *
 * These call `api/public-*`, which use the publishable key and the narrow,
 * redacted public projection RPCs. They never accept or read a service-role
 * credential. They must not fall back to direct table reads: with no session,
 * `profiles` and `broadcast_alerts` return 401 and `threads` returns zero rows,
 * so a direct client call produces console errors and an empty surface.
 *
 * That is why the logged-out views are separate components rather than the
 * signed-in pages with conditionals — there is no `supabase.from(...)` in them
 * to accidentally fire.
 */

import { useCallback, useEffect, useState } from "react";

export type PublicPost = {
  id: string;
  title: string;
  content: string;
  images: string[];
  likes: number;
  comment_count: number;
  share_count: number;
  created_at: string;
  category: string;
  tags: string[];
  hashtags: string[];
  author_name: string;
  author_avatar_url: string | null;
  /** Public handle, not a UUID — the lookup key for the profile card. */
  author_social_id: string | null;
  author_verification_status: string | null;
  /** Native Social keeps the post readable and conceals only its media. */
  is_sensitive: boolean;
};

export type PublicAlert = {
  id: string;
  /** Pin position only; alert and creator details remain auth-gated. */
  latitude: number;
  longitude: number;
  alert_type: string;
  area: string;
  created_at: string;
};

export type PublicGroup = {
  id: string;
  name: string;
  description: string;
  cover_url: string | null;
  area: string;
  country: string;
  member_count: number;
  pet_focus: string[];
  next_event_title: string | null;
  next_event_starts_at: string | null;
  next_event_ends_at: string | null;
};

type ResourceState<T> = { data: T[]; loading: boolean; failed: boolean };
type State<T> = ResourceState<T> & { refresh: () => Promise<void> };

type CachedResource = {
  data: unknown[];
  storedAt: number;
};

const PUBLIC_CACHE_TTL_MS = 60_000;
const resourceCache = new Map<string, CachedResource>();
const pendingResources = new Map<string, Promise<unknown[]>>();

/** Test isolation only; production code never clears the warm navigation cache. */
export const __resetPublicReadCacheForTests = () => {
  resourceCache.clear();
  pendingResources.clear();
};

const resourceId = (path: string, key: string) => `${path}::${key}`;

const readCached = <T,>(id: string): T[] | null => {
  const cached = resourceCache.get(id);
  if (!cached || Date.now() - cached.storedAt >= PUBLIC_CACHE_TTL_MS) return null;
  return cached.data as T[];
};

const readStored = <T,>(id: string): T[] | null => {
  const cached = resourceCache.get(id);
  return cached ? cached.data as T[] : null;
};

const fetchResource = <T,>(path: string, key: string): Promise<T[]> => {
  const id = resourceId(path, key);
  const existing = pendingResources.get(id);
  if (existing) return existing as Promise<T[]>;

  const request = fetch(path)
    .then(async (response) => {
      if (!response.ok) throw new Error(String(response.status));
      const payload = await response.json();
      const rows = Array.isArray(payload?.[key]) ? payload[key] as T[] : [];
      resourceCache.set(id, { data: rows, storedAt: Date.now() });
      return rows;
    })
    .finally(() => {
      pendingResources.delete(id);
    });

  pendingResources.set(id, request);
  return request;
};

const usePublicResource = <T,>(path: string, key: string): State<T> => {
  const id = resourceId(path, key);
  const cached = readCached<T>(id);
  const stored = readStored<T>(id);
  const [state, setState] = useState<ResourceState<T>>({
    data: cached ?? stored ?? [],
    loading: cached === null && stored === null,
    failed: false,
  });

  useEffect(() => {
    const fresh = readCached<T>(id);
    if (fresh) {
      setState({ data: fresh, loading: false, failed: false });
      return;
    }

    const stale = readStored<T>(id);
    let cancelled = false;
    setState({ data: stale ?? [], loading: stale === null, failed: false });
    void fetchResource<T>(path, key)
      .then((rows) => {
        if (!cancelled) setState({ data: rows, loading: false, failed: false });
      })
      .catch(() => {
        if (cancelled) return;
        // Distinguished from "empty" on purpose: an empty district is a normal,
        // encouraging state; a failed fetch is not, and must not be dressed up
        // as one.
        setState((current) => ({ ...current, loading: false, failed: true }));
      });
    return () => {
      cancelled = true;
    };
  }, [id, key, path]);

  const refresh = useCallback(async () => {
    resourceCache.delete(id);
    setState((current) => ({ ...current, loading: true, failed: false }));
    try {
      const rows = await fetchResource<T>(path, key);
      setState({ data: rows, loading: false, failed: false });
    } catch {
      setState((current) => ({ ...current, loading: false, failed: true }));
    }
  }, [id, key, path]);

  return { ...state, refresh };
};

export const usePublicFeed = (sort: "Latest" | "Trending" = "Latest") =>
  usePublicResource<PublicPost>(`/api/public-feed?sort=${encodeURIComponent(sort)}&limit=50`, "posts");
export const usePublicAlerts = () => usePublicResource<PublicAlert>("/api/public-alerts", "alerts");
export const usePublicGroups = () => usePublicResource<PublicGroup>("/api/public-groups", "groups");

export const relativeTime = (iso: string): string => {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const seconds = Math.max(1, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
};
