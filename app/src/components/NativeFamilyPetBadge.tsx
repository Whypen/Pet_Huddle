import { StyleSheet, Text, View } from "react-native";
import { huddleColors, huddleFamilyPet, huddleRadii, huddleShadows, huddleSpacing } from "../theme/huddleDesignTokens";
export function NativeFamilyPetBadge({ displayName }: { displayName: string }) {
  return (
    <View style={styles.badge}>
      <Text ellipsizeMode="tail" numberOfLines={1} style={styles.label}>
        {`Shared with ${displayName}'s family`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    maxWidth: huddleFamilyPet.badgeMaxWidth,
    minHeight: huddleFamilyPet.badgeHeight,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: huddleSpacing.x2,
    borderRadius: huddleRadii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: huddleColors.glassBorder,
    backgroundColor: huddleColors.glassOverlay,
    ...huddleShadows.polaroidBadge,
  },
  label: {
    color: huddleColors.text,
    fontFamily: huddleFamilyPet.badgeFontFamily,
    fontSize: huddleFamilyPet.badgeFontSize,
    lineHeight: huddleFamilyPet.badgeLineHeight,
  },
});
