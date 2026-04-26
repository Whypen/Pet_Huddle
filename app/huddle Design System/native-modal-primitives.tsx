import type { ReactNode } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { huddleModalTokens, styles } from "./native-modal-primitives.styles";

/**
 * huddle /app native modal primitives.
 *
 * This file is a design-system reference for active `/app` native implementation.
 * Agents must reuse or port these primitives/tokens when building app-owned modals.
 * Do not create modal-specific close/input/card/error/button styles unless the user
 * explicitly approves a design exception.
 */

export function AppModalCloseButton({
  children,
  onPress,
}: {
  children: ReactNode;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.appModalClose, pressed ? styles.pressed : null]}
      accessibilityRole="button"
      accessibilityLabel="Close"
    >
      {children}
    </Pressable>
  );
}

export function AppModalCard({
  children,
  fullHeight = false,
}: {
  children: ReactNode;
  fullHeight?: boolean;
}) {
  return <View style={fullHeight ? styles.appModalCardFull : styles.appModalCard}>{children}</View>;
}

export function AppModalScroll({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <ScrollView
      bounces={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.appModalScrollContent}
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  );
}

export function AppModalField({
  error,
  focused,
  multiline = false,
  style,
  ...props
}: {
  error?: boolean;
  focused?: boolean;
  multiline?: boolean;
} & React.ComponentProps<typeof TextInput>) {
  return (
    <TextInput
      {...props}
      multiline={multiline}
      scrollEnabled={multiline}
      placeholderTextColor={huddleModalTokens.color.mutedText}
      style={[
        styles.appModalField,
        multiline ? styles.appModalTextArea : null,
        focused ? styles.appModalFieldFocused : null,
        error ? styles.appModalFieldError : null,
        style,
      ]}
    />
  );
}

export function AppModalError({ children }: { children: ReactNode }) {
  return <Text style={styles.appModalError}>{children}</Text>;
}

export function AppModalActionRow({ children }: { children: ReactNode }) {
  return <View style={styles.appModalActionRow}>{children}</View>;
}

export function AppModalButton({
  children,
  variant = "primary",
  onPress,
  disabled,
}: {
  children: ReactNode;
  variant?: "primary" | "secondary";
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        variant === "primary" ? styles.appModalPrimaryButton : styles.appModalSecondaryButton,
        pressed && !disabled ? styles.pressed : null,
        disabled ? styles.disabled : null,
      ]}
    >
      {children}
    </Pressable>
  );
}
