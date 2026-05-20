import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { BlurView } from "@react-native-community/blur";
import { useEffect, useRef } from "react";
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { springTab } from "../lib/nativeAnimations";
import { haptic } from "../lib/nativeHaptics";
import {
  huddleColors,
  huddleLayout,
  huddleRadii,
  huddleShadows,
  huddleSpacing,
  huddleType,
} from "../theme/huddleDesignTokens";

export type NativeBottomTab = "home" | "social" | "chats" | "service" | "map";

type NativeBottomNavProps = {
  activeTab: NativeBottomTab | null;
  chatUnreadCount?: number;
  onNavigate: (path: string) => void;
  onReselect?: (tab: NativeBottomTab) => void;
};

const NAV_ITEMS: Array<{
  key: NativeBottomTab;
  label: string;
  path: string;
  icon: keyof typeof Feather.glyphMap;
  materialIcon?: keyof typeof MaterialCommunityIcons.glyphMap;
}> = [
  { key: "home", label: "Home", path: "/", icon: "home" },
  { key: "social", label: "Social", path: "/social", icon: "message-circle" },
  { key: "chats", label: "Chats", path: "/chats", icon: "users" },
  { key: "service", label: "Care", path: "/service", icon: "heart" },
  { key: "map", label: "Map", path: "/map", icon: "map-pin" },
];

const INDICATOR_WIDTH = 20;
const INDICATOR_HEIGHT = 3;

export function NativeBottomNav({ activeTab, chatUnreadCount = 0, onNavigate, onReselect }: NativeBottomNavProps) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const itemCenters = useRef<Record<NativeBottomTab, number>>({
    home: 0,
    social: 0,
    chats: 0,
    service: 0,
    map: 0,
  });
  const indicatorX = useSharedValue(0);
  const indicatorOpacity = useSharedValue(activeTab ? 1 : 0);

  const handleItemLayout = (key: NativeBottomTab, event: LayoutChangeEvent) => {
    const { x, width } = event.nativeEvent.layout;
    itemCenters.current[key] = x + width / 2 - INDICATOR_WIDTH / 2;
    if (key === activeTab) {
      indicatorX.value = itemCenters.current[key];
    }
  };

  useEffect(() => {
    if (!activeTab) {
      indicatorOpacity.value = reduceMotion ? 0 : withSpring(0, springTab);
      return;
    }
    const target = itemCenters.current[activeTab];
    if (typeof target !== "number" || target === 0) return;
    if (reduceMotion) {
      indicatorX.value = target;
      indicatorOpacity.value = 1;
    } else {
      indicatorX.value = withSpring(target, springTab);
      indicatorOpacity.value = withSpring(1, springTab);
    }
  }, [activeTab, reduceMotion, indicatorX, indicatorOpacity]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
    opacity: indicatorOpacity.value,
  }));

  return (
    <View pointerEvents="box-none" style={[styles.wrapper, { bottom: Math.max(huddleSpacing.x2, insets.bottom + 8) }]}>
      <View style={styles.nav}>
        <BlurView
          blurAmount={20}
          blurType="light"
          pointerEvents="none"
          reducedTransparencyFallbackColor="rgba(255,255,255,0.88)"
          style={StyleSheet.absoluteFill}
        />
        <View pointerEvents="none" style={styles.glassTint} />
        {NAV_ITEMS.map((item) => {
          const active = item.key === activeTab;
          const showChatBadge = item.key === "chats" && chatUnreadCount > 0;
          return (
            <Pressable
              accessibilityLabel={item.label}
              accessibilityState={{ selected: active }}
              key={item.key}
              onLayout={(event) => handleItemLayout(item.key, event)}
              onPress={() => {
                if (active) {
                  onReselect?.(item.key);
                } else {
                  haptic.selectTab();
                  onNavigate(item.path);
                }
              }}
              style={styles.item}
            >
              {item.materialIcon ? (
                <MaterialCommunityIcons
                  color={active ? huddleColors.blue : huddleColors.mutedText}
                  name={item.materialIcon}
                  size={22}
                />
              ) : (
                <Feather color={active ? huddleColors.blue : huddleColors.mutedText} name={item.icon} size={22} />
              )}
              <Text maxFontSizeMultiplier={1.1} numberOfLines={1} style={[styles.label, active && styles.labelActive]}>
                {item.label}
              </Text>
              {showChatBadge ? (
                <View accessibilityLabel="Unread chats" pointerEvents="none" style={styles.chatBadge} />
              ) : null}
            </Pressable>
          );
        })}
        <Animated.View pointerEvents="none" style={[styles.indicator, indicatorStyle]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    right: huddleSpacing.x4,
    left: huddleSpacing.x4,
    zIndex: 18,
  },
  nav: {
    height: huddleLayout.navHeight,
    maxWidth: 430,
    alignSelf: "center",
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingHorizontal: huddleSpacing.x2,
    borderRadius: huddleRadii.sheet,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.50)",
    backgroundColor: "transparent",
    overflow: "hidden",
    ...huddleShadows.glassElevation2,
  },
  glassTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255, 255, 255, 0.68)",
  },
  item: {
    minWidth: 58,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: huddleSpacing.x1,
  },
  chatBadge: {
    position: "absolute",
    top: 7,
    right: 11,
    width: 9,
    height: 9,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: huddleRadii.pill,
    backgroundColor: huddleColors.validationRed,
  },
  label: {
    fontFamily: "Urbanist-600",
    fontSize: huddleType.meta,
    lineHeight: 12,
    color: huddleColors.mutedText,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  labelActive: {
    color: huddleColors.blue,
  },
  indicator: {
    position: "absolute",
    left: 0,
    bottom: huddleSpacing.x1,
    width: INDICATOR_WIDTH,
    height: INDICATOR_HEIGHT,
    borderRadius: 2,
    backgroundColor: huddleColors.blue,
  },
});
