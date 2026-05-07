import { Children } from "react";
import type { ReactNode, Ref } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, type StyleProp, type TextInputProps, type TextStyle, View, type ViewStyle } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { huddleModalTokens, nativeModalStyles } from "./nativeModalPrimitives.styles";
import { huddleColors } from "../theme/huddleDesignTokens";

export function AppModalCloseButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityLabel="Close"
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [nativeModalStyles.appModalClose, pressed ? nativeModalStyles.pressed : null]}
    >
      <Feather color={huddleModalTokens.color.text} name="x" size={24} />
    </Pressable>
  );
}

export function AppModalIconButton({
  accessibilityLabel,
  children,
  disabled,
  onPress,
}: {
  accessibilityLabel: string;
  children: ReactNode;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        nativeModalStyles.appModalIconButton,
        pressed && !disabled ? nativeModalStyles.pressed : null,
        disabled ? nativeModalStyles.disabled : null,
      ]}
    >
      {children}
    </Pressable>
  );
}

export function AppModalCard({ children, fullHeight = false }: { children: ReactNode; fullHeight?: boolean }) {
  return <View style={fullHeight ? nativeModalStyles.appModalCardFull : nativeModalStyles.appModalCard}>{children}</View>;
}

export function AppModalScroll({ children, edgeToEdge = false }: { children: ReactNode; edgeToEdge?: boolean }) {
  return (
    <ScrollView
      bounces
      contentContainerStyle={[nativeModalStyles.appModalScrollContent, edgeToEdge ? nativeModalStyles.appModalScrollContentEdgeToEdge : null]}
      decelerationRate="normal"
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      style={nativeModalStyles.appModalScroll}
    >
      {children}
    </ScrollView>
  );
}

export function AppBottomSheet({ children, large = false, mode }: { children: ReactNode; large?: boolean; mode?: "content" | "large" | "autoMax" }) {
  const resolvedMode = mode ?? (large ? "large" : "content");
  return (
    <View
      style={[
        nativeModalStyles.appBottomSheet,
        resolvedMode === "large"
          ? nativeModalStyles.appBottomSheetLarge
          : resolvedMode === "autoMax"
          ? nativeModalStyles.appBottomSheetAutoMax
          : nativeModalStyles.appBottomSheetContent,
      ]}
    >
      {children}
    </View>
  );
}

export function AppBottomSheetHeader({ children }: { children: ReactNode }) {
  return <View style={nativeModalStyles.appBottomSheetHeader}>{children}</View>;
}

export function AppBottomSheetScroll({
  children,
  edgeToEdge = false,
  fill = false,
  scrollRef,
}: {
  children: ReactNode;
  edgeToEdge?: boolean;
  fill?: boolean;
  scrollRef?: Ref<ScrollView>;
}) {
  return (
    <ScrollView
      alwaysBounceVertical
      bounces
      contentContainerStyle={[nativeModalStyles.appModalScrollContent, edgeToEdge ? nativeModalStyles.appModalScrollContentEdgeToEdge : null]}
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
      nestedScrollEnabled
      ref={scrollRef}
      scrollEventThrottle={16}
      showsVerticalScrollIndicator={false}
      style={[nativeModalStyles.appModalScroll, nativeModalStyles.appBottomSheetScroll, fill ? nativeModalStyles.appBottomSheetScrollFill : null]}
    >
      {children}
    </ScrollView>
  );
}

export function AppBottomSheetFooter({ children }: { children: ReactNode }) {
  return <View style={nativeModalStyles.appModalFixedFooter}>{children}</View>;
}

export function AppModalField({
  error,
  focused,
  multiline = false,
  style,
  ...props
}: { error?: boolean; focused?: boolean; multiline?: boolean } & TextInputProps) {
  return (
    <TextInput
      {...props}
      multiline={multiline}
      placeholderTextColor={huddleModalTokens.color.mutedText}
      scrollEnabled={multiline}
      style={[
        nativeModalStyles.appModalField,
        multiline ? nativeModalStyles.appModalTextArea : null,
        focused ? nativeModalStyles.appModalFieldFocused : null,
        error ? nativeModalStyles.appModalFieldError : null,
        style,
      ]}
    />
  );
}

export function AppModalSelectField({
  label,
  labelStyle,
  open,
  options,
  placeholder,
  textStyle,
  triggerStyle,
  value,
  onSelect,
  onToggle,
}: {
  label: string;
  labelStyle?: StyleProp<TextStyle>;
  open: boolean;
  options: string[];
  placeholder: string;
  textStyle?: StyleProp<TextStyle>;
  triggerStyle?: StyleProp<ViewStyle>;
  value: string | null;
  onSelect: (value: string) => void;
  onToggle: () => void;
}) {
  return (
    <View style={nativeModalStyles.appModalFieldBlock}>
      <Text style={[nativeModalStyles.appModalFieldLabel, labelStyle]}>{label}</Text>
      <Pressable accessibilityRole="button" onPress={onToggle} style={[nativeModalStyles.appModalSelectTrigger, triggerStyle]}>
        <Text numberOfLines={1} style={[nativeModalStyles.appModalSelectText, !value ? nativeModalStyles.appModalSelectPlaceholder : null, textStyle]}>
          {value || placeholder}
        </Text>
        <Feather color={huddleModalTokens.color.mutedText} name={open ? "chevron-up" : "chevron-down"} size={16} />
      </Pressable>
      {open ? (
        <View style={nativeModalStyles.appModalSelectMenu}>
          {options.map((option) => {
            const active = option === value;
            return (
              <Pressable key={option} onPress={() => onSelect(option)} style={nativeModalStyles.appModalSelectOption}>
                <Text style={[nativeModalStyles.appModalSelectOptionText, active ? nativeModalStyles.appModalSelectOptionTextActive : null]}>{option}</Text>
                {active ? <Feather color={huddleModalTokens.color.blue} name="check" size={16} /> : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

export function AppModalError({ children }: { children: ReactNode }) {
  return <Text style={nativeModalStyles.appModalError}>{children}</Text>;
}

export function AppModalActionRow({ children }: { children: ReactNode }) {
  return (
    <View style={nativeModalStyles.appModalActionRow}>
      {Children.map(children, (child) => <View style={nativeModalStyles.appModalActionItem}>{child}</View>)}
    </View>
  );
}

export function AppModalButton({
  children,
  disabled,
  loading,
  onPress,
  variant = "primary",
}: {
  children: ReactNode;
  disabled?: boolean;
  loading?: boolean;
  onPress: () => void;
  variant?: "primary" | "secondary" | "destructive";
}) {
  return (
    <Pressable
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        variant === "primary"
          ? nativeModalStyles.appModalPrimaryButton
          : variant === "destructive"
          ? nativeModalStyles.appModalDestructiveButton
          : nativeModalStyles.appModalSecondaryButton,
        pressed && !(disabled || loading) ? nativeModalStyles.pressed : null,
        disabled || loading ? nativeModalStyles.disabled : null,
      ]}
    >
      {loading ? <ActivityIndicator color={variant === "primary" || variant === "destructive" ? huddleModalTokens.color.onPrimary : huddleModalTokens.color.blue} /> : children}
    </Pressable>
  );
}

export type AppActionMenuItem = {
  label: string;
  icon: keyof typeof Feather.glyphMap;
  onPress: () => void;
  destructive?: boolean;
};

export function AppActionMenu({
  items,
  style,
  textStyle,
}: {
  items: AppActionMenuItem[];
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}) {
  return (
    <View style={[nativeModalStyles.appActionMenuCard, { width: "auto" }, style]}>
      {items.map((item) => (
        <Pressable
          accessibilityRole="button"
          key={item.label}
          onPress={item.onPress}
          style={({ pressed }) => [nativeModalStyles.appActionMenuItem, pressed ? nativeModalStyles.pressed : null]}
        >
          <Feather color={item.destructive ? huddleModalTokens.color.validationRed : huddleColors.iconMuted} name={item.icon} size={18} />
          <Text style={[nativeModalStyles.appActionMenuText, item.destructive ? nativeModalStyles.appActionMenuTextDestructive : null, textStyle]}>{item.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}
