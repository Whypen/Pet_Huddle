import Feather from "@expo/vector-icons/Feather";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  huddleButtons,
  huddleColors,
  huddleRadii,
  huddleShadows,
  huddleSpacing,
  huddleType,
} from "../../theme/huddleDesignTokens";

type NativeMapErrorStateProps = {
  body: string;
  onRetry?: () => void;
  title: string;
};

export function NativeMapErrorState({ body, onRetry, title }: NativeMapErrorStateProps) {
  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.iconWrap}>
          <Feather color={huddleColors.blue} name="map-pin" size={22} />
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>{body}</Text>
        {onRetry ? (
          <Pressable accessibilityRole="button" onPress={onRetry} style={({ pressed }) => [
            styles.retryButton,
            pressed ? huddleButtons.pressed : null,
          ]}>
            <Text style={styles.retryLabel}>Retry</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: huddleSpacing.x6,
    backgroundColor: huddleColors.canvas,
  },
  card: {
    width: "100%",
    maxWidth: 320,
    alignItems: "center",
    gap: huddleSpacing.x3,
    padding: huddleSpacing.x5,
    borderWidth: 1,
    borderColor: huddleColors.cardBorderSoft,
    borderRadius: huddleRadii.card,
    backgroundColor: huddleColors.canvas,
    ...huddleShadows.glassElevation1,
  },
  iconWrap: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: huddleRadii.pill,
    backgroundColor: huddleColors.blueSoft,
  },
  title: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.h3,
    lineHeight: huddleType.h3Line,
    color: huddleColors.text,
    textAlign: "center",
  },
  body: {
    fontFamily: "Urbanist-400",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.subtext,
    textAlign: "center",
  },
  retryButton: {
    minWidth: 132,
    ...huddleButtons.base,
    ...huddleButtons.primary,
  },
  retryLabel: {
    ...huddleButtons.label,
    color: huddleColors.onPrimary,
  },
});
