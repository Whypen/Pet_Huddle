import { Feather } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { huddleColors, huddleLayout, huddleRadii, huddleSpacing } from "../theme/huddleDesignTokens";

// Full-screen focused editor: one field group per screen, Hinge-style. The form
// state lives in the parent (edits commit live through the children's own
// onChange wiring), so both the back arrow and Done simply return — nothing is
// discarded, which is why the affordance is a return arrow rather than an X.
// Shared shell for profile editing today; generic enough for Care/Pet fills.

type NativeFocusedEditorProps = {
  children: ReactNode;
  onClose: () => void;
  subtitle?: string;
  title: string;
  visible: boolean;
};

export function NativeFocusedEditor({ children, onClose, subtitle, title, visible }: NativeFocusedEditorProps) {
  const insets = useSafeAreaInsets();
  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen" visible={visible}>
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable accessibilityLabel="Back" accessibilityRole="button" hitSlop={8} onPress={onClose} style={({ pressed }) => [styles.backButton, pressed ? styles.pressed : null]}>
            <Feather color={huddleColors.iconMuted} name="chevron-left" size={26} />
          </Pressable>
          <View style={styles.headerSpacer} />
          <Pressable accessibilityLabel="Done" accessibilityRole="button" hitSlop={8} onPress={onClose} style={({ pressed }) => [styles.doneButton, pressed ? styles.pressed : null]}>
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
        </View>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.keyboard}>
          <ScrollView
            contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + huddleSpacing.x9 }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text ellipsizeMode="tail" numberOfLines={2} style={styles.title}>{title}</Text>
            {subtitle ? <Text ellipsizeMode="tail" numberOfLines={2} style={styles.subtitle}>{subtitle}</Text> : null}
            <View style={styles.body}>{children}</View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: huddleColors.canvas,
  },
  header: {
    minHeight: huddleLayout.headerHeight,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: huddleSpacing.x3,
  },
  backButton: {
    width: huddleLayout.minTouch,
    height: huddleLayout.minTouch,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: huddleRadii.pill,
  },
  headerSpacer: {
    flex: 1,
  },
  doneButton: {
    minHeight: huddleLayout.minTouch,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: huddleSpacing.x3,
    borderRadius: huddleRadii.pill,
  },
  doneText: {
    fontFamily: "Urbanist-800",
    fontSize: 16,
    color: huddleColors.blue,
  },
  pressed: {
    opacity: 0.72,
  },
  keyboard: {
    flex: 1,
  },
  content: {
    paddingHorizontal: huddleSpacing.x5,
    paddingTop: huddleSpacing.x2,
  },
  title: {
    fontFamily: "Urbanist-800",
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.4,
    color: huddleColors.text,
  },
  subtitle: {
    marginTop: huddleSpacing.x2,
    fontFamily: "Urbanist-500",
    fontSize: 13,
    lineHeight: 18,
    color: huddleColors.mutedText,
  },
  body: {
    marginTop: huddleSpacing.x6,
    gap: huddleSpacing.x4,
  },
});
