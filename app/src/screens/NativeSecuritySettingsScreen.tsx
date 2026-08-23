import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fetchNativeResponseWithTimeout as fetch } from "../lib/nativeTimeout";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { AppKeyboardAvoidingView, AppModalCloseButton } from "../components/nativeModalPrimitives";
import { NativeSpinner } from "../components/NativeSpinner";
import { NativeTurnstile } from "../components/NativeTurnstile";
import { hasNativePasswordProvider, isNativeOAuthOnlyAccount, nativeOAuthAccountResetNotAvailableCopy } from "../lib/nativeAuthAccountType";
import { createFreshNativeFunctionHeaders, getFreshNativeSession, installNativeAuthSession, noteNativeAuthState } from "../lib/nativeFunctionClient";
import {
  clearNativeBiometricSession,
  getNativeBiometricAvailability,
  hasNativeBiometricSessionHint,
  saveNativeBiometricSession,
} from "../lib/nativeBiometricAuth";
import { haptic } from "../lib/nativeHaptics";
import { nativePasswordPolicyError, nativePasswordSecurityError } from "../lib/nativePasswordSecurity";
import { createNativeSecurityActionGate } from "../lib/nativeSecurityActionGate";
import { nativeSafeErrorCopy } from "../lib/nativeSafeErrorCopy";
import { getNativeTurnstileSiteKey } from "../lib/nativeTurnstile";
import { supabase, supabaseUrl } from "../lib/supabase";
import {
  huddleButtons,
  huddleColors,
  huddleFieldStates,
  huddleLayout,
  huddleRadii,
  huddleShadows,
  huddleSpacing,
  huddleType,
  huddleVerifyIdentity,
} from "../theme/huddleDesignTokens";

type NativeSecuritySettingsScreenProps = {
  initialSession?: Session | null;
  onBack?: () => void;
};


const mapSecurityActionError = (error: unknown, fallback: string) => {
  const raw = String((error as { message?: string } | null)?.message || "").toLowerCase();
  if (!raw) return fallback;
  if (raw.includes("expired")) return "This code expired. Use the latest code and try again.";
  if (raw.includes("too many")) return "Too many attempts. Please wait a moment and try again.";
  if (raw.includes("network") || raw.includes("fetch")) return "Network issue. Check your connection and try again.";
  return fallback;
};

const mapBiometricError = (error: unknown) => {
  const raw = String(error instanceof Error ? error.message : error || "").toLowerCase();
  if (raw.includes("not_enrolled")) return "Set up Face ID or Touch ID on this device first.";
  if (raw.includes("hardware_missing")) return "This device does not support biometric sign in.";
  if (raw.includes("unsupported")) return "Biometric sign in is not available in this build.";
  if (raw.includes("session_missing") || raw.includes("auth_required")) return "Sign in again before setting up biometric sign in.";
  if (raw.includes("cancel")) return "Biometric setup was cancelled.";
  if (raw.includes("passcode")) return "Set a device passcode before using biometric sign in.";
  return "Couldn't enable biometric sign in right now.";
};

export function NativeSecuritySettingsScreen({ initialSession = null, onBack }: NativeSecuritySettingsScreenProps) {
  const insets = useSafeAreaInsets();
  const handleBackToAccountSettings = () => {
    if (onBack) {
      onBack();
      return;
    }
    void Linking.openURL("huddle://settings").catch(() => {});
  };


  const [biometricError, setBiometricError] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [removePasskeyOpen, setRemovePasskeyOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [focusedPasswordField, setFocusedPasswordField] = useState<"current" | "new" | "confirm" | null>(null);
  const newPasswordInputRef = useRef<TextInput | null>(null);
  const confirmPasswordInputRef = useRef<TextInput | null>(null);
  const passwordScrollRef = useRef<ScrollView | null>(null);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileError, setTurnstileError] = useState("");
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricBusy, setBiometricBusy] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState("Biometric Sign In");
  const [passwordLoginAvailable, setPasswordLoginAvailable] = useState(true);
  const biometricSetupGateRef = useRef(createNativeSecurityActionGate());

  const ensureNativeSession = useCallback(async () => {
    const fresh = await getFreshNativeSession(initialSession);
    if (fresh?.session) return fresh.session;
    if (initialSession?.access_token && initialSession.refresh_token) {
      return installNativeAuthSession({
        access_token: initialSession.access_token,
        refresh_token: initialSession.refresh_token,
      });
    }
    throw new Error("auth_required");
  }, [initialSession]);

  const loadSecurityState = useCallback(async () => {
    try {
      const session = await ensureNativeSession();
      const [biometricAvailability, biometricHint] = await Promise.all([
        getNativeBiometricAvailability(),
        hasNativeBiometricSessionHint(),
      ]);
      const oauthOnly = isNativeOAuthOnlyAccount(session.user);
      setPasswordLoginAvailable(hasNativePasswordProvider(session.user) && !oauthOnly);
      setBiometricAvailable(biometricAvailability.available);
      setBiometricLabel(biometricAvailability.label);
      setBiometricEnabled(biometricAvailability.available && biometricHint);
      setBiometricError("");
    } catch {
      setBiometricError("Couldn't load biometric status. Please retry.");
    }
  }, [ensureNativeSession]);

  useEffect(() => {
    void loadSecurityState();
  }, [loadSecurityState]);

  const handleChangePassword = async () => {
    setPasswordError("");
    setStatusMessage(null);
    if (!passwordLoginAvailable) {
      haptic.error();
      const session = await ensureNativeSession().catch(() => null);
      setPasswordError(nativeOAuthAccountResetNotAvailableCopy(session?.user));
      return;
    }
    if (!currentPassword || !newPassword || !confirmPassword) {
      haptic.error();
      setPasswordError("Please complete all password fields.");
      return;
    }
    if (newPassword !== confirmPassword) {
      haptic.error();
      setPasswordError("Passwords do not match.");
      return;
    }
    const policyError = nativePasswordPolicyError(newPassword);
    if (policyError) {
      haptic.error();
      setPasswordError(policyError);
      return;
    }
    if (!turnstileToken.trim()) {
      haptic.error();
      setTurnstileError(turnstileError || "Complete human verification first.");
      return;
    }
    const turnstileProof = turnstileToken.trim();
    setPasswordBusy(true);
    try {
      const securityError = await nativePasswordSecurityError(newPassword);
      if (securityError) {
        haptic.error();
        setTurnstileToken("");
        setTurnstileError("");
        setTurnstileResetKey((key) => key + 1);
        setPasswordError(securityError);
        return;
      }
      const session = await ensureNativeSession();
      const email = String(session.user.email || "").trim();
      const phone = String(session.user.phone || "").trim();
      if (!email && !phone) {
        setTurnstileToken("");
        setTurnstileError("");
        setTurnstileResetKey((key) => key + 1);
        setPasswordError("We couldn't verify your current password for this account.");
        return;
      }
      // A solved challenge gets one current-password attempt, successful or not.
      setTurnstileToken("");
      setTurnstileError("");
      setTurnstileResetKey((key) => key + 1);
      const credentials = email
        ? { email, password: currentPassword }
        : { phone, password: currentPassword };
      const { data: verifiedData, error: verifyError } = await supabase.auth.signInWithPassword(credentials);
      if (verifyError || !verifiedData.session?.access_token) {
        setPasswordError("Current password is incorrect.");
        return;
      }
      noteNativeAuthState(verifiedData.session);
      const response = await fetch(`${supabaseUrl}/functions/v1/auth-change-password`, {
        method: "POST",
        headers: await createFreshNativeFunctionHeaders(verifiedData.session.access_token),
        body: JSON.stringify({
          password: newPassword,
          turnstile_token: turnstileProof,
          turnstile_action: "change_password",
        }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;
      if (!response.ok) throw new Error(nativeSafeErrorCopy(body?.error || body?.message || "password_change_failed", "We couldn't update your password just yet. Try saving it again later."));
      setPasswordOpen(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTurnstileToken("");
      setTurnstileError("");
      setTurnstileResetKey((key) => key + 1);
      haptic.success();
      setStatusMessage("Password updated.");
    } catch (error) {
      haptic.error();
      setTurnstileToken("");
      setTurnstileResetKey((key) => key + 1);
      setPasswordError(nativeSafeErrorCopy(error, "We couldn't update your password. Please retry."));
    } finally {
      setPasswordBusy(false);
    }
  };

  const handleEnableBiometric = async () => {
    if (!biometricSetupGateRef.current.enter()) return;
    setBiometricBusy(true);
    setBiometricError("");
    setStatusMessage(null);
    try {
      const session = await ensureNativeSession();
      await saveNativeBiometricSession(session);
      const availability = await getNativeBiometricAvailability();
      setBiometricAvailable(availability.available);
      setBiometricLabel(availability.label);
      setBiometricEnabled(true);
      haptic.success();
      setStatusMessage(`${availability.label} enabled.`);
    } catch (error) {
      haptic.error();
      setBiometricError(mapBiometricError(error));
    } finally {
      biometricSetupGateRef.current.leave();
      setBiometricBusy(false);
    }
  };

  const handleRemoveBiometric = async () => {
    try {
      await clearNativeBiometricSession();
      setBiometricEnabled(false);
      haptic.success();
      setStatusMessage("Biometric sign in removed.");
    } catch (error) {
      haptic.error();
      setBiometricError(mapSecurityActionError(error, "Couldn't remove biometric sign in right now."));
    } finally {
      setRemovePasskeyOpen(false);
    }
  };

  const closePasswordModal = useCallback(() => {
    if (passwordBusy) return;
    setPasswordOpen(false);
  }, [passwordBusy]);

  const scrollPasswordFieldIntoView = useCallback((field: "current" | "new" | "confirm") => {
    setFocusedPasswordField(field);
    const offsets = {
      current: 0,
      new: huddleSpacing.x6,
      confirm: huddleSpacing.x8,
    };
    const scroll = () => passwordScrollRef.current?.scrollTo({ y: offsets[field], animated: true });
    requestAnimationFrame(scroll);
    setTimeout(scroll, 120);
  }, []);

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + huddleSpacing.x2 }]}>
        <Pressable accessibilityLabel="Go back" accessibilityRole="button" hitSlop={12} onPress={handleBackToAccountSettings} style={styles.backButton}>
          <Feather color={huddleColors.iconSubtle} name="arrow-left" size={huddleVerifyIdentity.headerIconSize} />
        </Pressable>
        <Text numberOfLines={1} style={styles.headerTitle}>Security</Text>
        <View style={[styles.backButton, styles.headerSpacer]} />
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {passwordLoginAvailable ? (
          <>
            <Text style={styles.sectionLabel}>ACCOUNT PASSWORD</Text>
            <View style={styles.group}>
              <Pressable onPress={() => setPasswordOpen(true)} style={styles.statusRow}>
                <View style={styles.rowIcon}>
                  <Feather color={huddleColors.iconMuted} name="lock" size={17} />
                </View>
                <Text style={styles.actionLabel}>Change Password</Text>
                <Feather color={huddleColors.mutedText} name="chevron-right" size={17} />
              </Pressable>
            </View>
          </>
        ) : null}

        <Text style={[styles.sectionLabel, passwordLoginAvailable ? styles.sectionLabelAfterGroup : null]}>BIOMETRIC SIGN IN</Text>
        <View style={styles.group}>
          <View style={styles.statusRow}>
            <View style={styles.rowIcon}>
              <MaterialCommunityIcons color={biometricEnabled ? "#16A34A" : huddleColors.iconMuted} name="face-recognition" size={18} />
            </View>
            <Text style={styles.actionLabel}>{biometricLabel}</Text>
            <View style={[styles.badge, biometricEnabled && styles.badgeActive]}>
              <Text style={[styles.badgeText, biometricEnabled && styles.badgeTextActive]}>{biometricEnabled ? "Active" : "Not set up"}</Text>
            </View>
          </View>

          <View style={styles.panelBody}>
            <Text style={styles.bodyText}>Sign in securely with Face ID or your fingerprint on this device.</Text>
            {biometricEnabled ? null : (
              <Pressable disabled={!biometricAvailable || biometricBusy} onPress={() => void handleEnableBiometric()} style={({ pressed }) => [styles.primaryButton, (pressed || !biometricAvailable || biometricBusy) ? styles.pressed : null]}>
                {biometricBusy ? <NativeSpinner tone="primary" /> : <Text style={styles.primaryButtonText}>{biometricAvailable ? "Set Up Biometric Sign In" : "Biometric Sign In Unavailable"}</Text>}
              </Pressable>
            )}
          </View>

          {biometricEnabled ? (
            <Pressable onPress={() => setRemovePasskeyOpen(true)} style={styles.dangerRow}>
              <Text style={styles.dangerLabel}>Remove Biometric Sign In</Text>
              <Feather color={huddleColors.validationRed} name="chevron-right" size={17} />
            </Pressable>
          ) : null}
          {biometricError ? <Text style={styles.panelErrorText}>{biometricError}</Text> : null}
        </View>

        {statusMessage ? <Text style={styles.statusText}>{statusMessage}</Text> : null}
      </ScrollView>

      <ConfirmRemoveModal
        body="This biometric sign-in method will no longer be available for your account."
        confirmLabel="Remove"
        open={removePasskeyOpen}
        onClose={() => setRemovePasskeyOpen(false)}
        onConfirm={() => void handleRemoveBiometric()}
        title="Remove Biometric Sign In?"
      />
      <Modal animationType="fade" onRequestClose={closePasswordModal} transparent visible={passwordOpen}>
        <AppKeyboardAvoidingView behavior="padding" keyboardVerticalOffset={0} style={styles.modalBackdrop}>
          <Pressable onPress={closePasswordModal} style={StyleSheet.absoluteFill} />
          <Pressable onPress={(event) => event.stopPropagation()} style={styles.modalCard}>
            <AppModalCloseButton onPress={closePasswordModal} />
            <Text style={styles.modalTitle}>Change Password</Text>
            <ScrollView keyboardShouldPersistTaps="handled" ref={passwordScrollRef} showsVerticalScrollIndicator={false}>
              <View style={styles.modalFieldGroup}>
              <TextInput
                multiline={false}
                scrollEnabled
                numberOfLines={1} lineBreakModeIOS="tail" lineBreakStrategyIOS="none"
                textBreakStrategy="simple"
                autoCapitalize="none"
                autoComplete="current-password"
                onChangeText={(value) => {
                  setCurrentPassword(value);
                  if (passwordError) setPasswordError("");
                }}
                onBlur={() => setFocusedPasswordField((current) => current === "current" ? null : current)}
                onFocus={() => scrollPasswordFieldIntoView("current")}
                onSubmitEditing={() => newPasswordInputRef.current?.focus()}
                placeholder="Current password"
                placeholderTextColor={huddleColors.mutedText}
                returnKeyType="next"
                secureTextEntry
                style={[styles.input, focusedPasswordField === "current" ? styles.inputFocused : null, passwordError ? styles.inputError : null]}
                value={currentPassword}
              />
              <TextInput
                multiline={false}
                scrollEnabled
                numberOfLines={1} lineBreakModeIOS="tail" lineBreakStrategyIOS="none"
                textBreakStrategy="simple"
                ref={newPasswordInputRef}
                autoCapitalize="none"
                autoComplete="new-password"
                onChangeText={(value) => {
                  setNewPassword(value);
                  if (passwordError) setPasswordError("");
                }}
                onBlur={() => setFocusedPasswordField((current) => current === "new" ? null : current)}
                onFocus={() => scrollPasswordFieldIntoView("new")}
                onSubmitEditing={() => confirmPasswordInputRef.current?.focus()}
                placeholder="New password"
                placeholderTextColor={huddleColors.mutedText}
                returnKeyType="next"
                secureTextEntry
                style={[styles.input, focusedPasswordField === "new" ? styles.inputFocused : null, passwordError ? styles.inputError : null]}
                value={newPassword}
              />
              <TextInput
                multiline={false}
                scrollEnabled
                numberOfLines={1} lineBreakModeIOS="tail" lineBreakStrategyIOS="none"
                textBreakStrategy="simple"
                ref={confirmPasswordInputRef}
                autoCapitalize="none"
                autoComplete="new-password"
                onChangeText={(value) => {
                  setConfirmPassword(value);
                  if (passwordError) setPasswordError("");
                }}
                onBlur={() => setFocusedPasswordField((current) => current === "confirm" ? null : current)}
                onFocus={() => scrollPasswordFieldIntoView("confirm")}
                onSubmitEditing={() => void handleChangePassword()}
                placeholder="Confirm password"
                placeholderTextColor={huddleColors.mutedText}
                returnKeyType="done"
                secureTextEntry
                style={[styles.input, focusedPasswordField === "confirm" ? styles.inputFocused : null, passwordError ? styles.inputError : null]}
                value={confirmPassword}
              />
              <NativeTurnstile
                action="change_password"
                key={`change-password-turnstile-${turnstileResetKey}`}
                onError={setTurnstileError}
                onToken={(token) => {
                  setTurnstileToken(token);
                  if (token) setTurnstileError("");
                }}
                siteKey={getNativeTurnstileSiteKey()}
              />
              {turnstileError ? <Text style={styles.errorText}>{turnstileError}</Text> : null}
              {passwordError ? <Text style={styles.errorText}>{passwordError}</Text> : null}
              </View>
            </ScrollView>
            <View style={styles.modalActions}>
              <Pressable disabled={passwordBusy} onPress={() => setPasswordOpen(false)} style={({ pressed }) => [styles.modalButton, styles.modalSecondaryButton, pressed && styles.pressed]}>
                <Text style={styles.modalSecondaryText}>Cancel</Text>
              </Pressable>
              <Pressable disabled={passwordBusy || !currentPassword || !newPassword || !confirmPassword || !turnstileToken.trim()} onPress={() => void handleChangePassword()} style={({ pressed }) => [styles.modalButton, styles.modalPrimaryButton, (pressed || passwordBusy || !currentPassword || !newPassword || !confirmPassword || !turnstileToken.trim()) && styles.pressed]}>
                {passwordBusy ? <NativeSpinner tone="primary" /> : <Text style={styles.modalPrimaryText}>Update</Text>}
              </Pressable>
            </View>
          </Pressable>
        </AppKeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function ConfirmRemoveModal({
  body = "This biometric sign-in method will no longer be available for your account.",
  confirmLabel = "Remove",
  open,
  onClose,
  onConfirm,
  title = "Remove Biometric Sign In?",
}: {
  body?: string;
  confirmLabel?: string;
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
}) {
  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={open}>
      <Pressable onPress={onClose} style={styles.modalBackdrop}>
        <Pressable onPress={(event) => event.stopPropagation()} style={styles.modalCard}>
          <Text style={styles.modalTitle}>{title}</Text>
          <Text style={styles.modalBody}>{body}</Text>
          <View style={styles.modalActions}>
            <Pressable onPress={onClose} style={({ pressed }) => [styles.modalButton, styles.modalSecondaryButton, pressed && styles.pressed]}>
              <Text style={styles.modalSecondaryText}>Cancel</Text>
            </Pressable>
            <Pressable onPress={onConfirm} style={({ pressed }) => [styles.modalButton, styles.modalDangerButton, pressed && styles.pressed]}>
              <Text style={styles.modalPrimaryText}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    ...StyleSheet.absoluteFillObject,
    paddingTop: 0,
    backgroundColor: huddleColors.canvas,
    zIndex: 2,
  },
  header: {
    minHeight: huddleLayout.headerHeight + huddleSpacing.x6,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: huddleSpacing.x4,
    paddingBottom: huddleSpacing.x2,
    backgroundColor: huddleColors.canvas,
    zIndex: 2,
  },
  backButton: {
    width: huddleVerifyIdentity.backButtonWidth,
    minHeight: huddleLayout.minTouch,
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontFamily: "Urbanist-700",
    fontSize: huddleType.nativeHeaderTitle,
    lineHeight: huddleType.nativeHeaderTitleLine,
    color: huddleColors.text,
  },
  headerSpacer: {
    opacity: 0,
  },
  content: {
    paddingHorizontal: huddleSpacing.x4,
    paddingTop: huddleSpacing.x4,
    paddingBottom: huddleSpacing.x9,
  },
  sectionLabel: {
    marginTop: huddleSpacing.x2,
    marginBottom: huddleSpacing.x2,
    paddingHorizontal: huddleSpacing.x1,
    fontFamily: "Urbanist-700",
    fontSize: huddleType.helper,
    lineHeight: 16,
    letterSpacing: 0,
    color: huddleColors.mutedText,
  },
  sectionLabelAfterGroup: {
    marginTop: huddleSpacing.x7,
  },
  group: {
    overflow: "hidden",
    borderRadius: huddleRadii.glass,
    borderWidth: 1,
    borderColor: "rgba(66, 73, 101, 0.06)",
    backgroundColor: huddleColors.canvas,
    ...huddleShadows.glassElevation2,
  },
  statusRow: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: huddleSpacing.x4,
    gap: huddleSpacing.x3,
  },
  rowIcon: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "rgba(33, 69, 207, 0.07)",
  },
  actionLabel: {
    flex: 1,
    fontFamily: "Urbanist-600",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.text,
  },
  badge: {
    minHeight: 28,
    justifyContent: "center",
    borderRadius: huddleRadii.pill,
    backgroundColor: "rgba(163, 168, 190, 0.15)",
    paddingHorizontal: huddleSpacing.x3,
  },
  badgeActive: {
    backgroundColor: "rgba(22, 163, 74, 0.1)",
  },
  badgeText: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.helper,
    lineHeight: 16,
    color: huddleColors.mutedText,
  },
  badgeTextActive: {
    color: "#16A34A",
  },
  panelBody: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: huddleColors.divider,
    padding: huddleSpacing.x4,
    gap: huddleSpacing.x3,
  },
  bodyText: {
    fontFamily: "Urbanist-400",
    fontSize: huddleType.label,
    lineHeight: 22,
    color: huddleColors.subtext,
  },
  primaryButton: {
    ...huddleButtons.base,
    ...huddleButtons.primary,
  },
  primaryButtonText: {
    ...huddleButtons.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.onPrimary,
  },
  input: {
    width: "100%",
    maxWidth: "100%",
    flexShrink: 1,
    minWidth: 0,
    minHeight: huddleLayout.fieldHeight,
    borderRadius: huddleRadii.field,
    borderWidth: 1,
    borderColor: huddleColors.fieldBorder,
    backgroundColor: huddleColors.canvas,
    paddingHorizontal: huddleSpacing.x4,
    fontFamily: "Urbanist-600",
    fontSize: huddleType.body,
    lineHeight: 22,
    color: huddleColors.text,
    overflow: "hidden",
  },
  inputFocused: {
    ...huddleFieldStates.focused,
  },
  inputError: {
    ...huddleFieldStates.error,
  },
  dangerRow: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: huddleColors.divider,
    paddingHorizontal: huddleSpacing.x4,
    gap: huddleSpacing.x3,
  },
  dangerLabel: {
    flex: 1,
    fontFamily: "Urbanist-600",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.validationRed,
  },
  statusText: {
    marginTop: huddleSpacing.x3,
    paddingHorizontal: huddleSpacing.x1,
    fontFamily: "Urbanist-600",
    fontSize: huddleType.helper,
    lineHeight: 16,
    color: huddleColors.subtext,
  },
  errorText: {
    marginTop: huddleSpacing.x3,
    paddingHorizontal: huddleSpacing.x1,
    fontFamily: "Urbanist-600",
    fontSize: huddleType.helper,
    lineHeight: 16,
    color: huddleColors.validationRed,
  },
  panelErrorText: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: huddleColors.divider,
    paddingHorizontal: huddleSpacing.x4,
    paddingVertical: huddleSpacing.x3,
    fontFamily: "Urbanist-600",
    fontSize: huddleType.helper,
    lineHeight: 16,
    color: huddleColors.validationRed,
  },
  pressed: {
    ...huddleButtons.pressed,
  },
  modalBackdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: huddleColors.backdrop,
    paddingHorizontal: huddleSpacing.x4,
  },
  modalCard: {
    width: "100%",
    maxWidth: 360,
    borderRadius: huddleRadii.modal,
    backgroundColor: huddleColors.canvas,
    padding: huddleSpacing.x5,
    ...huddleShadows.glassElevation2,
  },
  modalTitle: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.h4,
    lineHeight: huddleType.h4Line,
    color: huddleColors.text,
    textAlign: "center",
  },
  modalBody: {
    marginTop: huddleSpacing.x2,
    fontFamily: "Urbanist-400",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.subtext,
    textAlign: "center",
  },
  modalActions: {
    flexDirection: "row",
    gap: huddleSpacing.x3,
    marginTop: huddleSpacing.x5,
  },
  modalFieldGroup: {
    gap: huddleSpacing.x3,
    marginTop: huddleSpacing.x5,
  },
  modalButton: {
    flex: 1,
    ...huddleButtons.base,
  },
  modalSecondaryButton: {
    ...huddleButtons.secondary,
  },
  modalPrimaryButton: {
    ...huddleButtons.primary,
  },
  modalDangerButton: {
    ...huddleButtons.destructive,
  },
  modalSecondaryText: {
    ...huddleButtons.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.text,
  },
  modalPrimaryText: {
    ...huddleButtons.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.onPrimary,
  },
});
