import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View, type LayoutChangeEvent } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { springTab } from "../lib/nativeAnimations";
import { haptic } from "../lib/nativeHaptics";
import { navMinimized, setNavMinimized } from "../lib/nativeNavScroll";
import { NativeGlassSurface } from "./NativeGlassSurface";
import { NativeNavIcon } from "./NativeNavIcons";
import { NativePressable } from "./motion/NativeMotion";
import {
  huddleColors,
  huddleLayout,
  huddleRadii,
  huddleShadows,
  huddleSpacing,
} from "../theme/huddleDesignTokens";

export type NativeBottomTab = "home" | "social" | "chats" | "service" | "map";

type NativeBottomNavProps = {
  activeTab: NativeBottomTab | null;
  careMarketIsActive?: boolean;
  chatUnreadCount?: number;
  friendRequestUnread?: boolean;
  /** A Star created a chat that is waiting to be opened. Gold, distinct from unread red. */
  newChatPending?: boolean;
  onNavigate: (path: string) => void;
  onReselect?: (tab: NativeBottomTab) => void;
};

const NAV_ITEMS: Array<{
  key: NativeBottomTab;
  label: string;
  path: string;
}> = [
  { key: "home", label: "Home", path: "/" },
  { key: "social", label: "Social", path: "/social" },
  { key: "chats", label: "Chats", path: "/chats?tab=friends" },
  { key: "service", label: "Care", path: "/service" },
  { key: "map", label: "Map", path: "/map" },
];

const CAPSULE_WIDTH = 72;
const CAPSULE_HEIGHT = 54;

export function NativeBottomNav({ activeTab, careMarketIsActive = false, chatUnreadCount = 0, friendRequestUnread = false, newChatPending = false, onNavigate, onReselect }: NativeBottomNavProps) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const [visualActiveTab, setVisualActiveTab] = useState(activeTab);
  const itemCenters = useRef<Record<NativeBottomTab, number>>({
    home: Number.NaN,
    social: Number.NaN,
    chats: Number.NaN,
    service: Number.NaN,
    map: Number.NaN,
  });
  const capsuleX = useSharedValue(0);
  const capsuleOpacity = useSharedValue(activeTab ? 1 : 0);

  const moveCapsuleTo = useCallback((tab: NativeBottomTab | null) => {
    if (!tab) {
      capsuleOpacity.value = reduceMotion ? 0 : withTiming(0, { duration: 120 });
      return;
    }
    const target = itemCenters.current[tab];
    if (!Number.isFinite(target)) return;
    if (reduceMotion) {
      capsuleX.value = target;
      capsuleOpacity.value = 1;
    } else {
      capsuleX.value = withTiming(target, { duration: 180 });
      capsuleOpacity.value = withTiming(1, { duration: 120 });
    }
  }, [capsuleOpacity, capsuleX, reduceMotion]);

  const handleItemLayout = (key: NativeBottomTab, event: LayoutChangeEvent) => {
    const { x, width } = event.nativeEvent.layout;
    itemCenters.current[key] = x + width / 2 - CAPSULE_WIDTH / 2;
    if (key === visualActiveTab) {
      capsuleX.value = itemCenters.current[key];
    }
  };

  useEffect(() => {
    setVisualActiveTab(activeTab);
    moveCapsuleTo(activeTab);
  }, [activeTab, moveCapsuleTo]);

  const capsuleStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: capsuleX.value }],
    opacity: capsuleOpacity.value,
  }));

  // Shrink/recede the whole pill on scroll-down (driven by navMinimized 0..1).
  const minimizeStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: 1 - navMinimized.value * 0.2 },
      { translateY: navMinimized.value * 14 },
    ],
    opacity: 1 - navMinimized.value * 0.06,
  }));

  // Always restore the nav to full size when switching tabs.
  useEffect(() => {
    setNavMinimized(false);
  }, [activeTab]);

  return (
    <View pointerEvents="box-none" style={[styles.wrapper, { bottom: Math.max(huddleSpacing.x2, insets.bottom + 8) }]}>
      <Animated.View style={minimizeStyle}>
        <NativeGlassSurface glassFillStyle={styles.glassFill} style={styles.nav}>
          <Animated.View pointerEvents="none" style={[styles.capsule, capsuleStyle]} />
          {NAV_ITEMS.filter((item) => item.key !== "service" || careMarketIsActive).map((item) => {
            const active = item.key === visualActiveTab;
            // Gold outranks red: a brand-new chat is the rarer, more specific signal.
            const showStarDot = item.key === "chats" && newChatPending === true;
            const showChatBadge = item.key === "chats" && !showStarDot && (chatUnreadCount > 0 || friendRequestUnread);
            return (
              <NativePressable
                accessibilityLabel={item.label}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                key={item.key}
                onLayout={(event) => handleItemLayout(item.key, event)}
                onPress={() => {
                  if (active) {
                    onReselect?.(item.key);
                  } else {
                    setVisualActiveTab(item.key);
                    moveCapsuleTo(item.key);
                    haptic.selectTab();
                    const path = item.key === "chats" && chatUnreadCount <= 0 && !friendRequestUnread && !newChatPending ? "/chats?tab=discover" : item.path;
                    onNavigate(path);
                  }
                }}
                style={({ pressed }) => [styles.item, pressed ? styles.itemPressed : null]}
              >
                <View style={styles.iconAnchor}>
                  <NativeNavIcon
                    color={active ? huddleColors.blue : huddleColors.mutedText}
                    size={24}
                    tab={item.key}
                  />
                  {showChatBadge ? (
                    <View accessibilityLabel="Unread chats" pointerEvents="none" style={styles.chatBadge} />
                  ) : null}
                  {showStarDot ? (
                    <View accessibilityLabel="New chat waiting" pointerEvents="none" style={[styles.chatBadge, styles.chatBadgeNew]} />
                  ) : null}
                </View>
              </NativePressable>
            );
          })}
        </NativeGlassSurface>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    right: huddleSpacing.x6,
    left: huddleSpacing.x6,
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
    paddingHorizontal: huddleSpacing.x4,
    borderRadius: huddleRadii.sheet,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.62)",
    backgroundColor: "transparent",
    overflow: "hidden",
    ...huddleShadows.glassElevation2,
  },
  glassFill: {
    borderRadius: huddleRadii.sheet,
  },
  capsule: {
    position: "absolute",
    left: 0,
    top: (huddleLayout.navHeight - CAPSULE_HEIGHT) / 2,
    width: CAPSULE_WIDTH,
    height: CAPSULE_HEIGHT,
    borderRadius: CAPSULE_HEIGHT / 2,
    backgroundColor: "rgba(33, 69, 207, 0.18)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255, 255, 255, 0.76)",
  },
  item: {
    flex: 1,
    minWidth: 58,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
    paddingVertical: huddleSpacing.x1,
  },
  itemPressed: {
    opacity: 0.6,
    transform: [{ scale: 0.92 }],
  },
  iconAnchor: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  chatBadgeNew: {
    backgroundColor: huddleColors.premiumGold,
    shadowColor: huddleColors.premiumGold,
    shadowOpacity: 0.55,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 0 },
    elevation: 3,
  },
  chatBadge: {
    position: "absolute",
    top: -4,
    right: -5,
    width: 9,
    height: 9,
    borderRadius: huddleRadii.pill,
    backgroundColor: huddleColors.validationRed,
  },
});
