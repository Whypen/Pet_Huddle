import { useCallback, useRef, useState } from "react";
import { fetchNativeResponseWithTimeout as fetch } from "../lib/nativeTimeout";
import {
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { NativeTurnstile } from "../components/NativeTurnstile";
import { AppKeyboardAvoidingView as KeyboardAvoidingView, SlideToConfirm } from "../components/nativeModalPrimitives";
import { supabaseUrl } from "../lib/supabase";
import { createFreshNativeFunctionHeaders } from "../lib/nativeFunctionClient";
import { haptic } from "../lib/nativeHaptics";
import { nativeSafeErrorCopy } from "../lib/nativeSafeErrorCopy";
import { useErrorShake } from "../components/motion/useErrorShake";
import { getNativeTurnstileSiteKey } from "../lib/nativeTurnstile";
import {
  huddleButtons,
  huddleColors,
  huddleFieldStates,
  huddleFormFields,
  huddleLayout,
  huddleRadii,
  huddleShadows,
  huddleSpacing,
  huddleType,
} from "../theme/huddleDesignTokens";

type SupportErrors = {
  message?: string;
  replyEmail?: string;
};

type SupportFocusedField = "subject" | "message" | "replyEmail" | null;

const supportReplyEmailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const nativeSupportSubmitErrorMessage = (value: unknown) => {
  return nativeSafeErrorCopy(value, "Couldn't send your message. Please try again.");
};

export function NativeSupportScreen({ accountEmail, accessToken, onCancel }: { accountEmail?: string | null; accessToken?: string | null; onCancel?: () => void }) {
  const normalizedAccountEmail = String(accountEmail || "").trim();
  const normalizedAccessToken = String(accessToken || "").trim();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [wantsReply, setWantsReply] = useState(Boolean(normalizedAccountEmail));
  const [replyEmail, setReplyEmail] = useState(normalizedAccountEmail);
  const [errors, setErrors] = useState<SupportErrors>({});
  const [focusedField, setFocusedField] = useState<SupportFocusedField>(null);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileError, setTurnstileError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const { shake: triggerSendShake, shakeStyle: sendShakeStyle } = useErrorShake();
  const [ticketNumber, setTicketNumber] = useState<string | null>(null);
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const messageInputRef = useRef<TextInput | null>(null);
  const replyEmailInputRef = useRef<TextInput | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);
  const fieldOffsetsRef = useRef<Record<"message" | "replyEmail" | "turnstile", number>>({ message: 0, replyEmail: 0, turnstile: 0 });
  const [sliderResetKey, setSliderResetKey] = useState(0);
  const scrollToField = useCallback((field: "message" | "replyEmail" | "turnstile") => {
    const offset = fieldOffsetsRef.current[field];
    if (typeof offset === "number") scrollRef.current?.scrollTo({ y: Math.max(0, offset - 24), animated: true });
  }, []);

  const requiresReplyEmail = wantsReply;

  const clearError = useCallback((field: keyof SupportErrors) => {
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }, []);

  const validateSupportForm = useCallback(() => {
    const nextErrors: SupportErrors = {};
    if (!message.trim()) {
      nextErrors.message = "Please tell us how we can help.";
    }
    if (requiresReplyEmail) {
      const trimmedEmail = replyEmail.trim();
      if (!trimmedEmail) {
        nextErrors.replyEmail = "Enter your email if you want a reply.";
      } else if (!supportReplyEmailPattern.test(trimmedEmail)) {
        nextErrors.replyEmail = "Enter a valid email address.";
      }
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }, [message, replyEmail, requiresReplyEmail]);

  const resetSupportForm = useCallback(() => {
    setSubject("");
    setMessage("");
    setWantsReply(Boolean(normalizedAccountEmail));
    setReplyEmail(normalizedAccountEmail);
    setErrors({});
    setFocusedField(null);
    setSubmitError("");
    setTicketNumber(null);
    setTurnstileToken("");
    setTurnstileError("");
  }, [normalizedAccountEmail]);

  const submitSupport = useCallback(async () => {
    if (submitting) return;
    setSubmitError("");
    if (!validateSupportForm()) {
      triggerSendShake();
      setSliderResetKey((current) => current + 1);
      // Scroll to first missing/invalid field
      if (!message.trim()) scrollToField("message");
      else scrollToField("replyEmail");
      return;
    }
    if (!turnstileToken.trim()) {
      triggerSendShake();
      setTurnstileError(turnstileError || "Complete human verification first.");
      setSliderResetKey((current) => current + 1);
      scrollToField("turnstile");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/submit-support-ticket`, {
        method: "POST",
        headers: await createFreshNativeFunctionHeaders(normalizedAccessToken, { functionName: "submit-support-ticket", routeToken: normalizedAccessToken }),
        body: JSON.stringify({
          name: "Guest",
          email: wantsReply ? replyEmail.trim() : "noreply@huddle.pet",
          subject: subject.trim() || "Support Request",
          message: message.trim(),
          wants_reply: wantsReply,
          turnstile_token: turnstileToken.trim(),
        }),
      });
      const body = (await response.json().catch(() => null)) as { ticket_number?: string; error?: string; message?: string } | null;
      if (!response.ok) {
        throw new Error(nativeSupportSubmitErrorMessage(body?.error || body?.message || `Support submit failed with HTTP ${response.status}.`));
      }
      haptic.success();
      setTicketNumber(body?.ticket_number || "received");
      setSubject("");
      setMessage("");
      setReplyEmail("");
      setWantsReply(false);
      setErrors({});
      setTurnstileToken("");
      setTurnstileError("");
      setTurnstileResetKey((key) => key + 1);
    } catch (error) {
      haptic.error();
      setSubmitError(nativeSupportSubmitErrorMessage(error));
      setTurnstileToken("");
      setTurnstileResetKey((key) => key + 1);
    } finally {
      setSubmitting(false);
    }
  }, [message, normalizedAccessToken, replyEmail, scrollToField, subject, submitting, triggerSendShake, turnstileError, turnstileToken, validateSupportForm, wantsReply]);

  return (
    <KeyboardAvoidingView
      behavior="padding"
      style={styles.container}
    >
      <ScrollView
        bounces={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scrollContent}
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.panel}>
          {ticketNumber ? (
            <View style={styles.successBox}>
              <Text style={styles.title}>Message sent!</Text>
              <Text style={styles.successText}>Your ticket number is {ticketNumber}.</Text>
              <Pressable
                onPress={onCancel ?? resetSupportForm}
                style={({ pressed }) => [styles.primaryButton, pressed ? styles.pressed : null]}
              >
                <Text style={styles.primaryLabel}>Done</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <Text style={styles.title}>Need help with huddle?</Text>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Subject</Text>
                <TextInput
                multiline={false}
                scrollEnabled
                numberOfLines={1} lineBreakModeIOS="tail" lineBreakStrategyIOS="none"
                textBreakStrategy="simple"
                  value={subject}
                  onFocus={() => setFocusedField("subject")}
                  onBlur={() => setFocusedField(null)}
                  onChangeText={(next) => {
                    setSubject(next);
                    setSubmitError("");
                  }}
                  onSubmitEditing={() => messageInputRef.current?.focus()}
                  placeholder="Subject (optional)"
                  placeholderTextColor={huddleColors.mutedText}
                  returnKeyType="next"
                  editable={!submitting}
                  style={[styles.field, focusedField === "subject" ? styles.fieldFocused : null]}
                />
              </View>

              <View
                onLayout={(event) => { fieldOffsetsRef.current.message = event.nativeEvent.layout.y; }}
                style={styles.fieldGroup}
              >
                <Text style={styles.label}>Message</Text>
                <TextInput
                  ref={messageInputRef}
                  value={message}
                  onFocus={() => setFocusedField("message")}
                  onChangeText={(next) => {
                    setMessage(next);
                    setSubmitError("");
                    if (next.trim()) clearError("message");
                  }}
                  onBlur={() => {
                    setFocusedField(null);
                    if (!message.trim()) setErrors((current) => ({ ...current, message: "Please tell us how we can help." }));
                  }}
                  placeholder="How can we help?"
                  placeholderTextColor={huddleColors.mutedText}
                  editable={!submitting}
                  multiline
                  scrollEnabled
                  textAlignVertical="top"
                  style={[
                    styles.field,
                    styles.textArea,
                    focusedField === "message" ? styles.fieldFocused : null,
                    errors.message ? styles.fieldError : null,
                  ]}
                />
                {errors.message ? <Text style={styles.errorText}>{errors.message}</Text> : null}
              </View>

              <Pressable
                disabled={submitting}
                onPress={() => {
                  const next = !wantsReply;
                  setWantsReply(next);
                  setSubmitError("");
                  if (!next) clearError("replyEmail");
                }}
                style={({ pressed }) => [styles.checkboxRow, pressed && !submitting ? styles.pressed : null]}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: wantsReply }}
              >
                <View style={[styles.checkbox, wantsReply ? styles.checkboxChecked : null]}>
                  {wantsReply ? <Feather name="check" size={16} color={huddleColors.onPrimary} /> : null}
                </View>
                <Text style={styles.checkboxLabel}>You may follow up with me via email if needed.</Text>
              </Pressable>

              {requiresReplyEmail ? (
                <View
                  onLayout={(event) => { fieldOffsetsRef.current.replyEmail = event.nativeEvent.layout.y; }}
                  style={styles.fieldGroup}
                >
                  <Text style={styles.label}>Email</Text>
                  <TextInput
                multiline={false}
                scrollEnabled
                numberOfLines={1} lineBreakModeIOS="tail" lineBreakStrategyIOS="none"
                textBreakStrategy="simple"
                    ref={replyEmailInputRef}
                    value={replyEmail}
                    onFocus={() => setFocusedField("replyEmail")}
                    onChangeText={(next) => {
                      setReplyEmail(next);
                      setSubmitError("");
                      if (supportReplyEmailPattern.test(next.trim())) clearError("replyEmail");
                    }}
                    onBlur={() => {
                      setFocusedField(null);
                      const trimmed = replyEmail.trim();
                      if (!trimmed) {
                        setErrors((current) => ({ ...current, replyEmail: "Enter your email if you want a reply." }));
                      } else if (!supportReplyEmailPattern.test(trimmed)) {
                        setErrors((current) => ({ ...current, replyEmail: "Enter a valid email address." }));
                      }
                    }}
                    onSubmitEditing={() => void submitSupport()}
                    placeholder="name@email.com"
                    placeholderTextColor={huddleColors.mutedText}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    returnKeyType="done"
                    editable={!submitting}
                    style={[
                      styles.field,
                      focusedField === "replyEmail" ? styles.fieldFocused : null,
                      errors.replyEmail ? styles.fieldError : null,
                    ]}
                  />
                  {errors.replyEmail ? <Text style={styles.errorText}>{errors.replyEmail}</Text> : null}
                </View>
              ) : null}

              <View
                onLayout={(event) => { fieldOffsetsRef.current.turnstile = event.nativeEvent.layout.y; }}
                style={styles.turnstileGroup}
              >
                <NativeTurnstile
                  action="support_ticket"
                  compact
                  key={`support-turnstile-${turnstileResetKey}`}
                  onError={setTurnstileError}
                  onToken={(token) => {
                    setTurnstileToken(token);
                    if (token) setTurnstileError("");
                  }}
                  siteKey={getNativeTurnstileSiteKey()}
                />
                {turnstileError ? <Text style={styles.errorText}>{turnstileError}</Text> : null}
              </View>
              {submitError ? <Text style={styles.errorText}>{submitError}</Text> : null}

              <View style={styles.buttonStack}>
                <Animated.View style={sendShakeStyle}>
                  <SlideToConfirm
                    busy={submitting}
                    label="Slide to Send"
                    onCommit={() => void submitSupport()}
                    resetKey={sliderResetKey}
                  />
                </Animated.View>
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    backgroundColor: huddleColors.canvas,
  },
  scrollContent: {
    paddingHorizontal: huddleSpacing.x4,
    paddingTop: huddleSpacing.x5,
    paddingBottom: huddleSpacing.x5,
  },
  panel: {
    width: "100%",
    paddingHorizontal: huddleSpacing.x4,
    paddingTop: huddleSpacing.x5,
    paddingBottom: huddleSpacing.x5,
    gap: huddleSpacing.x4,
  },
  title: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.h4,
    lineHeight: huddleType.h4Line,
    color: huddleColors.text,
  },
  fieldGroup: {
    gap: huddleSpacing.x2,
  },
  label: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.text,
  },
  field: {
    flexShrink: 1,
    minWidth: 0,
    minHeight: huddleLayout.fieldHeight,
    borderRadius: huddleRadii.field,
    borderWidth: 1,
    borderColor: huddleColors.fieldBorderSoft,
    backgroundColor: huddleColors.canvas,
    paddingHorizontal: huddleSpacing.x3,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.body,
    lineHeight: 22,
    color: huddleColors.text,
    overflow: "hidden",
    shadowColor: huddleColors.neutralShadow,
    shadowOpacity: 0.42,
    shadowRadius: 14,
    shadowOffset: { width: 5, height: 5 },
    elevation: 1,
  },
  fieldFocused: {
    ...huddleFieldStates.focused,
  },
  fieldError: {
    ...huddleFieldStates.error,
  },
  textArea: {
    height: huddleFormFields.multilineHeight,
    maxHeight: huddleFormFields.multilineHeight,
    paddingTop: huddleSpacing.x3,
  },
  checkboxRow: {
    minHeight: huddleLayout.minTouch,
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x3,
  },
  checkbox: {
    width: 28,
    height: 28,
    borderWidth: 1,
    borderColor: huddleColors.fieldBorderStrong,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: huddleColors.canvas,
    shadowColor: huddleColors.neutralShadow,
    shadowOpacity: 0.85,
    shadowRadius: 13,
    shadowOffset: { width: 5, height: 5 },
    elevation: 1,
  },
  checkboxChecked: {
    borderColor: huddleColors.blue,
    backgroundColor: huddleColors.blue,
  },
  checkboxLabel: {
    flex: 1,
    fontFamily: "Urbanist-500",
    fontSize: 13,
    lineHeight: 18,
    color: huddleColors.text,
  },
  turnstileGroup: {
    width: "100%",
    gap: huddleSpacing.x2,
  },
  buttonStack: {
    gap: huddleSpacing.x3,
    paddingTop: huddleSpacing.x1,
  },
  primaryButton: {
    ...huddleButtons.base,
    ...huddleButtons.primary,
  },
  primaryLabel: {
    ...huddleButtons.label,
    color: huddleColors.onPrimary,
  },
  pressed: {
    ...huddleButtons.pressed,
  },
  errorText: {
    fontFamily: "Urbanist-600",
    fontSize: huddleType.helper,
    lineHeight: 16,
    color: huddleColors.validationRed,
  },
  successBox: {
    gap: huddleSpacing.x3,
  },
  successText: {
    fontFamily: "Urbanist-500",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.text,
  },
});
