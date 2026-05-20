import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Header } from "../components/Header";
import { HText } from "../components/HText";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/useAuth";
import { COLORS } from "../theme/tokens";

type NotificationRow = {
  id: string;
  message: string;
  type: string;
  read: boolean;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

function timeLabel(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString([], { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function NotificationsScreen() {
  const { user } = useAuth();
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);

  const unread = useMemo(() => rows.filter((r) => !r.read).length, [rows]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      const res = await supabase
        .from("notifications")
        .select("id,message,type,read,created_at,metadata")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(200);
      if (cancelled) return;
      setRows((res.data ?? []) as NotificationRow[]);
      setLoading(false);
    };

    const channel = supabase
      .channel(`notifications_mobile:${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => void load()
      )
      .subscribe();

    void load();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user]);

  const markOneRead = async (id: string) => {
    if (!user) return;
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, read: true } : r)));
    await supabase.from("notifications").update({ read: true }).eq("id", id).eq("user_id", user.id);
  };

  const markAllRead = async () => {
    if (!user || unread === 0) return;
    setRows((prev) => prev.map((r) => ({ ...r, read: true })));
    await supabase.from("notifications").update({ read: true }).eq("user_id", user.id).eq("read", false);
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.white }}>
      <Header showBack />

      <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <HText variant="heading" style={{ fontSize: 18, fontWeight: "900" }}>
            Notifications
          </HText>
          <Pressable
            onPress={() => void markAllRead()}
            hitSlop={4}
            disabled={unread === 0}
            style={({ pressed }) => ({
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: `${COLORS.brandText}33`,
              opacity: unread === 0 ? 0.4 : pressed ? 0.8 : 1,
            })}
          >
            <HText variant="meta" style={{ fontWeight: "900" }}>
              Mark all read
            </HText>
          </Pressable>
        </View>
        <HText variant="meta" style={{ color: "rgba(66,73,101,0.7)", marginTop: 6 }}>
          Alerts and admin notices show up here in real time.
        </HText>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, gap: 10 }}>
        {loading ? (
          <HText variant="body" style={{ color: "rgba(66,73,101,0.7)" }}>
            Loading...
          </HText>
        ) : rows.length === 0 ? (
          <HText variant="body" style={{ color: "rgba(66,73,101,0.7)" }}>
            No notifications yet.
          </HText>
        ) : (
          rows.map((r) => (
            <Pressable
              key={r.id}
              onPress={() => void markOneRead(r.id)}
              hitSlop={4}
              style={({ pressed }) => ({
                borderRadius: 16,
                borderWidth: 1,
                borderColor: r.read ? `${COLORS.brandText}22` : "rgba(33,69,207,0.30)",
                backgroundColor: r.read ? "rgba(66,73,101,0.03)" : "rgba(33,69,207,0.06)",
                padding: 12,
                opacity: pressed ? 0.9 : 1,
              })}
            >
              <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                <HText variant="body" style={{ fontWeight: "900", flex: 1 }}>
                  {r.message}
                </HText>
                <HText variant="meta" style={{ color: "rgba(66,73,101,0.6)" }}>
                  {timeLabel(r.created_at)}
                </HText>
              </View>
              <HText variant="meta" style={{ color: "rgba(66,73,101,0.6)", marginTop: 6 }}>
                {String(r.type || "alert").toUpperCase()}
                {!r.read ? <HText variant="meta" style={{ color: COLORS.brandError, fontWeight: "900" }}>  NEW</HText> : null}
              </HText>
            </Pressable>
          ))
        )}
      </ScrollView>
    </View>
  );
}

