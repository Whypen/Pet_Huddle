import Feather from "@expo/vector-icons/Feather";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useLanguage } from "../../lib/nativeLanguage";
import { huddleButtons, huddleColors, huddleRadii, huddleShadows, huddleSpacing, huddleType } from "../../theme/huddleDesignTokens";

type NativeMapRestrictionModalProps = {
  onClose: () => void;
  visible: boolean;
};

export function NativeMapRestrictionModal({ onClose, visible }: NativeMapRestrictionModalProps) {
  const { t } = useLanguage();
  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => undefined}>
          <Pressable accessibilityLabel="Close" accessibilityRole="button" onPress={onClose} style={styles.closeButton}>
            <Feather color={huddleColors.subtext} name="x" size={16} />
          </Pressable>
          <View style={styles.titleRow}>
            <View style={styles.iconCircle}>
              <Feather color={huddleColors.validationRed} name="alert-triangle" size={20} />
            </View>
            <Text style={styles.title}>{t("Map Alert Access Paused")}</Text>
          </View>
          <Text style={styles.body}>{t("Your ability to pin map alerts has been paused due to recent account activity that does not meet our community safety standards.")}</Text>
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" onPress={onClose} style={styles.primaryButton}>
              <Text style={styles.primaryText}>{t("Confirm")}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: huddleSpacing.x6,
    backgroundColor: huddleColors.backdrop,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    borderRadius: huddleRadii.modal,
    backgroundColor: huddleColors.canvas,
    padding: huddleSpacing.x5,
    ...huddleShadows.glassElevation2,
  },
  closeButton: {
    position: "absolute",
    top: huddleSpacing.x3,
    right: huddleSpacing.x3,
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: huddleRadii.pill,
    backgroundColor: huddleColors.mutedCanvas,
  },
  titleRow: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x3,
    paddingRight: huddleSpacing.x8,
  },
  iconCircle: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: huddleRadii.pill,
    backgroundColor: huddleColors.mutedCanvas,
  },
  title: {
    flex: 1,
    fontFamily: "Urbanist-700",
    fontSize: huddleType.h3,
    lineHeight: huddleType.h3Line,
    color: huddleColors.text,
  },
  body: {
    marginTop: huddleSpacing.x4,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.mutedText,
  },
  actions: {
    marginTop: huddleSpacing.x5,
  },
  primaryButton: {
    ...huddleButtons.base,
    ...huddleButtons.primary,
  },
  primaryText: {
    ...huddleButtons.label,
    color: huddleColors.onPrimary,
  },
});
