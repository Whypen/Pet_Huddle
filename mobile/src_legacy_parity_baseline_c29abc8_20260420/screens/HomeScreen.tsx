import { Pressable, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Header } from "../components/Header";
import { COLORS, LAYOUT, TYPO } from "../theme/tokens";
import { HText } from "../components/HText";
import type { RootStackParamList } from "../navigation/types";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/useAuth";
import { computeNextEvent, formatNextEventLabel, type PetReminder } from "../utils/petLogic";

export function HomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { profile } = useAuth();
  const [nextEventLabel, setNextEventLabel] = useState<string>("—");

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  useEffect(() => {
    (async () => {
      if (!profile?.id) return;
      try {
        const petsRes = await supabase
          .from("pets")
          .select("id,name,dob")
          .eq("owner_id", profile.id)
          .order("created_at", { ascending: false })
          .limit(25);
        if (petsRes.error) throw petsRes.error;

        const todayISO = new Date().toISOString().slice(0, 10);
        const remRes = await supabase
          .from("reminders")
          .select("id,pet_id,due_date,kind,reason")
          .eq("owner_id", profile.id)
          .gte("due_date", todayISO)
          .order("due_date", { ascending: true })
          .limit(200);

        // If the reminders table isn't deployed yet, degrade gracefully.
        const reminders = (remRes.error ? [] : (remRes.data ?? [])) as PetReminder[];

        let best: { date: Date; reasons: string[] } | null = null;
        for (const p of petsRes.data ?? []) {
          const petRem = reminders.filter((r) => r.pet_id === p.id);
          const ev = computeNextEvent(p.dob, petRem);
          if (!ev) continue;
          if (!best || ev.date.getTime() < best.date.getTime()) best = ev;
        }
        setNextEventLabel(formatNextEventLabel(best));
      } catch (e) {
        console.warn("[Home] failed to compute next event", e);
        setNextEventLabel("—");
      }
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
            {nextEventLabel === "—" ? "No upcoming events" : nextEventLabel}
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
