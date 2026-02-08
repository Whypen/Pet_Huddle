import { LayoutAnimation, Platform, Pressable, ScrollView, UIManager, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Header } from "../components/Header";
import { COLORS, LAYOUT, TYPO } from "../theme/tokens";
import type { RootStackParamList } from "../navigation/types";
import { PremiumGoldBanner } from "../components/PremiumGoldBanner";
import { HText } from "../components/HText";
import { useState } from "react";
import { useAuth } from "../contexts/useAuth";
import { UserAvatar } from "../components/UserAvatar";
import { supabase } from "../lib/supabase";
import { Ionicons } from "@expo/vector-icons";

export function SettingsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { profile } = useAuth();
  const [legalOpen, setLegalOpen] = useState(false);

  if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.white }}>
      <Header />

      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <View style={{ paddingHorizontal: LAYOUT.sectionPaddingH, paddingVertical: LAYOUT.sectionPaddingV, gap: 8 }}>
          {/* Next to Avatar: name + verification badge (gold rim if verified, gray if pending) */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 4 }}>
            <UserAvatar verificationStatus={profile?.verification_status ?? "Pending"} showCarBadge size={56} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <HText variant="heading" style={{ fontSize: 16, fontWeight: "800", color: COLORS.brandText, flexShrink: 1 }} numberOfLines={1}>
                  {profile?.display_name ?? "User"}
                </HText>
                <View
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 999,
                    borderWidth: 2,
                    borderColor: (profile?.verification_status ?? "").toLowerCase() === "approved" ? COLORS.brandGold : "rgba(66,73,101,0.35)",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons
                    name={(profile?.verification_status ?? "").toLowerCase() === "approved" ? "checkmark" : "time-outline"}
                    size={12}
                    color={(profile?.verification_status ?? "").toLowerCase() === "approved" ? COLORS.brandGold : "rgba(66,73,101,0.65)"}
                  />
                </View>
              </View>
            </View>
          </View>

          {/* Premium/Gold blocks between avatar and profile actions; squeeze within width */}
          <PremiumGoldBanner
            onSelect={(id) => {
              navigation.navigate("RootTabs", { screen: "Premium", params: { initialTab: id === "gold" ? "Gold" : "Premium" } });
            }}
          />

          <Pressable
            onPress={() => navigation.navigate("UserProfile")}
            style={({ pressed }) => ({
              height: LAYOUT.rowHeight,
              minHeight: 44,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: `${COLORS.brandText}1F`,
              paddingHorizontal: 14,
              justifyContent: "center",
              backgroundColor: pressed ? "rgba(33,69,207,0.04)" : COLORS.white,
              marginBottom: 4,
            })}
          >
            <HText variant="body" style={{ fontWeight: "700" }}>
              Edit User Profile
            </HText>
          </Pressable>

          <Pressable
            onPress={() => navigation.navigate("AccountSettings")}
            style={({ pressed }) => ({
              height: LAYOUT.rowHeight,
              minHeight: 44,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: `${COLORS.brandText}1F`,
              paddingHorizontal: 14,
              justifyContent: "center",
              backgroundColor: pressed ? "rgba(33,69,207,0.04)" : COLORS.white,
              marginBottom: 4,
            })}
          >
            <HText variant="body" style={{ fontWeight: "700" }}>
              Account Setting
            </HText>
          </Pressable>

          <Pressable
            onPress={() => navigation.navigate("RootTabs", { screen: "Premium" })}
            style={({ pressed }) => ({
              height: LAYOUT.rowHeight,
              minHeight: 44,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: `${COLORS.brandGold}66`,
              paddingHorizontal: 14,
              justifyContent: "center",
              backgroundColor: pressed ? "rgba(207,171,33,0.08)" : COLORS.white,
              marginBottom: 4,
            })}
          >
            <HText variant="body" style={{ fontWeight: "800" }}>
              Manage Subscription
            </HText>
          </Pressable>

          {/* UAT: Legal Information collapsible accordion */}
          <Pressable
            onPress={() => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setLegalOpen((v) => !v);
            }}
            style={({ pressed }) => ({
              height: LAYOUT.rowHeight,
              minHeight: 44,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: `${COLORS.brandText}1F`,
              paddingHorizontal: 14,
              justifyContent: "center",
              backgroundColor: pressed ? "rgba(33,69,207,0.04)" : COLORS.white,
              marginBottom: 4,
            })}
          >
            <HText variant="body" style={{ fontWeight: "700" }}>
              Legal Information {legalOpen ? "▲" : "▼"}
            </HText>
          </Pressable>
          {legalOpen ? (
            <View style={{ gap: 8, marginBottom: 8 }}>
              <Pressable
                onPress={() => navigation.navigate("Terms")}
                style={({ pressed }) => ({
                  height: LAYOUT.rowHeight,
                  minHeight: 44,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: `${COLORS.brandText}1F`,
                  paddingHorizontal: 14,
                  justifyContent: "center",
                  backgroundColor: pressed ? "rgba(33,69,207,0.04)" : COLORS.white,
                })}
              >
                <HText variant="body" style={{ fontWeight: "600" }}>
                  Terms of Service
                </HText>
              </Pressable>
              <Pressable
                onPress={() => navigation.navigate("Privacy")}
                style={({ pressed }) => ({
                  height: LAYOUT.rowHeight,
                  minHeight: 44,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: `${COLORS.brandText}1F`,
                  paddingHorizontal: 14,
                  justifyContent: "center",
                  backgroundColor: pressed ? "rgba(33,69,207,0.04)" : COLORS.white,
                })}
              >
                <HText variant="body" style={{ fontWeight: "600" }}>
                  Privacy Policy
                </HText>
              </Pressable>
            </View>
          ) : null}

          <Pressable
            onPress={() => {}}
            style={({ pressed }) => ({
              height: LAYOUT.rowHeight,
              minHeight: 44,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: `${COLORS.brandText}1F`,
              paddingHorizontal: 14,
              justifyContent: "center",
              backgroundColor: pressed ? "rgba(33,69,207,0.04)" : COLORS.white,
              marginBottom: 4,
            })}
          >
            <HText variant="body" style={{ fontWeight: "600" }}>
              Contact Support
            </HText>
          </Pressable>

          {/* UAT: Logout red on press; pinned at bottom via scroll layout */}
          <Pressable
            onPress={async () => {
              await supabase.auth.signOut();
            }}
            style={({ pressed }) => ({
              height: LAYOUT.rowHeight,
              minHeight: 44,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: `${COLORS.brandError}55`,
              paddingHorizontal: 14,
              justifyContent: "center",
              backgroundColor: pressed ? "rgba(239,68,68,0.08)" : COLORS.white,
              marginTop: 8,
            })}
          >
            <HText variant="body" style={{ color: COLORS.brandError, fontWeight: "800" }}>
              Logout
            </HText>
          </Pressable>

          {/* UAT: remove version string */}
        </View>
      </ScrollView>
    </View>
  );
}
