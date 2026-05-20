import { useEffect, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { HText } from "../components/HText";
import { useAuth } from "../contexts/useAuth";
import { supabase } from "../lib/supabase";
import { COLORS } from "../theme/tokens";

type TabKey = "home" | "social" | "chats" | "service" | "map";
type DrawerView = "main" | "legal";

const NAV_ITEMS: Array<{ key: TabKey; label: string; icon: keyof typeof MaterialIcons.glyphMap }> = [
  { key: "home", label: "Home", icon: "home-filled" },
  { key: "social", label: "Social", icon: "groups" },
  { key: "chats", label: "Chats", icon: "chat-bubble" },
  { key: "service", label: "Service", icon: "pets" },
  { key: "map", label: "Map", icon: "place" },
];

const DRAWER_ROWS = [
  "Manage Membership",
  "Family Account",
  "Identity Verification",
  "Pet Carer Profile",
  "Account Settings",
  "Help & Support",
  "Legal Information",
] as const;

const LEGAL_ROWS = ["Privacy Policy", "Terms of Service", "Support"] as const;

function SurfaceCard({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <View
      style={{
        borderRadius: 28,
        backgroundColor: "#FAFAFD",
        borderWidth: 1,
        borderColor: "rgba(33,69,207,0.08)",
        padding: 24,
        gap: 12,
        shadowColor: "#2145CF",
        shadowOpacity: 0.08,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 12 },
      }}
    >
      <HText variant="heading" style={{ fontSize: 22, fontWeight: "800", lineHeight: 28 }}>
        {title}
      </HText>
      <HText variant="body" style={{ lineHeight: 24, color: "rgba(66,73,101,0.72)" }}>
        {body}
      </HText>
    </View>
  );
}

export function ShellScreen() {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<TabKey>("home");
  const [notifOpen, setNotifOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [drawerView, setDrawerView] = useState<DrawerView>("main");
  const [chatUnread, setChatUnread] = useState(0);
  const [logoutBusy, setLogoutBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!profile?.id) {
      setChatUnread(0);
      return;
    }

    const refreshUnread = async () => {
      const { data, error } = await supabase.rpc("get_chat_inbox_summaries", {
        p_scope: "all",
        p_chat_ids: null,
      });
      if (cancelled || error) return;
      const rows = Array.isArray(data) ? data as Array<{ unread_count?: number | null }> : [];
      const unread = rows.reduce((sum, row) => sum + Math.max(0, Number(row?.unread_count ?? 0)), 0);
      setChatUnread(unread);
    };

    const channel = supabase
      .channel(`native_shell_unread_${profile.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages" }, refreshUnread)
      .subscribe();

    void refreshUnread();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [profile?.id]);

  const displayName = useMemo(() => profile?.display_name?.trim() || "Your profile", [profile?.display_name]);

  const tabBody = useMemo(() => {
    switch (activeTab) {
      case "home":
        return {
          title: "The best way to begin is simply to explore.",
          body:
            "The shell is rebuilt natively. Home content parity is not claimed yet in this slice because the destination feature slices have not been rebuilt.",
        };
      case "social":
        return {
          title: "Social is not rebuilt yet.",
          body: "The Social destination remains outside this slice. It will be rebuilt in its own parity slice instead of being faked here.",
        };
      case "chats":
        return {
          title: "Chats is not rebuilt yet.",
          body: "Unread badge wiring is live in the shell, but chats surfaces themselves are still outside this slice.",
        };
      case "service":
        return {
          title: "Service is not rebuilt yet.",
          body: "Service and marketplace remain out of slice until their own native rebuild pass.",
        };
      case "map":
        return {
          title: "Map is not rebuilt yet.",
          body: "Map remains outside this shell slice and will be rebuilt natively later.",
        };
    }
  }, [activeTab]);

  const handleLogout = async () => {
    if (logoutBusy) return;
    setLogoutBusy(true);
    try {
      await supabase.auth.signOut();
    } finally {
      setLogoutBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.white }}>
      <View style={{ flex: 1, backgroundColor: COLORS.white }}>
        <View
          style={{
            height: 60,
            paddingHorizontal: 18,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottomWidth: 1,
            borderBottomColor: "rgba(33,69,207,0.08)",
          }}
        >
          <Pressable
            onPress={() => setNotifOpen(true)}
            hitSlop={12}
            style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}
          >
            <MaterialIcons name="notifications-none" size={24} color={COLORS.brandText} />
            {chatUnread > 0 ? (
              <View
                style={{
                  position: "absolute",
                  top: 8,
                  right: 6,
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: "#EF4444",
                }}
              />
            ) : null}
          </Pressable>

          <View style={{ alignItems: "center" }}>
            <HText variant="heading" style={{ fontSize: 18, fontWeight: "800" }}>
              huddle
            </HText>
          </View>

          <Pressable
            onPress={() => {
              setDrawerView("main");
              setSettingsOpen(true);
            }}
            hitSlop={12}
            style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}
          >
            <MaterialIcons name="settings" size={22} color={COLORS.brandText} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 120, gap: 18 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                borderWidth: 1,
                borderColor: "rgba(33,69,207,0.16)",
                backgroundColor: "rgba(33,69,207,0.06)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <HText variant="heading" style={{ color: COLORS.brandBlue, fontSize: 24, fontWeight: "800" }}>
                {displayName.charAt(0).toUpperCase()}
              </HText>
            </View>

            <View style={{ flex: 1 }}>
              <HText variant="heading" style={{ fontSize: 18, fontWeight: "800" }}>
                {displayName}
              </HText>
              <HText variant="body" style={{ color: "rgba(66,73,101,0.72)" }}>
                Animal Friend
              </HText>
            </View>
          </View>

          <SurfaceCard title={tabBody.title} body={tabBody.body} />

          <View
            style={{
              borderRadius: 24,
              borderWidth: 1,
              borderColor: "rgba(33,69,207,0.08)",
              padding: 18,
              gap: 10,
            }}
          >
            <HText variant="heading" style={{ fontSize: 18, fontWeight: "800" }}>
              Shell-owned links not claimed yet
            </HText>
            <HText variant="body" style={{ color: "rgba(66,73,101,0.72)", lineHeight: 22 }}>
              Manage Membership, Family Account, Identity Verification, Pet Carer Profile, Account Settings, Help & Support, and Legal Information are represented in the drawer structure but their destination slices are not rebuilt yet.
            </HText>
          </View>
        </ScrollView>

        <View
          style={{
            position: "absolute",
            left: 16,
            right: 16,
            bottom: 10,
            height: 72,
            borderRadius: 28,
            backgroundColor: "rgba(255,255,255,0.98)",
            borderWidth: 1,
            borderColor: "rgba(33,69,207,0.12)",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-around",
            paddingHorizontal: 6,
            shadowColor: "#2145CF",
            shadowOpacity: 0.08,
            shadowRadius: 18,
            shadowOffset: { width: 0, height: 10 },
          }}
        >
          {NAV_ITEMS.map((item) => {
            const active = item.key === activeTab;
            return (
              <Pressable
                key={item.key}
                onPress={() => setActiveTab(item.key)}
                style={{
                  minWidth: 56,
                  minHeight: 50,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 16,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: active ? "rgba(33,69,207,0.08)" : "transparent",
                }}
              >
                <MaterialIcons name={item.icon} size={20} color={active ? COLORS.brandBlue : "rgba(66,73,101,0.48)"} />
                {item.key === "chats" && chatUnread > 0 ? (
                  <View
                    style={{
                      position: "absolute",
                      top: 4,
                      right: 6,
                      width: 10,
                      height: 10,
                      borderRadius: 5,
                      backgroundColor: "#EF4444",
                    }}
                  />
                ) : null}
                <HText
                  variant="meta"
                  style={{
                    marginTop: 2,
                    fontSize: 10,
                    color: active ? COLORS.brandBlue : "rgba(66,73,101,0.48)",
                  }}
                >
                  {item.label}
                </HText>
              </Pressable>
            );
          })}
        </View>

        <Modal visible={notifOpen} animationType="slide" transparent onRequestClose={() => setNotifOpen(false)}>
          <View style={{ flex: 1, backgroundColor: "rgba(20,25,40,0.28)", justifyContent: "flex-start" }}>
            <View
              style={{
                marginTop: 56,
                backgroundColor: COLORS.white,
                borderTopRightRadius: 26,
                borderBottomRightRadius: 26,
                width: "86%",
                padding: 20,
                minHeight: "78%",
                gap: 18,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <HText variant="heading" style={{ fontSize: 18, fontWeight: "800" }}>
                  Notifications
                </HText>
                <Pressable onPress={() => setNotifOpen(false)} hitSlop={12}>
                  <MaterialIcons name="close" size={22} color={COLORS.brandText} />
                </Pressable>
              </View>
              <SurfaceCard
                title="Notifications drawer rebuilt natively"
                body="Unread chat badge wiring is live. Notification history rows and click-through targets remain for a later slice so they are not faked here."
              />
            </View>
          </View>
        </Modal>

        <Modal visible={settingsOpen} animationType="slide" transparent onRequestClose={() => setSettingsOpen(false)}>
          <View style={{ flex: 1, backgroundColor: "rgba(20,25,40,0.28)", justifyContent: "flex-start", alignItems: "flex-end" }}>
            <View
              style={{
                marginTop: 56,
                backgroundColor: COLORS.white,
                borderTopLeftRadius: 26,
                borderBottomLeftRadius: 26,
                width: "86%",
                padding: 20,
                minHeight: "78%",
                gap: 14,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <HText variant="heading" style={{ fontSize: 18, fontWeight: "800" }}>
                  {drawerView === "main" ? "Settings" : "Legal Information"}
                </HText>
                <Pressable onPress={() => setSettingsOpen(false)} hitSlop={12}>
                  <MaterialIcons name="close" size={22} color={COLORS.brandText} />
                </Pressable>
              </View>

              {drawerView === "main" ? (
                <>
                  {DRAWER_ROWS.map((label) => (
                    <Pressable
                      key={label}
                      onPress={() => {
                        if (label === "Legal Information") {
                          setDrawerView("legal");
                        }
                      }}
                      style={{
                        minHeight: 56,
                        borderRadius: 18,
                        borderWidth: 1,
                        borderColor: "rgba(33,69,207,0.10)",
                        paddingHorizontal: 16,
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        opacity: label === "Legal Information" ? 1 : 0.72,
                      }}
                    >
                      <HText variant="body" style={{ fontWeight: "700" }}>
                        {label}
                      </HText>
                      {label === "Legal Information" ? (
                        <MaterialIcons name="chevron-right" size={22} color={COLORS.brandText} />
                      ) : (
                        <HText variant="meta" style={{ fontSize: 11, color: "rgba(66,73,101,0.52)" }}>
                          Pending next slice
                        </HText>
                      )}
                    </Pressable>
                  ))}
                </>
              ) : (
                <>
                  <Pressable
                    onPress={() => setDrawerView("main")}
                    style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}
                  >
                    <MaterialIcons name="chevron-left" size={20} color={COLORS.brandText} />
                    <HText variant="body" style={{ fontWeight: "700" }}>
                      Back
                    </HText>
                  </Pressable>
                  {LEGAL_ROWS.map((label) => (
                    <View
                      key={label}
                      style={{
                        minHeight: 56,
                        borderRadius: 18,
                        borderWidth: 1,
                        borderColor: "rgba(33,69,207,0.10)",
                        paddingHorizontal: 16,
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        opacity: 0.72,
                      }}
                    >
                      <HText variant="body" style={{ fontWeight: "700" }}>
                        {label}
                      </HText>
                      <HText variant="meta" style={{ fontSize: 11, color: "rgba(66,73,101,0.52)" }}>
                        Pending next slice
                      </HText>
                    </View>
                  ))}
                </>
              )}

              <Pressable
                onPress={() => {
                  setSettingsOpen(false);
                  void handleLogout();
                }}
                style={{
                  marginTop: "auto",
                  minHeight: 54,
                  borderRadius: 18,
                  backgroundColor: "rgba(239,68,68,0.10)",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <HText variant="body" style={{ color: "#E84545", fontWeight: "800" }}>
                  {logoutBusy ? "Signing out..." : "Log Out"}
                </HText>
              </Pressable>
            </View>
          </View>
        </Modal>
      </View>
    </SafeAreaView>
  );
}
