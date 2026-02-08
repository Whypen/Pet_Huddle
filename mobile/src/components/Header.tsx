import { Image, Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useState } from "react";
import { COLORS } from "../theme/tokens";
import { BackButton } from "./BackButton";
import huddleLogo from "../../assets/huddle-logo.png";
import { useAuth } from "../contexts/useAuth";
import { supabase } from "../lib/supabase";
import type { RootStackParamList } from "../navigation/types";

type Props = {
  showBack?: boolean;
};

export function Header({ showBack }: Props) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user) {
      setUnreadCount(0);
      return;
    }
    let cancelled = false;

    const refresh = async () => {
      const res = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("read", false);
      if (cancelled) return;
      setUnreadCount(res.count ?? 0);
    };

    const channel = supabase
      .channel(`notifications_header:${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => void refresh()
      )
      .subscribe();

    void refresh();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user]);

  return (
    <View className="h-12 flex-row items-center px-4 border-b border-brandText/10 bg-white">
      {/* Contract override: center logo only (no left wordmark). */}
      <View className="w-11 h-11 justify-center">{showBack ? <BackButton /> : null}</View>

      <View className="absolute left-0 right-0 items-center">
        <Image
          source={huddleLogo}
          style={{ width: 120, height: 28 }}
          resizeMode="contain"
          accessibilityLabel="Huddle logo"
        />
      </View>

      {/* Right: bell (Notification Hub) */}
      <View className="w-11 h-11 items-end justify-center">
        <Pressable
          onPress={() => navigation.navigate("Notifications")}
          hitSlop={4}
          style={({ pressed }) => ({ padding: 8, opacity: pressed ? 0.7 : 1 })}
        >
          <View>
            <Ionicons name="notifications-outline" size={22} color="rgba(66,73,101,0.75)" />
            {unreadCount > 0 ? (
              <View
                style={{
                  position: "absolute",
                  top: 2,
                  right: 2,
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: COLORS.brandError,
                }}
              />
            ) : null}
          </View>
        </Pressable>
      </View>
    </View>
  );
}
