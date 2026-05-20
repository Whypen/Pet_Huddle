import { ScrollView, Text, View } from "react-native";
import { Header } from "../components/Header";
import { COLORS, LAYOUT } from "../theme/tokens";
import { PRIVACY_TEXT } from "../legal/privacy";

export function PrivacyScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: COLORS.white }}>
      <Header showBack />
      <ScrollView contentContainerStyle={{ padding: LAYOUT.sectionPaddingH }}>
        <Text style={{ color: COLORS.brandText, fontSize: 16, fontWeight: "800", marginBottom: 12 }}>
          Privacy Policy
        </Text>
        <Text style={{ color: COLORS.brandText, fontSize: 12, lineHeight: 18 }}>{PRIVACY_TEXT}</Text>
      </ScrollView>
    </View>
  );
}

