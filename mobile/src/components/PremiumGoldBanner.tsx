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
        desc: "Manage your privileges",
        color: COLORS.brandBlue,
      },
      {
        id: "gold",
        title: "Unlock Gold",
        desc: "Manage your privileges",
        color: COLORS.brandGold,
      },
    ],
    []
  );

  return (
    <View style={{ paddingTop: 4, paddingBottom: 8 }}>
      <View style={{ flexDirection: "row", gap: 12, width: "100%" }}>
        {cards.map((item) => {
          const active = selected === item.id;
          const icon: keyof typeof Ionicons.glyphMap = item.id === "premium" ? "diamond" : "star";
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
                height: 88, // ~30% shorter than the previous card
                borderRadius: 16,
                borderWidth: active ? 2 : 0,
                borderColor: "rgba(255,255,255,0.85)",
                padding: 12,
                backgroundColor: item.color, // Checklist: solid brand backgrounds
                transform: [{ scale: pressed ? 0.99 : 1 }],
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.10,
                shadowRadius: 2,
                elevation: 1,
              })}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name={icon} size={16} color={COLORS.white} />
                <Text style={{ color: COLORS.white, fontSize: 14, fontWeight: "900" }}>{item.title}</Text>
              </View>
              <Text style={{ color: "rgba(255,255,255,0.92)", fontSize: 12, marginTop: 6 }} numberOfLines={1}>
                {item.desc}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
