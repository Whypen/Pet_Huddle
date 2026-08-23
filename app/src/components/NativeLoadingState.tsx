import { StyleSheet, View, type ViewStyle } from "react-native";
import { NativeBrandMedia } from "./NativeBrandMedia";
import { NativeSpinner } from "./NativeSpinner";
import { huddleColors, huddleSpacing } from "../theme/huddleDesignTokens";

// Loading state contract:
//   inline   — padded inline spinner (chip/footer/inline content load)
//   centered — flex:1 centered spinner (page-level data load, NOT cold boot)
//   overlay  — full-screen brand logo (auth recovery, cold boot only)
//   page     — flex:1 brand logo (cold boot only)
// Brand-logo variants are reserved for first-paint moments; everything else
// should use centered or inline so the same spinner shows up in the same place.

type NativeLoadingStateProps = {
  variant?: "inline" | "centered" | "overlay" | "page";
  style?: ViewStyle;
};

export function NativeLoadingState({ variant = "inline", style }: NativeLoadingStateProps) {
  if (variant === "overlay" || variant === "page") {
    return (
      <View style={[variant === "overlay" ? styles.overlay : styles.page, style]}>
        <NativeBrandMedia size={160} windowHeight={132} />
      </View>
    );
  }

  if (variant === "centered") {
    return (
      <View style={[styles.centered, style]}>
        <NativeSpinner tone="accent" size="md" />
      </View>
    );
  }

  return (
    <View style={[styles.inline, style]}>
      <NativeSpinner tone="accent" size="md" />
    </View>
  );
}

const styles = StyleSheet.create({
  inline: {
    alignItems: "center",
    justifyContent: "center",
    padding: huddleSpacing.x4,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: huddleSpacing.x6,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: huddleColors.canvas,
    zIndex: 50,
  },
  page: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: huddleColors.canvas,
  },
});
