import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { huddleColors, huddleRadii, huddleShadows, huddleSpacing, huddleType } from "../theme/huddleDesignTokens";
import { NativePetDetailsContent, type NativePetDetailsData } from "./NativePetDetailsContent";
import { haptic } from "../lib/nativeHaptics";

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
  const handleClose = () => { haptic.selectTab(); onClose(); }; // MP5: light tick on close
  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={open}>
      <View style={styles.backdrop}>
        <Pressable
          accessibilityLabel="Close pet profile"
          accessibilityRole="button"
          onPress={handleClose}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.card}>
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
                <ActivityIndicator color={huddleColors.blue} size="small" />
                <Text style={styles.stateText}>Loading pet details...</Text>
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
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: huddleSpacing.x4,
    backgroundColor: huddleColors.backdrop,
  },
  card: {
    maxHeight: "84%",
    overflow: "hidden",
    borderRadius: huddleRadii.modal,
    backgroundColor: huddleColors.canvas,
    ...huddleShadows.glassElevation2,
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
