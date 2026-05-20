import { StyleSheet, Text, View } from "react-native";
import { huddleColors, huddleSpacing, huddleType } from "../../theme/huddleDesignTokens";

type NativeProfileColophonProps = {
  lastActiveAt?: string | null;
  memberNumber?: number | null;
  memberSince?: string | null;
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

export function NativeProfileColophon({ lastActiveAt, memberNumber, memberSince }: NativeProfileColophonProps) {
  const since = formatMemberSince(memberSince);
  const activity = formatActivityBucket(lastActiveAt);
  const parts = [
    typeof memberNumber === "number" && memberNumber > 0 ? `#${memberNumber}` : null,
    activity || null,
    since ? `With huddle since ${since}` : "With huddle",
  ].filter(Boolean);

  return (
    <View style={styles.footer}>
      <Text style={styles.text}>{parts.join(" · ")}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    paddingHorizontal: huddleSpacing.x5,
    paddingVertical: huddleSpacing.x8,
    alignItems: "center",
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
