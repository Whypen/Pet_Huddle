import { StyleSheet, View, type ViewStyle } from "react-native";
import { NativeSelfPinControls, type NativeSelfPinControlsProps } from "./NativeSelfPinControls";
import {
  huddleColors,
  huddleLayers,
  huddleRadii,
  huddleShadows,
  huddleSpacing,
} from "../../theme/huddleDesignTokens";
import {
  NATIVE_SELF_PIN_MENU_WIDTH,
  type NativeSelfPinMenuPlacement,
} from "../../lib/nativeSelfPinMenuPosition";

export function NativeSelfPinAnchoredMenu({
  anchorStyle,
  pointerHorizontal,
  pointerVertical,
  ...controls
}: NativeSelfPinControlsProps & {
  anchorStyle: ViewStyle;
  pointerHorizontal: NativeSelfPinMenuPlacement["pointerHorizontal"];
  pointerVertical: NativeSelfPinMenuPlacement["pointerVertical"];
}) {
  return (
    <View accessibilityViewIsModal style={[styles.menu, anchorStyle]}>
      <View
        pointerEvents="none"
        style={[
          styles.pointer,
          pointerHorizontal === "right" ? styles.pointerRight : styles.pointerLeft,
          pointerVertical === "bottom" ? styles.pointerBottom : styles.pointerTop,
        ]}
      />
      <NativeSelfPinControls {...controls} />
    </View>
  );
}

const styles = StyleSheet.create({
  menu: {
    ...huddleShadows.glassElevation2,
    backgroundColor: huddleColors.canvas,
    borderColor: huddleColors.fieldBorder,
    borderRadius: huddleRadii.glass,
    borderWidth: StyleSheet.hairlineWidth,
    padding: huddleSpacing.x4,
    position: "absolute",
    width: NATIVE_SELF_PIN_MENU_WIDTH,
    zIndex: huddleLayers.nestedModal,
  },
  pointer: {
    backgroundColor: huddleColors.canvas,
    height: huddleSpacing.x4,
    position: "absolute",
    transform: [{ rotate: "45deg" }],
    width: huddleSpacing.x4,
  },
  pointerLeft: {
    left: huddleSpacing.x4,
  },
  pointerRight: {
    right: huddleSpacing.x4,
  },
  pointerTop: {
    top: -huddleSpacing.x2,
  },
  pointerBottom: {
    bottom: -huddleSpacing.x2,
  },
});
