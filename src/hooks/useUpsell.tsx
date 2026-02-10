// =====================================================
// SMART UPSELL HOOK - Trigger Modals Based on Usage
// Prevents client-side tampering via RLS-protected queries
// =====================================================

import { useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";

export type UpsellType = "star" | "emergency_alert" | "media" | "family_slot" | null;

interface UpsellModalState {
  isOpen: boolean;
  type: UpsellType;
  title: string;
  description: string;
  price: number;
}

type QuotaSnapshot = {
  user_id: string;
  tier: string;
  thread_posts_today: number;
  discovery_views_today: number;
  media_usage_today: number;
  stars_used_cycle: number;
  broadcast_alerts_week: number;
  extra_stars: number;
  extra_media_10: number;
  extra_broadcast_72h: number;
};

export const useUpsell = () => {
  const { profile, user } = useAuth();
  const { t } = useLanguage();
  const [upsellModal, setUpsellModal] = useState<UpsellModalState>({
    isOpen: false,
    type: null,
    title: "",
    description: "",
    price: 0,
  });

  const fetchQuotaSnapshot = useCallback(async (): Promise<QuotaSnapshot | null> => {
    if (!user) return null;
    const r = await (supabase as any).rpc("get_quota_snapshot");
    if (r.error) {
      console.warn("[useUpsell] get_quota_snapshot failed", r.error);
      return null;
    }
    // Supabase RPC returns either a row or an array depending on the generated types,
    // so normalize defensively.
    const row = Array.isArray(r.data) ? r.data[0] : r.data;
    return (row ?? null) as QuotaSnapshot | null;
  }, [user]);

  const effectiveTier = useCallback(
    (snap: QuotaSnapshot | null) => String(profile?.effective_tier || profile?.tier || snap?.tier || "free").toLowerCase(),
    [profile?.effective_tier, profile?.tier]
  );

  /**
   * Check if user needs to buy stars before boosting profile
   * Call this BEFORE any star-consuming action
   */
  const checkStarsAvailable = useCallback(async (): Promise<boolean> => {
    if (!user) return false;

    const snap = await fetchQuotaSnapshot();
    const tier = effectiveTier(snap);
    const base = tier === "gold" ? 3 : 0;
    const used = snap?.stars_used_cycle ?? 0;
    const extra = snap?.extra_stars ?? 0;
    const remaining = Math.max(0, base - used) + Math.max(0, extra);

    if (remaining <= 0) {
      setUpsellModal({
        isOpen: true,
        type: "star",
        title: t("Out of Stars!"),
        description: t("social.star_prompt"),
        price: 4.99,
      });
      return false;
    }

    return true;
  }, [effectiveTier, fetchQuotaSnapshot, t, user]);

  /**
   * Check if user can send emergency alert
   * Call this BEFORE sending mesh alert
   */
  const checkEmergencyAlertAvailable = useCallback(async (): Promise<boolean> => {
    if (!user) return false;

    // Broadcast usage is enforced server-side by trigger, but we can provide an early upsell hint.
    const snap = await fetchQuotaSnapshot();
    const tier = effectiveTier(snap);
    const base = tier === "free" ? 5 : 20;
    const used = snap?.broadcast_alerts_week ?? 0;
    const extra = snap?.extra_broadcast_72h ?? 0;
    const remaining = Math.max(0, base - used) + Math.max(0, extra);

    if (remaining <= 0) {
      setUpsellModal({
        isOpen: true,
        type: "emergency_alert",
        title: t("No Emergency Alerts Left"),
        description: t("Buy an additional Broadcast token to send one more alert."),
        price: 2.99,
      });
      return false;
    }

    return true;
  }, [effectiveTier, fetchQuotaSnapshot, t, user]);

  /**
   * Check if user can upload media to AI Vet
   * Call this BEFORE showing camera/upload UI
   */
  const checkMediaCreditsAvailable = useCallback(async (): Promise<boolean> => {
    if (!user) return false;

    const snap = await fetchQuotaSnapshot();
    const tier = effectiveTier(snap);
    const base = tier === "gold" ? 50 : tier === "premium" ? 10 : 0;
    const used = snap?.media_usage_today ?? 0;
    const extra = snap?.extra_media_10 ?? 0;
    const remaining = Math.max(0, base - used) + Math.max(0, extra);

    if (remaining <= 0) {
      setUpsellModal({
        isOpen: true,
        type: "media",
        title: t("Out of Media Credits"),
        description: t("Upgrade or buy a +10 Media add-on to continue uploading images."),
        price: 3.99,
      });
      return false;
    }

    return true;
  }, [effectiveTier, fetchQuotaSnapshot, t, user]);

  /**
   * Check if user can add more family members
   * Call this BEFORE showing "Add Family Member" form
   */
  const checkFamilySlotsAvailable = useCallback(async (): Promise<boolean> => {
    if (!user) return false;

    const ownerId = profile?.family_owner_id || user.id;
    const snap = await fetchQuotaSnapshot();
    const tier = effectiveTier(snap);
    const totalSlots = tier === "gold" ? 1 : 0;

    const { count } = await (supabase as any)
      .from("family_members")
      .select("id", { count: "exact", head: true })
      .eq("inviter_user_id", ownerId)
      .eq("status", "accepted");

    const currentFamilyCount = count || 0;

    if (currentFamilyCount >= totalSlots) {
      setUpsellModal({
        isOpen: true,
        type: "family_slot",
        title: t("Family Limit Reached"),
        description: t("Upgrade to Gold to invite 1 family member."),
        price: 5.99,
      });
      return false;
    }

    return true;
  }, [effectiveTier, fetchQuotaSnapshot, t, user, profile?.family_owner_id]);

  /**
   * Close upsell modal
   */
  const closeUpsellModal = useCallback(() => {
    setUpsellModal({
      isOpen: false,
      type: null,
      title: "",
      description: "",
      price: 0,
    });
  }, []);

  /**
   * Navigate to Premium page with pre-selected add-on
   */
  const buyAddOn = useCallback((type: UpsellType) => {
    if (!type) return;
    // Store selected add-on in session storage for Premium page to auto-select
    sessionStorage.setItem("pending_addon", type);
    window.location.href = "/premium";
  }, []);

  return {
    upsellModal,
    closeUpsellModal,
    buyAddOn,
    checkStarsAvailable,
    checkEmergencyAlertAvailable,
    checkMediaCreditsAvailable,
    checkFamilySlotsAvailable,
  };
};
