import Feather from "@expo/vector-icons/Feather";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppBottomSheet } from "../nativeModalPrimitives";
import { nativeModalStyles } from "../nativeModalPrimitives.styles";
import { huddleCoachMark, huddleColors, huddleSpacing, huddleType } from "../../theme/huddleDesignTokens";

// Same editorial language as the spotlight coach marks — accent rule, kicker,
// bold headline, supporting line — so the two onboarding surfaces read as one
// system. Dimensions come from the shared huddleCoachMark tokens; only the
// colours differ, because this sits on the sheet canvas rather than a dim scrim.
//
// Mounted exactly like NativeAppReviewSheet.tsx (the codebase's other
// AppBottomSheet usage): the shared appModalBackdrop/appModalBottomSafeArea
// tokens for the backdrop and bottom placement, and Modal's own
// animationType="fade" for entrance — no bespoke Reanimated split-animation,
// which is what left a gap between the sheet and the screen edge.
//
// No CTA: the whole overlay is the dismiss target, matching the spotlight's
// tap-anywhere contract. A Continue button would be a second way to do the only
// thing this sheet does.
export function NativeVerifyIntroSheet({
  onDismiss,
  visible,
}: {
  onDismiss: () => void;
  visible: boolean;
}) {
  const insets = useSafeAreaInsets();

  if (!visible) return null;

  return (
    <Modal animationType="fade" statusBarTranslucent transparent visible={visible} onRequestClose={onDismiss}>
      <Pressable
        accessibilityLabel="Continue"
        accessibilityRole="button"
        onPress={onDismiss}
        style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalBottomSafeArea]}
      >
        <AppBottomSheet disableSwipeToClose mode="content">
          <View pointerEvents="none" style={[styles.content, { paddingBottom: insets.bottom + huddleSpacing.x5 }]}>
            <View style={styles.rule} />
            <Text style={styles.kicker}>Identity</Text>
            <View style={styles.headlineRow}>
              <Feather color={huddleColors.blue} name="shield" size={22} />
              <Text style={styles.headline}>Verify to build trust</Text>
            </View>
            <Text style={nativeModalStyles.appConfirmBody}>We do human check and ID scan and discard them. Only verified badge and confirmed data will be stored into your profile</Text>
            <Text style={styles.hint}>Tap anywhere to continue</Text>
          </View>
        </AppBottomSheet>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: huddleCoachMark.blockLeft,
    paddingTop: huddleSpacing.x5,
  },
  rule: {
    width: huddleCoachMark.ruleWidth,
    height: huddleCoachMark.ruleHeight,
    backgroundColor: huddleColors.blue,
    marginBottom: huddleSpacing.x3,
  },
  kicker: {
    color: huddleColors.mutedText,
    fontFamily: "Urbanist-700",
    fontSize: huddleType.meta,
    lineHeight: huddleType.metaLine,
    letterSpacing: huddleCoachMark.kickerLetterSpacing,
    marginBottom: huddleSpacing.x2,
    textTransform: "uppercase",
  },
  headlineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x2,
    marginBottom: huddleSpacing.x2,
  },
  headline: {
    flexShrink: 1,
    color: huddleColors.text,
    fontFamily: "Urbanist-700",
    fontSize: huddleType.h1,
    lineHeight: huddleType.h1Line,
  },
  hint: {
    color: huddleColors.mutedText,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.meta,
    lineHeight: huddleType.metaLine,
    marginTop: huddleSpacing.x5,
  },
});
