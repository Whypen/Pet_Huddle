import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "../theme/tokens";
import { hapticCardThud } from "../lib/haptics";

type CardId = "premium" | "gold";

type Card = {
  id: CardId;
  title: string;
  desc: string;
  color: string;
  recommended?: boolean;
};

export function PremiumGoldBanner({ onSelect }: { onSelect?: (id: CardId) => void }) {
  const [selected, setSelected] = useState<CardId | null>(null);
  const cards = useMemo<Card[]>(
    () => [
      {
        id: "premium",
        title: "Unlock Premium",
        desc: "More discovery and social controls.",
        color: COLORS.brandBlue,
      },
      {
        id: "gold",
        title: "Unlock Gold",
        desc: "Ultimate experience and best value.",
        color: COLORS.brandGold,
        recommended: true,
      },
    ],
    []
  );

  return (
    <View style={{ paddingTop: 4, paddingBottom: 8 }}>
      <View style={{ flexDirection: "row", gap: 12, width: "100%" }}>
        {cards.map((item) => {
          const active = selected === item.id;
          return (
            <Pressable
              key={item.id}
              onPress={async () => {
                await hapticCardThud();
                setSelected(item.id);
                onSelect?.(item.id);
              }}
              style={({ pressed }) => ({
                flex: 1,
                minWidth: 0,
                height: 110, // ~30% shorter than the previous card
                borderRadius: 16,
                borderWidth: active ? 2 : 1,
                borderColor: item.color,
                padding: 12,
                backgroundColor: pressed ? "rgba(33,69,207,0.06)" : "rgba(255,255,255,0.95)",
                transform: [{ scale: pressed ? 1.02 : 1 }],
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.10,
                shadowRadius: 2,
                elevation: 1,
              })}
            >
              {item.recommended ? (
                <View
                  style={{
                    alignSelf: "flex-start",
                    backgroundColor: "#A855F7",
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    borderRadius: 999,
                    marginBottom: 6,
                  }}
                >
                  <Text style={{ color: COLORS.white, fontSize: 10, fontWeight: "800" }}>Recommended</Text>
                </View>
              ) : null}

              <Text style={{ color: COLORS.brandText, fontSize: 14, fontWeight: "800" }}>{item.title}</Text>
              <Text style={{ color: COLORS.brandSubtext, fontSize: 12, marginTop: 4 }} numberOfLines={1}>
                {item.desc}
              </Text>

              <View style={{ flex: 1 }} />

              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={{ color: item.color, fontSize: 12, fontWeight: "900" }}>Explore</Text>
                <Ionicons name="arrow-forward" size={14} color={item.color} />
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
