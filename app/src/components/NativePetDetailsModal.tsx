import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { NativeSpinner } from "./NativeSpinner";
import { huddleColors, huddleRadii, huddleShadows, huddleSpacing, huddleType } from "../theme/huddleDesignTokens";
import { NativePetDetailsContent, type NativePetDetailsData } from "./NativePetDetailsContent";
import { haptic } from "../lib/nativeHaptics";
import { useNativeSwipeDownToClose } from "../lib/useNativeSwipeDownToClose";

type NativePetDetailsModalProps = {
  error?: string | null;
  loading?: boolean;
  onClose: () => void;
  open: boolean;
  pet: NativePetDetailsData | null;
};

export function NativePetDetailsModal({
  error,
  loading = false,
  onClose,
  open,
  pet,
}: NativePetDetailsModalProps) {
  const insets = useSafeAreaInsets();
  const handleClose = () => { haptic.selectTab(); onClose(); }; // MP5: light tick on close
  const { gesture, cardStyle, backdropStyle } = useNativeSwipeDownToClose({ open, onClose: handleClose });
  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={open}>
      <GestureHandlerRootView style={styles.ghRoot}>
      <View style={[styles.backdrop, { paddingBottom: Math.max(insets.bottom, huddleSpacing.x4) }]}>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.dim, backdropStyle]} />
        <Pressable
          accessibilityLabel="Close pet profile"
          accessibilityRole="button"
          onPress={handleClose}
          style={StyleSheet.absoluteFill}
        />
        <Animated.View style={[styles.card, cardStyle]}>
          <GestureDetector gesture={gesture}>
            <View>
              <View style={styles.grabber} />
              <View style={styles.header}>
                <Text numberOfLines={1} style={styles.title}>
                  {pet?.name || "Pet details"}
                </Text>
                <Pressable
                  accessibilityLabel="Close pet profile"
                  accessibilityRole="button"
                  onPress={handleClose}
                  style={({ pressed }) => [styles.closeButton, pressed ? styles.pressed : null]}
                >
                  <Feather color={huddleColors.iconMuted} name="x" size={24} />
                </Pressable>
              </View>
            </View>
          </GestureDetector>
          <ScrollView
            bounces={false}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
            style={styles.scroll}
          >
            {loading ? (
              <View style={styles.state}>
                <NativeSpinner tone="accent" />
              </View>
            ) : pet ? (
              <NativePetDetailsContent pet={pet} />
            ) : (
              <View style={styles.state}>
                <Text style={styles.stateTitle}>Pet details</Text>
                <Text style={styles.stateText}>{error || "Pet details are unavailable."}</Text>
              </View>
            )}
          </ScrollView>
        </Animated.View>
      </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  ghRoot: {
    flex: 1,
  },
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    paddingHorizontal: huddleSpacing.x4,
  },
  dim: {
    backgroundColor: huddleColors.backdrop,
  },
  card: {
    maxHeight: "84%",
    overflow: "hidden",
    borderRadius: huddleRadii.modal,
    backgroundColor: huddleColors.canvas,
    ...huddleShadows.glassElevation2,
  },
  grabber: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: huddleRadii.pill,
    backgroundColor: huddleColors.sectionDividerStrong,
    marginTop: huddleSpacing.x2,
    marginBottom: huddleSpacing.x1,
  },
  header: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: huddleColors.divider,
    paddingLeft: huddleSpacing.x4,
    paddingRight: huddleSpacing.x2,
  },
  title: {
    flex: 1,
    fontFamily: "Urbanist-700",
    fontSize: huddleType.body,
    lineHeight: 22,
    color: huddleColors.text,
  },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: huddleRadii.pill,
  },
  scroll: {
    flexGrow: 0,
    flexShrink: 1,
    minHeight: 0,
  },
  scrollContent: {
    padding: huddleSpacing.x4,
    paddingBottom: huddleSpacing.x7,
  },
  state: {
    minHeight: 240,
    alignItems: "center",
    justifyContent: "center",
    gap: huddleSpacing.x2,
  },
  stateTitle: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.h4,
    lineHeight: huddleType.h4Line,
    color: huddleColors.text,
    textAlign: "center",
  },
  stateText: {
    fontFamily: "Urbanist-500",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.subtext,
    textAlign: "center",
  },
  pressed: {
    opacity: 0.72,
  },
});
