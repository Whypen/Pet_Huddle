import { StyleSheet, Text, View } from "react-native";
import { huddleColors, huddleSpacing, huddleType } from "../../theme/huddleDesignTokens";
import { NativeEngagementSparkleInline } from "../NativeProfileAvatar";
import type { NativeEngagementSummary } from "../../lib/nativeEngagement";

type NativeProfileColophonProps = {
  lastActiveAt?: string | null;
  memberNumber?: number | null;
  memberSince?: string | null;
  engagement?: NativeEngagementSummary | null;
};

const formatMemberSince = (value?: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en", { month: "short", year: "numeric" });
};

const formatActivityBucket = (value?: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  if (date.getTime() > now.getTime()) return "Active now";

  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  if (date.getTime() >= startOfToday.getTime()) return "Active now";

  const ageMs = now.getTime() - date.getTime();
  if (ageMs <= 7 * 24 * 60 * 60 * 1000) return "Active this week";
  if (ageMs <= 30 * 24 * 60 * 60 * 1000) return "Recently active";
  return "";
};

export function NativeProfileColophon({ lastActiveAt, memberNumber, memberSince, engagement }: NativeProfileColophonProps) {
  const since = formatMemberSince(memberSince);
  const activity = formatActivityBucket(lastActiveAt);
  const percentileRank = engagement?.percentileRank;
  const topPercent = typeof percentileRank === "number" && Number.isFinite(percentileRank)
    ? Math.max(1, Math.round(100 - percentileRank))
    : null;
  // Below the median isn't a flattering stat to broadcast, so we only ever
  // show the percentile line when the user is in the top half.
  const showPercentile = topPercent !== null && topPercent <= 50;

  const memberNumberText = typeof memberNumber === "number" && memberNumber > 0 ? `#${memberNumber}` : null;
  const sinceText = since ? `With huddle since ${since}` : "With huddle";

  const firstLineParts = [memberNumberText, sinceText].filter(Boolean);
  const secondLineParts = showPercentile
    ? [`Top ${topPercent}% members`, activity || null].filter(Boolean)
    : [];

  const singleLineParts = [memberNumberText, sinceText, activity || null].filter(Boolean);

  return (
    <View style={styles.footer}>
      {showPercentile ? (
        <>
          <Text style={styles.text}>{firstLineParts.join(" · ")}</Text>
          <View style={styles.secondLineRow}>
            <NativeEngagementSparkleInline engagement={engagement} size={11} style={styles.secondLineSparkle} />
            <Text style={styles.text}>{secondLineParts.join(" · ")}</Text>
          </View>
        </>
      ) : (
        <Text style={styles.text}>{singleLineParts.join(" · ")}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    paddingHorizontal: huddleSpacing.x5,
    paddingVertical: huddleSpacing.x8,
    alignItems: "center",
    gap: 4,
  },
  secondLineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  secondLineSparkle: {
    marginTop: -1,
  },
  text: {
    textAlign: "center",
    fontFamily: "Urbanist-500",
    fontSize: huddleType.meta,
    lineHeight: 13,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: huddleColors.text,
  },
});
