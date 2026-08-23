import { Children, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ComponentProps, ReactNode, Ref } from "react";
import { Animated, Keyboard, KeyboardAvoidingView as RNKeyboardAvoidingView, Modal, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, type StyleProp, type TextInputProps, type TextStyle, View, type ViewStyle } from "react-native";
import { KeyboardAvoidingView as AndroidKeyboardAvoidingView, type KeyboardAvoidingViewProps } from "react-native-keyboard-controller";
import { NativeSpinner } from "./NativeSpinner";
import Feather from "@expo/vector-icons/Feather";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Reanimated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { huddleModalTokens, nativeModalStyles } from "./nativeModalPrimitives.styles";
import { huddleColors, huddleRadii, huddleSpacing, huddleType } from "../theme/huddleDesignTokens";
import { springTab } from "../lib/nativeAnimations";
import { haptic } from "../lib/nativeHaptics";
import { canInvokeNativeSlideCommit, shouldCommitNativeSlide } from "../lib/nativeSlideToConfirm";

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

export function AppKeyboardAvoidingView(props: KeyboardAvoidingViewProps) {
  if (Platform.OS === "android") {
    return <AndroidKeyboardAvoidingView {...props} />;
  }
  return <RNKeyboardAvoidingView {...(props as ComponentProps<typeof RNKeyboardAvoidingView>)} />;
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
  swipeToCloseArea = "header",
}: {
  children: ReactNode;
  closeDistance?: number;
  closeVelocity?: number;
  disableSwipeToClose?: boolean;
  large?: boolean;
  mode?: "content" | "large" | "autoMax";
  onClose?: () => void;
  style?: StyleProp<ViewStyle>;
  swipeToCloseArea?: "sheet" | "header";
}) {
  const resolvedMode = mode ?? (large ? "large" : "content");
  const dragY = useRef(new Animated.Value(0)).current;
  const closeRef = useRef(onClose);
  const closingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    mountedRef.current = true;
    closingRef.current = false;
    dragY.setValue(0);
    return () => {
      mountedRef.current = false;
      closingRef.current = false;
      dragY.stopAnimation();
    };
  }, [dragY]);

  const handleClose = useCallback(() => {
    closeRef.current?.();
  }, []);

  const closeFromSwipe = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    dragY.stopAnimation();
    dragY.setValue(0);
    handleClose();
    setTimeout(() => {
      if (mountedRef.current) closingRef.current = false;
    }, 350);
  }, [dragY, handleClose]);

  const pullDownResponder = useMemo(
    () => PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => !closingRef.current && !disableSwipeToClose && Boolean(onClose) && gestureState.dy > 10 && Math.abs(gestureState.dx) < 18,
      onPanResponderGrant: () => {
        dragY.stopAnimation();
      },
      onPanResponderMove: (_, gestureState) => {
        if (closingRef.current) return;
        dragY.setValue(Math.max(0, gestureState.dy));
      },
      onPanResponderRelease: (_, gestureState) => {
        if (closingRef.current) return;
        if (gestureState.dy > closeDistance || gestureState.vy > closeVelocity) {
          closeFromSwipe();
          return;
        }
        Animated.spring(dragY, { toValue: 0, damping: 24, stiffness: 280, useNativeDriver: true }).start();
      },
      onPanResponderTerminate: () => {
        if (closingRef.current) return;
        Animated.spring(dragY, { toValue: 0, damping: 24, stiffness: 280, useNativeDriver: true }).start();
      },
    }),
    [closeDistance, closeFromSwipe, closeVelocity, disableSwipeToClose, dragY, onClose],
  );

  const canSwipeToClose = Boolean(onClose) && !disableSwipeToClose;
  const panHandlers = canSwipeToClose ? pullDownResponder.panHandlers : {};
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
        canSwipeToClose ? { transform: [{ translateY: dragY }] } : null,
      ]}
      {...(canSwipeToClose && swipeToCloseArea === "sheet" ? panHandlers : {})}
    >
      {canSwipeToClose ? (
        // The handle drags too when only the header owns the gesture, otherwise
        // the one affordance for swiping would itself be inert.
        <View {...(swipeToCloseArea === "header" ? panHandlers : {})} style={nativeModalStyles.appBottomSheetHandleArea}>
          <View style={nativeModalStyles.appBottomSheetHandle} />
        </View>
      ) : null}
      {swipeToCloseArea === "header"
        ? Children.map(children, (child, index) => index === 0 && canSwipeToClose && typeof child === "object" && child && "props" in child
          ? <View {...panHandlers}>{child}</View>
          : child)
        : children}
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
  scrollEnabled = true,
  scrollRef,
}: {
  children: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  edgeToEdge?: boolean;
  fill?: boolean;
  scrollEnabled?: boolean;
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
      scrollEnabled={scrollEnabled}
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
      lineBreakModeIOS={props.lineBreakModeIOS ?? (multiline ? undefined : "tail")}
      lineBreakStrategyIOS={props.lineBreakStrategyIOS ?? (multiline ? undefined : "none")}
      multiline={multiline}
      numberOfLines={props.numberOfLines ?? (multiline ? undefined : 1)}
      returnKeyType={props.returnKeyType ?? (multiline ? undefined : "done")}
      onSubmitEditing={props.onSubmitEditing ?? (multiline ? undefined : () => Keyboard.dismiss())}
      placeholderTextColor={huddleModalTokens.color.mutedText}
      scrollEnabled={props.scrollEnabled ?? true}
      textBreakStrategy={props.textBreakStrategy ?? (multiline ? undefined : "simple")}
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
  formatLabel,
  fieldBlockStyle,
  label,
  labelStyle,
  open,
  options,
  optionStyle,
  placeholder,
  textStyle,
  triggerStyle,
  value,
  onSelect,
  onToggle,
}: {
  formatLabel?: (value: string) => string;
  fieldBlockStyle?: StyleProp<ViewStyle>;
  label: string;
  labelStyle?: StyleProp<TextStyle>;
  open: boolean;
  options: string[];
  optionStyle?: StyleProp<ViewStyle>;
  placeholder: string;
  textStyle?: StyleProp<TextStyle>;
  triggerStyle?: StyleProp<ViewStyle>;
  value: string | null;
  onSelect: (value: string) => void;
  onToggle: () => void;
}) {
  return (
    <View style={[nativeModalStyles.appModalFieldBlock, fieldBlockStyle]}>
      <Text style={[nativeModalStyles.appModalFieldLabel, labelStyle]}>{label}</Text>
      <Pressable accessibilityRole="button" onPress={onToggle} style={[nativeModalStyles.appModalSelectTrigger, open ? nativeModalStyles.appModalFieldFocused : null, triggerStyle]}>
        <Text numberOfLines={1} style={[nativeModalStyles.appModalSelectText, !value ? nativeModalStyles.appModalSelectPlaceholder : null, textStyle]}>
          {value ? (formatLabel?.(value) ?? value) : placeholder}
        </Text>
        <Feather color={huddleModalTokens.color.mutedText} name={open ? "chevron-up" : "chevron-down"} size={16} />
      </Pressable>
      {open ? (
        <ScrollView bounces={false} keyboardShouldPersistTaps="handled" nestedScrollEnabled showsVerticalScrollIndicator={false} style={nativeModalStyles.appModalSelectMenu}>
          {options.map((option) => {
            const active = option === value;
            return (
              <Pressable key={option} onPress={() => onSelect(option)} style={[nativeModalStyles.appModalSelectOption, optionStyle]}>
                <Text ellipsizeMode="tail" numberOfLines={1} style={[nativeModalStyles.appModalSelectOptionText, active ? nativeModalStyles.appModalSelectOptionTextActive : null]}>{formatLabel?.(option) ?? option}</Text>
                {active ? <Feather color={huddleModalTokens.color.blue} name="check" size={16} /> : null}
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );
}

export function AppModalError({ children }: { children: ReactNode }) {
  return <Text style={nativeModalStyles.appModalError}>{children}</Text>;
}

export function AppModalToggleRow({ disabled, label, onChange, value }: { disabled?: boolean; label: string; onChange: (value: boolean) => void; value: boolean }) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={() => onChange(!value)}
      style={({ pressed }) => [
        nativeModalStyles.appModalToggleRow,
        value ? nativeModalStyles.appModalToggleRowActive : null,
        pressed && !disabled ? nativeModalStyles.pressed : null,
        disabled ? nativeModalStyles.disabled : null,
      ]}
    >
      <Text style={nativeModalStyles.appModalToggleLabel}>{label}</Text>
      <View style={[nativeModalStyles.appModalToggleControl, value ? nativeModalStyles.appModalToggleControlActive : null]}>
        {value ? <Feather color={huddleModalTokens.color.onPrimary} name="check" size={huddleModalTokens.spacing.x5} /> : null}
      </View>
    </Pressable>
  );
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
  accessibilityLabel,
  children,
  disabled,
  loading,
  onPress,
  variant = "primary",
}: {
  accessibilityLabel?: string;
  children: ReactNode;
  disabled?: boolean;
  loading?: boolean;
  onPress: () => void;
  variant?: "primary" | "secondary" | "destructive";
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
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
        <NativeSpinner tone={variant === "primary" || variant === "destructive" ? "primary" : "accent"} />
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
  /** Muted actions remain tappable when they need to explain why they are unavailable. */
  muted?: boolean;
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
          style={({ pressed }) => [
            nativeModalStyles.appActionMenuItem,
            item.muted ? nativeModalStyles.appActionMenuItemMuted : null,
            pressed ? nativeModalStyles.pressed : null,
          ]}
        >
          <Feather color={item.muted ? huddleColors.mutedText : item.destructive ? huddleModalTokens.color.validationRed : huddleColors.iconMuted} name={item.icon} size={18} />
          <Text style={[
            nativeModalStyles.appActionMenuText,
            item.destructive ? nativeModalStyles.appActionMenuTextDestructive : null,
            item.muted ? nativeModalStyles.appActionMenuTextMuted : null,
            textStyle,
          ]} ellipsizeMode="tail" numberOfLines={1}>{item.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Informational popup with the same backdrop, close affordance and platform dismissal paths as every native popup. */
export function AppNoticeModal({
  body,
  onClose,
  open,
  title,
}: {
  body: ReactNode;
  onClose: () => void;
  open: boolean;
  title: string;
}) {
  if (!open) return null;
  return (
    <Modal animationType="fade" presentationStyle="overFullScreen" transparent visible onRequestClose={onClose}>
      <Pressable style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalSafeArea]} onPress={onClose}>
        <Pressable onPress={(event) => event.stopPropagation()} style={nativeModalStyles.appConfirmBoundary}>
          <View style={nativeModalStyles.appConfirmCard}>
            <AppModalCloseButton onPress={onClose} />
            <Text style={nativeModalStyles.appConfirmTitle}>{title}</Text>
            {typeof body === "string" ? <Text style={nativeModalStyles.appConfirmBody}>{body}</Text> : body}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
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
  presentation = "modal",
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
  presentation?: "inline" | "modal";
  showClose?: boolean;
  title: string;
  visible?: boolean;
}) {
  const isVisible = visible ?? open ?? false;
  const finalCancelLabel = cancel ?? cancelLabel;
  const finalConfirmLabel = confirmLabel ?? confirm ?? "Confirm";

  const content = (
      <Pressable style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalSafeArea]} onPress={onCancel}>
        <Pressable onPress={(event) => event.stopPropagation()} style={nativeModalStyles.appConfirmBoundary}>
          <View style={nativeModalStyles.appConfirmCard}>
            {showClose ? <AppModalCloseButton onPress={onCancel} /> : null}
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
  );

  if (presentation === "inline") {
    return isVisible ? <View style={StyleSheet.absoluteFill}>{content}</View> : null;
  }

  return (
    <Modal animationType="fade" presentationStyle="overFullScreen" transparent visible={isVisible} onRequestClose={onCancel}>
      {content}
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
    if (!canInvokeNativeSlideCommit({ alreadyCommitted: committedRef.current, busy, disabled })) return;
    committedRef.current = true;
    void onCommitRef.current();
  }, [busy, disabled]);

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
          if (shouldCommitNativeSlide(translateX.value, maxTranslate)) {
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
          <NativeSpinner tone={tone === "destructive" ? "muted" : "accent"} />
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
  presentation = "modal",
  slideLabel,
  title,
}: {
  body?: ReactNode;
  busy?: boolean;
  message?: string | null;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  open: boolean;
  presentation?: "inline" | "modal";
  slideLabel: string;
  title: string;
}) {
  const [resetKey, setResetKey] = useState(0);
  useEffect(() => { if (!open) setResetKey((current) => current + 1); }, [open]);

  const content = (
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
  );

  if (!open) return null;
  if (presentation === "inline") {
    return <View style={[StyleSheet.absoluteFill, destructiveSlideStyles.inlineLayer]}>{content}</View>;
  }
  return (
    <Modal animationType="fade" presentationStyle="overFullScreen" transparent visible onRequestClose={onClose}>
      {content}
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
  inlineLayer: {
    zIndex: 100,
    elevation: 100,
  },
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
