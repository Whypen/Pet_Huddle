import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import {
  AppBottomSheet,
  AppBottomSheetHeader,
  AppModalCloseButton,
} from "../nativeModalPrimitives";
import { NativeSelfPinControls, type NativeSelfPinControlsProps } from "./NativeSelfPinControls";
import { huddleColors, huddleSpacing, huddleType } from "../../theme/huddleDesignTokens";

export function NativeSelfPinSheet({
  onClose,
  visible,
  ...controls
}: NativeSelfPinControlsProps & { onClose: () => void; visible: boolean }) {
  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.root}>
        <Pressable accessibilityLabel="Close map sharing controls" onPress={onClose} style={styles.backdrop} />
        <AppBottomSheet onClose={onClose}>
          <AppBottomSheetHeader>
            <View style={styles.header}>
              <Text style={styles.title}>Map sharing</Text>
              <AppModalCloseButton onPress={onClose} />
            </View>
          </AppBottomSheetHeader>
          <View style={styles.body}>
            <NativeSelfPinControls {...controls} />
          </View>
        </AppBottomSheet>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: huddleColors.backdrop,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  title: {
    color: huddleColors.text,
    fontFamily: "Urbanist-700",
    fontSize: huddleType.nativeHeaderTitle,
    lineHeight: huddleType.nativeHeaderTitleLine,
  },
  body: {
    paddingBottom: huddleSpacing.x5,
    paddingHorizontal: huddleSpacing.x4,
  },
});
