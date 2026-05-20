import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { NativeTurnstile } from "../components/NativeTurnstile";
import { createNativeFunctionHeaders } from "../lib/nativeFunctionClient";
import {
  clearNativeBiometricSession,
  getNativeBiometricAvailability,
  hasNativeBiometricSessionHint,
  saveNativeBiometricSession,
} from "../lib/nativeBiometricAuth";
import { haptic } from "../lib/nativeHaptics";
import { supabase, supabaseAnonKey, supabaseUrl } from "../lib/supabase";
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

type MfaPhase = "off" | "setup" | "verifying" | "active";
type TotpFactorSummary = {
  id: string;
  status: string;
};
type NativeSecuritySettingsScreenProps = {
  initialSession?: Session | null;
  onBack?: () => void;
};

const turnstileSiteKey =
  process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY ||
  process.env.VITE_TURNSTILE_SITE_KEY ||
  "";

const mapMfaError = (error: unknown, fallback: string) => {
  const raw = String((error as { message?: string } | null)?.message || "").toLowerCase();
  if (!raw) return fallback;
  if (raw.includes("invalid") && raw.includes("otp")) return "Incorrect code. Check your authenticator app and try again.";
  if (raw.includes("expired")) return "This code expired. Use the latest code and try again.";
  if (raw.includes("challenge")) return "Couldn't start verification. Please try again.";
  if (raw.includes("factor")) return "Two-factor setup is incomplete. Please set up authenticator again.";
  if (raw.includes("too many")) return "Too many attempts. Please wait a moment and try again.";
  if (raw.includes("network") || raw.includes("fetch")) return "Network issue. Check your connection and try again.";
  return fallback;
};

const listTotpFactors = async (): Promise<TotpFactorSummary[]> => {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw error;
  const all = Array.isArray((data as { all?: unknown[] } | null)?.all)
    ? ((data as { all?: unknown[] }).all as Array<Record<string, unknown>>)
    : [];
  return all
    .filter((row) => String(row.factor_type || "").toLowerCase() === "totp" && typeof row.id === "string")
    .map((row) => ({
      id: String(row.id),
      status: String(row.status || "unverified"),
    }));
};

const unenrollFactor = async (factorId: string) => {
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) throw error;
};

const clearUnverifiedTotpFactors = async () => {
  const factors = await listTotpFactors();
  const stale = factors.filter((factor) => factor.status !== "verified");
  for (const factor of stale) {
    try {
      await unenrollFactor(factor.id);
    } catch {
      // best effort cleanup before fresh enrollment
    }
  }
};

const enrollTotp = async (accessToken: string) => {
  const response = await fetch(`${supabaseUrl}/auth/v1/factors`, {
    method: "POST",
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      factor_type: "totp",
      friendly_name: "Authenticator App",
      issuer: "Huddle",
    }),
  });
  const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) {
    const message = typeof data?.msg === "string"
      ? data.msg
      : typeof data?.message === "string"
        ? data.message
        : typeof data?.error === "string"
          ? data.error
          : `totp_enroll_http_${response.status}`;
    throw new Error(message);
  }
  const totp = (data?.totp && typeof data.totp === "object" ? data.totp : {}) as Record<string, unknown>;
  return {
    factorId: typeof data?.id === "string" ? data.id : null,
    secret: typeof totp.secret === "string" ? totp.secret : null,
    uri: typeof totp.uri === "string" ? totp.uri : null,
  };
};

const challengeAndVerifyTotp = async (factorId: string, code: string) => {
  const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
  if (challengeError) throw challengeError;
  const challengeId = typeof challengeData?.id === "string" ? challengeData.id : "";
  if (!challengeId) throw new Error("challenge_unavailable");
  const { error: verifyError } = await supabase.auth.mfa.verify({ factorId, challengeId, code });
  if (verifyError) throw verifyError;
};

export function NativeSecuritySettingsScreen({ initialSession = null, onBack }: NativeSecuritySettingsScreenProps) {
  const insets = useSafeAreaInsets();
  const handleBackToAccountSettings = () => {
    if (onBack) {
      onBack();
      return;
    }
    void Linking.openURL("huddle:/settings").catch(() => {});
  };


  const [mfaLoading, setMfaLoading] = useState(true);
  const [mfaPhase, setMfaPhase] = useState<MfaPhase>("off");
  const [otpCode, setOtpCode] = useState("");
  const [mfaError, setMfaError] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [disableMfaOpen, setDisableMfaOpen] = useState(false);
  const [removePasskeyOpen, setRemovePasskeyOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const newPasswordInputRef = useRef<TextInput | null>(null);
  const confirmPasswordInputRef = useRef<TextInput | null>(null);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileError, setTurnstileError] = useState("");
  const [totpFactorId, setTotpFactorId] = useState<string | null>(null);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState("Biometric Sign In");
  const [setupSecret, setSetupSecret] = useState("");
  const [setupUri, setSetupUri] = useState("");

  const ensureNativeSession = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token && data.session.refresh_token) return data.session;
    if (initialSession?.access_token && initialSession.refresh_token) {
      const { data: setData, error } = await supabase.auth.setSession({
        access_token: initialSession.access_token,
        refresh_token: initialSession.refresh_token,
      });
      if (error || !setData.session) throw error || new Error("auth_required");
      return setData.session;
    }
    throw new Error("auth_required");
  }, [initialSession]);

  const loadMfaState = useCallback(async () => {
    setMfaLoading(true);
    setMfaError("");
    try {
      await ensureNativeSession();
      const [factors, biometricAvailability, biometricHint] = await Promise.all([
        listTotpFactors(),
        getNativeBiometricAvailability(),
        hasNativeBiometricSessionHint(),
      ]);
      const verified = factors.find((factor) => factor.status === "verified") || null;
      if (verified) {
        setTotpFactorId(verified.id);
        setMfaPhase("active");
      } else {
        if (factors.some((factor) => factor.status !== "verified")) {
          await clearUnverifiedTotpFactors();
        }
        setTotpFactorId(null);
        setMfaPhase("off");
        setSetupSecret("");
        setSetupUri("");
      }
      setBiometricAvailable(biometricAvailability.available);
      setBiometricLabel(biometricAvailability.label);
      setBiometricEnabled(biometricAvailability.available && biometricHint);
    } catch {
      setMfaError("Couldn't load two-factor status. Please retry.");
      setMfaPhase("off");
    } finally {
      setMfaLoading(false);
    }
  }, [ensureNativeSession]);

  useEffect(() => {
    void loadMfaState();
  }, [loadMfaState]);

  const handleStartMfaSetup = async () => {
    setMfaError("");
    setStatusMessage(null);
    try {
      const session = await ensureNativeSession();
      await clearUnverifiedTotpFactors();
      const enrollment = await enrollTotp(session.access_token);
      setTotpFactorId(enrollment.factorId);
      setSetupSecret(enrollment.secret || "");
      setSetupUri(enrollment.uri || "");
      if (!enrollment.secret || !enrollment.uri) throw new Error("totp_setup_payload_missing");
      setMfaPhase("setup");
    } catch (error) {
      setMfaError(mapMfaError(error, "Couldn't start two-factor setup."));
    }
  };

  const handleChangePassword = async () => {
    setPasswordError("");
    setStatusMessage(null);
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
    if (newPassword.length < 8) {
      haptic.error();
      setPasswordError("Password must be at least 8 characters.");
      return;
    }
    if (!turnstileToken.trim()) {
      haptic.error();
      setTurnstileError(turnstileError || "Complete human verification first.");
      return;
    }
    setPasswordBusy(true);
    try {
      const session = await ensureNativeSession();
      const email = String(session.user.email || "").trim();
      const phone = String(session.user.phone || "").trim();
      if (!email && !phone) {
        setPasswordError("We couldn't verify your current password for this account.");
        return;
      }
      const credentials = email
        ? { email, password: currentPassword }
        : { phone, password: currentPassword };
      const { data: verifiedData, error: verifyError } = await supabase.auth.signInWithPassword(credentials);
      if (verifyError || !verifiedData.session?.access_token) {
        setPasswordError("Current password is incorrect.");
        return;
      }
      const response = await fetch(`${supabaseUrl}/functions/v1/auth-change-password`, {
        method: "POST",
        headers: createNativeFunctionHeaders(verifiedData.session.access_token),
        body: JSON.stringify({
          password: newPassword,
          turnstile_token: turnstileToken.trim(),
          turnstile_action: "change_password",
        }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;
      if (!response.ok) throw new Error(body?.error || body?.message || "password_change_failed");
      setPasswordOpen(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTurnstileToken("");
      setTurnstileError("");
      haptic.success();
      setStatusMessage("Password updated.");
    } catch {
      haptic.error();
      setPasswordError("We couldn't update your password. Please retry.");
    } finally {
      setPasswordBusy(false);
    }
  };

  const handleEnableBiometric = async () => {
    setMfaError("");
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
      const raw = String(error instanceof Error ? error.message : error || "").toLowerCase();
      if (raw.includes("not_enrolled")) {
        setMfaError("Set up Face ID or Touch ID on this device first.");
      } else if (raw.includes("hardware_missing")) {
        setMfaError("This device does not support biometric sign in.");
      } else {
        setMfaError("Couldn't enable biometric sign in right now.");
      }
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
      setMfaError(mapMfaError(error, "Couldn't remove biometric sign in right now."));
    } finally {
      setRemovePasskeyOpen(false);
    }
  };

  const handleOpenAuthApp = async () => {
    if (!setupUri) {
      setMfaError("Authenticator link not available. Use setup key manually.");
      return;
    }
    try {
      await Linking.openURL(setupUri);
    } catch {
      setMfaError("Authenticator app could not be opened. Use setup key manually.");
    }
  };

  const handleVerifyCode = async () => {
    const code = otpCode.trim();
    if (code.length < 6 || !totpFactorId) return;
    setMfaPhase("verifying");
    setMfaError("");
    setStatusMessage(null);
    try {
      await ensureNativeSession();
      await challengeAndVerifyTotp(totpFactorId, code);
      const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (data?.currentLevel !== "aal2") throw new Error("aal_not_upgraded");
      setOtpCode("");
      setMfaPhase("active");
      setStatusMessage("Two-factor authentication enabled.");
    } catch (error) {
      setMfaPhase("setup");
      setMfaError(mapMfaError(error, "Could not verify code. Please try again."));
    }
  };

  const handleDisableMfa = async () => {
    if (!totpFactorId) {
      setDisableMfaOpen(false);
      return;
    }
    try {
      await ensureNativeSession();
      await unenrollFactor(totpFactorId);
      setMfaPhase("off");
      setTotpFactorId(null);
      setOtpCode("");
      setMfaError("");
      setSetupSecret("");
      setSetupUri("");
      setStatusMessage("Authenticator app removed.");
    } catch (error) {
      setMfaError(mapMfaError(error, "Couldn't remove authenticator app right now."));
    } finally {
      setDisableMfaOpen(false);
    }
  };

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
        <Text style={styles.sectionLabel}>BIOMETRIC SIGN IN</Text>
        <View style={styles.group}>
          <View style={styles.statusRow}>
            <View style={styles.rowIcon}>
              <MaterialCommunityIcons color={biometricEnabled ? "#16A34A" : huddleColors.iconMuted} name="face-recognition" size={18} />
            </View>
            <Text style={styles.actionLabel}>{biometricLabel}</Text>
            <View style={[styles.badge, biometricEnabled && styles.badgeActive]}>
              <Text style={[styles.badgeText, biometricEnabled && styles.badgeTextActive]}>{biometricEnabled ? "Active" : "Off"}</Text>
            </View>
          </View>

          <View style={styles.panelBody}>
            <Text style={styles.bodyText}>Sign in securely with Face ID or your fingerprint on this device.</Text>
            {biometricEnabled ? null : (
              <Pressable disabled={!biometricAvailable} onPress={() => void handleEnableBiometric()} style={({ pressed }) => [styles.primaryButton, (pressed || !biometricAvailable) ? styles.pressed : null]}>
                <Text style={styles.primaryButtonText}>{biometricAvailable ? "Set Up Biometric Sign In" : "Biometric Sign In Unavailable"}</Text>
              </Pressable>
            )}
          </View>

          {biometricEnabled ? (
            <Pressable onPress={() => setRemovePasskeyOpen(true)} style={styles.dangerRow}>
              <Text style={styles.dangerLabel}>Remove Biometric Sign In</Text>
              <Feather color={huddleColors.validationRed} name="chevron-right" size={17} />
            </Pressable>
          ) : null}
        </View>

        <Text style={[styles.sectionLabel, styles.sectionLabelAfterGroup]}>AUTHENTICATOR APP</Text>
        <View style={styles.group}>
          <View style={styles.statusRow}>
            <View style={styles.rowIcon}>
              <Feather color={mfaPhase === "active" ? "#16A34A" : huddleColors.iconMuted} name="shield" size={17} />
            </View>
            <Text style={styles.actionLabel}>Authenticator App</Text>
            <View style={[styles.badge, mfaPhase === "active" && styles.badgeActive]}>
              <Text style={[styles.badgeText, mfaPhase === "active" && styles.badgeTextActive]}>{mfaPhase === "active" ? "Active" : "Off"}</Text>
            </View>
          </View>

          {mfaPhase === "off" ? (
            <View style={styles.panelBody}>
              <Text style={styles.bodyText}>Add an extra layer of protection with codes from your authenticator app.</Text>
              <Pressable disabled={mfaLoading} onPress={() => void handleStartMfaSetup()} style={({ pressed }) => [styles.primaryButton, (pressed || mfaLoading) && styles.pressed]}>
                {mfaLoading ? <ActivityIndicator color={huddleColors.onPrimary} /> : <Text style={styles.primaryButtonText}>Set Up Authenticator App</Text>}
              </Pressable>
            </View>
          ) : null}

          {mfaPhase === "setup" || mfaPhase === "verifying" ? (
            <View style={styles.panelBody}>
              <Text style={styles.stepTitle}>Step 1 - Add Huddle to your authenticator app</Text>
              <Text style={styles.bodyText}>Open your authenticator app automatically, or enter the setup key manually.</Text>
              <Pressable onPress={() => void handleOpenAuthApp()} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
                <Feather color={huddleColors.text} name="external-link" size={16} />
                <Text style={styles.secondaryButtonText}>Open Authenticator App</Text>
              </Pressable>
              <View style={styles.secretBox}>
                <Text numberOfLines={1} style={styles.secretText}>{setupSecret || "-"}</Text>
              </View>
              <Text style={styles.helperText}>In your authenticator app, choose "Enter a setup key" and use this code.</Text>

              <Text style={styles.stepTitle}>Step 2 - Enter the 6-digit code</Text>
              <TextInput
                autoComplete="one-time-code"
                editable={mfaPhase !== "verifying"}
                inputMode="numeric"
                keyboardType="number-pad"
                maxLength={6}
                onChangeText={(value) => {
                  setOtpCode(value.replace(/\D/g, "").slice(0, 6));
                  if (mfaError) setMfaError("");
                }}
                placeholder="6-digit code"
                placeholderTextColor={huddleColors.mutedText}
                style={[styles.input, mfaError ? styles.inputError : null]}
                value={otpCode}
              />
              <Pressable disabled={otpCode.length < 6 || !totpFactorId || mfaPhase === "verifying"} onPress={() => void handleVerifyCode()} style={({ pressed }) => [styles.primaryButton, (pressed || otpCode.length < 6 || !totpFactorId || mfaPhase === "verifying") && styles.pressed]}>
                {mfaPhase === "verifying" ? <ActivityIndicator color={huddleColors.onPrimary} /> : <Text style={styles.primaryButtonText}>Verify Code</Text>}
              </Pressable>
              <Pressable
                onPress={() => {
                  setMfaPhase("off");
                  setOtpCode("");
                  setMfaError("");
                  setSetupSecret("");
                  setSetupUri("");
                  setTotpFactorId(null);
                }}
                style={styles.textButton}
              >
                <Text style={styles.textButtonLabel}>Cancel</Text>
              </Pressable>
            </View>
          ) : null}

          {mfaPhase === "active" ? (
            <Pressable onPress={() => setDisableMfaOpen(true)} style={styles.dangerRow}>
              <Text style={styles.dangerLabel}>Remove Authenticator App</Text>
              <Feather color={huddleColors.validationRed} name="chevron-right" size={17} />
            </Pressable>
          ) : null}
          {mfaError ? <Text style={styles.panelErrorText}>{mfaError}</Text> : null}
        </View>

        <Text style={[styles.sectionLabel, styles.sectionLabelAfterGroup]}>ACCOUNT PASSWORD</Text>
        <View style={styles.group}>
          <Pressable onPress={() => setPasswordOpen(true)} style={styles.statusRow}>
            <View style={styles.rowIcon}>
              <Feather color={huddleColors.iconMuted} name="lock" size={17} />
            </View>
            <Text style={styles.actionLabel}>Change Password</Text>
            <Feather color={huddleColors.mutedText} name="chevron-right" size={17} />
          </Pressable>
        </View>

        {statusMessage ? <Text style={styles.statusText}>{statusMessage}</Text> : null}
      </ScrollView>

      <ConfirmRemoveModal
        open={disableMfaOpen}
        onClose={() => setDisableMfaOpen(false)}
        onConfirm={() => void handleDisableMfa()}
      />
      <ConfirmRemoveModal
        body="This biometric sign-in method will no longer be available for your account."
        confirmLabel="Remove"
        open={removePasskeyOpen}
        onClose={() => setRemovePasskeyOpen(false)}
        onConfirm={() => void handleRemoveBiometric()}
        title="Remove Biometric Sign In?"
      />
      <Modal animationType="fade" onRequestClose={() => setPasswordOpen(false)} transparent visible={passwordOpen}>
        <Pressable onPress={() => setPasswordOpen(false)} style={styles.modalBackdrop}>
          <Pressable onPress={(event) => event.stopPropagation()} style={styles.modalCard}>
            <Text style={styles.modalTitle}>Change Password</Text>
            <View style={styles.modalFieldGroup}>
              <TextInput
                autoCapitalize="none"
                autoComplete="current-password"
                onChangeText={(value) => {
                  setCurrentPassword(value);
                  if (passwordError) setPasswordError("");
                }}
                onSubmitEditing={() => newPasswordInputRef.current?.focus()}
                placeholder="Current password"
                placeholderTextColor={huddleColors.mutedText}
                returnKeyType="next"
                secureTextEntry
                style={styles.input}
                value={currentPassword}
              />
              <TextInput
                ref={newPasswordInputRef}
                autoCapitalize="none"
                autoComplete="new-password"
                onChangeText={(value) => {
                  setNewPassword(value);
                  if (passwordError) setPasswordError("");
                }}
                onSubmitEditing={() => confirmPasswordInputRef.current?.focus()}
                placeholder="New password"
                placeholderTextColor={huddleColors.mutedText}
                returnKeyType="next"
                secureTextEntry
                style={styles.input}
                value={newPassword}
              />
              <TextInput
                ref={confirmPasswordInputRef}
                autoCapitalize="none"
                autoComplete="new-password"
                onChangeText={(value) => {
                  setConfirmPassword(value);
                  if (passwordError) setPasswordError("");
                }}
                onSubmitEditing={() => void handleChangePassword()}
                placeholder="Confirm password"
                placeholderTextColor={huddleColors.mutedText}
                returnKeyType="done"
                secureTextEntry
                style={styles.input}
                value={confirmPassword}
              />
              <NativeTurnstile
                action="change_password"
                onError={setTurnstileError}
                onToken={(token) => {
                  setTurnstileToken(token);
                  if (token) setTurnstileError("");
                }}
                siteKey={turnstileSiteKey}
              />
              {turnstileError ? <Text style={styles.errorText}>{turnstileError}</Text> : null}
              {passwordError ? <Text style={styles.errorText}>{passwordError}</Text> : null}
            </View>
            <View style={styles.modalActions}>
              <Pressable disabled={passwordBusy} onPress={() => setPasswordOpen(false)} style={({ pressed }) => [styles.modalButton, styles.modalSecondaryButton, pressed && styles.pressed]}>
                <Text style={styles.modalSecondaryText}>Cancel</Text>
              </Pressable>
              <Pressable disabled={passwordBusy || !currentPassword || !newPassword || !confirmPassword || !turnstileToken.trim()} onPress={() => void handleChangePassword()} style={({ pressed }) => [styles.modalButton, styles.modalPrimaryButton, (pressed || passwordBusy || !currentPassword || !newPassword || !confirmPassword || !turnstileToken.trim()) && styles.pressed]}>
                {passwordBusy ? <ActivityIndicator color={huddleColors.onPrimary} /> : <Text style={styles.modalPrimaryText}>Update</Text>}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function ConfirmRemoveModal({
  body = "You'll no longer need a code to sign in. This reduces your account security.",
  confirmLabel = "Remove",
  open,
  onClose,
  onConfirm,
  title = "Remove Authenticator App?",
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
  stepTitle: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.text,
  },
  helperText: {
    fontFamily: "Urbanist-400",
    fontSize: huddleType.helper,
    lineHeight: 17,
    color: huddleColors.mutedText,
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
  disabledButton: {
    ...huddleButtons.disabled,
  },
  disabledButtonText: {
    color: huddleColors.onPrimary,
  },
  secondaryButton: {
    ...huddleButtons.base,
    ...huddleButtons.secondary,
    flexDirection: "row",
    gap: huddleSpacing.x2,
  },
  secondaryButtonText: {
    ...huddleButtons.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.text,
  },
  secretBox: {
    minHeight: huddleLayout.fieldHeight,
    justifyContent: "center",
    borderRadius: huddleRadii.field,
    borderWidth: 1,
    borderColor: "rgba(198, 202, 214, 0.7)",
    backgroundColor: huddleColors.mutedCanvas,
    paddingHorizontal: huddleSpacing.x4,
  },
  secretText: {
    fontFamily: "Courier",
    fontSize: huddleType.helper,
    lineHeight: 16,
    color: huddleColors.text,
  },
  input: {
    minHeight: huddleLayout.fieldHeight,
    borderRadius: huddleRadii.field,
    borderWidth: 1,
    borderColor: "rgba(198, 202, 214, 0.9)",
    backgroundColor: huddleColors.canvas,
    paddingHorizontal: huddleSpacing.x4,
    fontFamily: "Urbanist-600",
    fontSize: huddleType.body,
    lineHeight: 22,
    color: huddleColors.text,
  },
  inputError: {
    ...huddleFieldStates.error,
  },
  turnstileBox: {
    minHeight: 74,
    overflow: "hidden",
  },
  turnstileContainer: {
    height: 74,
    backgroundColor: "transparent",
  },
  turnstileWebView: {
    height: 74,
    backgroundColor: "transparent",
  },
  turnstileStatus: {
    position: "absolute",
    left: 2,
    bottom: 0,
    fontFamily: "Urbanist-500",
    fontSize: 12,
    lineHeight: 16,
    color: huddleColors.mutedText,
  },
  textButton: {
    minHeight: huddleLayout.minTouch,
    alignItems: "center",
    justifyContent: "center",
  },
  textButtonLabel: {
    fontFamily: "Urbanist-600",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.mutedText,
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
