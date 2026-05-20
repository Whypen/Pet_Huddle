import { useEffect, useRef } from "react";
import { Animated, Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { HText } from "./HText";
import { COLORS } from "../theme/tokens";

export type UpsellBannerState = {
  open: boolean;
  message: string;
  ctaLabel?: string;
  onCta?: () => void;
};

export function UpsellBanner({ state, onClose }: { state: UpsellBannerState; onClose: () => void }) {
  const y = useRef(new Animated.Value(24)).current;
  const o = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!state.open) return;
    Animated.parallel([
      Animated.timing(y, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(o, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();
  }, [o, state.open, y]);

  if (!state.open) return null;

  return (
    <Animated.View
      style={{
        position: "absolute",
        left: 8,
        right: 8,
        bottom: 84,
        transform: [{ translateY: y }],
        opacity: o,
        zIndex: 9999,
      }}
      pointerEvents="box-none"
    >
      <BlurView intensity={25} tint="light" style={{ borderRadius: 16, overflow: "hidden" }}>
        <View
          style={{
            borderWidth: 1,
            borderColor: COLORS.brandGold,
            backgroundColor: "rgba(255,255,255,0.92)",
            borderRadius: 16,
            padding: 12,
            flexDirection: "row",
            gap: 10,
          }}
        >
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 12,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: `${COLORS.brandGold}26`,
            }}
          >
            <Ionicons name="sparkles" size={18} color={COLORS.brandGold} />
          </View>

          <View style={{ flex: 1 }}>
            <HText variant="body" style={{ fontSize: 14, fontWeight: "800", color: COLORS.brandText }}>
              Upgrade for more!
            </HText>
            <HText variant="meta" style={{ marginTop: 2, color: "rgba(66,73,101,0.75)" }}>
              {state.message}
            </HText>
            {state.ctaLabel && state.onCta ? (
              <Pressable
                onPress={state.onCta}
                hitSlop={6}
                style={{
                  marginTop: 10,
                  backgroundColor: COLORS.brandBlue,
                  borderRadius: 12,
                  height: 36,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <HText variant="body" style={{ color: COLORS.white, fontWeight: "800", fontSize: 14 }}>
                  {state.ctaLabel}
                </HText>
              </Pressable>
            ) : null}
          </View>

          <Pressable onPress={onClose} hitSlop={6} style={{ padding: 6 }}>
            <Ionicons name="close" size={18} color="rgba(66,73,101,0.75)" />
          </Pressable>
        </View>
      </BlurView>
    </Animated.View>
  );
}

