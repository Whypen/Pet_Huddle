import { useEffect, useMemo, useRef, useState } from "react";
import { Dimensions, Pressable, ScrollView, TextInput, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { Header } from "../components/Header";
import { HText } from "../components/HText";
import { COLORS, LAYOUT } from "../theme/tokens";

type FakeProfile = {
  id: string;
  name: string;
  age: number;
  status: string;
  species: string;
};

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function ChatsScreen() {
  const w = Dimensions.get("window").width;
  const cardW = Math.round(w * 0.8);
  const scrollRef = useRef<ScrollView | null>(null);

  const [tab, setTab] = useState<"Chats" | "Groups">("Chats");
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");

  // UAT: Free users max 40 profiles/day; the 41st+ is paywalled.
  const [seenToday, setSeenToday] = useState(0);
  useEffect(() => {
    (async () => {
      const key = `discovery_seen_${todayKey()}`;
      const raw = await AsyncStorage.getItem(key);
      const n = raw ? Number(raw) : 0;
      setSeenToday(Number.isFinite(n) ? n : 0);
    })();
  }, []);

  const bumpSeen = async (idx: number) => {
    const next = Math.max(seenToday, idx + 1);
    if (next === seenToday) return;
    setSeenToday(next);
    const key = `discovery_seen_${todayKey()}`;
    await AsyncStorage.setItem(key, String(next));
  };

  const profiles = useMemo<FakeProfile[]>(
    () =>
      Array.from({ length: 80 }).map((_, i) => ({
        id: String(i + 1),
        name: `Profile ${i + 1}`,
        age: 24 + ((i + 1) % 8),
        status: i % 3 === 0 ? "Verified" : "Standard",
        species: i % 2 === 0 ? "Dog" : "Cat",
      })),
    []
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return profiles;
    return profiles.filter((p) => p.name.toLowerCase().includes(q));
  }, [profiles, query]);

  const filters = useMemo(() => ["Age", "Gender", "Pet Size", "Distance", "Species", "Role", "Verified"], []);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.white }}>
      <Header />

      {/* UAT: Chats/Groups toggle smaller + move search icon + Create Group next to it */}
      <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8, gap: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {(["Chats", "Groups"] as const).map((t) => {
              const active = tab === t;
              return (
                <Pressable
                  key={t}
                  onPress={() => setTab(t)}
                  hitSlop={4}
                  style={{
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: active ? `${COLORS.brandGold}80` : `${COLORS.brandText}25`,
                    backgroundColor: active ? "rgba(207,171,33,0.10)" : COLORS.white,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                  }}
                >
                  <HText variant="meta" style={{ fontSize: 12, fontWeight: active ? "900" : "700", color: COLORS.brandText }}>
                    {t}
                  </HText>
                </Pressable>
              );
            })}
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Pressable
              onPress={() => setSearchOpen((v) => !v)}
              hitSlop={4}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            >
              <Ionicons name="search" size={20} color="rgba(66,73,101,0.8)" />
            </Pressable>
            <Pressable
              onPress={() => {}}
              hitSlop={4}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            >
              <Ionicons name="add-circle" size={22} color={COLORS.brandBlue} />
            </Pressable>
          </View>
        </View>

        {searchOpen ? (
          <View style={{ borderWidth: 1, borderColor: `${COLORS.brandText}33`, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 }}>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Conversations"
              placeholderTextColor="rgba(66,73,101,0.45)"
              style={{ fontSize: 14, color: COLORS.brandText }}
            />
          </View>
        ) : null}
      </View>

      {/* UAT: Discovery embedded within chat session + filters in one row */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingBottom: 8 }}>
        {filters.map((f) => (
          <Pressable
            key={f}
            onPress={() => {}}
            hitSlop={4}
            style={({ pressed }) => ({
              borderRadius: 999,
              borderWidth: 1,
              borderColor: `${COLORS.brandText}25`,
              backgroundColor: pressed ? "rgba(33,69,207,0.06)" : "rgba(66,73,101,0.06)",
              paddingHorizontal: 12,
              paddingVertical: 6,
            })}
          >
            <HText variant="meta" style={{ fontSize: 12, fontWeight: "800" }}>
              {f}
            </HText>
          </Pressable>
        ))}
      </ScrollView>

      {/* UAT: Profile cards horizontal snap-to-center, 80% width */}
      <ScrollView
        horizontal
        pagingEnabled
        snapToAlignment="center"
        showsHorizontalScrollIndicator={false}
        ref={(r) => {
          scrollRef.current = r;
        }}
        onMomentumScrollEnd={(e) => {
          const x = e.nativeEvent.contentOffset.x;
          const idx = Math.round(x / (cardW + 16));
          bumpSeen(idx).catch(() => {});
        }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
      >
        {filtered.map((p, idx) => {
          const blocked = seenToday >= 40 && idx >= 40;
          return (
            <View
              key={p.id}
              style={{
                width: cardW,
                marginRight: 16,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: `${COLORS.brandText}25`,
                padding: 16,
                overflow: "hidden",
                height: 360,
              }}
            >
              <HText variant="heading" style={{ fontSize: 16, fontWeight: "900" }}>
                {p.name}
              </HText>
              <HText variant="body" style={{ color: COLORS.brandSubtext, marginTop: 6 }}>
                {p.age} • {p.status} • {p.species}
              </HText>

              {/* UAT: overlay icons Wave/Star/X on profile preview (visual only here) */}
              <View style={{ position: "absolute", right: 16, bottom: 16, flexDirection: "row", gap: 10 }}>
                <Pressable hitSlop={4} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(33,69,207,0.10)", alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="hand-left" size={18} color={COLORS.brandBlue} />
                </Pressable>
                <Pressable hitSlop={4} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(207,171,33,0.14)", alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="star" size={18} color={COLORS.brandGold} />
                </Pressable>
                <Pressable hitSlop={4} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(239,68,68,0.12)", alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="close" size={18} color={COLORS.brandError} />
                </Pressable>
              </View>

              {blocked ? (
                <View style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0 }}>
                  <BlurView intensity={25} tint="light" style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.8)" }}>
                    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 16 }}>
                      <HText variant="body" style={{ fontWeight: "900", textAlign: "center" }}>
                        Unlock Premium to see more users
                      </HText>
                      <HText variant="meta" style={{ color: COLORS.brandSubtext, marginTop: 8, textAlign: "center" }}>
                        Free users can view up to 40 profiles per day.
                      </HText>
                      <Pressable
                        onPress={() => {}}
                        hitSlop={4}
                        style={({ pressed }) => ({
                          marginTop: 12,
                          backgroundColor: COLORS.brandBlue,
                          paddingHorizontal: 16,
                          paddingVertical: 12,
                          borderRadius: 12,
                          opacity: pressed ? 0.9 : 1,
                        })}
                      >
                        <HText variant="body" style={{ color: COLORS.white, fontWeight: "900" }}>
                          Explore Premium
                        </HText>
                      </Pressable>
                    </View>
                  </BlurView>
                </View>
              ) : null}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}
