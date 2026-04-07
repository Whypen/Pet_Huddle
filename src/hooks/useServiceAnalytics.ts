// ── Service ranking analytics ─────────────────────────────────────────────────
// Two events:
//
//   service_feed_rendered — fires once per page visit when the feed first
//   populates. Payload: sort mode, total results, and tier distribution of the
//   top-10 slots. Shows whether Gold/Plus carers are surfacing at the top.
//
//   service_profile_viewed — fires each time a carer card is tapped. Payload:
//   provider_user_id, service_rank_weight (0/10/20 → free/plus/gold), sort mode.
//   Shows which tier profiles users actually open.
//
// Both are fire-and-forget inserts into `service_analytics`. Errors are silently
// swallowed — analytics must never interrupt the user flow.

import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { ProviderSummary } from "@/components/service/types";
import type { ServiceSortOption } from "@/components/service/filterProviders";

export function useServiceAnalytics(
  userId: string | undefined,
  providers: ProviderSummary[],
  sort: ServiceSortOption,
  activeProviderId: string | null,
  loading: boolean,
): void {
  // ── Feed rendered ────────────────────────────────────────────────────────────
  // Fire once per page mount when the initial results arrive. Does not re-fire
  // on filter or sort changes (those are captured via profile_viewed events).
  const hasFiredFeedRef = useRef(false);

  useEffect(() => {
    if (hasFiredFeedRef.current || loading || providers.length === 0 || !userId) return;
    hasFiredFeedRef.current = true;

    const top10 = providers.slice(0, 10);
    void supabase.from("service_analytics").insert({
      user_id: userId,
      event: "service_feed_rendered",
      payload: {
        sort,
        total: providers.length,
        top10_gold: top10.filter((p) => p.serviceRankWeight === 20).length,
        top10_plus: top10.filter((p) => p.serviceRankWeight === 10).length,
        top10_free: top10.filter((p) => p.serviceRankWeight === 0).length,
      },
    });
  }, [loading, providers, sort, userId]);

  // ── Profile viewed ───────────────────────────────────────────────────────────
  // Fire each time a distinct provider card is tapped.
  // Uses a ref to avoid duplicate fires when deps other than activeProviderId
  // change while the same card is open.
  const lastViewedRef = useRef<string | null>(null);
  const providersRef = useRef(providers);
  providersRef.current = providers;

  useEffect(() => {
    if (!activeProviderId || activeProviderId === lastViewedRef.current || !userId) return;
    lastViewedRef.current = activeProviderId;

    const provider = providersRef.current.find((p) => p.userId === activeProviderId);
    void supabase.from("service_analytics").insert({
      user_id: userId,
      event: "service_profile_viewed",
      payload: {
        provider_user_id: activeProviderId,
        service_rank_weight: provider?.serviceRankWeight ?? null,
        sort,
      },
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProviderId, userId]);
}
