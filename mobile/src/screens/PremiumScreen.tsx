import { useCallback, useMemo, useRef, useState } from "react";
import { Alert, Animated, Pressable, ScrollView, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Header } from "../components/Header";
import { HText } from "../components/HText";
import { COLORS, LAYOUT } from "../theme/tokens";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";

type Tier = "Premium" | "Gold" | "Add-on";

type Plan = {
  id: string;
  label: string;
  price: string;
  savePill?: string;
};

type AddOn = {
  id: string;
  title: string;
  subtitle: string;
  price: number;
};

export function PremiumScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [tier, setTier] = useState<Tier>("Premium");
  const fade = useRef(new Animated.Value(1)).current;

  const [plan, setPlan] = useState<string>("premium_monthly");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [selectedAddOns, setSelectedAddOns] = useState<Record<string, boolean>>({});

  const selectTier = useCallback(
    (t: Tier) => {
      setTier(t);
      Animated.sequence([
        Animated.timing(fade, { toValue: 0, duration: 150, useNativeDriver: true }),
        Animated.timing(fade, { toValue: 1, duration: 150, useNativeDriver: true }),
      ]).start();
    },
    [fade]
  );

  const premiumPlans = useMemo<Plan[]>(
    () => [
      { id: "premium_monthly", label: "Monthly", price: "$8.99" },
      { id: "premium_yearly", label: "Yearly", price: "$80.99", savePill: "Save 26%" },
    ],
    []
  );
  const goldPlans = useMemo<Plan[]>(
    () => [
      { id: "gold_monthly", label: "Monthly", price: "$19.99" },
      { id: "gold_yearly", label: "Yearly", price: "$180.99", savePill: "Save 25%" },
    ],
    []
  );

  const addOns = useMemo<AddOn[]>(
    () => [
      { id: "star_pack", title: "3 Star Pack", subtitle: "Superpower to trigger chats immediately", price: 4.99 },
      { id: "broadcast_alert", title: "Broadcast Alert", subtitle: "Additional broadcast alert", price: 2.99 },
      { id: "media_10", title: "Additional 10 media", subtitle: "Across Social, Chats and AI Vet", price: 3.99 },
    ],
    []
  );

  const total = useMemo(() => {
    let t = 0;
    for (const a of addOns) t += (cart[a.id] ?? 0) * a.price;
    return t;
  }, [addOns, cart]);

  const Features = ({ gold }: { gold?: boolean }) => (
    <View style={{ gap: 8, marginTop: 12 }}>
      {[
        { t: "Unlimited", d: gold ? "Ultra-wide visibility and perks" : "More discovery and social access" },
        { t: "Threads", d: gold ? "30 threads/month" : "5 threads/month" },
        { t: "Broadcast", d: gold ? "20km range" : "5km range" },
      ].map((f) => (
        <Pressable
          key={f.t}
          onPress={() => Alert.alert(f.t, f.d)}
          style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
        >
          <Ionicons name="checkmark-circle" size={24} color={COLORS.brandBlue} />
          <View style={{ flex: 1 }}>
            <HText variant="body" style={{ fontWeight: "800" }}>
              {f.t}
            </HText>
            <HText variant="meta" style={{ color: "rgba(66,73,101,0.7)", marginTop: 2 }}>
              {f.d}
            </HText>
          </View>
          <Ionicons name="information-circle-outline" size={18} color="rgba(66,73,101,0.6)" />
        </Pressable>
      ))}
    </View>
  );

  const Plans = ({ plans }: { plans: Plan[] }) => (
    <View style={{ gap: 10, marginTop: 10 }}>
      {plans.map((p) => {
        const active = plan === p.id;
        const isGold = p.id.startsWith("gold");
        return (
          <Pressable
            key={p.id}
            onPress={() => setPlan(p.id)}
            hitSlop={4}
            style={({ pressed }) => ({
              borderWidth: 2,
              borderColor: active ? COLORS.brandGold : "rgba(66,73,101,0.25)",
              borderRadius: 12,
              padding: 12,
              backgroundColor: pressed ? "rgba(33,69,207,0.04)" : COLORS.white,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            })}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 9,
                  borderWidth: 2,
                  borderColor: active ? COLORS.brandGold : "rgba(66,73,101,0.35)",
                  backgroundColor: active ? COLORS.brandGold : "transparent",
                }}
              />
              <HText variant="body" style={{ fontWeight: "800" }}>
                {p.label} {p.price}
              </HText>
            </View>
            {p.savePill ? (
              <View
                style={{
                  backgroundColor: isGold ? "rgba(207,171,33,0.18)" : "rgba(33,69,207,0.12)",
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  borderRadius: 999,
                }}
              >
                <HText variant="meta" style={{ color: isGold ? COLORS.brandGold : COLORS.brandBlue, fontWeight: "900", fontSize: 12 }}>
                  {p.savePill}
                </HText>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.white }}>
      <Header />

      <ScrollView contentContainerStyle={{ paddingBottom: 120 }} stickyHeaderIndices={[0]}>
        {/* UAT: Sticky top (header+tabs) */}
        <View style={{ backgroundColor: COLORS.white, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 }}>
          <HText variant="heading" style={{ fontSize: 18, fontWeight: "900" }}>
            Choose Your Privileges
          </HText>
          <View style={{ marginTop: 10, flexDirection: "row", gap: 8 }}>
            {(["Premium", "Gold", "Add-on"] as Tier[]).map((t) => {
              const active = t === tier;
              return (
                <Pressable
                  key={t}
                  onPress={() => selectTier(t)}
                  style={{
                    flex: 1,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: "rgba(66,73,101,0.25)",
                    height: LAYOUT.tabsHeight,
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: active ? 1 : 0.7,
                    position: "relative",
                  }}
                >
                  <HText variant="body" style={{ fontWeight: active ? "900" : "700", color: active ? COLORS.brandGold : COLORS.brandText }}>
                    {t}
                  </HText>
                  {active ? <View style={{ position: "absolute", bottom: 0, left: 10, right: 10, height: 2, backgroundColor: COLORS.brandGold }} /> : null}
                </Pressable>
              );
            })}
          </View>
        </View>

        <Animated.View style={{ opacity: fade, paddingHorizontal: 16 }}>
          <HText variant="body" style={{ color: "rgba(66,73,101,0.7)", marginBottom: 12 }}>
            Select a plan to unlock features and privileges.
          </HText>

          {tier === "Premium" ? (
            <View>
              <HText variant="heading" style={{ fontSize: 16, fontWeight: "900" }}>
                Best for Pet Lovers
              </HText>
              <Plans plans={premiumPlans} />
              <Features />
            </View>
          ) : tier === "Gold" ? (
            <View>
              <HText variant="heading" style={{ fontSize: 16, fontWeight: "900" }}>
                Ultimate Experience
              </HText>
              <Plans plans={goldPlans} />
              <Features gold />
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              <HText variant="heading" style={{ fontSize: 16, fontWeight: "900" }}>
                Add-ons
              </HText>
              {addOns.map((a) => {
                const qty = cart[a.id] ?? 0;
                const checked = !!selectedAddOns[a.id];
                return (
                  <View key={a.id} style={{ borderWidth: 1, borderColor: `${COLORS.brandText}1F`, borderRadius: 16, padding: 12 }}>
                    <HText variant="body" style={{ fontWeight: "900" }}>
                      {a.title}
                    </HText>
                    <HText variant="meta" style={{ color: "rgba(66,73,101,0.7)", marginTop: 4 }}>
                      {a.subtitle}
                    </HText>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
                      <HText variant="body" style={{ fontWeight: "800" }}>
                        ${a.price.toFixed(2)}
                      </HText>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                        <Pressable
                          onPress={() => {
                            setSelectedAddOns((s) => {
                              const next = !s[a.id];
                              // UAT: min1 max10 when selected.
                              setCart((c) => ({ ...c, [a.id]: next ? Math.max(1, c[a.id] ?? 1) : 0 }));
                              return { ...s, [a.id]: next };
                            });
                          }}
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 8,
                            borderWidth: 2,
                            borderColor: checked ? COLORS.brandGold : "rgba(66,73,101,0.35)",
                            backgroundColor: checked ? COLORS.brandGold : "transparent",
                          }}
                        />
                        <Pressable
                          onPress={() =>
                            setCart((c) => ({
                              ...c,
                              [a.id]: checked ? Math.max(1, (c[a.id] ?? 1) - 1) : 0,
                            }))
                          }
                          disabled={!checked}
                          style={{ width: 34, height: 34, borderRadius: 10, borderWidth: 1, borderColor: `${COLORS.brandText}33`, alignItems: "center", justifyContent: "center" }}
                        >
                          <HText variant="body" style={{ fontWeight: "900" }}>
                            -
                          </HText>
                        </Pressable>
                        <HText variant="body" style={{ fontWeight: "900" }}>
                          {checked ? Math.max(1, qty || 1) : 0}
                        </HText>
                        <Pressable
                          onPress={() =>
                            setCart((c) => ({
                              ...c,
                              [a.id]: checked ? Math.min(10, (c[a.id] ?? 1) + 1) : 0,
                            }))
                          }
                          disabled={!checked}
                          style={{ width: 34, height: 34, borderRadius: 10, borderWidth: 1, borderColor: `${COLORS.brandText}33`, alignItems: "center", justifyContent: "center" }}
                        >
                          <HText variant="body" style={{ fontWeight: "900" }}>
                            +
                          </HText>
                        </Pressable>
                      </View>
                    </View>
                    <Pressable
                      onPress={() => Alert.alert("Added", `${a.title} added to cart.`)}
                      disabled={!checked}
                      style={({ pressed }) => ({
                        marginTop: 10,
                        backgroundColor: COLORS.brandBlue,
                        paddingVertical: 12,
                        borderRadius: 12,
                        alignItems: "center",
                        opacity: !checked ? 0.5 : pressed ? 0.9 : 1,
                      })}
                    >
                      <HText variant="body" style={{ color: COLORS.white, fontWeight: "900" }}>
                        Add to Cart
                      </HText>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          )}
        </Animated.View>
      </ScrollView>

      {/* UAT: fixed bottom purchase area */}
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 90,
          backgroundColor: COLORS.white,
          borderTopWidth: 1,
          borderTopColor: `${COLORS.brandText}1F`,
          paddingHorizontal: 16,
          paddingTop: 10,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: -1 },
          shadowOpacity: 0.08,
          shadowRadius: 2,
          elevation: 2,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <HText variant="body" style={{ fontWeight: "900" }}>
            Total: {tier === "Add-on" ? `$${total.toFixed(2)}` : plan.includes("yearly") ? "Yearly" : "Monthly"}
          </HText>
          <HText variant="body" style={{ fontWeight: "900" }}>
            Cart: {Object.values(cart).reduce((a, b) => a + b, 0)}
          </HText>
        </View>
        <Pressable
          onPress={() => Alert.alert("Checkout", "Stripe checkout wiring happens in integration phase.")}
          style={({ pressed }) => ({
            marginTop: 8,
            backgroundColor: COLORS.brandBlue,
            paddingVertical: 12,
            borderRadius: 12,
            alignItems: "center",
            opacity: pressed ? 0.9 : 1,
            flexDirection: "row",
            justifyContent: "center",
            gap: 8,
          })}
        >
          <Ionicons name="lock-closed" size={16} color={COLORS.white} />
          <HText variant="body" style={{ color: COLORS.white, fontWeight: "900" }}>
            Secure Privileges
          </HText>
        </Pressable>
        <Pressable onPress={() => navigation.navigate("Terms")}>
          <HText variant="meta" style={{ color: "rgba(66,73,101,0.6)", marginTop: 6, textAlign: "center" }}>
            By purchasing you agree to our <HText variant="meta" style={{ color: COLORS.brandBlue, textDecorationLine: "underline" }}>Terms</HText>
          </HText>
        </Pressable>
      </View>
    </View>
  );
}
