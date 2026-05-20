import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View, Linking, useWindowDimensions } from "react-native";
import premiumBanner from "../../assets/Notifications/premium-banner.png";
import { haptic } from "../lib/nativeHaptics";
import { fetchNativeProfileSummary } from "../lib/nativeProfileSummary";
import { supabaseAnonKey, supabaseUrl } from "../lib/supabase";
import {
  huddleButtons,
  huddleColors,
  huddleRadii,
  huddleShadows,
  huddleSpacing,
  huddleType,
  huddleLayout,
  huddleVerifyIdentity,
} from "../theme/huddleDesignTokens";

type NativePriceMap = {
  plus_monthly?: number;
  plus_annual?: number;
  gold_monthly?: number;
  gold_annual?: number;
  superBroadcast?: number;
  topProfileBooster?: number;
  sharePerks?: number;
  sharePerksInterval?: "month" | "year" | null;
  currencyCode: string;
};

type NativeManageSubscriptionScreenProps = {
  userId: string | null;
  accessToken?: string | null;
  sessionKey?: string | null;
  initialPlan?: PlanKey;
  onBack?: () => void;
};

type PlanKey = "plus" | "gold" | "addons";
type OwnedTier = "free" | "plus" | "gold";

type NativeMembershipProfile = {
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
  suffix?: string;
};

const NATIVE_FALLBACK_PRICES: NativePriceMap = {
  sharePerksInterval: null,
  currencyCode: "USD",
};

const NATIVE_SUBSCRIPTION_CACHE_VERSION = 1;
const NATIVE_SUBSCRIPTION_CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const nativePricingCacheKey = "huddle_native_subscription_pricing:v1";
const nativeMembershipCacheKey = (userId: string, sessionKey?: string | null) => `huddle_native_membership_profile:v1:${userId}:${sessionKey || `${userId}:0`}`;

const plans: Record<Exclude<PlanKey, "addons">, {
  label: string;
  shortLabel: string;
  background: string;
  textColor: string;
  features: FeatureRow[];
}> = {
  plus: {
    label: "Huddle+",
    shortLabel: "Huddle+",
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
    label: "Huddle Gold",
    shortLabel: "Huddle Gold",
    background: "#FF6452",
    textColor: "#FFFFFF",
    features: [
      { icon: "globe", title: "Max Discovery", subtitle: "Keep discovering without the usual limits." },
      { icon: "trending-up", title: "Top Profile Boost", subtitle: "Priority placement in Discover and Care." },
      { icon: "star", title: "10 Stars / month", subtitle: "Your fastest way to connect." },
      { icon: "radio", title: "Broadcasts · 20km · 48h", subtitle: "Your widest reach, for even longer." },
      { icon: "sliders", title: "All Filters", subtitle: "Every filter unlocked. Less noise, better matches." },
      { icon: "video", title: "Video Uploads", subtitle: "Gold exclusive." },
      { icon: "users", title: "Family Sharing", subtitle: "Extend your plan benefits to one other account (except Stars)." },
    ],
  },
};

const addonRows: AddonRow[] = [
  { id: "superBroadcast", icon: "radio", title: "Super Broadcast · 50km · 72h", subtitle: "Ultra-wide reach. Stay visible the longest." },
  { id: "topProfileBooster", icon: "zap", title: "Profile Booster", subtitle: "Maximum visibility for 24h." },
  { id: "sharePerks", icon: "users", title: "Family Sharing", subtitle: "Extend your plan benefits to one other account (except Stars)." },
];

const formatMoney = (amount: number, currencyCode: string) => {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currencyCode.toUpperCase()}$${amount.toFixed(2)}`;
  }
};

const isLivePrice = (value: unknown): value is number => (
  typeof value === "number" && Number.isFinite(value) && value > 0
);

const discountPct = (monthlyAmount?: number, annualTotal?: number) => {
  if (!isLivePrice(monthlyAmount) || !isLivePrice(annualTotal)) return null;
  return Math.round((1 - annualTotal / 12 / monthlyAmount) * 100);
};

const normalizeOwnedTier = (value?: string | null): OwnedTier => {
  const tier = String(value || "free").toLowerCase();
  if (tier === "gold" || tier === "huddle gold" || tier.startsWith("gold_")) return "gold";
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

const parseNativePrices = (payload: unknown): NativePriceMap | null => {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as { prices?: Record<string, { amount?: unknown; currency?: unknown; interval?: unknown }>; display_currency?: unknown };
  const prices = root.prices;
  if (!prices) return null;
  const currencyCode = String(root.display_currency || prices.plus_monthly?.currency || "USD").toUpperCase();
  const nextPrices = {
    plus_monthly: Number(prices.plus_monthly?.amount),
    plus_annual: Number(prices.plus_annual?.amount),
    gold_monthly: Number(prices.gold_monthly?.amount),
    gold_annual: Number(prices.gold_annual?.amount),
    superBroadcast: typeof prices.superBroadcast?.amount === "number" && prices.superBroadcast.amount > 0 ? prices.superBroadcast.amount : undefined,
    topProfileBooster: typeof prices.topProfileBooster?.amount === "number" && prices.topProfileBooster.amount > 0 ? prices.topProfileBooster.amount : undefined,
    sharePerks: typeof prices.sharePerks?.amount === "number" && prices.sharePerks.amount > 0 ? prices.sharePerks.amount : undefined,
    sharePerksInterval:
      typeof prices.sharePerks?.interval === "string" && ["month", "year"].includes(prices.sharePerks.interval.toLowerCase())
        ? prices.sharePerks.interval.toLowerCase() as "month" | "year"
        : null,
    currencyCode,
  };
  if (
    !isLivePrice(nextPrices.plus_monthly) ||
    !isLivePrice(nextPrices.plus_annual) ||
    !isLivePrice(nextPrices.gold_monthly) ||
    !isLivePrice(nextPrices.gold_annual)
  ) {
    return null;
  }
  return nextPrices;
};

const parseCachedPayload = <T,>(raw: string | null, validate: (value: unknown) => value is T): T | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { cachedAt?: unknown; value?: unknown; version?: unknown };
    if (
      parsed.version !== NATIVE_SUBSCRIPTION_CACHE_VERSION ||
      typeof parsed.cachedAt !== "number" ||
      Date.now() - parsed.cachedAt > NATIVE_SUBSCRIPTION_CACHE_MAX_AGE_MS ||
      !validate(parsed.value)
    ) {
      return null;
    }
    return parsed.value;
  } catch {
    return null;
  }
};

const writeCachedPayload = async (key: string, value: unknown) => {
  try {
    await AsyncStorage.setItem(key, JSON.stringify({
      cachedAt: Date.now(),
      value,
      version: NATIVE_SUBSCRIPTION_CACHE_VERSION,
    }));
  } catch {
    // AsyncStorage can be unavailable in constrained dev/runtime contexts.
  }
};

const isNativePriceMap = (value: unknown): value is NativePriceMap => Boolean(value && typeof value === "object" && typeof (value as NativePriceMap).currencyCode === "string");
const isNativeMembershipProfile = (value: unknown): value is NativeMembershipProfile | null => value === null || Boolean(value && typeof value === "object");

const fetchNativeSubscriptionPricing = async (accessToken?: string | null) => {
  const token = String(accessToken || "").trim();
  if (!token) throw new Error("missing_access_token");
  const response = await fetch(`${supabaseUrl}/functions/v1/stripe-pricing`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: supabaseAnonKey,
      "content-type": "application/json",
    },
    body: "{}",
  });
  const raw = await response.text();
  const parsed = raw ? JSON.parse(raw) as unknown : null;
  if (!response.ok) {
    throw new Error(typeof parsed === "object" && parsed && "message" in parsed ? String((parsed as { message?: unknown }).message) : String(raw || response.statusText));
  }
  const prices = parseNativePrices(parsed);
  if (!prices) throw new Error("pricing_unavailable");
  return prices;
};

const fetchNativeMembershipProfile = async (userId: string, accessToken?: string | null, sessionKey?: string | null): Promise<NativeMembershipProfile | null> => {
  const token = String(accessToken || "").trim();
  if (!token) throw new Error("missing_access_token");
  const [summary, profileResponse] = await Promise.all([
    fetchNativeProfileSummary(userId, { force: true, accessToken: token, sessionKey }),
    fetch(`${supabaseUrl}/rest/v1/profiles?${new URLSearchParams({
      select: "tier,effective_tier,subscription_status,subscription_current_period_end,subscription_cancel_at_period_end,share_perks_subscription_status,share_perks_subscription_current_period_end",
      id: `eq.${userId}`,
    }).toString()}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: supabaseAnonKey,
      },
    }),
  ]);
  const raw = await profileResponse.text();
  const parsed = raw ? JSON.parse(raw) as unknown : [];
  if (!profileResponse.ok) {
    throw new Error(typeof parsed === "object" && parsed && "message" in parsed ? String((parsed as { message?: unknown }).message) : String(raw || profileResponse.statusText));
  }
  const row = Array.isArray(parsed) ? parsed[0] as Partial<NativeMembershipProfile> | undefined : null;
  return {
    tier: String(row?.tier ?? summary.profile?.tier ?? summary.quota?.tier ?? "free"),
    effective_tier: String(row?.effective_tier ?? summary.profile?.effective_tier ?? summary.quota?.effective_tier ?? row?.tier ?? "free"),
    subscription_status: typeof row?.subscription_status === "string" ? row.subscription_status : null,
    subscription_current_period_end: typeof row?.subscription_current_period_end === "string" ? row.subscription_current_period_end : null,
    subscription_cancel_at_period_end: row?.subscription_cancel_at_period_end === true,
    share_perks_subscription_status: typeof row?.share_perks_subscription_status === "string" ? row.share_perks_subscription_status : null,
    share_perks_subscription_current_period_end: typeof row?.share_perks_subscription_current_period_end === "string" ? row.share_perks_subscription_current_period_end : null,
  };
};

export function NativeManageSubscriptionScreen({ userId, accessToken, sessionKey, onBack, initialPlan = "gold" }: NativeManageSubscriptionScreenProps) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const contentWidth = Math.max(0, windowWidth - huddleSpacing.x5 * 2);
  const handleBackToAccountSettings = () => {
    if (onBack) {
      onBack();
      return;
    }
    void Linking.openURL("huddle:/settings").catch(() => {});
  };


  const [activePlan, setActivePlan] = useState<PlanKey>(initialPlan);
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");
  const [prices, setPrices] = useState<NativePriceMap>(NATIVE_FALLBACK_PRICES);
  const [profile, setProfile] = useState<NativeMembershipProfile | null>(null);
  const subscriptionSessionKeyRef = useRef(sessionKey || (userId ? `${userId}:0` : "anon:0"));
  const currentSubscriptionSessionKey = sessionKey || (userId ? `${userId}:0` : "anon:0");
  subscriptionSessionKeyRef.current = currentSubscriptionSessionKey;
  const [selectedAddons, setSelectedAddons] = useState<Record<AddonRow["id"], boolean>>({
    superBroadcast: false,
    topProfileBooster: false,
    sharePerks: false,
  });

  useEffect(() => {
    setActivePlan(initialPlan);
  }, [initialPlan]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const cached = parseCachedPayload(await AsyncStorage.getItem(nativePricingCacheKey), isNativePriceMap);
      if (active && cached) setPrices(cached);
      if (!accessToken) return;
      try {
        const nextPrices = await fetchNativeSubscriptionPricing(accessToken);
        if (!active) return;
        setPrices(nextPrices);
        await writeCachedPayload(nativePricingCacheKey, nextPrices);
      } catch {
        // Keep cached pricing/fallback display when the endpoint is unavailable.
      }
    })();
    return () => {
      active = false;
    };
  }, [accessToken]);

  useEffect(() => {
    let active = true;
    const requestSessionKey = currentSubscriptionSessionKey;
    if (!userId || !accessToken) {
      return () => {
        active = false;
      };
    }

    void (async () => {
      const cacheKey = nativeMembershipCacheKey(userId, requestSessionKey);
      const cached = parseCachedPayload(await AsyncStorage.getItem(cacheKey), isNativeMembershipProfile);
      if (active && subscriptionSessionKeyRef.current === requestSessionKey && cached) setProfile(cached);
      try {
        const nextProfile = await fetchNativeMembershipProfile(userId, accessToken, requestSessionKey);
        if (!active || subscriptionSessionKeyRef.current !== requestSessionKey) return;
        setProfile(nextProfile);
        await writeCachedPayload(cacheKey, nextProfile);
      } catch {
        // Failed DB refresh keeps cached membership state.
      }
    })();

    return () => {
      active = false;
    };
  }, [accessToken, currentSubscriptionSessionKey, userId]);

  const renderPlanCard = () => {
    if (activePlan === "addons") {
      const currencyCode = prices.currencyCode;
      const selectedAddonRows = addonRows.filter((row) => selectedAddons[row.id] && typeof prices[row.id] === "number");
      const selectedTotal = selectedAddonRows.reduce((sum, row) => {
        const addonPrice = prices[row.id];
        return isLivePrice(addonPrice) ? sum + addonPrice : sum;
      }, 0);
      const canShowTotal = Boolean(currencyCode && selectedAddonRows.length > 0 && selectedTotal > 0);
      return (
        <View style={styles.addonCard}>
          <View style={styles.addonHeader}>
            <Text style={styles.addonHeaderTitle}>Power-ups</Text>
            <Text style={styles.addonHeaderSubtitle}>One-time and recurring</Text>
          </View>
          <View style={styles.addonBody}>
            {addonRows.map((row, index) => (
              <View key={row.title} style={[styles.addonRow, index > 0 && styles.addonDivider]}>
                <Feather color={huddleColors.blue} name={row.icon} size={20} />
                <View style={styles.featureCopy}>
                  <Text style={styles.addonTitle}>{row.title}</Text>
                  <Text style={styles.addonSubtitle}>{row.subtitle}</Text>
                  {isLivePrice(prices[row.id]) ? (
                    <Text style={styles.addonPrice}>
                      {formatMoney(prices[row.id] as number, currencyCode)}
                      {row.id === "sharePerks" && prices.sharePerksInterval ? (prices.sharePerksInterval === "year" ? "/yr" : "/mo") : ""}
                    </Text>
                  ) : (
                    <Text style={styles.addonPricePending}>Checking live price...</Text>
                  )}
                </View>
                <Pressable
                  accessibilityLabel={`${selectedAddons[row.id] ? "Remove" : "Add"} ${row.title}`}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !isLivePrice(prices[row.id]) }}
                  disabled={!isLivePrice(prices[row.id])}
                  onPress={() => setSelectedAddons((current) => ({ ...current, [row.id]: !current[row.id] }))}
                  style={[styles.addonToggle, selectedAddons[row.id] && styles.addonToggleSelected, !isLivePrice(prices[row.id]) && styles.addonToggleDisabled]}
                >
                  <Feather color={selectedAddons[row.id] ? huddleColors.onPrimary : huddleColors.blue} name={selectedAddons[row.id] ? "minus" : "plus"} size={15} />
                </Pressable>
              </View>
            ))}
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: selectedAddonRows.length === 0 }}
              disabled={selectedAddonRows.length === 0}
              onPress={() => undefined}
              style={[styles.addonCta, selectedAddonRows.length === 0 && styles.addonCtaDisabled]}
            >
              <Feather color={huddleColors.blue} name="shopping-bag" size={18} />
              <Text style={styles.addonCtaText}>
                {canShowTotal ? formatMoney(selectedTotal, currencyCode as string) : "Purchase Add-ons"}
              </Text>
            </Pressable>
          </View>
        </View>
      );
    }

    const plan = plans[activePlan];
    const isAnnual = billing === "annual";
    const ownTier = normalizeOwnedTier(profile?.tier);
    const monthlyAmount = prices[`${activePlan}_monthly` as "plus_monthly" | "gold_monthly"];
    const annualAmount = prices[`${activePlan}_annual` as "plus_annual" | "gold_annual"];
    const currencyCode = prices.currencyCode;
    const price = isAnnual && isLivePrice(annualAmount)
      ? annualAmount / 12
      : monthlyAmount;
    const annualDiscount = discountPct(monthlyAmount, annualAmount);
    const isBlockedByTier = ownTier === "gold" || (ownTier === "plus" && activePlan === "plus");
    const isCurrentPlan = ownTier === activePlan;
    const ctaLabel = isBlockedByTier
      ? (ownTier === "gold" ? "You're on Huddle Gold" : "You're on Huddle+")
      : (activePlan === "plus" ? "Get Huddle+" : "Get Huddle Gold");

    return (
      <View style={[styles.planCard, { backgroundColor: plan.background }]}>
          <View style={[styles.billingTabs, { backgroundColor: plan.background }]}>
            <Pressable onPress={() => setBilling("monthly")} style={[styles.billingTab, !isAnnual ? null : styles.billingTabInactiveRight]}>
              <Text style={[styles.billingText, isAnnual && { color: plan.background }]}>Monthly</Text>
            </Pressable>
            <Pressable onPress={() => setBilling("annual")} style={[styles.billingTab, isAnnual ? null : styles.billingTabInactiveLeft]}>
              <Text style={[styles.billingText, !isAnnual && { color: plan.background }]}>Annually</Text>
              {!isAnnual && annualDiscount !== null ? (
                <View style={[styles.discountPill, { backgroundColor: plan.background }]}>
                  <Text style={styles.discountText}>-{annualDiscount}%</Text>
                </View>
              ) : null}
            </Pressable>
          </View>
          <View style={styles.planBody}>
            {!isAnnual ? (
              <Text style={styles.price}>
                {isLivePrice(price) ? formatMoney(price, currencyCode) : "--"} <Text style={styles.priceSuffix}>/mo</Text>
              </Text>
            ) : (
              <View>
                <View style={styles.annualPriceRow}>
                  <Text style={styles.struckPrice}>{isLivePrice(monthlyAmount) ? formatMoney(monthlyAmount, currencyCode) : "--"}</Text>
                  <Text style={styles.price}>
                    {isLivePrice(price) ? formatMoney(price, currencyCode) : "--"} <Text style={styles.priceSuffix}>/mo</Text>
                  </Text>
                </View>
                <Text style={styles.annualNote}>{isLivePrice(annualAmount) ? formatMoney(annualAmount, currencyCode) : "--"} billed yearly</Text>
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
              accessibilityState={{ disabled: isBlockedByTier }}
              disabled={isBlockedByTier}
              onPress={() => undefined}
              style={[styles.planCta, isBlockedByTier && styles.planCtaBlocked]}
            >
              <Text style={[styles.planCtaText, { color: isBlockedByTier ? "#99A0B3" : plan.background }]}>
                {ctaLabel}
              </Text>
            </Pressable>
            {isCurrentPlan ? (
              <Pressable
                accessibilityLabel="Cancel Subscription"
                accessibilityRole="button"
                onPress={() => undefined}
                style={styles.cancelSubscriptionLink}
              >
                <Text style={styles.cancelSubscriptionText}>Cancel Subscription</Text>
              </Pressable>
            ) : null}
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
        <Pressable accessibilityLabel="Go back" accessibilityRole="button" hitSlop={12} onPress={onBack} style={({ pressed }) => [styles.returnArrow, pressed ? styles.pressed : null]}>
          <Feather color={huddleColors.iconMuted} name="arrow-left" size={20} />
        </Pressable>

        <Image
          accessibilityIgnoresInvertColors
          accessibilityLabel="Huddle Premium"
          resizeMode="contain"
          source={premiumBanner}
          style={[styles.premiumBanner, { width: contentWidth, height: contentWidth * (175 / 916) }]}
        />

        <View style={styles.tabRow}>
          {(["plus", "gold", "addons"] as PlanKey[]).map((planKey) => {
            const selected = activePlan === planKey;
            const isGold = planKey === "gold";
            const tabColor = planKey === "plus" ? plans.plus.background : planKey === "gold" ? plans.gold.background : "#7CFF6B";
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
                    {planKey === "plus" ? "Huddle+" : planKey === "gold" ? "Huddle Gold" : "Add-ons"}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </View>

        {renderPlanCard()}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: {
    ...huddleButtons.pressed,
  },
  screen: {
    ...StyleSheet.absoluteFillObject,
    paddingTop: huddleLayout.headerHeight + huddleSpacing.x5,
    backgroundColor: huddleColors.canvas,
  },
  content: {
    paddingHorizontal: huddleSpacing.x5,
    paddingTop: huddleSpacing.x5,
    paddingBottom: huddleSpacing.x9,
  },
  returnArrow: {
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  premiumBanner: {
    marginTop: 7,
    alignSelf: "center",
  },
  tabRow: {
    marginTop: 14,
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
  discountPill: {
    borderRadius: huddleRadii.pill,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  discountText: {
    fontFamily: "Urbanist-700",
    fontSize: 9,
    lineHeight: 12,
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
  annualPriceRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
  },
  struckPrice: {
    fontFamily: "Urbanist-400",
    fontSize: 15,
    lineHeight: 20,
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
    fontSize: huddleType.helper,
    lineHeight: 16,
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
    backgroundColor: "#7CFF6B",
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
  addonPricePending: {
    marginTop: 4,
    fontFamily: "Urbanist-600",
    fontSize: 12,
    lineHeight: 16,
    color: "rgba(33, 69, 207, 0.52)",
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
    backgroundColor: "#7CFF6B",
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
});
