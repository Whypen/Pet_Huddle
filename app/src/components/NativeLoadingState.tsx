import { ActivityIndicator, StyleSheet, View, type ViewStyle } from "react-native";
import { huddleColors, huddleSpacing } from "../theme/huddleDesignTokens";

type NativeLoadingStateProps = {
  variant?: "inline" | "overlay" | string;
  style?: ViewStyle;
};

export function NativeLoadingState({ variant = "inline", style }: NativeLoadingStateProps) {
  return (
    <View style={[variant === "overlay" ? styles.overlay : styles.inline, style]}>
      <ActivityIndicator color={huddleColors.blue} size="small" />
    </View>
  );
}

const styles = StyleSheet.create({
  inline: {
    alignItems: "center",
    justifyContent: "center",
    padding: huddleSpacing.x4,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.72)",
    zIndex: 50,
  },
});
