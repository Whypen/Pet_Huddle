import { BlurView } from "@react-native-community/blur";
import { LinearGradient } from "expo-linear-gradient";
import type { ComponentProps, ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

// Same guarded require as NativeBottomNav: expo-glass-effect's iOS entry calls
// requireNativeViewManager at load time and throws on a dev client not yet rebuilt
// with the native module, so we fall back to a BlurView + tint.
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

type NativeGlassCircleProps = {
  /** Diameter in px. */
  size: number;
  /** Tint applied to the liquid-glass surface (use a translucent brand colour). */
  tint: string;
  /** Matching tint for the BlurView fallback path (typically the same rgba). */
  fallbackTint: string;
  blurAmount?: number;
  blurType?: ComponentProps<typeof BlurView>["blurType"];
  children?: ReactNode;
  forceFallback?: boolean;
  glassOpacity?: number;
  highlightOpacity?: number;
  materialTint?: string;
  rimColor?: string;
  navFillOnLiquidGlass?: boolean;
  /** Tinted-glass body: a colour gradient (deeper at the bottom) layered over the frost
   *  so the surface reads as luminous coloured glass instead of a flat sticker. */
  bodyGradient?: { colors: readonly string[]; locations?: readonly number[]; start?: { x: number; y: number }; end?: { x: number; y: number } };
  /** Specular highlight — a soft bright glint swept across the upper-left, the key "glass" tell. */
  sheen?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * Circular glass surface — true iOS liquid glass (expo-glass-effect) where available,
 * BlurView + tint fallback otherwise. The app's canonical glassfill (mirrors
 * NativeBottomNav), reused so glass treatments stay consistent.
 */
export function NativeGlassCircle({ size, tint, fallbackTint, blurAmount = 18, blurType = "ultraThinMaterial", bodyGradient, children, forceFallback = false, glassOpacity = 1, highlightOpacity = 0.82, materialTint, rimColor = "rgba(255,255,255,0.42)", navFillOnLiquidGlass = true, sheen = false, style }: NativeGlassCircleProps) {
  const LiquidGlassView = LIQUID_GLASS && GlassViewComponent && !forceFallback ? GlassViewComponent : null;
  const showNavFill = navFillOnLiquidGlass && (forceFallback || !LIQUID_GLASS || Boolean(LiquidGlassView));
  return (
    <View style={[{ width: size, height: size, borderRadius: size / 2, overflow: "hidden", alignItems: "center", justifyContent: "center" }, style]}>
      {LiquidGlassView ? (
        <LiquidGlassView glassEffectStyle="clear" isInteractive tintColor={tint} pointerEvents="none" style={StyleSheet.absoluteFill} />
      ) : (
        <>
          <BlurView blurAmount={blurAmount} blurType={blurType} pointerEvents="none" reducedTransparencyFallbackColor={fallbackTint} style={StyleSheet.absoluteFill} />
        </>
      )}
      {materialTint ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: materialTint }]} /> : null}
      {bodyGradient ? (
        <LinearGradient
          colors={bodyGradient.colors as readonly [string, string, ...string[]]}
          locations={bodyGradient.locations as readonly [number, number, ...number[]] | undefined}
          start={bodyGradient.start ?? { x: 0.2, y: 0 }}
          end={bodyGradient.end ?? { x: 0.85, y: 1 }}
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      {showNavFill ? (
        <>
          <View pointerEvents="none" style={[styles.glassTint, { backgroundColor: fallbackTint, opacity: highlightOpacity }]} />
          <LinearGradient
            colors={["rgba(255,255,255,0.90)", "rgba(255,255,255,0.34)", "rgba(255,255,255,0.68)"]}
            locations={[0, 0.5, 1]}
            start={{ x: 0.15, y: 0 }}
            end={{ x: 0.85, y: 1 }}
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { opacity: glassOpacity }]}
          />
        </>
      ) : null}
      {sheen ? (
        <LinearGradient
          colors={["rgba(255,255,255,0.62)", "rgba(255,255,255,0.12)", "rgba(255,255,255,0)"]}
          locations={[0, 0.35, 0.6]}
          start={{ x: 0.12, y: 0.02 }}
          end={{ x: 0.78, y: 0.82 }}
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.innerRim, { borderColor: rimColor }]} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  glassTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.90)",
  },
  innerRim: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.82)",
    borderRadius: 999,
  },
});
