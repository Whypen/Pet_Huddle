import { BlurView } from "@react-native-community/blur";
import { LinearGradient } from "expo-linear-gradient";
import type { ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

// Canonical app glass: this mirrors NativeBottomNav exactly. Keep shared so
// smaller glass bars/buttons do not drift into separate blur recipes.
let GlassViewComponent: typeof import("expo-glass-effect").GlassView | null = null;
let LIQUID_GLASS = false;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const glass = require("expo-glass-effect") as typeof import("expo-glass-effect");
  LIQUID_GLASS = glass.isLiquidGlassAvailable();
  if (LIQUID_GLASS) GlassViewComponent = glass.GlassView;
} catch {
  LIQUID_GLASS = false;
}

type NativeGlassSurfaceProps = {
  children?: ReactNode;
  glassFillStyle?: StyleProp<ViewStyle>;
  intensity?: "chrome" | "clear";
  style?: StyleProp<ViewStyle>;
};

export function NativeGlassSurface({ children, glassFillStyle, intensity = "chrome", style }: NativeGlassSurfaceProps) {
  const isClear = intensity === "clear";
  return (
    <View style={[styles.surface, style]}>
      {LIQUID_GLASS && GlassViewComponent ? (
        <GlassViewComponent
          glassEffectStyle="clear"
          isInteractive
          tintColor={isClear ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.90)"}
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, glassFillStyle]}
        />
      ) : (
        <>
          <BlurView
            blurAmount={isClear ? 18 : 30}
            blurType="light"
            pointerEvents="none"
            reducedTransparencyFallbackColor={isClear ? "rgba(255,255,255,0.42)" : "rgba(255,255,255,0.98)"}
            style={StyleSheet.absoluteFill}
          />
          <View pointerEvents="none" style={[styles.glassTint, isClear ? styles.glassTintClear : null]} />
          <LinearGradient
            colors={isClear
              ? ["rgba(255,255,255,0.40)", "rgba(255,255,255,0.12)", "rgba(255,255,255,0.26)"]
              : ["rgba(255,255,255,0.90)", "rgba(255,255,255,0.34)", "rgba(255,255,255,0.68)"]}
            locations={[0, 0.5, 1]}
            start={{ x: 0.15, y: 0 }}
            end={{ x: 0.85, y: 1 }}
            pointerEvents="none"
            style={StyleSheet.absoluteFill}
          />
        </>
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  surface: {
    backgroundColor: "transparent",
    overflow: "hidden",
  },
  glassTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255, 255, 255, 0.90)",
  },
  glassTintClear: {
    backgroundColor: "rgba(255, 255, 255, 0.18)",
  },
});
