import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { canonicalizeSocialAlbumEntries, resolveSocialAlbumUrlList } from "@/lib/socialAlbum";
import { normalizeCountryKey } from "@/lib/locationLabels";
import { mapProviderRow } from "@/components/service/mapProviderRow";
import type { ProviderSummary } from "@/components/service/types";

interface UseServiceProvidersResult {
  providers: ProviderSummary[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  toggleBookmark: (providerUserId: string) => Promise<void>;
}

type Anchor = { lat: number; lng: number } | null;

type ServiceProvidersCacheEntry = {
  providers: ProviderSummary[];
  updatedAt: number;
};

const SERVICE_PROVIDERS_STALE_MS = 5 * 60 * 1000;
const serviceProvidersCache = new Map<string, ServiceProvidersCacheEntry>();
const socialAlbumUrlCache = new Map<string, string[]>();

const buildServiceProvidersCacheKey = (anchor?: Anchor, viewerCountry?: string | null) =>
  JSON.stringify({
    lat: anchor && Number.isFinite(anchor.lat) ? Number(anchor.lat.toFixed(3)) : null,
    lng: anchor && Number.isFinite(anchor.lng) ? Number(anchor.lng.toFixed(3)) : null,
    viewerCountry: normalizeCountryKey(viewerCountry),
  });

export function useServiceProviders(anchor?: Anchor, viewerCountry?: string | null): UseServiceProvidersResult {
  const [providers, setProviders] = useState<ProviderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const bookmarkInFlight = useRef<Set<string>>(new Set());
  const cacheKey = buildServiceProvidersCacheKey(anchor, viewerCountry);
  const lastFetchedAtRef = useRef(0);

  const fetchProviders = useCallback(async (options?: { force?: boolean; background?: boolean }) => {
    const force = options?.force === true;
    const background = options?.background === true;
    const cached = serviceProvidersCache.get(cacheKey);
    const cacheAgeMs = cached ? Date.now() - cached.updatedAt : Number.POSITIVE_INFINITY;
    const shouldUseFreshCache = !force && cached && cacheAgeMs < SERVICE_PROVIDERS_STALE_MS;

    if (shouldUseFreshCache) {
      setProviders(cached.providers);
      setError(null);
      setLoading(false);
      lastFetchedAtRef.current = cached.updatedAt;
      return;
    }

    if (cached && !force) {
      setProviders(cached.providers);
      setError(null);
      lastFetchedAtRef.current = cached.updatedAt;
    }

    if (!background || !cached) {
      setLoading(true);
    }
    setError(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { data: rows, error: rowsError } = await (supabase
        .from("pet_care_profiles" as never)
        .select(
          [
            "user_id",
            "story",
            "skills",
            "proof_metadata",
            "days",
            "time_blocks",
            "other_time_from",
            "other_time_to",
            "emergency_readiness",
            "min_notice_value",
            "min_notice_unit",
            "location_styles",
            "area_name",
            "services_offered",
            "services_other",
            "pet_types",
            "pet_types_other",
            "dog_sizes",
            "currency",
            "starting_price",
            "rates",
            "listed",
            "view_count",
            "created_at",
            "updated_at",
            "agreement_accepted",
            "stripe_payout_status",
            "service_rank_weight",
          ].join(","),
        )
        .eq("listed", true)
        .order("updated_at", { ascending: false })) as unknown as {
          data: Array<Record<string, unknown>> | null;
          error: { message?: string } | null;
        };
      if (rowsError) throw rowsError;

      const providerRows = rows ?? [];
      let providerIds = providerRows
        .map((row) => String((row as Record<string, unknown>).user_id ?? ""))
        .filter(Boolean);

      if (providerIds.length > 0) {
        const { data: hiddenRows, error: hiddenErr } = await (supabase.rpc as (
          fn: string,
          params?: Record<string, unknown>,
        ) => Promise<{ data: Array<{ user_id?: string }> | null; error: { message?: string } | null }>)(
          "get_users_with_active_restriction",
          { p_user_ids: providerIds, p_restriction_key: "marketplace_hidden" },
        );
        if (hiddenErr) throw hiddenErr;
        const hiddenSet = new Set(
          (hiddenRows ?? [])
            .map((row) => String(row?.user_id || "").trim())
            .filter(Boolean),
        );
        if (hiddenSet.size > 0) {
          providerIds = providerIds.filter((id) => !hiddenSet.has(id));
        }
      }

      if (providerIds.length === 0) {
        setProviders([]);
        return;
      }

      const [
        { data: profileRows, error: profileErr },
        { data: albumRows, error: albumErr },
        { data: bookmarkRows, error: bookmarkErr },
        distanceResp,
      ] = await Promise.all([
        supabase
          .from("profiles_public")
          .select("id, display_name, avatar_url, has_car, is_verified")
          .in("id", providerIds),
        supabase
          .from("profiles")
          .select("id, social_album, verification_status, location_country")
          .in("id", providerIds),
        user?.id
          ? supabase
              .from("service_bookmarks")
              .select("provider_user_id")
              .eq("user_id", user.id)
          : Promise.resolve({ data: [], error: null }),
        anchor && Number.isFinite(anchor.lat) && Number.isFinite(anchor.lng)
          ? (supabase.rpc as (
              fn: string,
              params?: Record<string, unknown>,
            ) => Promise<{ data: unknown; error: { message?: string } | null }>)(
              "get_service_provider_distances",
              { p_lat: anchor.lat, p_lng: anchor.lng },
            )
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (profileErr) throw profileErr;
      if (albumErr) {
        console.warn("[service.fetch_providers.album_rows_failed]", albumErr);
      }
      if (bookmarkErr) {
        console.warn("[service.fetch_providers.bookmarks_failed]", bookmarkErr);
      }
      if (distanceResp.error) {
        console.warn("[service.fetch_providers.distance_failed]", distanceResp.error);
      }

      const publicProfileById = new Map(
        (profileRows ?? []).map((profileRow) => [String(profileRow.id), profileRow as Record<string, unknown>]),
      );
      const albumById = new Map(
        (albumRows ?? []).map((albumRow) => [String(albumRow.id), albumRow as Record<string, unknown>]),
      );
      const bookmarkedSet = new Set((bookmarkRows ?? []).map((row) => String(row.provider_user_id)));
      const distanceByUserId = new Map<string, number>();
      for (const row of (distanceResp.data as Array<{ user_id?: string; distance_km?: number | null }> | null) ?? []) {
        const id = String(row?.user_id || "").trim();
        if (!id) continue;
        const distanceKm = typeof row?.distance_km === "number" && Number.isFinite(row.distance_km) ? row.distance_km : null;
        if (distanceKm == null) continue;
        distanceByUserId.set(id, distanceKm);
      }

      // Pre-resolve album URLs in concurrency-capped batches.
      // Previous behavior: Promise.all over N providers fired N parallel
      // storage-signing requests, head-of-line-blocking other Supabase calls
      // behind Chrome's 6-per-origin connection cap. Now: collect unique
      // cache misses, resolve in batches of 6, then do a sync mapping pass.
      const ALBUM_BATCH_SIZE = 6;
      const profileByProviderId = new Map<string, Record<string, unknown> | null>();
      const albumRawByProviderId = new Map<string, string[]>();
      const missingAlbumKeys = new Map<string, string[]>(); // cacheKey → albumRaw

      for (const row of providerRows) {
        const rowObj = row as Record<string, unknown>;
        const providerUserId = String(rowObj.user_id ?? "");
        if (!providerUserId) continue;
        const publicProfile = publicProfileById.get(providerUserId) ?? null;
        const albumProfile = albumById.get(providerUserId) ?? null;
        const mergedProfile =
          publicProfile || albumProfile
            ? { ...(publicProfile ?? {}), ...(albumProfile ?? {}) }
            : null;
        profileByProviderId.set(providerUserId, mergedProfile);

        const albumRaw = canonicalizeSocialAlbumEntries((mergedProfile?.social_album as string[] | null) ?? []);
        albumRawByProviderId.set(providerUserId, albumRaw);
        if (albumRaw.length === 0) continue;
        const cacheKey = albumRaw.join("|");
        if (socialAlbumUrlCache.get(cacheKey)) continue;
        if (!missingAlbumKeys.has(cacheKey)) missingAlbumKeys.set(cacheKey, albumRaw);
      }

      const missingEntries = Array.from(missingAlbumKeys.entries());
      for (let i = 0; i < missingEntries.length; i += ALBUM_BATCH_SIZE) {
        const slice = missingEntries.slice(i, i + ALBUM_BATCH_SIZE);
        await Promise.all(
          slice.map(async ([cacheKey, albumRaw]) => {
            try {
              const urls = await resolveSocialAlbumUrlList(albumRaw);
              socialAlbumUrlCache.set(cacheKey, urls);
            } catch (error) {
              console.warn("[service.fetch_providers.album_url_resolve_failed]", {
                cacheKey,
                error,
              });
              // Intentionally do NOT cache the failure — preserves the prior
              // behavior of retrying on the next provider fetch (transient
              // signing errors will recover). The mapping pass below falls
              // back to [] when the cache is empty for this key.
            }
          }),
        );
      }

      const mapped = providerRows.map((row) => {
        const rowObj = row as Record<string, unknown>;
        const providerUserId = String(rowObj.user_id ?? "");
        const mergedProfile = profileByProviderId.get(providerUserId) ?? null;
        const albumRaw = albumRawByProviderId.get(providerUserId) ?? [];
        const albumUrls = albumRaw.length > 0
          ? (socialAlbumUrlCache.get(albumRaw.join("|")) ?? [])
          : [];
        const out = mapProviderRow(rowObj, mergedProfile, albumUrls, bookmarkedSet.has(providerUserId));
        out.distanceKm = distanceByUserId.get(providerUserId) ?? null;
        return out;
      });

      const viewerCountryKey = normalizeCountryKey(viewerCountry);
      const geoFiltered = mapped.filter((entry) => {
        const distanceKm = typeof entry.distanceKm === "number" && Number.isFinite(entry.distanceKm) ? entry.distanceKm : null;
        const within50km = distanceKm !== null && distanceKm <= 50;
        if (distanceKm !== null && !within50km) return false;
        const providerCountryKey = normalizeCountryKey(entry.locationCountry ?? null);
        if (viewerCountryKey && providerCountryKey) {
          return providerCountryKey === viewerCountryKey && (within50km || distanceKm === null);
        }
        return within50km || distanceKm === null;
      });

      // Defense-in-depth: only surface verified providers in the public feed.
      // The listing gate in CarerProfile prevents unverified users from setting
      // listed=true going forward, but this filter protects against legacy rows.
      const nextProviders = geoFiltered.filter(
        (entry): entry is ProviderSummary =>
          entry !== null && entry.verificationStatus === "verified",
      );
      setProviders(nextProviders);
      lastFetchedAtRef.current = Date.now();
      serviceProvidersCache.set(cacheKey, {
        providers: nextProviders,
        updatedAt: lastFetchedAtRef.current,
      });
    } catch (e) {
      console.error("[service.fetch_providers_failed]", e);
      setError("Unable to load services right now.");
    } finally {
      setLoading(false);
    }
  }, [anchor, cacheKey, viewerCountry]);

  useEffect(() => {
    void fetchProviders();
  }, [fetchProviders]);

  useEffect(() => {
    const onFocus = () => {
      const cached = serviceProvidersCache.get(cacheKey);
      const cacheAgeMs = cached ? Date.now() - cached.updatedAt : Number.POSITIVE_INFINITY;
      if (cacheAgeMs < SERVICE_PROVIDERS_STALE_MS) return;
      void fetchProviders({ background: true });
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [cacheKey, fetchProviders]);

  const toggleBookmark = useCallback(async (providerUserId: string) => {
    if (bookmarkInFlight.current.has(providerUserId)) return;
    bookmarkInFlight.current.add(providerUserId);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.id) {
      bookmarkInFlight.current.delete(providerUserId);
      return;
    }

    const { data: existingRow, error: existingErr } = await supabase
      .from("service_bookmarks")
      .select("id")
      .eq("user_id", user.id)
      .eq("provider_user_id", providerUserId)
      .maybeSingle();
    if (existingErr) {
      bookmarkInFlight.current.delete(providerUserId);
      throw existingErr;
    }

    const isBookmarked = Boolean(existingRow);
    const previous = providers;

    try {
      if (isBookmarked) {
      const { error: delErr } = await supabase
        .from("service_bookmarks")
        .delete()
        .eq("user_id", user.id)
        .eq("provider_user_id", providerUserId);
        if (delErr) throw delErr;
      } else {
        const { error: upsertErr } = await supabase
          .from("service_bookmarks")
          .upsert(
            { user_id: user.id, provider_user_id: providerUserId },
            { onConflict: "user_id,provider_user_id", ignoreDuplicates: true },
          );
        if (upsertErr) throw upsertErr;
      }

      const updated = previous.map((item) =>
        item.userId === providerUserId ? { ...item, isBookmarked: !isBookmarked } : item,
      );
      setProviders(updated);
      serviceProvidersCache.set(cacheKey, {
        providers: updated,
        updatedAt: lastFetchedAtRef.current || Date.now(),
      });
    } catch (err) {
      setProviders(previous);
      throw err;
    } finally {
      bookmarkInFlight.current.delete(providerUserId);
    }
  }, [cacheKey, providers]);

  const refresh = useCallback(async () => {
    await fetchProviders({ force: true });
  }, [fetchProviders]);

  return {
    providers,
    loading,
    error,
    refresh,
    toggleBookmark,
  };
}
