import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { canonicalizeSocialAlbumEntries, resolveSocialAlbumUrlList } from "@/lib/socialAlbum";
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

export function useServiceProviders(anchor?: Anchor): UseServiceProvidersResult {
  const [providers, setProviders] = useState<ProviderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const bookmarkInFlight = useRef<Set<string>>(new Set());

  const fetchProviders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { data: rows, error: rowsError } = await supabase
        .from("pet_care_profiles")
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
          ].join(","),
        )
        .eq("listed", true)
        .order("updated_at", { ascending: false });
      if (rowsError) throw rowsError;

      const providerRows = rows ?? [];
      const providerIds = providerRows
        .map((row) => String((row as Record<string, unknown>).user_id ?? ""))
        .filter(Boolean);

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
          .select("id, social_album, verification_status")
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
      if (albumErr) throw albumErr;
      if (bookmarkErr) throw bookmarkErr;
      if (distanceResp.error) throw distanceResp.error;

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

      const mapped = await Promise.all(
        providerRows.map(async (row) => {
          const rowObj = row as Record<string, unknown>;
          const providerUserId = String(rowObj.user_id ?? "");
          const publicProfile = publicProfileById.get(providerUserId) ?? null;
          const albumProfile = albumById.get(providerUserId) ?? null;
          const mergedProfile =
            publicProfile || albumProfile
              ? { ...(publicProfile ?? {}), ...(albumProfile ?? {}) }
              : null;

          const albumRaw = canonicalizeSocialAlbumEntries((mergedProfile?.social_album as string[] | null) ?? []);
          const albumUrls = await resolveSocialAlbumUrlList(albumRaw);
          const mapped = mapProviderRow(rowObj, mergedProfile, albumUrls, bookmarkedSet.has(providerUserId));
          mapped.distanceKm = distanceByUserId.get(providerUserId) ?? null;
          return mapped;
        }),
      );

      setProviders(mapped.filter((entry): entry is ProviderSummary => entry !== null));
    } catch (e) {
      console.error("[service.fetch_providers_failed]", e);
      setError("Unable to load services right now.");
    } finally {
      setLoading(false);
    }
  }, [anchor]);

  useEffect(() => {
    void fetchProviders();
  }, [fetchProviders]);

  useEffect(() => {
    const onFocus = () => {
      void fetchProviders();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [fetchProviders]);

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

      setProviders((prev) =>
        prev.map((item) =>
          item.userId === providerUserId ? { ...item, isBookmarked: !isBookmarked } : item,
        ),
      );
    } catch (err) {
      setProviders(previous);
      throw err;
    } finally {
      bookmarkInFlight.current.delete(providerUserId);
    }
  }, [providers]);

  const refresh = useCallback(async () => {
    await fetchProviders();
  }, [fetchProviders]);

  return {
    providers,
    loading,
    error,
    refresh,
    toggleBookmark,
  };
}
