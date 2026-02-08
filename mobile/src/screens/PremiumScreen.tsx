import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Animated, Linking, Pressable, ScrollView, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Header } from "../components/Header";
import { HText } from "../components/HText";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/useAuth";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";

type TierTab = "Premium" | "Gold" | "Add-on";
type Billing = "monthly" | "yearly";

type Pricing = {
  premium: { monthly: number; yearly: number };
  gold: { monthly: number; yearly: number };
  addOn: { star_pack: number; emergency_alert: number; vet_media: number };
};

type AddOnId = keyof Pricing["addOn"];

const DEFAULT_PRICING: Pricing = {
  premium: { monthly: 9.99, yearly: 80.99 },
  gold: { monthly: 19.99, yearly: 180.99 },
  addOn: { star_pack: 4.99, emergency_alert: 2.99, vet_media: 3.99 },
};

const ADD_ONS: { id: AddOnId; title: string; subtitle: string; pill?: string }[] = [
  { id: "star_pack", title: "3 Star Pack", subtitle: "Superpower to trigger chats immediately" },
  { id: "emergency_alert", title: "Broadcast (72H/150km)", subtitle: "+1 Broadcast (72h / 150km)", pill: "72H" },
  { id: "vet_media", title: "AI Vet Media (+10)", subtitle: "+10 Media (AI Vet only)" },
];

function money(n: number) {
  return `$${n.toFixed(2)}`;
}

export function PremiumScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  // UAT: auto-select Premium on load.
  const [tab, setTab] = useState<TierTab>("Premium");
  const [billing, setBilling] = useState<Billing>("monthly");
  const [pricing, setPricing] = useState<Pricing>(DEFAULT_PRICING);

  const fade = useRef(new Animated.Value(1)).current;

  const [selected, setSelected] = useState<Record<AddOnId, boolean>>({
    star_pack: false,
    emergency_alert: false,
    vet_media: false,
  });
  const [qty, setQty] = useState<Record<AddOnId, number>>({
    star_pack: 1,
    emergency_alert: 1,
    vet_media: 1,
  });

  useEffect(() => {
    // UAT: dynamic pricing from Stripe if available (fallback to defaults).
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("stripe-pricing");
        if (error) throw error;
        const prices = (data as { prices?: Record<string, { amount?: number }> } | null)?.prices || {};
        setPricing((prev) => ({
          premium: {
            monthly: prices.premium_monthly?.amount ?? prev.premium.monthly,
            yearly: prices.premium_annual?.amount ?? prev.premium.yearly,
          },
          gold: {
            monthly: prices.gold_monthly?.amount ?? prev.gold.monthly,
            yearly: prices.gold_annual?.amount ?? prev.gold.yearly,
          },
          addOn: {
            star_pack: prices.star_pack?.amount ?? prev.addOn.star_pack,
            emergency_alert: prices.emergency_alert?.amount ?? prev.addOn.emergency_alert,
            vet_media: prices.vet_media?.amount ?? prev.addOn.vet_media,
          },
        }));
      } catch {
        // ignore
      }
    })();
  }, []);

  const cartItems = useMemo(() => {
    return ADD_ONS.filter((a) => selected[a.id]).map((a) => ({
      ...a,
      qty: Math.min(10, Math.max(1, qty[a.id] ?? 1)),
      price: pricing.addOn[a.id],
    }));
  }, [pricing.addOn, qty, selected]);

  const cartTotal = useMemo(() => cartItems.reduce((s, i) => s + i.qty * i.price, 0), [cartItems]);

  const purchaseLabel = useMemo(() => {
    if (tab === "Add-on") return money(cartTotal);
    const tier = tab === "Gold" ? "gold" : "premium";
    const p = pricing[tier][billing];
    return `${money(p)} / ${billing === "monthly" ? "mo" : "yr"}`;
  }, [billing, cartTotal, pricing, tab]);

  const selectTab = (next: TierTab) => {
    setTab(next);
    // UAT: 0.3s fade-in transition
    Animated.sequence([
      Animated.timing(fade, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(fade, { toValue: 1, duration: 150, useNativeDriver: true }),
    ]).start();
  };

  const secureCheckout = async () => {
    if (!user) {
      Alert.alert("Sign in required", "Please sign in to continue.");
      return;
    }
    try {
      if (tab === "Add-on") {
        if (!cartItems.length) return;
        const { data, error } = await supabase.functions.invoke("create-checkout-session", {
          body: {
            userId: user.id,
            mode: "payment",
            items: cartItems.map((i) => ({ type: i.id, quantity: i.qty })),
            amount: Math.round(cartTotal * 100),
            successUrl: "https://example.com/premium",
            cancelUrl: "https://example.com/premium",
          },
        });
        if (error) throw error;
        const url = (data as { url?: string } | null)?.url;
        if (url) await Linking.openURL(url);
        return;
      }

      const type = `${tab === "Gold" ? "gold" : "premium"}_${billing === "monthly" ? "monthly" : "annual"}`;
      const { data, error } = await supabase.functions.invoke("create-checkout-session", {
        body: {
          userId: user.id,
          mode: "subscription",
          type,
          successUrl: "https://example.com/premium",
          cancelUrl: "https://example.com/premium",
        },
      });
      if (error) throw error;
      const url = (data as { url?: string } | null)?.url;
      if (url) await Linking.openURL(url);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert("Checkout failed", msg || "Please try again.");
    }
  };

  return (
    <View className="flex-1 bg-white">
      <Header />

      <ScrollView contentContainerStyle={{ paddingBottom: 120 }} stickyHeaderIndices={[0]}>
        {/* UAT: Sticky top tier tabs */}
        <View className="bg-white px-4 pt-2 pb-3 border-b border-brandText/10">
          <HText variant="heading" className="text-[18px] font-extrabold text-brandText">
            Choose Your Privileges
          </HText>

          <View className="mt-3 flex-row gap-2 rounded-xl border border-brandText/20 bg-white p-1">
            {(["Premium", "Gold", "Add-on"] as const).map((t) => {
              const active = tab === t;
              return (
                <Pressable
                  key={t}
                  onPress={() => selectTab(t)}
                  className={[
                    "relative flex-1 h-10 rounded-xl items-center justify-center",
                    active ? "opacity-100" : "opacity-70",
                  ].join(" ")}
                  hitSlop={4}
                >
                  {t === "Gold" ? (
                    <View className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-purple-500 px-2 py-0.5">
                      <HText variant="meta" className="text-[10px] font-semibold text-white">
                        Recommended
                      </HText>
                    </View>
                  ) : null}

                  <HText
                    variant="body"
                    className={[
                      "text-[14px]",
                      active ? "font-extrabold text-brandGold" : "font-bold text-brandText",
                    ].join(" ")}
                  >
                    {t}
                  </HText>

                  {active ? <View className="absolute left-3 right-3 bottom-0 h-[2px] bg-brandGold rounded-full" /> : null}
                </Pressable>
              );
            })}
          </View>
        </View>

        <Animated.View style={{ opacity: fade }}>
          <View className="px-4 pt-4">
          <HText variant="body" className="text-[14px] text-brandText/70">
            {tab === "Premium"
              ? "Best for Pet Lovers"
              : tab === "Gold"
                ? "Ultimate Experience"
                : "Add on extra privileges any time."}
          </HText>

          {tab === "Premium" || tab === "Gold" ? (
            <>
              <View className="mt-3 gap-3">
                {(
                  [
                  {
                    id: "monthly" as const,
                    label: "Monthly",
                    price: tab === "Gold" ? pricing.gold.monthly : pricing.premium.monthly,
                  },
                  {
                    id: "yearly" as const,
                    label: "Yearly",
                    price: tab === "Gold" ? pricing.gold.yearly : pricing.premium.yearly,
                    pill: tab === "Gold" ? "Save 25%" : "Save 26%",
                  },
                ] as { id: Billing; label: string; price: number; pill?: string }[]
                ).map((p) => {
                  const active = billing === p.id;
                  return (
                    <Pressable
                      key={p.id}
                      onPress={() => setBilling(p.id)}
                      hitSlop={4}
                      className={[
                        "w-full flex-row items-center justify-between rounded-xl border p-3",
                        active ? "border-brandGold" : "border-brandText/20",
                      ].join(" ")}
                    >
                      <View className="flex-row items-center gap-3">
                        <View
                          className={[
                            "w-[18px] h-[18px] rounded-full border-2",
                            active ? "border-brandGold bg-brandGold" : "border-brandText/30",
                          ].join(" ")}
                        />
                        <HText variant="body" className="text-[14px] font-extrabold text-brandText">
                          {p.label} {money(p.price)}
                        </HText>
                      </View>
                      {p.pill ? (
                        <View
                          className={[
                            "rounded-full px-2.5 py-1",
                            tab === "Gold" ? "bg-brandGold/15" : "bg-brandBlue/10",
                          ].join(" ")}
                        >
                          <HText
                            variant="meta"
                            className={[
                              "text-[12px] font-extrabold",
                              tab === "Gold" ? "text-brandGold" : "text-brandBlue",
                            ].join(" ")}
                          >
                            {p.pill}
                          </HText>
                        </View>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>

              <View className="mt-4 gap-3">
                {[
                  {
                    t: "Unlimited",
                    d: tab === "Gold" ? "Unlimited discovery + priority ranking" : "Unlimited discovery + standard ranking",
                    icon: "sparkles-outline" as const,
                  },
                  { t: "Threads", d: tab === "Gold" ? "30 posts/day (pooled with family)" : "15 posts/day", icon: "chatbox-ellipses-outline" as const },
                  { t: "AI Vet", d: tab === "Gold" ? "20 uploads/day (pooled) + 5 priority/month" : "10 uploads/day", icon: "medkit-outline" as const },
                  { t: "Broadcast", d: tab === "Gold" ? "50/month • 50km • 48h (pooled)" : "30/month • 25km • 24h", icon: "radio-outline" as const },
                  ...(tab === "Gold"
                    ? [
                        { t: "Stars", d: "10/month (pooled) direct chat triggers", icon: "star-outline" as const },
                        { t: "Family", d: "1 member (shared billing, pooled quotas)", icon: "people-outline" as const },
                        { t: "Video", d: "Chats/Threads video upload (Gold-only)", icon: "videocam-outline" as const },
                      ]
                    : []),
                ].map((f) => (
                  <Pressable key={f.t} onPress={() => Alert.alert(f.t, f.d)} hitSlop={4} className="flex-row items-start gap-3 py-2">
                    <Ionicons name={f.icon} size={24} color="#2145CF" />
                    <View className="flex-1">
                      <HText variant="body" className="text-[14px] font-extrabold text-brandText">
                        {f.t}
                      </HText>
                      <HText variant="meta" className="text-[10px] text-brandText/70 mt-1">
                        {f.d}
                      </HText>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color="rgba(66,73,101,0.6)" />
                  </Pressable>
                ))}
              </View>
            </>
          ) : (
            <View className="mt-4 gap-3">
              {ADD_ONS.map((a) => {
                const checked = selected[a.id];
                const q = Math.min(10, Math.max(1, qty[a.id] ?? 1));
                return (
                  <View key={a.id} className="rounded-2xl border border-brandText/20 bg-white p-4">
                    <View className="flex-row items-start justify-between gap-3">
                      <View className="flex-1">
                        <View className="flex-row items-center gap-2">
                          <Pressable
                            onPress={() => {
                              setSelected((s) => ({ ...s, [a.id]: !s[a.id] }));
                              setQty((x) => ({ ...x, [a.id]: Math.min(10, Math.max(1, x[a.id] ?? 1)) }));
                            }}
                            hitSlop={4}
                            className={[
                              "w-6 h-6 rounded-[8px] border-2",
                              checked ? "border-brandGold bg-brandGold" : "border-brandText/30",
                            ].join(" ")}
                            accessibilityLabel={a.title}
                          />
                          <HText variant="body" className="text-[14px] font-extrabold text-brandText">
                            {a.title}
                          </HText>
                          {a.pill ? (
                            <View className="rounded-full bg-brandText/5 px-2 py-0.5">
                              <HText variant="meta" className="text-[10px] font-semibold text-brandText/80">
                                {a.pill}
                              </HText>
                            </View>
                          ) : null}
                        </View>
                        <HText variant="meta" className="text-[10px] text-brandText/70 mt-1">
                          {a.subtitle}
                        </HText>
                      </View>
                      <HText variant="body" className="text-[14px] font-extrabold text-brandText">
                        {money(pricing.addOn[a.id])}
                      </HText>
                    </View>

                    <View className="mt-3 flex-row items-center justify-between">
                      <View className="flex-row items-center gap-2">
                        <Pressable
                          onPress={() => setQty((x) => ({ ...x, [a.id]: Math.max(1, (x[a.id] ?? 1) - 1) }))}
                          disabled={!checked}
                          hitSlop={4}
                          className={["w-9 h-9 rounded-[10px] border border-brandText/20 items-center justify-center", !checked ? "opacity-40" : ""].join(" ")}
                        >
                          <HText variant="body" className="font-extrabold text-brandText">
                            -
                          </HText>
                        </Pressable>
                        <HText variant="body" className="w-8 text-center font-extrabold text-brandText">
                          {checked ? q : 0}
                        </HText>
                        <Pressable
                          onPress={() => setQty((x) => ({ ...x, [a.id]: Math.min(10, (x[a.id] ?? 1) + 1) }))}
                          disabled={!checked}
                          hitSlop={4}
                          className={["w-9 h-9 rounded-[10px] border border-brandText/20 items-center justify-center", !checked ? "opacity-40" : ""].join(" ")}
                        >
                          <HText variant="body" className="font-extrabold text-brandText">
                            +
                          </HText>
                        </Pressable>
                      </View>

                      <Pressable
                        onPress={() => setSelected((s) => ({ ...s, [a.id]: true }))}
                        disabled={!checked}
                        hitSlop={4}
                        className={["px-4 py-2 rounded-xl bg-brandBlue", !checked ? "opacity-50" : ""].join(" ")}
                      >
                        <HText variant="body" className="text-white font-extrabold">
                          Add to Cart
                        </HText>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
          </View>
        </Animated.View>
      </ScrollView>

      {/* UAT: fixed bottom purchase area (height: 90px) */}
      <View className="absolute left-0 right-0 bottom-0 h-[90px] bg-white border-t border-brandText/10 px-4 pt-3 pb-3">
        <View className="flex-row items-center justify-between">
          <HText variant="body" className="text-[16px] font-extrabold text-brandText">
            {tab === "Add-on" ? `Cart ${cartItems.reduce((s, i) => s + i.qty, 0)}` : tab}
          </HText>
          <HText variant="body" className="text-[16px] font-extrabold text-brandText">
            {purchaseLabel}
          </HText>
        </View>

        <Pressable
          onPress={secureCheckout}
          disabled={tab === "Add-on" && cartItems.length === 0}
          hitSlop={4}
          className={["mt-2 w-full rounded-lg bg-brandBlue py-2 flex-row items-center justify-center gap-2", tab === "Add-on" && cartItems.length === 0 ? "opacity-50" : ""].join(" ")}
        >
          <Ionicons name="lock-closed" size={16} color="#ffffff" />
          <HText variant="body" className="text-white font-extrabold">
            Secure Privileges
          </HText>
        </Pressable>

        <Pressable onPress={() => navigation.navigate("Terms")} hitSlop={4}>
          <HText variant="meta" className="mt-1 text-[10px] text-brandText/60 text-center">
            <HText variant="meta" className="text-[10px] text-brandText/60">
              By purchasing you agree to our{" "}
            </HText>
            <HText variant="meta" className="text-[10px] text-brandBlue underline font-semibold">
              Terms
            </HText>
          </HText>
        </Pressable>
      </View>
    </View>
  );
}
