import { Feather } from "@expo/vector-icons";
import { Image, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  huddleColors,
  huddleLayout,
  huddleNativeChrome,
  huddleRadii,
  huddleSpacing,
} from "../theme/huddleDesignTokens";
import huddleNameLogo from "../../assets/huddle-full-logo-header.png";
import { NativePressable } from "./motion/NativeMotion";

const HEADER_LOGO_WIDTH = 116;
const HEADER_LOGO_HEIGHT = 28;
const headerLogoAsset = Image.resolveAssetSource(huddleNameLogo);

type NativeGlobalHeaderProps = {
  notificationCount: number;
  onNotificationsPress: () => void;
  onSettingsPress: () => void;
  onLogoPress: () => void;
  showSettings?: boolean;
  /** Reports the header's actual rendered height so screens can reserve exactly that much space, not a guess. */
  onHeightChange?: (height: number) => void;
};

export function NativeGlobalHeader({
  notificationCount,
  onNotificationsPress,
  onSettingsPress,
  onLogoPress,
  showSettings = true,
  onHeightChange,
}: NativeGlobalHeaderProps) {
  const hasUnread = notificationCount > 0;
  const insets = useSafeAreaInsets();
  const headerLogoUri = headerLogoAsset?.uri ?? null;

  return (
    <View pointerEvents="box-none" style={styles.wrapper}>
      <View
        style={[styles.header, { paddingTop: insets.top + huddleSpacing.x2 }]}
        onLayout={(event) => onHeightChange?.(event.nativeEvent.layout.height)}
      >
        <NativePressable accessibilityLabel="Notifications" hapticIntent="selectTab" onPress={onNotificationsPress} style={styles.iconButton}>
          <View style={styles.notificationIconWrap}>
            <Feather color={huddleColors.iconMuted} name="bell" size={21} />
            {hasUnread ? (
              <View accessibilityLabel={`${notificationCount} unread notifications`} style={styles.badge}>
                <Text maxFontSizeMultiplier={1.1} numberOfLines={1} style={styles.badgeText}>
                  {notificationCount > 9 ? "9+" : notificationCount}
                </Text>
              </View>
            ) : null}
          </View>
        </NativePressable>

        <View pointerEvents="box-none" style={[styles.logoLayer, { paddingTop: insets.top + huddleSpacing.x2, paddingBottom: huddleSpacing.x2 }]}>
          <NativePressable accessibilityLabel="huddle Home" hapticIntent="selectTab" onPress={onLogoPress} pressScale={0.98} style={styles.logoButton}>
            <Image resizeMode="contain" source={headerLogoUri ? { uri: headerLogoUri } : huddleNameLogo} style={styles.logo} />
          </NativePressable>
        </View>

        {showSettings ? (
          <NativePressable accessibilityLabel="Settings" hapticIntent="selectTab" onPress={onSettingsPress} style={styles.iconButton}>
            <Feather color={huddleColors.iconMuted} name="settings" size={21} />
          </NativePressable>
        ) : (
          <View style={styles.iconButtonPlaceholder} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    top: 0,
    right: 0,
    left: 0,
    zIndex: huddleNativeChrome.headerZIndex,
  },
  header: {
    minHeight: huddleLayout.headerHeight + huddleSpacing.x6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: huddleSpacing.x3,
    paddingHorizontal: huddleSpacing.x4,
    paddingBottom: huddleSpacing.x2,
    backgroundColor: huddleColors.canvas,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: huddleColors.divider,
  },
  iconButtonPlaceholder: {
    width: huddleNativeChrome.headerSideSlot,
    height: huddleNativeChrome.headerSideSlot,
  },
  iconButton: {
    width: huddleNativeChrome.headerSideSlot,
    height: huddleNativeChrome.headerSideSlot,
    borderRadius: huddleRadii.card,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: huddleColors.glassControl,
  },
  logoLayer: {
    backgroundColor: "transparent",
    position: "absolute",
    top: 0,
    bottom: 0,
    right: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  logoButton: {
    backgroundColor: "transparent",
    width: 160,
    height: huddleLayout.headerHeight,
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    backgroundColor: "transparent",
    width: HEADER_LOGO_WIDTH,
    height: HEADER_LOGO_HEIGHT,
  },
  notificationIconWrap: {
    width: 21,
    height: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: -6,
    right: -7,
    minWidth: 15,
    height: 15,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
    backgroundColor: huddleColors.validationRed,
    borderWidth: 1.5,
    borderColor: huddleColors.canvas,
  },
  badgeText: {
    fontFamily: "Urbanist-700",
    fontSize: 8,
    lineHeight: 10,
    color: huddleColors.onPrimary,
  },
});
