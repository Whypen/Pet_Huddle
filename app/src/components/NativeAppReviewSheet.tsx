import { useEffect, useState } from "react";
import { Linking, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { AppBottomSheet, AppBottomSheetHeader, AppBottomSheetScroll, AppModalCloseButton } from "./nativeModalPrimitives";
import { nativeModalStyles } from "./nativeModalPrimitives.styles";
import {
  confirmAppReviewPositive,
  recordAppReviewDeclined,
  subscribeAppReviewPrompt,
  type AppReviewPromptCopy,
  type AppReviewTrigger,
} from "../lib/nativeAppReview";
import { huddleColors, huddleRadii, huddleSpacing, huddleType } from "../theme/huddleDesignTokens";

const FEEDBACK_EMAIL = "support@huddle.pet";

type ActivePrompt = { userId: string; trigger: AppReviewTrigger; copy: AppReviewPromptCopy };

// Root-mounted sentiment pre-gate. Listens for delight-moment prompts emitted by
// nativeAppReview and routes: "Yes" → native store review; "Not really" → private
// feedback (so unhappy users never reach the App Store prompt).
export function NativeAppReviewSheet() {
  const [active, setActive] = useState<ActivePrompt | null>(null);

  useEffect(() => subscribeAppReviewPrompt((event) => setActive(event)), []);

  const handlePositive = () => {
    if (!active) return;
    const { userId, trigger } = active;
    setActive(null);
    void confirmAppReviewPositive(userId, trigger);
  };

  const handleNegative = () => {
    if (!active) return;
    const { userId, trigger } = active;
    setActive(null);
    void recordAppReviewDeclined(userId, trigger);
    const subject = encodeURIComponent("huddle feedback");
    const body = encodeURIComponent("What would make huddle better for you?\n\n");
    void Linking.openURL(`mailto:${FEEDBACK_EMAIL}?subject=${subject}&body=${body}`).catch(() => undefined);
  };

  if (!active) return null;

  return (
    <Modal animationType="fade" transparent visible onRequestClose={() => setActive(null)}>
      <View style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalBottomSafeArea]}>
        <Pressable accessibilityLabel="Close app review prompt" accessibilityRole="button" onPress={() => setActive(null)} style={StyleSheet.absoluteFill} />
        <View pointerEvents="box-none" style={nativeModalStyles.appBottomSheetEventBoundary}>
          <AppBottomSheet mode="content" onClose={() => setActive(null)} style={styles.sheet}>
            <AppBottomSheetHeader>
              <View style={styles.headerCopy}>
                <Text ellipsizeMode="tail" numberOfLines={2} style={[nativeModalStyles.appModalSheetTitle, styles.title]}>{active.copy.title}</Text>
              </View>
              <AppModalCloseButton onPress={() => setActive(null)} />
            </AppBottomSheetHeader>
            <AppBottomSheetScroll contentContainerStyle={styles.bodyScroll}>
              <Text style={styles.body}>{active.copy.body}</Text>
              <Pressable
                accessibilityRole="button"
                onPress={handlePositive}
                style={({ pressed }) => [styles.primary, pressed ? styles.pressed : null]}
              >
                <Text style={styles.primaryLabel}>{active.copy.positiveLabel}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={handleNegative}
                style={({ pressed }) => [styles.secondary, pressed ? styles.pressed : null]}
              >
                <Text style={styles.secondaryLabel}>Not really</Text>
              </Pressable>
            </AppBottomSheetScroll>
          </AppBottomSheet>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  bodyScroll: {
    gap: huddleSpacing.x3,
  },
  title: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.h3,
    lineHeight: huddleType.h3Line,
    color: huddleColors.text,
    textAlign: "left",
  },
  body: {
    fontFamily: "Urbanist-500",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.mutedText,
    textAlign: "left",
  },
  primary: {
    backgroundColor: huddleColors.blue,
    borderRadius: huddleRadii.pill,
    paddingVertical: huddleSpacing.x4,
    alignItems: "center",
  },
  primaryLabel: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.onPrimary,
  },
  secondary: {
    paddingVertical: huddleSpacing.x3,
    alignItems: "center",
  },
  secondaryLabel: {
    fontFamily: "Urbanist-600",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.mutedText,
  },
  pressed: {
    opacity: 0.85,
  },
});
