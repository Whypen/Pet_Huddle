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

  /**
   * Check if user needs to buy stars before boosting profile
   * Call this BEFORE any star-consuming action
   */
  const checkStarsAvailable = useCallback(async (): Promise<boolean> => {
    if (!user) return false;

    // Fetch from database (RLS-protected, read-only)
    const { data: currentProfile } = await supabase
      .from("profiles")
      .select("stars_count")
      .eq("id", user.id)
      .single();

    const starsCount = currentProfile?.stars_count || 0;

    if (starsCount === 0) {
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
  }, [user]);

  /**
   * Check if user can send emergency alert
   * Call this BEFORE sending mesh alert
   */
  const checkEmergencyAlertAvailable = useCallback(async (): Promise<boolean> => {
    if (!user) return false;

    const { data: currentProfile } = await supabase
      .from("profiles")
      .select("mesh_alert_count")
      .eq("id", user.id)
      .single();

    const alertCount = currentProfile?.mesh_alert_count || 0;

    if (alertCount === 0) {
      setUpsellModal({
        isOpen: true,
        type: "emergency_alert",
        title: t("No Emergency Alerts Left"),
        description: t("Buy an Emergency Alert to broadcast a lost pet notification to nearby users."),
        price: 2.99,
      });
      return false;
    }

    return true;
  }, [user]);

  /**
   * Check if user can upload media to AI Vet
   * Call this BEFORE showing camera/upload UI
   */
  const checkMediaCreditsAvailable = useCallback(async (): Promise<boolean> => {
    if (!user) return false;

    const { data: currentProfile } = await supabase
      .from("profiles")
      .select("media_credits, tier")
      .eq("id", user.id)
      .single();

    const mediaCredits = currentProfile?.media_credits || 0;
    const tier = currentProfile?.tier || "free";

    // Premium/Gold users get unlimited or higher limits
    if (tier === "premium" || tier === "gold") {
      return true;
    }

    // Free tier needs credits
    if (mediaCredits === 0) {
      setUpsellModal({
        isOpen: true,
        type: "media",
        title: t("Out of Media Credits"),
        description: t("Upgrade to Premium for unlimited media or buy a 10-pack to continue uploading photos and videos to AI Vet."),
        price: 3.99,
      });
      return false;
    }

    return true;
  }, [user]);

  /**
   * Check if user can add more family members
   * Call this BEFORE showing "Add Family Member" form
   */
  const checkFamilySlotsAvailable = useCallback(async (): Promise<boolean> => {
    if (!user) return false;

    const { data: currentProfile } = await supabase
      .from("profiles")
      .select("family_slots, care_circle")
      .eq("id", user.id)
      .single();

    const familySlots = currentProfile?.family_slots || 0;
    const careCircle = Array.isArray(currentProfile?.care_circle) ? currentProfile?.care_circle : [];
    const currentFamilyCount = careCircle.length;

    if (currentFamilyCount >= 2 + familySlots) {
      setUpsellModal({
        isOpen: true,
        type: "family_slot",
        title: t("Family Limit Reached"),
        description: t("Buy additional family slots to add more members to your huddle account."),
        price: 5.99,
      });
      return false;
    }

    return true;
  }, [user]);

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
