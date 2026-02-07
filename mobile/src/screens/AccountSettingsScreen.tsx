import { Alert, LayoutAnimation, Platform, Pressable, ScrollView, UIManager, View } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import { Header } from "../components/Header";
import { HText } from "../components/HText";
import { COLORS, LAYOUT } from "../theme/tokens";
import { useAuth } from "../contexts/useAuth";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function statusColors(status: string | null | undefined) {
  if (status === "Verified") return { bg: "rgba(207,171,33,0.18)", fg: COLORS.brandGold, border: "rgba(207,171,33,0.45)" };
  if (status === "Rejected") return { bg: "rgba(239,68,68,0.14)", fg: COLORS.brandError, border: "rgba(239,68,68,0.45)" };
  return { bg: "rgba(66,73,101,0.10)", fg: "rgba(66,73,101,0.75)", border: "rgba(66,73,101,0.25)" };
}

export function AccountSettingsScreen() {
  const { profile } = useAuth();
  const s = statusColors(profile?.verification_status);

  const onBiometric = async () => {
    const has = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    if (!has || !enrolled) {
      Alert.alert("Biometrics unavailable", "Enable Face ID / Touch ID in system settings first.");
      return;
    }
    Alert.alert("Biometric Login", "Biometrics are available on this device.");
  };

  const Item = ({ title, right, onPress, disabled }: { title: string; right?: React.ReactNode; onPress?: () => void; disabled?: boolean }) => (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={4}
      style={({ pressed }) => ({
        height: LAYOUT.rowHeight,
        minHeight: 44,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: `${COLORS.brandText}1F`,
        paddingHorizontal: 14,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: pressed ? "rgba(33,69,207,0.04)" : COLORS.white,
        opacity: disabled ? 0.5 : 1,
      })}
    >
      <HText variant="body" style={{ fontWeight: "600" }}>
        {title}
      </HText>
      {right}
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.white }}>
      <Header showBack />
      <ScrollView contentContainerStyle={{ padding: LAYOUT.sectionPaddingH, gap: 8 }}>
        {/* UAT: Remove Account Info section. */}
        <HText variant="heading" style={{ fontSize: 16, fontWeight: "800", marginTop: 4 }}>
          Account Security
        </HText>

        <Item
          title="Identity Verification"
          right={
            <View style={{ backgroundColor: s.bg, borderColor: s.border, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 }}>
              <HText variant="meta" style={{ color: s.fg, fontWeight: "800" }}>
                {profile?.verification_status ?? "Pending"}
              </HText>
            </View>
          }
          onPress={() => Alert.alert("Identity Verification", "Flow is wired in the full onboarding spec; status reflects profile.verification_status.")}
        />

        <Item title="Personal Info >" onPress={() => Alert.alert("Personal Info", "Open User Profile screen from Settings > Profiles")} />
        <Item title="Password >" onPress={() => Alert.alert("Password", "Password reset can be triggered via Supabase auth flows.")} />

        <Item
          title="Family"
          onPress={() => Alert.alert("Family", "Invite is gated by tier in the full spec. Tap Premium to upgrade.")}
        />

        <Item title="Biometric Login" onPress={onBiometric} />

        {/* UAT: Remove 2FA / Hide from Map / Notifications / Manage Subscription / Deactivate. */}
        <HText variant="meta" style={{ color: COLORS.brandSubtext, marginTop: 8 }}>
          Help & Support is moved to the main navigation (Settings tab).
        </HText>
      </ScrollView>
    </View>
  );
}
