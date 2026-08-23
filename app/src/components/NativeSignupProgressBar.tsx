import { StyleSheet, View } from "react-native";
import { huddleColors } from "../theme/huddleDesignTokens";

// Thin top-of-screen signup progress bar (no "Step X of Y" text). Fills brand
// blue with progress and turns green at 100%.
export function NativeSignupProgressBar({ progress }: { progress: number }) {
  const clamped = Math.max(0, Math.min(1, progress));
  const complete = clamped >= 1;
  return (
    <View style={styles.track}>
      <View
        style={[
          styles.fill,
          { width: `${clamped * 100}%`, backgroundColor: complete ? huddleColors.success : huddleColors.blue },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 3,
    width: "100%",
    backgroundColor: huddleColors.fieldBorderSoft,
    overflow: "hidden",
  },
  fill: {
    height: 3,
    borderRadius: 2,
  },
});
