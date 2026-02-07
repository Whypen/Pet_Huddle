import { useCallback, useMemo, useRef, useState } from "react";
import { Animated, FlatList, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Header } from "../components/Header";
import { COLORS, LAYOUT, TYPO } from "../theme/tokens";
import { hapticCardThud } from "../lib/haptics";

type Tier = "Premium" | "Gold" | "Add-on";

export function PremiumScreen() {
  const [tier, setTier] = useState<Tier>("Premium");
  const fade = useRef(new Animated.Value(1)).current;

  const onSelectTier = useCallback(
    async (t: Tier) => {
      setTier(t);
      Animated.timing(fade, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
        Animated.timing(fade, { toValue: 1, duration: 150, useNativeDriver: true }).start();
      });
    },
    [fade]
  );

  const cards = useMemo(
    () => [
      { id: "premium", title: "Unlock Premium", color: COLORS.brandBlue },
      { id: "gold", title: "Unlock Gold", color: COLORS.brandGold },
    ],
    []
  );

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.white }}>
      <Header />

      <View style={{ paddingHorizontal: LAYOUT.sectionPaddingH, paddingVertical: LAYOUT.sectionPaddingV }}>
        <Text style={{ color: COLORS.brandText, fontSize: 18, fontWeight: "700" }}>Choose Your Privileges</Text>
      </View>

      <View style={{ paddingHorizontal: 16 }}>
        <FlatList
          horizontal
          pagingEnabled
          snapToAlignment="center"
          showsHorizontalScrollIndicator={false}
          data={cards}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => (
            <Pressable
              onPress={async () => {
                await hapticCardThud();
              }}
              style={({ pressed }) => ({
                width: 320,
                aspectRatio: 1.8,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: item.color,
                padding: 16,
                marginRight: 16,
                backgroundColor: "rgba(255,255,255,0.96)",
                transform: [{ scale: pressed ? 1.05 : 1 }],
              })}
            >
              <Text style={{ color: COLORS.brandText, fontSize: 16, fontWeight: "800" }}>{item.title}</Text>
              <Text style={{ color: COLORS.brandSubtext, fontSize: 14, marginTop: 8 }}>
                Explore benefits and upgrade securely.
              </Text>
              <View
                style={{
                  marginTop: 12,
                  backgroundColor: item.color,
                  borderRadius: 12,
                  paddingVertical: 12,
                  alignItems: "center",
                  flexDirection: "row",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                <Text style={{ color: COLORS.white, fontSize: 14, fontWeight: "700" }}>Explore</Text>
                <Ionicons name="arrow-forward" size={16} color={COLORS.white} />
              </View>
            </Pressable>
          )}
        />
      </View>

      <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {(["Premium", "Gold", "Add-on"] as Tier[]).map((t) => {
            const active = t === tier;
            return (
              <Pressable
                key={t}
                onPress={() => onSelectTier(t)}
                style={{
                  flex: 1,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: "rgba(66,73,101,0.25)",
                  height: LAYOUT.tabsHeight,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    color: active ? COLORS.brandGold : "rgba(66,73,101,0.7)",
                    fontWeight: active ? "800" : "600",
                    fontSize: 14,
                  }}
                >
                  {t}
                </Text>
                {active ? (
                  <View style={{ position: "absolute", bottom: 0, left: 10, right: 10, height: 2, backgroundColor: COLORS.brandGold }} />
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </View>

      <Animated.View style={{ flex: 1, opacity: fade, padding: 16 }}>
        <Text style={{ color: "rgba(66,73,101,0.7)", fontSize: 14, marginBottom: 12 }}>
          Select a plan and see included privileges.
        </Text>
        <Text style={{ color: COLORS.brandText, fontSize: TYPO.headingSize, fontWeight: "700" }}>
          {tier === "Premium" ? "Best for Pet Lovers" : tier === "Gold" ? "Ultimate Experience" : "Add-ons"}
        </Text>
      </Animated.View>
    </View>
  );
}

