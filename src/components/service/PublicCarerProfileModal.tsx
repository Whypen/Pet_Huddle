import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { canonicalizeSocialAlbumEntries, resolveSocialAlbumUrlList } from "@/lib/socialAlbum";
import { mapProviderRow } from "./mapProviderRow";
import type { ProviderSummary } from "./types";
import { PublicCarerProfileView } from "./PublicCarerProfileView";

interface PublicCarerProfileModalProps {
  isOpen: boolean;
  providerUserId: string | null;
  onClose: () => void;
  onRequestService?: (providerUserId: string) => void;
  canRequestService?: boolean;
}

export function PublicCarerProfileModal({
  isOpen,
  providerUserId,
  onClose,
  onRequestService,
  canRequestService = true,
}: PublicCarerProfileModalProps) {
  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState<ProviderSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !providerUserId) return;
    let mounted = true;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [
          { data: row, error: rowError },
          { data: publicProfileRow, error: publicProfileError },
          { data: albumProfileRow, error: albumProfileError },
        ] = await Promise.all([
          supabase
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
            .eq("user_id", providerUserId)
            .eq("listed", true)
            .maybeSingle(),
          supabase
            .from("profiles_public")
            .select("id, display_name, avatar_url, has_car, is_verified")
            .eq("id", providerUserId)
            .maybeSingle(),
          supabase
            .from("profiles")
            .select("id, social_album, verification_status")
            .eq("id", providerUserId)
            .maybeSingle(),
        ]);

        if (rowError) throw rowError;
        if (publicProfileError) throw publicProfileError;
        if (albumProfileError) throw albumProfileError;
        if (!row) {
          setError("Provider is unavailable right now.");
          return;
        }

        const mergedProfile =
          publicProfileRow || albumProfileRow
            ? { ...(publicProfileRow ?? {}), ...(albumProfileRow ?? {}) }
            : null;

        const rawAlbum = canonicalizeSocialAlbumEntries((mergedProfile?.social_album as string[] | null) ?? []);
        const albumUrls = await resolveSocialAlbumUrlList(rawAlbum);

        const mapped = mapProviderRow(
          row as Record<string, unknown>,
          (mergedProfile as unknown as Record<string, unknown>) ?? null,
          albumUrls,
          false,
        );

        if (!mounted) return;
        setProvider(mapped);

        const { data: freshListedRow, error: freshListedErr } = await supabase
          .from("pet_care_profiles")
          .select("listed")
          .eq("user_id", providerUserId)
          .maybeSingle();
        if (freshListedErr) {
          console.warn("[service.provider_modal.listed_recheck_failed]", freshListedErr);
        }

        const shouldCountView = freshListedRow?.listed === true;
        const { error: viewErr } = shouldCountView
          ? await supabase.rpc("increment_pet_care_profile_view_count", {
              p_user_id: providerUserId,
            })
          : { error: null };
        if (viewErr) {
          console.warn("[service.provider_modal.view_count_failed]", viewErr);
        }
      } catch (e) {
        console.error("[service.provider_modal.load_failed]", e);
        if (!mounted) return;
        setError("Unable to load provider profile.");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void load();
    return () => {
      mounted = false;
    };
  }, [isOpen, providerUserId]);

  useEffect(() => {
    if (!isOpen) {
      setProvider(null);
      setError(null);
      setLoading(false);
    }
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-[6200]"
          />

          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed top-[70px] left-4 right-4 max-w-md mx-auto bg-card rounded-2xl z-[6210] overflow-hidden shadow-elevated max-h-[80vh]"
          >
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 rounded-full bg-foreground/10 hover:bg-foreground/20 transition-colors z-10"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="overflow-y-auto max-h-[80vh] px-4 pt-6 pb-6">
              {loading && (
                <div className="min-h-[320px] flex items-center justify-center text-muted-foreground gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Loading provider profile…</span>
                </div>
              )}
              {!loading && error && (
                <div className="min-h-[320px] flex items-center justify-center px-6 text-center text-sm text-muted-foreground">
                  {error}
                </div>
              )}
              {!loading && !error && provider && (
                <PublicCarerProfileView
                  provider={provider}
                  canRequestService={canRequestService}
                  onRequestService={
                    providerUserId && onRequestService
                      ? () => onRequestService(providerUserId)
                      : undefined
                  }
                />
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
