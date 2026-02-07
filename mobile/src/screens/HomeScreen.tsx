import { Pressable, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Header } from "../components/Header";
import { COLORS, LAYOUT, TYPO } from "../theme/tokens";
import { HText } from "../components/HText";
import type { RootStackParamList } from "../navigation/types";
import { formatDDMMM } from "../lib/dates";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/useAuth";

export function HomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { profile } = useAuth();
  const [nextEvent, setNextEvent] = useState<{ date: Date; reason: string } | null>(null);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  useEffect(() => {
    (async () => {
      if (!profile?.id) return;
      const res = await supabase
        .from("pets")
        .select("id,name,dob,next_vaccination_reminder")
        .eq("owner_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(25);
      if (res.error) return;

      const candidates: { date: Date; reason: string }[] = [];

      for (const p of res.data ?? []) {
        if (p.next_vaccination_reminder) {
          const d = new Date(p.next_vaccination_reminder);
          if (d >= today) candidates.push({ date: d, reason: "Vaccination" });
        }
        if (p.dob) {
          const dob = new Date(p.dob);
          const nextBday = new Date(today);
          nextBday.setMonth(dob.getMonth());
          nextBday.setDate(dob.getDate());
          if (nextBday < today) nextBday.setFullYear(nextBday.getFullYear() + 1);
          candidates.push({ date: nextBday, reason: "Birthday" });
        }
      }

      candidates.sort((a, b) => a.date.getTime() - b.date.getTime());
      setNextEvent(candidates[0] ?? null);
    })();
  }, [profile?.id, today]);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.white }}>
      <Header />
      <View
        style={{
          paddingHorizontal: LAYOUT.sectionPaddingH,
          paddingVertical: LAYOUT.sectionPaddingV,
          gap: 8,
        }}
      >
        <HText variant="heading" style={{ fontSize: TYPO.headingSize, fontWeight: "800" }}>
          Pet Dashboard
        </HText>

        {/* UAT: Home Dashboard Next Event compute/format "DD MMM, Reasons" */}
        <View style={{ borderWidth: 1, borderColor: `${COLORS.brandText}1F`, borderRadius: 16, padding: 12 }}>
          <HText variant="body" style={{ fontWeight: "800" }}>
            Next Event
          </HText>
          <HText variant="meta" style={{ color: COLORS.brandSubtext, marginTop: 4 }}>
            {nextEvent ? `${formatDDMMM(nextEvent.date)}, ${nextEvent.reason}` : "No upcoming events"}
          </HText>
        </View>

        <Pressable
          onPress={() => navigation.navigate("PetProfile", { mode: "add" })}
          style={({ pressed }) => ({
            height: 44,
            borderRadius: 12,
            backgroundColor: COLORS.brandBlue,
            justifyContent: "center",
            alignItems: "center",
            opacity: pressed ? 0.9 : 1,
          })}
        >
          <HText variant="body" style={{ color: COLORS.white, fontWeight: "800" }}>
            Add Pet
          </HText>
        </Pressable>

        <Pressable
          onPress={() => navigation.navigate("CreateThread")}
          style={({ pressed }) => ({
            height: 44,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: `${COLORS.brandGold}66`,
            backgroundColor: COLORS.white,
            justifyContent: "center",
            alignItems: "center",
            opacity: pressed ? 0.9 : 1,
          })}
        >
          <HText variant="body" style={{ color: COLORS.brandText, fontWeight: "800" }}>
            Create Thread
          </HText>
        </Pressable>
      </View>
    </View>
  );
}
