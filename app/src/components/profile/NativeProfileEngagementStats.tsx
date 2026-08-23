import { StyleSheet, Text, View } from "react-native";
import { huddleColors, huddleSpacing, huddleType } from "../../theme/huddleDesignTokens";
import type { NativeProfileEngagementStats as NativeProfileEngagementStatsData } from "../../lib/nativePublicProfile";

type NativeProfileEngagementStatsProps = {
  stats: NativeProfileEngagementStatsData | null;
};

const STAT_ITEMS: Array<{ key: keyof NativeProfileEngagementStatsData; label: string }> = [
  { key: "groups", label: "Groups" },
  { key: "friends", label: "Friends" },
  { key: "likes", label: "Likes" },
];

export function NativeProfileEngagementStats({ stats }: NativeProfileEngagementStatsProps) {
  return (
    <View style={styles.section}>
      <View style={styles.row}>
        {STAT_ITEMS.map((item, index) => (
          <View key={item.key} style={styles.item}>
            {index > 0 ? <View style={styles.divider} /> : null}
            <View style={styles.itemContent}>
              <Text style={styles.count}>{stats ? stats[item.key] : 0}</Text>
              <Text style={styles.label}>{item.label}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    paddingHorizontal: huddleSpacing.x5,
    paddingTop: huddleSpacing.x6,
    paddingBottom: huddleSpacing.x6,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
  },
  divider: {
    width: 1,
    height: 28,
    marginHorizontal: huddleSpacing.x5,
    backgroundColor: huddleColors.sectionDividerStrong,
  },
  itemContent: {
    alignItems: "center",
    minWidth: 56,
  },
  count: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.h4,
    lineHeight: huddleType.h4Line,
    color: huddleColors.text,
  },
  label: {
    marginTop: 2,
    fontFamily: "Urbanist-600",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
    color: huddleColors.mutedText,
  },
});
