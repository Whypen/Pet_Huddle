import { Children, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode, Ref } from "react";
import { ActivityIndicator, Animated, Modal, PanResponder, Pressable, ScrollView, StyleSheet, Text, TextInput, type StyleProp, type TextInputProps, type TextStyle, View, type ViewStyle } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Reanimated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { huddleModalTokens, nativeModalStyles } from "./nativeModalPrimitives.styles";
import { huddleColors, huddleRadii, huddleSpacing, huddleType } from "../theme/huddleDesignTokens";
import { springTab } from "../lib/nativeAnimations";
import { haptic } from "../lib/nativeHaptics";

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

export function AppBottomSheet({
  children,
  closeDistance = 96,
  closeVelocity = 0.9,
  disableSwipeToClose = false,
  large = false,
  mode,
  onClose,
  style,
}: {
  children: ReactNode;
  closeDistance?: number;
  closeVelocity?: number;
  disableSwipeToClose?: boolean;
  large?: boolean;
  mode?: "content" | "large" | "autoMax";
  onClose?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const resolvedMode = mode ?? (large ? "large" : "content");
  const dragY = useRef(new Animated.Value(0)).current;
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  const handleClose = useCallback(() => {
    closeRef.current?.();
  }, []);

  const pullDownResponder = useMemo(
    () => PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => !disableSwipeToClose && Boolean(onClose) && gestureState.dy > 10 && Math.abs(gestureState.dx) < 18,
      onPanResponderMove: (_, gestureState) => {
        dragY.setValue(Math.max(0, gestureState.dy));
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > closeDistance || gestureState.vy > closeVelocity) {
          Animated.spring(dragY, { toValue: 640, damping: 24, stiffness: 280, useNativeDriver: true }).start(() => {
            dragY.setValue(0);
            handleClose();
          });
          return;
        }
        Animated.spring(dragY, { toValue: 0, damping: 24, stiffness: 280, useNativeDriver: true }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(dragY, { toValue: 0, damping: 24, stiffness: 280, useNativeDriver: true }).start();
      },
    }),
    [closeDistance, closeVelocity, disableSwipeToClose, dragY, handleClose, onClose],
  );

  const sheet = (
    <Animated.View
      style={[
        nativeModalStyles.appBottomSheet,
        resolvedMode === "large"
          ? nativeModalStyles.appBottomSheetLarge
          : resolvedMode === "autoMax"
          ? nativeModalStyles.appBottomSheetAutoMax
          : nativeModalStyles.appBottomSheetContent,
        style,
        onClose && !disableSwipeToClose ? { transform: [{ translateY: dragY }] } : null,
      ]}
      {...(onClose && !disableSwipeToClose ? pullDownResponder.panHandlers : {})}
    >
      {children}
    </Animated.View>
  );
  return sheet;
}

export function AppBottomSheetHeader({ children, onLayout }: { children: ReactNode; onLayout?: (event: import("react-native").LayoutChangeEvent) => void }) {
  return <View onLayout={onLayout} style={nativeModalStyles.appBottomSheetHeader}>{children}</View>;
}

export function AppBottomSheetScroll({
  children,
  edgeToEdge = false,
  fill = false,
  contentContainerStyle,
  scrollRef,
}: {
  children: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  edgeToEdge?: boolean;
  fill?: boolean;
  scrollRef?: Ref<ScrollView>;
}) {
  return (
    <ScrollView
      alwaysBounceVertical
      bounces
      contentContainerStyle={[nativeModalStyles.appModalScrollContent, edgeToEdge ? nativeModalStyles.appModalScrollContentEdgeToEdge : null, contentContainerStyle]}
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

export function AppBottomSheetFooter({ children, onLayout }: { children: ReactNode; onLayout?: (event: import("react-native").LayoutChangeEvent) => void }) {
  return <View onLayout={onLayout} style={nativeModalStyles.appModalFixedFooter}>{children}</View>;
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
  const actionChildren = Children.toArray(children);
  return (
    <View style={nativeModalStyles.appModalActionRow}>
      {actionChildren.map((child, index) => <View key={`app-modal-action-${index}`} style={nativeModalStyles.appModalActionItem}>{child}</View>)}
    </View>
  );
}


const renderAppModalButtonChild = (child: ReactNode, index: number, variant: "primary" | "secondary" | "destructive") => {
  if (typeof child === "string" || typeof child === "number") {
    return (
      <Text
        key={`button-text-${index}`}
        style={[
          nativeModalStyles.appModalButtonText,
          variant === "secondary" ? nativeModalStyles.appModalButtonTextSecondary : null,
          variant === "destructive" ? nativeModalStyles.appModalButtonTextDestructive : null,
        ]}
      >
        {child}
      </Text>
    );
  }
  return child;
};

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
      {loading ? (
        <ActivityIndicator color={variant === "primary" || variant === "destructive" ? huddleModalTokens.color.onPrimary : huddleModalTokens.color.blue} />
      ) : (
        Children.map(children, (child, index) => renderAppModalButtonChild(child, index, variant))
      )}
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


export function AppConfirmModal({
  body,
  cancel,
  cancelLabel = "Cancel",
  children,
  confirm,
  confirmLabel,
  destructive = false,
  loading = false,
  message,
  onCancel,
  onConfirm,
  open,
  showClose,
  title,
  visible,
}: {
  body?: ReactNode;
  cancel?: string | null;
  cancelLabel?: string | null;
  children?: ReactNode;
  confirm?: string;
  confirmLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  message?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
  open?: boolean;
  showClose?: boolean;
  title: string;
  visible?: boolean;
}) {
  const isVisible = visible ?? open ?? false;
  const finalCancelLabel = cancel ?? cancelLabel;
  const finalConfirmLabel = confirmLabel ?? confirm ?? "Confirm";

  return (
    <Modal animationType="fade" presentationStyle="overFullScreen" transparent visible={isVisible} onRequestClose={onCancel}>
      <Pressable style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalSafeArea]} onPress={onCancel}>
        <Pressable onPress={(event) => event.stopPropagation()} style={nativeModalStyles.appConfirmBoundary}>
          <View style={nativeModalStyles.appConfirmCard}>
            <Text style={nativeModalStyles.appConfirmTitle}>{title}</Text>
            {typeof body === "string" ? <Text style={nativeModalStyles.appConfirmBody}>{body}</Text> : body}
            {children}
            {message ? <Text style={nativeModalStyles.appModalError}>{message}</Text> : null}
            <AppModalActionRow>
              {finalCancelLabel ? <AppModalButton disabled={loading} variant="secondary" onPress={onCancel}>{finalCancelLabel}</AppModalButton> : null}
              <AppModalButton disabled={loading} loading={loading} variant={destructive ? "destructive" : "primary"} onPress={onConfirm}>{finalConfirmLabel}</AppModalButton>
            </AppModalActionRow>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// Shared "slide to confirm" bar — destructive (red) or primary (blue) tone.
// Gesture physics match SlideToPublish in NativeBroadcastModal:
// - activeOffsetX([12, 9999]), failOffsetY([-12, 12])
// - mid-tick haptic at 50%, primaryConfirm haptic at 92% commit
// - spring-back on undershoot, resets via resetKey
// When disabled, the bar grays out and tap triggers onDisabledPress (intended for form-shake).
export function SlideToConfirm({
  busy = false,
  disabled = false,
  label,
  onCommit,
  onDisabledPress,
  resetKey = 0,
  tone = "primary",
}: {
  busy?: boolean;
  disabled?: boolean;
  label: string;
  onCommit: () => void | Promise<void>;
  onDisabledPress?: () => void;
  resetKey?: number;
  tone?: "primary" | "destructive";
}) {
  const THUMB_SIZE = 48;
  const [trackWidth, setTrackWidth] = useState(0);
  const maxTranslate = Math.max(0, trackWidth - THUMB_SIZE - 8);
  const translateX = useSharedValue(0);
  const hitMid = useSharedValue(false);
  const committedRef = useRef(false);
  const prevBusyRef = useRef(false);
  const onCommitRef = useRef(onCommit);

  useEffect(() => { onCommitRef.current = onCommit; }, [onCommit]);

  useEffect(() => {
    if (prevBusyRef.current && !busy && committedRef.current) {
      committedRef.current = false;
      translateX.value = withSpring(0, springTab);
    }
    prevBusyRef.current = busy;
  }, [busy, translateX]);

  useEffect(() => {
    committedRef.current = false;
    hitMid.value = false;
    translateX.value = withSpring(0, springTab);
  }, [resetKey, hitMid, translateX]);

  const handleCommit = useCallback(() => {
    committedRef.current = true;
    void onCommitRef.current();
  }, []);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([12, 9999])
        .failOffsetY([-12, 12])
        .enabled(!disabled && !busy)
        .onBegin(() => {
          "worklet";
          hitMid.value = false;
          runOnJS(haptic.selectTab)();
        })
        .onUpdate((event) => {
          "worklet";
          translateX.value = Math.max(0, Math.min(event.translationX, maxTranslate));
          if (!hitMid.value && translateX.value >= maxTranslate * 0.5) {
            hitMid.value = true;
            runOnJS(haptic.selectTab)();
          }
        })
        .onEnd(() => {
          "worklet";
          if (translateX.value >= maxTranslate * 0.92) {
            runOnJS(haptic.primaryConfirm)();
            runOnJS(handleCommit)();
          } else {
            translateX.value = withSpring(0, springTab);
            runOnJS(haptic.swipeReturn)();
          }
        }),
    [busy, disabled, handleCommit, hitMid, maxTranslate, translateX],
  );

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const trackBackgroundColor = tone === "destructive" ? huddleColors.validationRed : huddleColors.blue;
  const thumbIconColor = tone === "destructive" ? huddleColors.validationRed : huddleColors.blue;

  // When disabled, the pan gesture is inert. Wrap in a Pressable so we can fire onDisabledPress (shake).
  const trackInner = (
    <View
      collapsable={false}
      onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
      style={[slideToConfirmStyles.track, disabled ? slideToConfirmStyles.trackDisabled : { backgroundColor: trackBackgroundColor }]}
    >
      <Text style={[slideToConfirmStyles.label, disabled ? slideToConfirmStyles.labelDisabled : null]}>{label}</Text>
      <Reanimated.View style={[slideToConfirmStyles.thumb, thumbStyle]}>
        {busy ? (
          <ActivityIndicator color={thumbIconColor} size="small" />
        ) : (
          <MaterialCommunityIcons color={thumbIconColor} name={tone === "destructive" ? "alert" : "arrow-right"} size={20} />
        )}
      </Reanimated.View>
    </View>
  );

  if (disabled) {
    return (
      <Pressable onPress={onDisabledPress} style={slideToConfirmStyles.wrapper}>
        {trackInner}
      </Pressable>
    );
  }

  return (
    <GestureDetector gesture={panGesture}>
      <View collapsable={false} style={slideToConfirmStyles.wrapper}>
        {trackInner}
      </View>
    </GestureDetector>
  );
}

const slideToConfirmStyles = StyleSheet.create({
  wrapper: {
    width: "100%",
  },
  track: {
    width: "100%",
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  trackDisabled: {
    backgroundColor: huddleColors.mutedCanvas,
  },
  label: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.onPrimary,
  },
  labelDisabled: {
    color: huddleColors.mutedText,
  },
  thumb: {
    position: "absolute",
    left: 4,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: huddleColors.canvas,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
});

// Destructive confirm modal: top-right X close (shared token), title, body, slide-to-destruct bar.
// No Cancel button — X is the only abort path.
export function AppDestructiveSlideConfirm({
  body,
  busy = false,
  message,
  onClose,
  onConfirm,
  open,
  slideLabel,
  title,
}: {
  body?: ReactNode;
  busy?: boolean;
  message?: string | null;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  open: boolean;
  slideLabel: string;
  title: string;
}) {
  const [resetKey, setResetKey] = useState(0);
  useEffect(() => { if (!open) setResetKey((current) => current + 1); }, [open]);

  return (
    <Modal animationType="fade" presentationStyle="overFullScreen" transparent visible={open} onRequestClose={onClose}>
      <Pressable style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalSafeArea]} onPress={busy ? undefined : onClose}>
        <Pressable onPress={(event) => event.stopPropagation()} style={nativeModalStyles.appConfirmBoundary}>
          <View style={[nativeModalStyles.appConfirmCard, destructiveSlideStyles.card]}>
            <AppModalCloseButton onPress={busy ? () => undefined : onClose} />
            <Text style={[nativeModalStyles.appConfirmTitle, destructiveSlideStyles.title]}>{title}</Text>
            {typeof body === "string" ? <Text style={nativeModalStyles.appConfirmBody}>{body}</Text> : body}
            {message ? <Text style={nativeModalStyles.appModalError}>{message}</Text> : null}
            <View style={destructiveSlideStyles.slideRow}>
              <SlideToConfirm busy={busy} label={slideLabel} onCommit={onConfirm} resetKey={resetKey} tone="destructive" />
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function AppSlideConfirm({
  body,
  busy = false,
  message,
  onClose,
  onConfirm,
  open,
  slideLabel,
  title,
}: {
  body?: ReactNode;
  busy?: boolean;
  message?: string | null;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  open: boolean;
  slideLabel: string;
  title: string;
}) {
  const [resetKey, setResetKey] = useState(0);
  useEffect(() => { if (!open) setResetKey((current) => current + 1); }, [open]);

  return (
    <Modal animationType="fade" presentationStyle="overFullScreen" transparent visible={open} onRequestClose={onClose}>
      <Pressable style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalSafeArea]} onPress={busy ? undefined : onClose}>
        <Pressable onPress={(event) => event.stopPropagation()} style={nativeModalStyles.appConfirmBoundary}>
          <View style={[nativeModalStyles.appConfirmCard, destructiveSlideStyles.card]}>
            <AppModalCloseButton onPress={busy ? () => undefined : onClose} />
            <Text style={[nativeModalStyles.appConfirmTitle, destructiveSlideStyles.title]}>{title}</Text>
            {typeof body === "string" ? <Text style={nativeModalStyles.appConfirmBody}>{body}</Text> : body}
            {message ? <Text style={nativeModalStyles.appModalError}>{message}</Text> : null}
            <View style={destructiveSlideStyles.slideRow}>
              <SlideToConfirm busy={busy} label={slideLabel} onCommit={onConfirm} resetKey={resetKey} />
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const destructiveSlideStyles = StyleSheet.create({
  card: {
    paddingTop: huddleSpacing.x8,
  },
  title: {
    paddingRight: huddleSpacing.x6,
  },
  slideRow: {
    marginTop: huddleSpacing.x2,
  },
});
