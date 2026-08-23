import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import { Platform, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import Reanimated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { NativeVerifiedBadge } from "../NativeVerifiedBadge";
import { NativeGlassSurface } from "../NativeGlassSurface";
import { NativeEngagementSparkle } from "../NativeProfileAvatar";
import type { NativeEngagementSummary } from "../../lib/nativeEngagement";
import {
  huddleColors,
  huddleRadii,
  huddleSpacing,
} from "../../theme/huddleDesignTokens";

// Sheen that sweeps a soft bright band across the name. The base text (and its
// shadow) stays untouched underneath; this overlay is clipped to the name box so
// the light only travels over the letters (not the gaps), so there is no visible
// white bar. Technique: a duplicate of the name with a soft white glow is revealed
// through a moving clip window; the window's child counter-translates so the text
// stays put — only the glow sweeps across the glyphs. Honors reduced-motion.
function NameShine({ text, gold = false }: { text: string; gold?: boolean }) {
  const [width, setWidth] = useState(0);
  const progress = useSharedValue(0);
  const reduceMotion = useReducedMotion();

  const band = Math.max(36, width * 0.30);

  const onLayout = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.width;
    setWidth((current) => (Math.abs(current - next) < 0.5 ? current : next));
  };

  useEffect(() => {
    if (reduceMotion || width <= 0) {
      progress.value = 0;
      return;
    }
    progress.value = 0;
    progress.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1250, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 2800 }), // slow, rare passes feel premium
        withTiming(0, { duration: 0 }),
      ),
      -1,
      false,
    );
  }, [progress, reduceMotion, width]);

  // window slides from -band to width; inner copy counter-translates to stay fixed.
  // Opacity follows a sine curve so the glint fades in and out smoothly instead of
  // popping at the name edges.
  const windowStyle = useAnimatedStyle(() => ({
    opacity: Math.sin(Math.min(Math.max(progress.value, 0), 1) * Math.PI),
    transform: [{ translateX: -band + progress.value * (width + band) }],
  }));
  const innerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: band - progress.value * (width + band) }],
  }));

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} onLayout={onLayout}>
      {!reduceMotion && width > 0 ? (
        <Reanimated.View style={[styles.shineWindow, { width: band }, windowStyle]}>
          <Reanimated.View style={[{ width }, innerStyle]}>
            <Text
              adjustsFontSizeToFit={Platform.OS === "ios"}
              minimumFontScale={0.58}
              numberOfLines={Platform.OS === "ios" ? 1 : 2}
              style={[styles.name, gold ? styles.nameGold : null, styles.shineName, Platform.OS === "android" ? styles.nameAndroid : null]}
            >
              {text}
            </Text>
          </Reanimated.View>
        </Reanimated.View>
      ) : null}
    </View>
  );
}

// Canonical headline overlay for any profile-card surface (Profile modal, Discover deck, etc.).
// Renders absoluteFill on top of a parent-provided photo + frame. Parent owns:
//   • the photo (ExpoImage / ResilientAvatarImage / etc.)
//   • the outer frame (aspect ratio, border radius, shadow, container padding)
//   • any extra overlays (swipe tints, top badges, queued masks, …)
// This component just paints the bottom scrim and the name / verified / role / tier copy.

type NativeProfileHeroProps = {
  caption?: string | null;
  isVerified: boolean;
  engagement?: NativeEngagementSummary | null;
  membershipTier?: string | null;
  name: string;
  roleLabels: string[];
  showTier?: boolean;
  shinyName?: boolean;
};

const formatTier = (tier?: string | null) => {
  const clean = String(tier || "").trim().toLowerCase();
  if (!clean || clean === "free") return null;
  if (clean === "gold" || clean === "huddle＊" || clean.startsWith("gold_")) return "huddle＊";
  if (clean === "plus" || clean === "premium" || clean === "huddle+" || clean === "huddle_plus") return "huddle+";
  return clean.charAt(0).toUpperCase() + clean.slice(1);
};

const hasNameShineEntitlement = (tier?: string | null) => {
  const clean = String(tier || "").trim().toLowerCase();
  return clean === "gold" || clean === "plus" || clean === "premium" || clean === "huddle+" || clean === "huddle_plus";
};

const normalizeHeroRoleLabel = (value: string) => {
  const label = value.trim();
  if (/^vet$/i.test(label)) return "Veterinarian";
  if (/^animal friend\s*\(no pet\)$/i.test(label)) return "Animal Friend";
  const allowed = new Set(["Pet Parent", "Pet Nanny", "Animal Friend", "Veterinarian", "Pet Photographer", "Pet Groomer", "Vet Nurse", "Volunteer"]);
  return allowed.has(label) ? label : "";
};

export function NativeProfileHero({
  caption,
  isVerified,
  engagement,
  membershipTier,
  name,
  roleLabels,
  showTier = true,
  shinyName = false,
}: NativeProfileHeroProps) {
  const tierLabel = showTier ? formatTier(membershipTier) : null;
  const roleLabel = roleLabels.map(normalizeHeroRoleLabel).filter(Boolean).join(" · ");
  const displayName = (name || "User").trim().toUpperCase();
  const isPillar = engagement?.tier === "pillar";
  const showNameShine = (shinyName && hasNameShineEntitlement(membershipTier)) || isPillar;
  const hasSparkle = Boolean(engagement && engagement.tier !== "new");

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={[huddleColors.profileHeroScrimStart, huddleColors.profileHeroScrimMid, huddleColors.profileHeroScrimEnd]}
        end={{ x: 0, y: 0 }}
        pointerEvents="none"
        start={{ x: 0, y: 1 }}
        style={styles.scrim}
      />
      {/* Extra dark info strip over the bottom ~28% so name + pills stay legible against busy photos. */}
      <LinearGradient
        colors={["rgba(0,0,0,0.0)", "rgba(0,0,0,0.42)"]}
        end={{ x: 0, y: 1 }}
        pointerEvents="none"
        start={{ x: 0, y: 0 }}
        style={styles.infoStrip}
      />
      <View pointerEvents="box-none" style={styles.copy}>
        <View style={[styles.nameRow, Platform.OS === "android" ? styles.nameRowAndroid : null]}>
          <View style={styles.nameWrap}>
            {hasSparkle ? (
              <View style={styles.nameSparkleBadge}>
                <NativeEngagementSparkle corner="top-left" engagement={engagement ?? null} size={22} />
              </View>
            ) : null}
            <Text
              adjustsFontSizeToFit={Platform.OS === "ios"}
              minimumFontScale={0.58}
              numberOfLines={Platform.OS === "ios" ? 1 : 2}
              style={[styles.name, isPillar ? styles.nameGold : null, Platform.OS === "android" ? styles.nameAndroid : null]}
            >
              {displayName}
            </Text>
            {showNameShine ? <NameShine gold={isPillar} text={displayName} /> : null}
          </View>
          {isVerified ? <NativeVerifiedBadge compact scale={1.25} style={styles.verifiedTighten} /> : null}
        </View>
        <View style={styles.pills}>
          {roleLabel ? (
            <NativeGlassSurface intensity="chrome" style={styles.rolePill}>
              <View style={styles.roleDot} />
              <Text numberOfLines={1} style={styles.roleText}>{roleLabel}</Text>
            </NativeGlassSurface>
          ) : null}
          {tierLabel ? (
            <NativeGlassSurface
              intensity="clear"
              style={[styles.tierPill, tierLabel === "huddle＊" ? styles.goldBorder : styles.plusBorder]}
            >
              {/* Colour tint sits INSIDE the glass, above its white sheen layers, so the
                  pill stays saturated brand colour on both the LiquidGlass path (iOS 18+)
                  and the BlurView fallback path (Android + older iOS). */}
              <View pointerEvents="none" style={[StyleSheet.absoluteFill, tierLabel === "huddle＊" ? styles.goldGlassFill : styles.plusGlassFill]} />
              <Text style={[styles.tierText, tierLabel === "huddle＊" ? styles.goldText : styles.plusText]}>{tierLabel}</Text>
            </NativeGlassSurface>
          ) : null}
        </View>
        {caption ? <Text ellipsizeMode="tail" numberOfLines={2} style={styles.caption}>{caption}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "56%",
  },
  infoStrip: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "28%",
  },
  copy: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: huddleSpacing.x4,
    paddingTop: huddleSpacing.x9,
    paddingBottom: huddleSpacing.x5,
  },
  nameRow: {
    maxWidth: "100%",
    flexDirection: "row",
    alignItems: "flex-end",
    alignSelf: "flex-start",
    flexWrap: "nowrap",
    gap: huddleSpacing.x1,
  },
  nameRowAndroid: {
    flexWrap: "wrap",
  },
  name: {
    flexShrink: 1,
    minWidth: 0,
    fontFamily: "Urbanist-800",
    fontWeight: "800",
    fontSize: 34,
    lineHeight: 36,
    includeFontPadding: false,
    textTransform: "uppercase",
    color: huddleColors.onPrimary,
    textShadowColor: huddleColors.profileNameShadow,
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 14,
  },
  nameAndroid: {
    flexShrink: 0,
    maxWidth: "100%",
  },
  nameGold: {
    // Solid Huddle Gold tint; the moving NameShine sheen plays over this base
    // colour, never recolouring anything else (ring stays untouched elsewhere).
    color: "#F2C14E",
    textShadowColor: "rgba(242,193,78,0.55)",
  },
  nameWrap: {
    flexShrink: 1,
    minWidth: 0,
    position: "relative",
  },
  nameSparkleBadge: {
    position: "absolute",
    left: 0,
    top: 0,
    width: 0,
    height: 0,
  },
  shineWindow: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    overflow: "hidden",
  },
  shineName: {
    // Duplicate of the name with a soft white glow; revealed only within the
    // moving window so the light reads as travelling through the letters.
    color: "#FFFFFF",
    textShadowColor: "rgba(255,255,255,0.8)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  verifiedTighten: {
    marginLeft: -2,
    marginBottom: 2,
  },
  pills: {
    marginTop: huddleSpacing.x3,
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x2,
    minWidth: 0,
    flexWrap: "nowrap",
  },
  rolePill: {
    minHeight: 34,
    alignSelf: "flex-start",
    maxWidth: "62%",
    flexShrink: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x1,
    borderRadius: huddleRadii.pill,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.45)",
    paddingHorizontal: huddleSpacing.x3,
    paddingVertical: huddleSpacing.x1,
  },
  roleDot: {
    width: 6,
    height: 6,
    flexShrink: 0,
    borderRadius: huddleRadii.pill,
    backgroundColor: huddleColors.blue,
  },
  roleText: {
    flexShrink: 1,
    minWidth: 0,
    fontFamily: "Urbanist-600",
    fontSize: 15,
    lineHeight: 19,
    color: huddleColors.blue,
  },
  tierPill: {
    minHeight: 32,
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x1,
    borderRadius: huddleRadii.pill,
    borderWidth: 1,
    borderColor: huddleColors.profileHeroTierBorder,
    paddingHorizontal: huddleSpacing.x3,
    paddingVertical: huddleSpacing.x1,
  },
  // Colour rides on top of the shared glass blur as a tinted fill, so the pill
  // still reads as frosted glass (not a flat chip) on both iOS and Android.
  // Tints are near-solid: the blur shows through only at the edges/highlights,
  // keeping brand saturation instead of a washed-out pastel.
  goldGlassFill: {
    // Aligned with Manage Subscription Gold (#FF6452).
    backgroundColor: "rgba(255,100,82,0.86)",
  },
  plusGlassFill: {
    // Aligned with Manage Subscription huddle+ (#5BA4F5).
    backgroundColor: "rgba(91,164,245,0.86)",
  },
  goldBorder: {
    borderColor: "rgba(255,140,120,0.75)",
  },
  plusBorder: {
    borderColor: "rgba(140,190,250,0.75)",
  },
  tierText: {
    flexShrink: 0,
    fontFamily: "Urbanist-600",
    fontSize: 15,
    lineHeight: 19,
    color: huddleColors.onPrimary,
  },
  goldText: {
    color: huddleColors.onPrimary,
  },
  plusText: {
    color: huddleColors.onPrimary,
  },
  caption: {
    maxWidth: 320,
    marginTop: huddleSpacing.x3,
    fontFamily: "Urbanist-500",
    fontSize: 14,
    lineHeight: 18,
    color: huddleColors.onPrimary,
  },
});
