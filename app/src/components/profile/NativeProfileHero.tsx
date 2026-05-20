import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, Text, View } from "react-native";
import { Image as ExpoImage } from "expo-image";
import {
  huddleColors,
  huddleRadii,
  huddleShadows,
  huddleSpacing,
} from "../../theme/huddleDesignTokens";

type NativeProfileHeroProps = {
  caption?: string | null;
  isVerified: boolean;
  membershipTier?: string | null;
  name: string;
  roleLabels: string[];
  src: string | null;
};

const formatTier = (tier?: string | null) => {
  const clean = String(tier || "").trim().toLowerCase();
  if (!clean || clean === "free") return null;
  if (clean === "gold") return "Gold";
  if (clean === "plus" || clean === "huddle+" || clean === "huddle_plus") return "Huddle+";
  return clean.charAt(0).toUpperCase() + clean.slice(1);
};

export function NativeProfileHero({
  caption,
  isVerified,
  membershipTier,
  name,
  roleLabels,
  src,
}: NativeProfileHeroProps) {
  const tierLabel = formatTier(membershipTier);
  const roleLabel = roleLabels.map((label) => label.trim()).filter(Boolean).join(" · ");
  const displayNameWords = (name || "User").trim().split(/\s+/).filter(Boolean);

  return (
    <View style={styles.section}>
      <View style={styles.hero}>
        {src ? (
          <ExpoImage accessibilityIgnoresInvertColors cachePolicy="memory-disk" contentFit="cover" source={{ uri: src }} style={styles.image} transition={120} />
        ) : (
          <View style={styles.fallback} />
        )}
        <LinearGradient
          colors={[huddleColors.profileHeroScrimStart, huddleColors.profileHeroScrimMid, huddleColors.profileHeroScrimEnd]}
          end={{ x: 0, y: 0 }}
          pointerEvents="none"
          start={{ x: 0, y: 1 }}
          style={styles.scrim}
        />
        <View style={styles.copy}>
          <View style={styles.nameRow}>
            {displayNameWords.map((word, index) => (
              <Text key={`${word}:${index}`} style={styles.nameWord}>
                {word}
              </Text>
            ))}
            {isVerified ? (
              <View style={styles.verifiedBadge}>
                <MaterialCommunityIcons color={huddleColors.blue} name="shield-check-outline" size={20} />
              </View>
            ) : null}
          </View>
          <View style={styles.pills}>
            {roleLabel ? (
              <View style={styles.rolePill}>
                <View style={styles.roleDot} />
                <Text numberOfLines={1} style={styles.roleText}>{roleLabel}</Text>
              </View>
            ) : null}
            {tierLabel ? (
              <View style={[styles.tierPill, tierLabel === "Gold" ? styles.goldPill : tierLabel === "Huddle+" ? styles.plusPill : null]}>
                <Feather color={tierLabel === "Gold" ? huddleColors.premiumGold : huddleColors.onPrimary} name="star" size={14} />
                <Text numberOfLines={1} style={[styles.tierText, tierLabel === "Gold" ? styles.goldText : tierLabel === "Huddle+" ? styles.plusText : null]}>{tierLabel}</Text>
              </View>
            ) : null}
          </View>
          {caption ? <Text style={styles.caption}>{caption}</Text> : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    paddingHorizontal: huddleSpacing.x4,
    paddingTop: huddleSpacing.x4,
  },
  hero: {
    aspectRatio: 4 / 5,
    overflow: "hidden",
    borderRadius: huddleRadii.modal,
    backgroundColor: huddleColors.mutedCanvas,
    ...huddleShadows.glassElevation1,
  },
  image: {
    width: "100%",
    height: "100%",
  },
  fallback: {
    flex: 1,
    backgroundColor: huddleColors.primarySoftFill,
  },
  scrim: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "56%",
  },
  copy: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: huddleSpacing.x5,
    paddingTop: huddleSpacing.x9,
    paddingBottom: huddleSpacing.x5,
  },
  nameWord: {
    fontFamily: "Urbanist-800",
    fontWeight: "800",
    fontSize: 40,
    lineHeight: 40,
    includeFontPadding: false,
    textTransform: "uppercase",
    color: huddleColors.onPrimary,
    textShadowColor: huddleColors.profileNameShadow,
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 14,
  },
  nameRow: {
    maxWidth: "100%",
    flexDirection: "row",
    alignItems: "flex-end",
    flexWrap: "wrap",
    gap: huddleSpacing.x2,
  },
  verifiedBadge: {
    width: 32,
    height: 32,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: huddleRadii.pill,
    borderWidth: 1,
    borderColor: huddleColors.blue,
    backgroundColor: huddleColors.glassChrome,
    marginBottom: huddleSpacing.x1,
  },
  pills: {
    marginTop: huddleSpacing.x3,
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x2,
    minWidth: 0,
  },
  rolePill: {
    minHeight: 40,
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x2,
    overflow: "hidden",
    borderRadius: huddleRadii.pill,
    borderWidth: 1,
    borderColor: huddleColors.profileHeroRoleBorder,
    backgroundColor: huddleColors.blueSoft,
    paddingHorizontal: huddleSpacing.x4,
    paddingVertical: huddleSpacing.x2,
  },
  roleDot: {
    width: 6,
    height: 6,
    flexShrink: 0,
    borderRadius: huddleRadii.pill,
    backgroundColor: huddleColors.blue,
  },
  roleText: {
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
    fontFamily: "Urbanist-600",
    fontSize: 14,
    lineHeight: 18,
    color: huddleColors.blue,
  },
  tierPill: {
    minHeight: 40,
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x2,
    borderRadius: huddleRadii.pill,
    borderWidth: 1,
    borderColor: huddleColors.profileHeroTierBorder,
    backgroundColor: huddleColors.profileHeroTierFill,
    paddingHorizontal: huddleSpacing.x4,
    paddingVertical: huddleSpacing.x2,
  },
  goldPill: {
    borderColor: huddleColors.profileHeroGoldBorder,
    backgroundColor: huddleColors.premiumGoldSoft,
  },
  plusPill: {
    borderColor: huddleColors.profileHeroPlusBorder,
    backgroundColor: huddleColors.profileHeroPlusFill,
  },
  tierText: {
    flexShrink: 1,
    fontFamily: "Urbanist-600",
    fontSize: 14,
    lineHeight: 18,
    color: huddleColors.onPrimary,
  },
  goldText: {
    color: huddleColors.premiumGold,
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
