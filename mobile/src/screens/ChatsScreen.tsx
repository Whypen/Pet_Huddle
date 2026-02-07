import { useMemo, useState } from "react";
import { FlatList, Text, View } from "react-native";
import { BlurView } from "expo-blur";
import { Header } from "../components/Header";
import { COLORS, LAYOUT, TYPO } from "../theme/tokens";

type FakeProfile = { id: string; name: string; meta: string };

export function ChatsScreen() {
  // UAT: Free users max 40 profiles/day. The 41st is paywalled with blur overlay.
  // This will be wired to membership + counters in Supabase; placeholder for now.
  const [dailySeen] = useState(41);

  const data = useMemo<FakeProfile[]>(
    () =>
      Array.from({ length: 60 }).map((_, i) => ({
        id: String(i + 1),
        name: `Profile ${i + 1}`,
        meta: "Name, age, social status, owned pet species",
      })),
    []
  );

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.white }}>
      <Header />

      <View style={{ paddingHorizontal: LAYOUT.sectionPaddingH, paddingVertical: LAYOUT.sectionPaddingV }}>
        <Text style={{ color: COLORS.brandText, fontSize: TYPO.headingSize, fontWeight: "600" }}>
          Discovery (Embedded in Chats)
        </Text>
      </View>

      <View style={{ flex: 1 }}>
        <FlatList
          horizontal
          pagingEnabled
          snapToAlignment="center"
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16 }}
          data={data}
          keyExtractor={(p) => p.id}
          renderItem={({ item, index }) => {
            const blocked = dailySeen > 40 && index >= 40;
            return (
              <View
                style={{
                  width: 320,
                  marginRight: 16,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: `${COLORS.brandText}33`,
                  padding: 16,
                  overflow: "hidden",
                }}
              >
                <Text style={{ color: COLORS.brandText, fontSize: 16, fontWeight: "700" }}>{item.name}</Text>
                <Text style={{ color: COLORS.brandSubtext, fontSize: 12, marginTop: 6 }}>{item.meta}</Text>

                {blocked ? (
                  <View style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0 }}>
                    <BlurView intensity={25} tint="light" style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.8)" }}>
                      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 16 }}>
                        <Text style={{ color: COLORS.brandText, fontSize: 14, fontWeight: "700", textAlign: "center" }}>
                          Unlock Premium to see more users
                        </Text>
                        <Text
                          style={{
                            color: COLORS.brandSubtext,
                            fontSize: 12,
                            marginTop: 8,
                            textAlign: "center",
                          }}
                        >
                          You reached today&apos;s free limit of 40 profiles.
                        </Text>
                      </View>
                    </BlurView>
                  </View>
                ) : null}
              </View>
            );
          }}
        />
      </View>
    </View>
  );
}

