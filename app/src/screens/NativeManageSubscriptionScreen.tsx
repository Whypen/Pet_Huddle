import { Feather } from "@expo/vector-icons";
import { fetchNativeResponseWithTimeout as fetch } from "../lib/nativeTimeout";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import premiumBanner from "../../assets/Notifications/premium-banner.png";
import { haptic } from "../lib/nativeHaptics";
import { createNativeAuthenticatedHeaders, getFreshNativeAccessToken } from "../lib/nativeFunctionClient";
import { nativeSafeErrorCopy } from "../lib/nativeSafeErrorCopy";
import { useNativeLoadingDeadline } from "../lib/useNativeLoadingDeadline";
import { scheduleNativeMembershipRefreshRetry } from "../lib/nativeMembershipRefreshRetry";
import { fetchNativeProfileSummary } from "../lib/nativeProfileSummary";
import {
  NATIVE_STORE_ALIAS_TO_PRODUCT_ID,
  formatNativeAddonPrice,
  formatNativeStoreMonthlyEquivalentPrice,
  formatNativeStorePrice,
  loadNativeStoreProducts,
  listenForNativeStorePurchases,
  nativeFallbackStruckMonthlyPrices,
  openNativeStoreSubscriptionManagement,
  requestNativeStoreProductPurchase,
  restoreNativeStorePurchases,
  type NativeStoreProductId,
  type NativeStoreProductState,
  type NativeStorePurchaseStatus,
} from "../lib/nativeStoreSubscriptions";
import { supabaseAnonKey, supabaseUrl } from "../lib/supabase";
import {
  huddleButtons,
  huddleColors,
  huddleLayout,
  huddleRadii,
  huddleShadows,
  huddleSpacing,
  huddleType,
} from "../theme/huddleDesignTokens";

type NativeManageSubscriptionScreenProps = {
  userId: string | null;
  accessToken?: string | null;
  sessionKey?: string | null;
  initialPlan?: PlanKey;
  initialBilling?: "monthly" | "annual";
  onBack?: () => void;
  onNavigate?: (path: string) => void;
};

type PlanKey = "plus" | "gold" | "addons";
type OwnedTier = "free" | "plus" | "gold";

type NativeMembershipProfile = {
  family_share_capacity: number | null;
  has_active_paid_tier: boolean | null;
  tier: string | null;
  effective_tier: string | null;
  subscription_status: string | null;
  subscription_current_period_end: string | null;
  subscription_cancel_at_period_end: boolean | null;
  share_perks_subscription_status: string | null;
  share_perks_subscription_current_period_end: string | null;
};

type FeatureRow = {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  subtitle: string;
};

type AddonRow = FeatureRow & {
  id: "superBroadcast" | "topProfileBooster" | "sharePerks";
  productId: NativeStoreProductId;
};

const plans: Record<Exclude<PlanKey, "addons">, {
  label: string;
  shortLabel: string;
  background: string;
  textColor: string;
  features: FeatureRow[];
}> = {
  plus: {
    label: "huddle+",
    shortLabel: "huddle+",
    background: "#5BA4F5",
    textColor: "#FFFFFF",
    features: [
      { icon: "users", title: "Open Discovery", subtitle: "Double the chances. Better matches." },
      { icon: "trending-up", title: "Profile Boost", subtitle: "Get seen earlier in Discover and Care." },
      { icon: "star", title: "4 Stars / month", subtitle: "Reach out without waiting." },
      { icon: "radio", title: "Broadcasts · 10km · 24h", subtitle: "Reach more nearby members for longer." },
      { icon: "sliders", title: "Advanced Filters", subtitle: "Sharper search. Better fit." },
      { icon: "heart", title: "Family Sharing", subtitle: "Extend your plan benefits to one other account (except Stars)." },
    ],
  },
  gold: {
    label: "huddle＊",
    shortLabel: "huddle＊",
    background: "#FF6452",
    textColor: "#FFFFFF",
    features: [
      { icon: "globe", title: "Max Discovery", subtitle: "Keep discovering without the usual limits." },
      { icon: "trending-up", title: "Top Profile Boost", subtitle: "Priority placement in Discover and Care." },
      { icon: "star", title: "10 Stars / month", subtitle: "Your fastest way to connect." },
      { icon: "radio", title: "Broadcasts · 20km · 48h", subtitle: "Your widest reach, for even longer." },
      { icon: "sliders", title: "All Filters", subtitle: "Every filter unlocked. Less noise, better matches." },
      { icon: "video", title: "Video Uploads", subtitle: "huddle＊ exclusive." },
      { icon: "users", title: "Family Sharing", subtitle: "Extend your plan benefits to one other account (except Stars)." },
    ],
  },
};

const addonRows: AddonRow[] = [
  { id: "superBroadcast", productId: "huddle_super_broadcast", icon: "radio", title: "Super Broadcast · 50km · 72h", subtitle: "Ultra-wide reach. Stay visible the longest." },
  { id: "topProfileBooster", productId: "profile_boost", icon: "zap", title: "Profile Booster", subtitle: "Maximum visibility for 24h." },
  { id: "sharePerks", productId: "huddle_family_extra_monthly", icon: "users", title: "Family Sharing", subtitle: "Extend your plan benefits to one other account (except Stars)." },
];

const storeUnavailableCopy = "Purchases unavailable right now";
const NATIVE_TERMS_URL = "https://huddle.pet/legal/terms";
const NATIVE_PRIVACY_URL = "https://huddle.pet/legal/privacy";

const normalizeOwnedTier = (value?: string | null): OwnedTier => {
  const tier = String(value || "free").toLowerCase();
  if (tier === "gold" || tier === "huddle＊" || tier.startsWith("gold_")) return "gold";
  if (
    tier === "plus" ||
    tier === "premium" ||
    tier === "huddle+" ||
    tier === "huddle plus" ||
    tier.startsWith("plus_") ||
    tier.startsWith("premium_")
  ) {
    return "plus";
  }
  return "free";
};


const fetchNativeMembershipProfile = async (userId: string, accessToken?: string | null, sessionKey?: string | null): Promise<NativeMembershipProfile | null> => {
  const token = await getFreshNativeAccessToken(accessToken);
  if (!token) throw new Error("missing_access_token");
  const [summary, profileResponse, entitlementResponse] = await Promise.all([
    // The canonical profile and entitlement requests below already refresh
    // membership truth. This summary is fallback data, so reuse the boot cache.
    fetchNativeProfileSummary(userId, { accessToken: token, sessionKey }),
    fetch(`${supabaseUrl}/rest/v1/profiles?${new URLSearchParams({
      select: "tier,effective_tier,subscription_status,subscription_current_period_end,subscription_cancel_at_period_end,share_perks_subscription_status,share_perks_subscription_current_period_end",
      id: `eq.${userId}`,
    }).toString()}`, {
      headers: createNativeAuthenticatedHeaders(token),
    }),
    fetch(`${supabaseUrl}/rest/v1/rpc/get_store_entitlement_summary`, {
      body: JSON.stringify({ p_user_id: userId }),
      headers: createNativeAuthenticatedHeaders(token, {
        "Content-Type": "application/json",
      }),
      method: "POST",
    }),
  ]);
  const raw = await profileResponse.text();
  const parsed = raw ? JSON.parse(raw) as unknown : [];
  if (!profileResponse.ok) {
    throw new Error(typeof parsed === "object" && parsed && "message" in parsed ? String((parsed as { message?: unknown }).message) : String(raw || profileResponse.statusText));
  }
  const entitlementRaw = await entitlementResponse.text();
  const entitlementParsed = entitlementRaw ? JSON.parse(entitlementRaw) as unknown : [];
  if (!entitlementResponse.ok) {
    throw new Error(typeof entitlementParsed === "object" && entitlementParsed && "message" in entitlementParsed ? String((entitlementParsed as { message?: unknown }).message) : String(entitlementRaw || entitlementResponse.statusText));
  }
  const row = Array.isArray(parsed) ? parsed[0] as Partial<NativeMembershipProfile> | undefined : null;
  const entitlementRow = Array.isArray(entitlementParsed) ? entitlementParsed[0] as Partial<NativeMembershipProfile> | undefined : entitlementParsed as Partial<NativeMembershipProfile> | null;
  const entitlementTier = typeof entitlementRow?.tier === "string"
    ? entitlementRow.tier
    : typeof (entitlementRow as { own_tier?: unknown } | null)?.own_tier === "string"
    ? String((entitlementRow as { own_tier?: unknown }).own_tier)
    : null;
  return {
    family_share_capacity: typeof entitlementRow?.family_share_capacity === "number" ? entitlementRow.family_share_capacity : null,
    has_active_paid_tier: typeof entitlementRow?.has_active_paid_tier === "boolean" ? entitlementRow.has_active_paid_tier : null,
    tier: String(entitlementTier ?? row?.tier ?? summary.profile?.tier ?? summary.quota?.tier ?? "free"),
    effective_tier: String(row?.effective_tier ?? summary.profile?.effective_tier ?? summary.quota?.effective_tier ?? row?.tier ?? "free"),
    subscription_status: typeof row?.subscription_status === "string" ? row.subscription_status : null,
    subscription_current_period_end: typeof row?.subscription_current_period_end === "string" ? row.subscription_current_period_end : null,
    subscription_cancel_at_period_end: row?.subscription_cancel_at_period_end === true,
    share_perks_subscription_status: typeof row?.share_perks_subscription_status === "string" ? row.share_perks_subscription_status : null,
    share_perks_subscription_current_period_end: typeof row?.share_perks_subscription_current_period_end === "string" ? row.share_perks_subscription_current_period_end : null,
  };
};

export function NativeManageSubscriptionScreen({ userId, accessToken, sessionKey, onBack, onNavigate, initialPlan = "gold", initialBilling = "monthly" }: NativeManageSubscriptionScreenProps) {
  const { width: windowWidth } = useWindowDimensions();
  // Banner fills the row beside the back arrow, up to the same right edge as
  // the plan card below (content's own horizontal padding on both sides).
  const bannerWidth = Math.max(0, windowWidth - huddleSpacing.x5 * 2 - 40 - huddleSpacing.x2);
  const bannerHeight = bannerWidth / (1024 / 248);
  const [activePlan, setActivePlan] = useState<PlanKey>(initialPlan);
  const [billing, setBilling] = useState<"monthly" | "annual">(initialBilling);
  const [profile, setProfile] = useState<NativeMembershipProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileLoadFailed, setProfileLoadFailed] = useState(false);
  useNativeLoadingDeadline(profileLoading, {
    onTrip: () => {
      setProfileLoading(false);
      setProfileLoadFailed(true);
    },
  });
  const [storeProducts, setStoreProducts] = useState<Record<NativeStoreProductId, NativeStoreProductState> | null>(null);
  const [purchaseStatus, setPurchaseStatus] = useState<NativeStorePurchaseStatus>("idle");
  const [purchaseMessage, setPurchaseMessage] = useState<string | null>(null);
  const [activePurchaseProductId, setActivePurchaseProductId] = useState<NativeStoreProductId | null>(null);
  const [membershipRefreshNeedsRetry, setMembershipRefreshNeedsRetry] = useState(false);
  const [membershipAutoRetryProductId, setMembershipAutoRetryProductId] = useState<NativeStoreProductId | null>(null);
  const membershipAutoRetryAttemptedRef = useRef(false);
  const subscriptionSessionKeyRef = useRef(sessionKey || (userId ? `${userId}:0` : "anon:0"));
  const currentSubscriptionSessionKey = sessionKey || (userId ? `${userId}:0` : "anon:0");
  subscriptionSessionKeyRef.current = currentSubscriptionSessionKey;

  const refetchBackendMembership = useCallback(async (requestSessionKey = currentSubscriptionSessionKey) => {
    if (!userId) return;
    const nextProfile = await fetchNativeMembershipProfile(userId, accessToken, requestSessionKey);
    if (subscriptionSessionKeyRef.current !== requestSessionKey) return;
    setProfile(nextProfile);
    setProfileLoadFailed(false);
  }, [accessToken, currentSubscriptionSessionKey, userId]);

  const refreshConfirmedPurchaseMembership = useCallback(async (productId: NativeStoreProductId) => {
    const requestSessionKey = subscriptionSessionKeyRef.current;
    setActivePurchaseProductId(productId);
    setMembershipRefreshNeedsRetry(false);
    setPurchaseStatus("verified_refetching");
    setPurchaseMessage("Purchase confirmed. Refreshing membership.");
    try {
      await refetchBackendMembership(requestSessionKey);
      if (subscriptionSessionKeyRef.current !== requestSessionKey) return false;
      // A confirmed purchase changes the tier every other surface reads from the shared
      // profile summary cache (Home, Settings drawer). Refresh it here rather than leaving
      // those surfaces to an indirect realtime listener: this is the contract's
      // "immediately after a mutation that can change the data" case for force.
      if (userId) {
        void fetchNativeProfileSummary(userId, {
          accessToken,
          force: true,
          sessionKey: requestSessionKey,
          cacheWriteGuard: () => subscriptionSessionKeyRef.current === requestSessionKey,
        }).catch(() => {});
      }
      setMembershipAutoRetryProductId(null);
      setPurchaseStatus("idle");
      setPurchaseMessage("Membership updated from backend.");
      return true;
    } catch {
      if (subscriptionSessionKeyRef.current !== requestSessionKey) return false;
      setPurchaseStatus("verified_refetching");
      if (!membershipAutoRetryAttemptedRef.current) {
        membershipAutoRetryAttemptedRef.current = true;
        setPurchaseMessage("Purchase confirmed. Retrying membership refresh.");
        setMembershipAutoRetryProductId(productId);
      } else {
        setPurchaseMessage("Purchase confirmed, but membership hasn't refreshed yet. Your purchase will not be repeated.");
        setMembershipRefreshNeedsRetry(true);
      }
      return false;
    }
  }, [accessToken, refetchBackendMembership, userId]);

  useEffect(() => {
    membershipAutoRetryAttemptedRef.current = false;
    setMembershipAutoRetryProductId(null);
    setMembershipRefreshNeedsRetry(false);
  }, [currentSubscriptionSessionKey]);

  useEffect(() => {
    if (!membershipAutoRetryProductId) return;
    const expectedSessionKey = currentSubscriptionSessionKey;
    return scheduleNativeMembershipRefreshRetry({
      delayMs: 1500,
      isCurrentSession: () => subscriptionSessionKeyRef.current === expectedSessionKey,
      refresh: async () => {
        await refreshConfirmedPurchaseMembership(membershipAutoRetryProductId);
      },
    });
  }, [currentSubscriptionSessionKey, membershipAutoRetryProductId, refreshConfirmedPurchaseMembership]);

  useEffect(() => {
    setActivePlan(initialPlan);
  }, [initialPlan]);

  useEffect(() => {
    setBilling(initialBilling);
  }, [initialBilling]);

  useEffect(() => {
    let active = true;
    const requestSessionKey = currentSubscriptionSessionKey;
    if (!userId) {
      setProfile(null);
      setProfileLoading(false);
      setProfileLoadFailed(true);
      return () => {
        active = false;
      };
    }

    setProfileLoading(true);
    setProfileLoadFailed(false);
    void (async () => {
      try {
        const nextProfile = await fetchNativeMembershipProfile(userId, accessToken, requestSessionKey);
        if (!active || subscriptionSessionKeyRef.current !== requestSessionKey) return;
        setProfile(nextProfile);
        setProfileLoadFailed(false);
      } catch {
        if (active && subscriptionSessionKeyRef.current === requestSessionKey) {
          setProfile(null);
          setProfileLoadFailed(true);
        }
      } finally {
        if (active && subscriptionSessionKeyRef.current === requestSessionKey) setProfileLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [accessToken, currentSubscriptionSessionKey, userId]);

  const retryMembershipProfile = useCallback(async () => {
    if (profileLoading) return;
    setProfileLoading(true);
    setProfileLoadFailed(false);
    try {
      await refetchBackendMembership(currentSubscriptionSessionKey);
    } catch {
      if (subscriptionSessionKeyRef.current === currentSubscriptionSessionKey) setProfileLoadFailed(true);
    } finally {
      if (subscriptionSessionKeyRef.current === currentSubscriptionSessionKey) setProfileLoading(false);
    }
  }, [currentSubscriptionSessionKey, profileLoading, refetchBackendMembership]);

  useEffect(() => {
    let active = true;
    setPurchaseStatus("loading_products");
    setPurchaseMessage(null);
    void (async () => {
      try {
        const products = await loadNativeStoreProducts();
        if (!active) return;
        setStoreProducts(products);
        const unavailableCount = Object.values(products).filter((product) => !product.isAvailable).length;
        setPurchaseStatus(unavailableCount === Object.keys(products).length ? "unavailable" : "idle");
        setPurchaseMessage(unavailableCount > 0 ? storeUnavailableCopy : null);
      } catch {
        if (!active) return;
        setStoreProducts(null);
        setPurchaseStatus("unavailable");
        setPurchaseMessage(storeUnavailableCopy);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    void (async () => {
      const freshAccessToken = await getFreshNativeAccessToken(accessToken);
      if (!active || !freshAccessToken) return;
      unsubscribe = listenForNativeStorePurchases(freshAccessToken, {
        onPurchaseError: (message) => {
          setPurchaseStatus("failed");
          setPurchaseMessage(message || "Purchase could not be verified.");
          setActivePurchaseProductId(null);
        },
        onPurchasePending: (productId) => {
          setActivePurchaseProductId(productId);
          setPurchaseStatus("purchase_pending");
          setPurchaseMessage("Purchase pending");
        },
        onPurchaseVerified: async (productId) => {
          membershipAutoRetryAttemptedRef.current = false;
          setMembershipAutoRetryProductId(null);
          await refreshConfirmedPurchaseMembership(productId);
        },
        onVerifying: (productId) => {
          setActivePurchaseProductId(productId);
          setPurchaseStatus("backend_verifying");
          setPurchaseMessage("Confirming purchase with huddle.");
        },
      });
      if (!active) unsubscribe();
    })();
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [accessToken, refreshConfirmedPurchaseMembership]);

  const planProductId = useMemo<NativeStoreProductId>(() => {
    if (activePlan === "addons") return "huddle_super_broadcast";
    const alias = `${activePlan}_${billing === "annual" ? "annual" : "monthly"}` as keyof typeof NATIVE_STORE_ALIAS_TO_PRODUCT_ID;
    return NATIVE_STORE_ALIAS_TO_PRODUCT_ID[alias];
  }, [activePlan, billing]);

  const isPurchaseBusy = membershipRefreshNeedsRetry || purchaseStatus === "purchase_pending" || purchaseStatus === "backend_verifying" || purchaseStatus === "verified_refetching" || purchaseStatus === "restoring";

  const requestPurchaseForProduct = async (productId: NativeStoreProductId) => {
    const product = storeProducts?.[productId];
    const freshAccessToken = await getFreshNativeAccessToken(accessToken);
    if (!userId || !freshAccessToken) {
      setPurchaseStatus("failed");
      setPurchaseMessage("Sign in again to continue.");
      return;
    }
    if (!product?.isAvailable) {
      setPurchaseStatus("unavailable");
      setPurchaseMessage(storeUnavailableCopy);
      return;
    }
    try {
      haptic.toggleControl();
      setActivePurchaseProductId(productId);
      setPurchaseStatus("purchase_pending");
      setPurchaseMessage("Opening store purchase.");
      await requestNativeStoreProductPurchase(product, userId);
    } catch (error) {
      setPurchaseStatus("failed");
      setPurchaseMessage(nativeSafeErrorCopy(error, "Your purchase didn't go through. Mind trying again a bit later?"));
      setActivePurchaseProductId(null);
    }
  };

  const restorePurchasesFromStore = async () => {
    const freshAccessToken = await getFreshNativeAccessToken(accessToken);
    if (!freshAccessToken) {
      setPurchaseStatus("failed");
      setPurchaseMessage("Sign in again to restore purchases.");
      return;
    }
    try {
      let verifiedProductId: NativeStoreProductId | null = null;
      setPurchaseStatus("restoring");
      setPurchaseMessage("Restoring purchases.");
      const restored = await restoreNativeStorePurchases(freshAccessToken, {
        onPurchaseVerified: (productId) => {
          verifiedProductId = productId;
        },
        onVerifying: (productId) => {
          setActivePurchaseProductId(productId);
          setPurchaseStatus("backend_verifying");
        },
      });
      if (verifiedProductId) {
        membershipAutoRetryAttemptedRef.current = false;
        setMembershipAutoRetryProductId(null);
        await refreshConfirmedPurchaseMembership(verifiedProductId);
        return;
      }
      await refetchBackendMembership();
      setPurchaseStatus("idle");
      setPurchaseMessage(restored.length > 0 ? "Purchases restored from backend." : "No active store purchases found.");
    } catch (error) {
      setPurchaseStatus("failed");
      setPurchaseMessage(nativeSafeErrorCopy(error, "We couldn't find any past purchases linked to this account."));
    }
  };

  const isMaxFamilyCapacity = typeof profile?.family_share_capacity === "number" && profile.family_share_capacity >= 4;

  const renderPlanCard = () => {
    if (activePlan === "addons") {
      return (
        <View style={styles.addonCard}>
          <View style={styles.addonHeader}>
            <Text style={styles.addonHeaderTitle}>Power-ups</Text>
            <Text style={styles.addonHeaderSubtitle}>One-time and recurring</Text>
          </View>
          <View style={styles.addonBody}>
            {addonRows.map((row, index) => {
              const isFamilyAddon = row.id === "sharePerks";
              const product = storeProducts?.[row.productId];
              const addonDisabled = !product?.isAvailable || isPurchaseBusy || (isFamilyAddon && isMaxFamilyCapacity);
              return (
                <View key={row.title} style={[styles.addonRow, index > 0 && styles.addonDivider]}>
                  <Feather color={huddleColors.blue} name={row.icon} size={20} />
                  <View style={styles.featureCopy}>
                    <Text style={styles.addonTitle}>{row.title}</Text>
                    <Text style={styles.addonSubtitle}>{row.subtitle}</Text>
                    <Text style={styles.addonPrice}>{isFamilyAddon && isMaxFamilyCapacity ? "Max. capacity reached" : formatNativeAddonPrice(row.productId, product)}</Text>
                  </View>
                  <Pressable
                    accessibilityLabel={`Purchase ${row.title}`}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: addonDisabled }}
                    disabled={addonDisabled}
                    onPress={() => void requestPurchaseForProduct(row.productId)}
                    style={[styles.addonToggle, activePurchaseProductId === row.productId && styles.addonToggleSelected, addonDisabled && styles.addonToggleDisabled]}
                  >
                    <Feather color={activePurchaseProductId === row.productId ? huddleColors.onPrimary : huddleColors.blue} name="shopping-bag" size={15} />
                  </Pressable>
                </View>
              );
            })}
            <Pressable
              accessibilityRole="button"
              disabled={isPurchaseBusy}
              onPress={() => void restorePurchasesFromStore()}
              style={[styles.addonCta, isPurchaseBusy && styles.addonCtaDisabled]}
            >
              <Feather color={huddleColors.blue} name="refresh-cw" size={18} />
              <Text style={styles.addonCtaText}>Restore Purchases</Text>
            </Pressable>
          </View>
        </View>
      );
    }

    const plan = plans[activePlan];
    const isAnnual = billing === "annual";
    const ownTier = profileLoading || profileLoadFailed ? "free" : normalizeOwnedTier(profile?.tier);
    const product = storeProducts?.[planProductId] || null;
    const monthlyProductId = NATIVE_STORE_ALIAS_TO_PRODUCT_ID[`${activePlan}_monthly` as keyof typeof NATIVE_STORE_ALIAS_TO_PRODUCT_ID] as NativeStoreProductId;
    const monthlyProduct = storeProducts?.[monthlyProductId] || null;
    const isBlockedByTier = ownTier === "gold" || (ownTier === "plus" && activePlan === "plus");
    const isCurrentPlan = ownTier === activePlan;
    const purchaseUnavailable = !product?.isAvailable;
    const ctaLabel = profileLoading
      ? "Checking membership"
      : profileLoadFailed
      ? "Refresh membership"
      : purchaseUnavailable
      ? storeUnavailableCopy
      : membershipRefreshNeedsRetry && activePurchaseProductId === product?.id
      ? "Purchase confirmed"
      : isPurchaseBusy && activePurchaseProductId === product?.id
      ? purchaseMessage || "Purchase pending"
      : isBlockedByTier
      ? (ownTier === "gold" ? "You're on huddle＊" : "You're on huddle+")
      : (activePlan === "plus" ? "Get huddle+" : "Get huddle＊");

    return (
      <View style={[styles.planCard, { backgroundColor: plan.background }]}>
        <View style={[styles.billingTabs, { backgroundColor: plan.background }]}>
          <Pressable onPress={() => setBilling("monthly")} style={[styles.billingTab, !isAnnual ? null : styles.billingTabInactiveRight]}>
            <Text style={[styles.billingText, isAnnual && { color: plan.background }]}>Monthly</Text>
          </Pressable>
          <Pressable onPress={() => setBilling("annual")} style={[styles.billingTab, isAnnual ? null : styles.billingTabInactiveLeft]}>
            <Text style={[styles.billingText, !isAnnual && { color: plan.background }]}>Annually</Text>
          </Pressable>
        </View>
        <View style={styles.planBody}>
          {!isAnnual ? (
            <Text style={styles.price}>
              {formatNativeStorePrice(planProductId, product)}<Text style={styles.priceSuffix}>/mo</Text>
            </Text>
          ) : (
            <View>
              <Text style={styles.price}>
                {formatNativeStorePrice(planProductId, product)}<Text style={styles.priceSuffix}> billed yearly</Text>
              </Text>
              <Text style={styles.annualNote}>
                {formatNativeStoreMonthlyEquivalentPrice(planProductId, product)}<Text style={styles.annualNoteSuffix}>/mo equivalent</Text>
                {" · "}
                <Text style={styles.struckPrice}>{formatNativeStorePrice(monthlyProductId, monthlyProduct) || nativeFallbackStruckMonthlyPrices[planProductId] || "--"}</Text>
              </Text>
            </View>
          )}
          <View style={styles.divider} />
          {plan.features.map((row) => (
            <View key={row.title} style={styles.featureRow}>
              <Feather color={plan.textColor} name={row.icon} size={18} />
              <View style={styles.featureCopy}>
                <Text style={styles.featureTitle}>{row.title}</Text>
                <Text style={styles.featureSubtitle}>{row.subtitle}</Text>
              </View>
            </View>
          ))}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: profileLoading || (!profileLoadFailed && (isBlockedByTier || purchaseUnavailable || isPurchaseBusy)) }}
            disabled={profileLoading || (!profileLoadFailed && (isBlockedByTier || purchaseUnavailable || isPurchaseBusy))}
            onPress={() => profileLoadFailed ? void retryMembershipProfile() : void requestPurchaseForProduct(planProductId)}
            style={[styles.planCta, (profileLoading || (!profileLoadFailed && (isBlockedByTier || purchaseUnavailable || isPurchaseBusy))) && styles.planCtaBlocked]}
          >
            <Text style={[styles.planCtaText, { color: (isBlockedByTier || profileLoading || profileLoadFailed || purchaseUnavailable || isPurchaseBusy) ? "#99A0B3" : plan.background }]}>
              {ctaLabel}
            </Text>
          </Pressable>
          {isCurrentPlan ? (
            <Pressable
              accessibilityLabel="Manage Subscription"
              accessibilityRole="button"
              onPress={() => void openNativeStoreSubscriptionManagement(planProductId).catch(() => setPurchaseMessage("Open your app store subscription settings to manage this plan."))}
              style={styles.cancelSubscriptionLink}
            >
              <Text style={styles.cancelSubscriptionText}>Manage Subscription</Text>
            </Pressable>
          ) : null}
          <Pressable accessibilityRole="button" disabled={isPurchaseBusy} onPress={() => void restorePurchasesFromStore()} style={styles.restoreLink}>
            <Text style={styles.restoreText}>Restore Purchases</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topRow}>
          <Pressable accessibilityLabel="Go back" accessibilityRole="button" hitSlop={12} onPress={onBack} style={({ pressed }) => [styles.returnArrow, pressed ? styles.pressed : null]}>
            <Feather color={huddleColors.text} name="arrow-left" size={22} />
          </Pressable>
          <Image
            accessibilityIgnoresInvertColors
            accessibilityLabel="huddle+"
            resizeMode="contain"
            source={premiumBanner}
            style={[styles.headerBanner, { width: bannerWidth, height: bannerHeight }]}
          />
        </View>
        <View style={styles.tabRow}>
          {(["plus", "gold", "addons"] as PlanKey[]).map((planKey) => {
            const selected = activePlan === planKey;
            const isGold = planKey === "gold";
            const tabColor = planKey === "plus" ? plans.plus.background : planKey === "gold" ? plans.gold.background : huddleColors.subscriptionAddonLime;
            return (
              <View key={planKey} style={styles.tabWrap}>
                {isGold ? (
                  <View style={styles.goldThumbBadge}>
                    <Feather color={plans.gold.background} name="thumbs-up" size={10} />
                  </View>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => {
                    if (!selected) haptic.toggleControl();
                    setActivePlan(planKey);
                  }}
                  style={[styles.tab, selected ? { backgroundColor: tabColor } : styles.tabRest]}
                >
                  <Text style={[styles.tabText, selected ? (planKey === "addons" ? styles.tabTextRest : styles.tabTextSelected) : styles.tabTextRest]}>
                    {planKey === "plus" ? "huddle+" : planKey === "gold" ? "huddle＊" : "Add-ons"}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </View>

        {renderPlanCard()}

        {membershipRefreshNeedsRetry && activePurchaseProductId ? (
          <View accessibilityLiveRegion="polite" style={styles.membershipRefreshNotice}>
            <Text style={styles.membershipRefreshNoticeText}>{purchaseMessage}</Text>
            <Pressable
              accessibilityLabel="Retry membership refresh"
              accessibilityRole="button"
              onPress={() => void refreshConfirmedPurchaseMembership(activePurchaseProductId)}
              style={({ pressed }) => [styles.membershipRefreshRetry, pressed ? styles.pressed : null]}
            >
              <Feather color={huddleColors.blue} name="refresh-cw" size={16} />
              <Text style={styles.membershipRefreshRetryText}>Retry membership refresh</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.legalDisclosure}>
          <Text style={styles.legalDisclosureText}>
            By purchasing, your subscription renews automatically at the shown price until canceled in your Apple Account settings, and you agree to our{" "}
            <Text
              onPress={() => void Linking.openURL(NATIVE_PRIVACY_URL)}
              style={styles.legalInlineLinkText}
            >
              Privacy Policy
            </Text>
            {" and "}
            <Text
              onPress={() => void Linking.openURL(NATIVE_TERMS_URL)}
              style={styles.legalInlineLinkText}
            >
              Terms
            </Text>
            .
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: {
    ...huddleButtons.pressed,
  },
  screen: {
    flex: 1,
    backgroundColor: huddleColors.canvas,
  },
  content: {
    paddingHorizontal: huddleSpacing.x5,
    paddingTop: huddleSpacing.x2,
    paddingBottom: huddleSpacing.x9,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x2,
    marginBottom: huddleSpacing.x4,
  },
  headerBanner: {},
  returnArrow: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: huddleRadii.pill,
    backgroundColor: huddleColors.canvas,
    ...huddleShadows.glassElevation1,
  },
  tabRow: {
    flexDirection: "row",
    gap: huddleSpacing.x2,
  },
  tabWrap: {
    flex: 1,
    alignItems: "center",
  },
  goldThumbBadge: {
    position: "absolute",
    top: -2,
    right: -4,
    zIndex: 3,
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: huddleColors.canvas,
    borderWidth: 1,
    borderColor: huddleColors.canvas,
    shadowColor: huddleColors.blue,
    shadowOpacity: 0.14,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
    transform: [{ rotate: "20deg" }],
  },
  tab: {
    width: "100%",
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
  },
  tabRest: {
    backgroundColor: huddleColors.canvas,
    shadowColor: huddleColors.neutralShadow,
    shadowOpacity: 0.9,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  tabText: {
    fontFamily: "Urbanist-700",
    fontSize: 13,
    lineHeight: 18,
  },
  tabTextRest: {
    color: huddleColors.blue,
  },
  tabTextSelected: {
    color: huddleColors.onPrimary,
  },
  planCard: {
    marginTop: huddleSpacing.x4,
    overflow: "hidden",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.88)",
  },
  billingTabs: {
    height: 44,
    flexDirection: "row",
  },
  billingTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: huddleSpacing.x1,
  },
  billingTabInactiveLeft: {
    borderBottomLeftRadius: 14,
    backgroundColor: huddleColors.canvas,
  },
  billingTabInactiveRight: {
    borderBottomRightRadius: 14,
    backgroundColor: huddleColors.canvas,
  },
  billingText: {
    fontFamily: "Urbanist-700",
    fontSize: 13,
    lineHeight: 18,
    color: huddleColors.onPrimary,
  },
  planBody: {
    paddingHorizontal: huddleSpacing.x5,
    paddingTop: huddleSpacing.x5,
    paddingBottom: huddleSpacing.x5,
  },
  price: {
    fontFamily: "Urbanist-700",
    fontSize: 30,
    lineHeight: 36,
    color: huddleColors.onPrimary,
  },
  struckPrice: {
    fontFamily: "Urbanist-400",
    fontSize: 12,
    lineHeight: 16,
    color: "rgba(255, 255, 255, 0.62)",
    textDecorationLine: "line-through",
  },
  priceSuffix: {
    fontFamily: "Urbanist-400",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: "rgba(255, 255, 255, 0.9)",
  },
  annualNote: {
    marginTop: 2,
    fontFamily: "Urbanist-400",
    fontSize: 13,
    lineHeight: 18,
    color: "rgba(255, 255, 255, 0.78)",
  },
  annualNoteSuffix: {
    fontFamily: "Urbanist-400",
    fontSize: 13,
    lineHeight: 18,
    color: "rgba(255, 255, 255, 0.78)",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginTop: huddleSpacing.x4,
    marginBottom: huddleSpacing.x3,
    backgroundColor: "rgba(255, 255, 255, 0.34)",
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: huddleSpacing.x3,
    paddingVertical: huddleSpacing.x2,
  },
  featureCopy: {
    flex: 1,
  },
  featureTitle: {
    fontFamily: "Urbanist-700",
    fontSize: 13,
    lineHeight: 17,
    color: huddleColors.onPrimary,
  },
  featureSubtitle: {
    marginTop: 2,
    fontFamily: "Urbanist-400",
    fontSize: 11,
    lineHeight: 15,
    color: "rgba(255, 255, 255, 0.78)",
  },
  planCta: {
    ...huddleButtons.base,
    ...huddleButtons.secondary,
    marginTop: huddleSpacing.x4,
    backgroundColor: huddleColors.canvas,
  },
  planCtaBlocked: {
    ...huddleButtons.disabled,
  },
  planCtaText: {
    ...huddleButtons.label,
  },
  addonCard: {
    marginTop: huddleSpacing.x4,
    overflow: "hidden",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.88)",
    backgroundColor: huddleColors.canvas,
    ...huddleShadows.glassElevation2,
  },
  addonHeader: {
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x3,
    paddingHorizontal: huddleSpacing.x5,
    backgroundColor: huddleColors.subscriptionAddonLime,
  },
  addonHeaderTitle: {
    fontFamily: "Urbanist-700",
    fontSize: 13,
    lineHeight: 18,
    color: huddleColors.blue,
  },
  addonHeaderSubtitle: {
    fontFamily: "Urbanist-500",
    fontSize: 11,
    lineHeight: 15,
    color: "rgba(33, 69, 207, 0.66)",
  },
  addonBody: {
    paddingHorizontal: huddleSpacing.x4,
    paddingBottom: huddleSpacing.x4,
  },
  addonRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: huddleSpacing.x3,
    paddingVertical: huddleSpacing.x4,
  },
  addonDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(33, 69, 207, 0.1)",
  },
  addonTitle: {
    fontFamily: "Urbanist-700",
    fontSize: 13,
    lineHeight: 17,
    color: huddleColors.blue,
  },
  addonSubtitle: {
    marginTop: 2,
    fontFamily: "Urbanist-400",
    fontSize: 11,
    lineHeight: 15,
    color: "rgba(33, 69, 207, 0.66)",
  },
  addonPrice: {
    marginTop: 4,
    fontFamily: "Urbanist-700",
    fontSize: 13,
    lineHeight: 17,
    color: huddleColors.blue,
  },
  addonToggle: {
    width: 32,
    height: 32,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    backgroundColor: huddleColors.canvas,
    shadowColor: huddleColors.blue,
    shadowOpacity: 0.18,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
    borderWidth: 1.5,
    borderColor: "rgba(33, 69, 207, 0.22)",
  },
  addonToggleSelected: {
    backgroundColor: huddleColors.blue,
    borderColor: huddleColors.blue,
  },
  addonToggleDisabled: {
    opacity: 0.38,
  },
  addonCta: {
    height: 50,
    marginTop: huddleSpacing.x2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: huddleSpacing.x2,
    borderRadius: 16,
    backgroundColor: huddleColors.subscriptionAddonLime,
  },
  addonCtaDisabled: {
    opacity: 0.38,
  },
  addonCtaText: {
    fontFamily: "Urbanist-700",
    fontSize: 15,
    lineHeight: 20,
    color: huddleColors.blue,
  },
  restoreLink: {
    alignSelf: "center",
    marginTop: huddleSpacing.x3,
    paddingHorizontal: huddleSpacing.x2,
    paddingVertical: huddleSpacing.x1,
  },
  restoreText: {
    fontFamily: "Urbanist-600",
    fontSize: 11,
    lineHeight: 15,
    color: "rgba(255, 255, 255, 0.82)",
    textDecorationLine: "underline",
  },
  cancelSubscriptionLink: {
    alignSelf: "center",
    marginTop: huddleSpacing.x3,
    paddingHorizontal: huddleSpacing.x2,
    paddingVertical: huddleSpacing.x1,
  },
  cancelSubscriptionText: {
    fontFamily: "Urbanist-600",
    fontSize: 11,
    lineHeight: 15,
    color: "rgba(255, 255, 255, 0.72)",
    textDecorationLine: "underline",
  },
  membershipRefreshNotice: {
    marginTop: huddleSpacing.x3,
    padding: huddleSpacing.x4,
    gap: huddleSpacing.x3,
    borderRadius: huddleRadii.glass,
    borderWidth: 1,
    borderColor: "rgba(33, 69, 207, 0.14)",
    backgroundColor: huddleColors.canvas,
  },
  membershipRefreshNoticeText: {
    fontFamily: "Urbanist-500",
    fontSize: 13,
    lineHeight: 18,
    color: huddleColors.text,
  },
  membershipRefreshRetry: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: huddleSpacing.x2,
    borderRadius: huddleRadii.pill,
    backgroundColor: "rgba(33, 69, 207, 0.08)",
  },
  membershipRefreshRetryText: {
    fontFamily: "Urbanist-700",
    fontSize: 13,
    lineHeight: 18,
    color: huddleColors.blue,
  },
  legalDisclosure: {
    marginTop: huddleSpacing.x5,
    paddingHorizontal: huddleSpacing.x2,
    alignItems: "center",
  },
  legalDisclosureText: {
    fontFamily: "Urbanist-400",
    fontSize: 11,
    lineHeight: 16,
    color: huddleColors.subtext,
    textAlign: "center",
  },
  legalInlineLinkText: {
    fontFamily: "Urbanist-400",
    fontSize: 11,
    lineHeight: 16,
    color: huddleColors.subtext,
    textDecorationLine: "underline",
  },
});
