import { Text, View } from "react-native";
import { Header } from "../components/Header";
import { COLORS, LAYOUT, TYPO } from "../theme/tokens";

export function HomeScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: COLORS.white }}>
      <Header />
      <View
        style={{
          paddingHorizontal: LAYOUT.sectionPaddingH,
          paddingVertical: LAYOUT.sectionPaddingV,
        }}
      >
        <Text style={{ color: COLORS.brandText, fontSize: TYPO.headingSize, fontWeight: "600" }}>
          Pet Dashboard
        </Text>
        <Text style={{ color: COLORS.brandSubtext, fontSize: 12, marginTop: 6 }}>
          This screen will be ported from the web dashboard with the same Add Pet and Edit Pet Profile form component.
        </Text>
      </View>
    </View>
  );
}

