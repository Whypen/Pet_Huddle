import { StyleSheet, Text, View } from "react-native";
import { huddleColors, huddleSpacing } from "../../theme/huddleDesignTokens";

type NativeProfilePullQuoteProps = {
  bio: string;
};

export function NativeProfilePullQuote({ bio }: NativeProfilePullQuoteProps) {
  const text = bio.trim();
  if (!text) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.quote}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    paddingHorizontal: huddleSpacing.x5,
    paddingTop: huddleSpacing.x2,
    paddingBottom: huddleSpacing.x7,
  },
  quote: {
    maxWidth: 340,
    alignSelf: "center",
    fontFamily: "Urbanist-600Italic",
    fontSize: 17,
    lineHeight: 27,
    color: huddleColors.text,
  },
});
