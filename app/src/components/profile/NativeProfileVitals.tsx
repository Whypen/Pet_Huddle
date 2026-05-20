import { Feather, FontAwesome5, MaterialCommunityIcons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import {
  huddleColors,
  huddleRadii,
  huddleSpacing,
  huddleType,
} from "../../theme/huddleDesignTokens";

export type NativeProfileVitalsRow = {
  icon?: keyof typeof Feather.glyphMap | keyof typeof FontAwesome5.glyphMap | keyof typeof MaterialCommunityIcons.glyphMap;
  iconFamily?: "feather" | "fontawesome5" | "material";
  label: string;
  value: string;
};

type NativeProfileVitalsProps = {
  intro?: {
    label: string;
    socialId: string | null;
  } | null;
  rows: NativeProfileVitalsRow[];
  title?: string | null;
};

export function NativeProfileVitals({ intro = null, rows, title = "Key info" }: NativeProfileVitalsProps) {
  if (rows.length === 0) return null;

  return (
    <View style={styles.section}>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {intro ? (
        <View style={styles.intro}>
          {intro.socialId ? <Text style={styles.socialId}>@{intro.socialId}</Text> : null}
          <Text style={styles.introLabel}>{intro.socialId ? "• " : ""}{intro.label}</Text>
        </View>
      ) : null}
      <View>
        {rows.map((row, index) => (
          <View key={`${row.label}:${index}`} style={[styles.row, index === rows.length - 1 ? styles.lastRow : null]}>
            <View style={styles.iconSlot} pointerEvents="none">
              {row.icon && row.iconFamily === "fontawesome5" ? (
                <FontAwesome5 color={huddleColors.text} name={row.icon as keyof typeof FontAwesome5.glyphMap} size={16} />
              ) : row.icon && row.iconFamily === "material" ? (
                <MaterialCommunityIcons color={huddleColors.text} name={row.icon as keyof typeof MaterialCommunityIcons.glyphMap} size={18} />
              ) : row.icon ? (
                <Feather color={huddleColors.text} name={row.icon as keyof typeof Feather.glyphMap} size={16} />
              ) : null}
            </View>
            <Text accessibilityLabel={row.label} style={styles.hiddenLabel}>{row.label}</Text>
            <Text style={styles.value}>{row.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    paddingHorizontal: huddleSpacing.x5,
    paddingVertical: huddleSpacing.x7,
  },
  title: {
    marginBottom: huddleSpacing.x3,
    fontFamily: "Urbanist-800",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    letterSpacing: 1.12,
    textTransform: "uppercase",
    color: huddleColors.text,
  },
  intro: {
    marginBottom: huddleSpacing.x4,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
    columnGap: huddleSpacing.x2,
  },
  socialId: {
    fontFamily: "Urbanist-600Italic",
    fontSize: 17,
    lineHeight: 27,
    color: huddleColors.text,
  },
  introLabel: {
    fontFamily: "Urbanist-800",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    letterSpacing: 1.12,
    textTransform: "uppercase",
    color: huddleColors.text,
  },
  row: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x3,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: huddleColors.sectionDividerStrong,
    paddingVertical: huddleSpacing.x3,
  },
  lastRow: {
    borderBottomWidth: 0,
  },
  iconSlot: {
    width: 36,
    height: 36,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: huddleRadii.pill,
  },
  hiddenLabel: {
    width: 0,
    height: 0,
    opacity: 0,
  },
  value: {
    flex: 1,
    minWidth: 0,
    fontFamily: "Urbanist-600",
    fontSize: 17,
    lineHeight: 22,
    color: huddleColors.text,
  },
});
