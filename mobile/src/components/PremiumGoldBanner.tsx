import { useMemo, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
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

export function PremiumGoldBanner() {
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
    <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 }}>
      <FlatList
        horizontal
        pagingEnabled
        snapToAlignment="center"
        showsHorizontalScrollIndicator={false}
        data={cards}
        keyExtractor={(c) => c.id}
        renderItem={({ item }) => {
          const active = selected === item.id;
          return (
            <Pressable
              onPress={async () => {
                await hapticCardThud();
                setSelected(item.id);
              }}
              style={({ pressed }) => ({
                width: 320,
                aspectRatio: 1.8,
                borderRadius: 16,
                borderWidth: active ? 2 : 1,
                borderColor: item.color,
                padding: 16,
                marginRight: 16,
                backgroundColor: pressed ? "rgba(33,69,207,0.06)" : "rgba(255,255,255,0.95)",
                transform: [{ scale: pressed ? 1.05 : 1 }],
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.12,
                shadowRadius: 2,
                elevation: 1,
              })}
            >
              {item.recommended ? (
                <View
                  style={{
                    alignSelf: "flex-start",
                    backgroundColor: "#A855F7",
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: 999,
                    marginBottom: 10,
                  }}
                >
                  <Text style={{ color: COLORS.white, fontSize: 12, fontWeight: "800" }}>Recommended</Text>
                </View>
              ) : null}

              <Text style={{ color: COLORS.brandText, fontSize: 16, fontWeight: "800" }}>{item.title}</Text>
              <Text style={{ color: COLORS.brandSubtext, fontSize: 14, marginTop: 8 }}>{item.desc}</Text>

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
          );
        }}
      />
    </View>
  );
}

