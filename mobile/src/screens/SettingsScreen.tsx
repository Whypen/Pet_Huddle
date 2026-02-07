import { Pressable, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Header } from "../components/Header";
import { COLORS, LAYOUT, TYPO } from "../theme/tokens";
import type { RootStackParamList } from "../navigation/types";

export function SettingsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.white }}>
      <Header />

      <View style={{ paddingHorizontal: LAYOUT.sectionPaddingH, paddingVertical: LAYOUT.sectionPaddingV }}>
        <Text style={{ color: COLORS.brandText, fontSize: TYPO.headingSize, fontWeight: "600" }}>Settings</Text>
      </View>

      <View style={{ paddingHorizontal: 16, gap: 8 }}>
        <View style={{ padding: 12, borderWidth: 1, borderColor: `${COLORS.brandGold}66`, borderRadius: 16 }}>
          <Text style={{ color: COLORS.brandText, fontSize: 14, fontWeight: "700" }}>PREMIUM + GOLD BANNER</Text>
          <Text style={{ color: COLORS.brandSubtext, fontSize: 12, marginTop: 6 }}>
            Sticky banner behavior will be implemented with scroll + header offset.
          </Text>
        </View>

        <Pressable
          onPress={() => navigation.navigate("Terms")}
          style={{ padding: 12, borderWidth: 1, borderColor: `${COLORS.brandText}33`, borderRadius: 12 }}
        >
          <Text style={{ color: COLORS.brandText, fontSize: 14, fontWeight: "600" }}>Terms of Service</Text>
        </Pressable>

        <Pressable
          onPress={() => navigation.navigate("Privacy")}
          style={{ padding: 12, borderWidth: 1, borderColor: `${COLORS.brandText}33`, borderRadius: 12 }}
        >
          <Text style={{ color: COLORS.brandText, fontSize: 14, fontWeight: "600" }}>Privacy Policy</Text>
        </Pressable>

        <Pressable style={{ padding: 12 }}>
          <Text style={{ color: COLORS.brandError, fontSize: 14, fontWeight: "700" }}>Logout</Text>
        </Pressable>
      </View>
    </View>
  );
}

