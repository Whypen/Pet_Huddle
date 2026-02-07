import { ScrollView, Text, View } from "react-native";
import { Header } from "../components/Header";
import { COLORS, LAYOUT } from "../theme/tokens";
import { TERMS_TEXT } from "../legal/terms";

export function TermsScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: COLORS.white }}>
      <Header showBack />
      <ScrollView contentContainerStyle={{ padding: LAYOUT.sectionPaddingH }}>
        <Text style={{ color: COLORS.brandText, fontSize: 16, fontWeight: "800", marginBottom: 12 }}>
          Terms of Service
        </Text>
        <Text style={{ color: COLORS.brandText, fontSize: 12, lineHeight: 18 }}>{TERMS_TEXT}</Text>
      </ScrollView>
    </View>
  );
}

