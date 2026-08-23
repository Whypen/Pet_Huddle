// Shared collapsible profile/pet section (Bumble-style).
//
// Edit mode: each section is a self-contained card — title + chevron in the
// header, fields revealed below a hairline divider when open. Onboarding mode
// (collapsible=false): plain always-open section so required fields are never
// hidden mid-signup. Both forms (Set Profile, Set Pet) use this so the
// treatment and tokens stay identical.

import { Feather } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { huddleColors, huddleLayout, huddleRadii, huddleShadows, huddleSpacing, huddleType } from "../../theme/huddleDesignTokens";

export function NativeCollapsibleSection({
  title,
  collapsible,
  open,
  onToggle,
  bodyStyle,
  children,
}: {
  title: string;
  collapsible: boolean;
  open: boolean;
  onToggle: () => void;
  bodyStyle?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  if (!collapsible) {
    return (
      <View style={styles.plainSection}>
        <Text style={styles.title}>{title}</Text>
        {children}
      </View>
    );
  }
  return (
    <View style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={onToggle}
        style={styles.header}
      >
        <Text style={styles.title}>{title}</Text>
        <Feather color={huddleColors.iconMuted} name={open ? "chevron-up" : "chevron-down"} size={18} />
      </Pressable>
      {open ? <View style={[styles.body, bodyStyle]}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  plainSection: {
    gap: huddleSpacing.x3,
  },
  card: {
    borderRadius: huddleRadii.card,
    backgroundColor: huddleColors.canvas,
    paddingHorizontal: huddleSpacing.x4,
    paddingVertical: huddleSpacing.x3,
    ...huddleShadows.glassElevation2,
  },
  header: {
    minHeight: huddleLayout.minTouch,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: huddleSpacing.x2,
  },
  body: {
    gap: huddleSpacing.x3,
    marginTop: huddleSpacing.x3,
    paddingTop: huddleSpacing.x3,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: huddleColors.sectionDividerStrong,
  },
  title: {
    flex: 1,
    fontFamily: "Urbanist-700",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: huddleColors.blue,
  },
});
