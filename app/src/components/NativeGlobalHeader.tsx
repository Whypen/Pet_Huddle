import { Feather } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  huddleColors,
  huddleLayout,
  huddleNativeChrome,
  huddleRadii,
  huddleSpacing,
} from "../theme/huddleDesignTokens";
import huddleNameLogo from "../../assets/huddle-full-logo-header.png";

const HEADER_LOGO_WIDTH = 116;
const HEADER_LOGO_HEIGHT = 28;
const headerLogoAsset = Image.resolveAssetSource(huddleNameLogo);

type NativeGlobalHeaderProps = {
  notificationCount: number;
  onNotificationsPress: () => void;
  onSettingsPress: () => void;
  onLogoPress: () => void;
  showSettings?: boolean;
};

export function NativeGlobalHeader({
  notificationCount,
  onNotificationsPress,
  onSettingsPress,
  onLogoPress,
  showSettings = true,
}: NativeGlobalHeaderProps) {
  const hasUnread = notificationCount > 0;
  const insets = useSafeAreaInsets();
  const [headerLogoUri, setHeaderLogoUri] = useState<string | null>(headerLogoAsset?.uri ?? null);

  useEffect(() => {
    let active = true;
    const uri = headerLogoAsset?.uri;
    if (!uri) return () => {
      active = false;
    };

    void Image.prefetch(uri).then((ok) => {
      if (active && ok) setHeaderLogoUri(uri);
    }).catch(() => {
      if (active) setHeaderLogoUri(uri);
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <View pointerEvents="box-none" style={styles.wrapper}>
      <View style={[styles.header, { paddingTop: insets.top + huddleSpacing.x2 }]}>
        <Pressable accessibilityLabel="Notifications" onPress={onNotificationsPress} style={styles.iconButton}>
          <Feather color={huddleColors.iconMuted} name="bell" size={21} />
          {hasUnread ? (
            <View accessibilityLabel={`${notificationCount} unread notifications`} style={styles.badge}>
              <Text maxFontSizeMultiplier={1.1} numberOfLines={1} style={styles.badgeText}>
                {notificationCount > 9 ? "9+" : notificationCount}
              </Text>
            </View>
          ) : null}
        </Pressable>

        <View pointerEvents="box-none" style={[styles.logoLayer, { paddingTop: insets.top + huddleSpacing.x2, paddingBottom: huddleSpacing.x2 }]}>
          <Pressable accessibilityLabel="huddle Home" onPress={onLogoPress} style={styles.logoButton}>
            <Image resizeMode="contain" source={headerLogoUri ? { uri: headerLogoUri } : huddleNameLogo} style={styles.logo} />
          </Pressable>
        </View>

        {showSettings ? (
          <Pressable accessibilityLabel="Settings" onPress={onSettingsPress} style={styles.iconButton}>
            <Feather color={huddleColors.iconMuted} name="settings" size={21} />
          </Pressable>
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
  badge: {
    position: "absolute",
    top: 5,
    right: 5,
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
