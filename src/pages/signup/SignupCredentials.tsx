/**
 * SignupCredentials — C.5  Step 2 of 4
 * Email + phone OTP + password + terms. Uses SignupShell for layout.
 * All business logic (OTP, duplicate detection, password strength, dialog) preserved.
 */

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Lock, Mail, Phone } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { credentialsSchema, oauthCredentialsSchema } from "@/lib/authSchemas";
import { useSignup } from "@/contexts/SignupContext";
import { useAuth } from "@/contexts/AuthContext";
import { isRegisteredUserProfile } from "@/lib/signupFlow";
import { getClientEnv } from "@/lib/env";
import { NeuButton } from "@/components/ui/NeuButton";
import { FormField, NeuCheckbox } from "@/components/ui";
import { LegalModal } from "@/components/modals/LegalModal";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { SignupShell } from "@/components/signup/SignupShell";
import { TurnstileDebugPanel, TurnstileWidget } from "@/components/security/TurnstileWidget";
import { useTurnstile } from "@/hooks/useTurnstile";
import { mapAuthFailureMessage } from "@/lib/authErrorMessages";
import { loadSignupDraft } from "@/lib/signupOnboarding";
import { enablePersistentSession, enableSessionOnlyAuth } from "@/lib/authSessionPersistence";
// ─── Constants ────────────────────────────────────────────────────────────────

const FORM_ID = "signup-credentials-form";
const SIGNUP_TURNSTILE_TOKEN_KEY = "huddle_signup_turnstile_token";
const BASIC_E164_REGEX = /^\+[1-9]\d{1,14}$/;
const SignupPhoneInput = lazy(() => import("@/components/signup/SignupPhoneInput"));
const emailSchema = z.string().trim().email();
const ACCOUNT_UNAVAILABLE_MESSAGE =
  "Your Huddle account is unavailable. Contact support@huddle.pet if you think this is a mistake.";
const appEnv = String(import.meta.env.VITE_APP_ENV ?? "").toLowerCase();
const shouldBypassDuplicateCheck =
  import.meta.env.PROD === false &&
  (
    import.meta.env.MODE === "test" ||
    appEnv === "test" ||
    appEnv === "testing" ||
    String(import.meta.env.VITE_E2E_MODE ?? "false") === "true"
  );

// ─── Component ────────────────────────────────────────────────────────────────

const SignupCredentials = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const showTurnstileDiag =
    typeof window !== "undefined"
    && new URLSearchParams(window.location.search).get("turnstile_diag") === "1";
  const { data, update, setFlowState, flowState } = useSignup();
  const incomingState = location.state as { email?: string; invalid_link?: boolean } | null;
  const incomingEmail = String(incomingState?.email || "").trim().toLowerCase();
  const { user, profile, signIn } = useAuth();
  const [isExiting, setIsExiting] = useState(false);
  // Pre-verified state: set as soon as the email field resolves to an already-verified
  // presignup token on the backend. Checked on submit to skip /signup/verify-email.
  const [preVerifiedProof, setPreVerifiedProof] = useState<string | null>(null);
  const preVerifyCheckRef = useRef(0);

  // Strict OAuth onboarding detection — ALL four conditions must hold:
  // 1. Already authenticated (session exists via OAuth provider)
  // 2. Provider is OAuth (Google / Apple), not email / password
  // 3. Signup flow is explicitly active (set by AuthCallback on this path)
  // 4. Onboarding not yet complete
  // Cannot match: a completed user (cond 4), a normal idle session (cond 3),
  // or an email-signup user who hasn't called signUp() yet (cond 2).
  const isOAuthOnboarding =
    Boolean(user) &&
    user?.app_metadata?.provider !== "email" &&
    flowState === "signup" &&
    !isRegisteredUserProfile(profile ?? null);

  const goTo = (to: string, state?: Record<string, unknown>) => {
    setIsExiting(true);
    setTimeout(() => navigate(to, state ? { state } : undefined), 180);
  };

  const [emailOptIn, setEmailOptIn] = useState(false);
  const [legalModal, setLegalModal] = useState<"terms" | "privacy" | null>(null);
  const [showSignInModal, setShowSignInModal] = useState(false);
  const [duplicateDetected, setDuplicateDetected] = useState(false);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);
  const [duplicateCheckError, setDuplicateCheckError] = useState<string | null>(null);
  const [signupBlockedMessage, setSignupBlockedMessage] = useState<string | null>(null);
  const [duplicateRetryToken, setDuplicateRetryToken] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [signinEmail, setSigninEmail] = useState("");
  const [signinPassword, setSigninPassword] = useState("");
  const [signinLoading, setSigninLoading] = useState(false);
  const [signinError, setSigninError] = useState("");
  const [signinRemember, setSigninRemember] = useState(true);
  const [dismissedDuplicateKey, setDismissedDuplicateKey] = useState<string | null>(null);
  const [phoneValidator, setPhoneValidator] = useState<((value: string) => boolean) | null>(null);
  const duplicateCheckRef = useRef(0);
  const presignupTurnstile = useTurnstile("send_pre_signup_verify");
  const readTurnstileToken = (turnstileState: { getToken?: unknown; token?: string | null }) => {
    const maybeGetToken = turnstileState.getToken;
    if (typeof maybeGetToken === "function") {
      return String((maybeGetToken as () => string)() || "").trim();
    }
    return String(turnstileState.token || "").trim();
  };

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isValid },
  } = useForm({
    // OAuth path: password fields are hidden and must not block validation.
    // oauthCredentialsSchema omits password requirements so isValid reflects
    // only email + phone — the only fields the user can actually fill.
    resolver: zodResolver(isOAuthOnboarding ? oauthCredentialsSchema : credentialsSchema),
    mode: "onChange",
    defaultValues: {
      // OAuth onboarding: pre-fill email from provider; do not allow entry
      email: data.email || (user?.app_metadata?.provider !== "email" ? user?.email ?? "" : ""),
      phone: data.phone,
      password: data.password,
      confirmPassword: data.password,
    },
  });

  const email = watch("email") || "";
  const phone = watch("phone") || "";
  const setPhoneValue = (value: string) => {
    setValue("phone", value || "", { shouldValidate: true, shouldTouch: true });
  };
  const defaultCountry = useMemo(() => {
    const locale = typeof navigator !== "undefined" ? navigator.language : "";
    const parts = locale.split("-");
    return (parts[1] || "HK") as string;
  }, []);
  const password = watch("password") || "";
  const confirmPassword = watch("confirmPassword") || "";
  const confirmMismatch = Boolean(confirmPassword) && confirmPassword !== password;
  // Email signup path: Zod schema validation (E.164 structural regex).
  const isPhoneStructurallyValid = useCallback((value: string) => {
    const normalized = String(value || "").trim();
    if (!BASIC_E164_REGEX.test(normalized)) return false;
    return phoneValidator ? phoneValidator(normalized) : false;
  }, [phoneValidator]);
  const phoneValidatorPending = Boolean(phone) && BASIC_E164_REGEX.test(phone.trim()) && !phoneValidator;
  const phoneInvalid = Boolean(errors.phone);

  // Full structural phone validation is loaded after first paint with the phone
  // input chunk. It must pass before duplicate checks or Continue can run.
  const phoneNotValid = Boolean(phone) && !phoneValidatorPending && !isPhoneStructurallyValid(phone);

  // ── Effects ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    let mounted = true;
    void import("@/lib/signupPhoneValidation")
      .then((module) => {
        if (mounted) setPhoneValidator(() => module.isValidSignupPhoneNumber);
      })
      .catch(() => {
        if (mounted) setPhoneValidator(null);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const hasChanges = data.email !== email || data.phone !== phone || data.password !== password;
    if (!hasChanges) return;
    update({ email, phone, password });
  }, [data.email, data.phone, data.password, email, phone, password, update]);

  useEffect(() => {
    if (!getClientEnv().isDev) return;
    console.debug(errors, isValid);
  }, [errors, isValid]);

  useEffect(() => {
    setDismissedDuplicateKey(null);
    setSignupBlockedMessage(null);
  }, [email, phone]);

  // Early pre-verification check: as soon as the email field is structurally valid,
  // ask the backend whether it already has a verified presignup token for this address.
  // This fires on email change (debounced 600ms) so the result is ready by the time
  // the user hits Continue — no token in sessionStorage required.
  useEffect(() => {
    if (isOAuthOnboarding) return;
    const normalizedEmail = email.trim().toLowerCase();
    if (!emailSchema.safeParse(normalizedEmail).success) {
      setPreVerifiedProof(null);
      return;
    }
    const checkId = ++preVerifyCheckRef.current;
    const timer = setTimeout(async () => {
      try {
        const { data: resp } = await supabase.functions.invoke("get-pre-signup-verify-status", {
          body: { email: normalizedEmail },
        });
        if (checkId !== preVerifyCheckRef.current) return;
        if (resp?.verified && resp?.signup_proof) {
          setPreVerifiedProof(String(resp.signup_proof));
        } else {
          setPreVerifiedProof(null);
        }
      } catch {
        if (checkId === preVerifyCheckRef.current) setPreVerifiedProof(null);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [email, isOAuthOnboarding]);

  // Sync email from OAuth provider metadata after first render (in case auth
  // context wasn't ready when defaultValues was computed).
  useEffect(() => {
    if (isOAuthOnboarding && user?.email && !email) {
      setValue("email", user.email, { shouldValidate: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOAuthOnboarding]);

  useEffect(() => {
    if (!incomingEmail) return;
    const restoredDraft = loadSignupDraft(incomingEmail);
    if (restoredDraft) {
      const restoredEmail = String((restoredDraft.data as { email?: string }).email || incomingEmail);
      const restoredPhone = String((restoredDraft.data as { phone?: string }).phone || "");
      const restoredPassword = restoredDraft.password || "";
      if (!email && restoredEmail) setValue("email", restoredEmail, { shouldValidate: true });
      if (!phone && restoredPhone) setValue("phone", restoredPhone, { shouldValidate: true });
      if (!password && restoredPassword && !isOAuthOnboarding) {
        setValue("password", restoredPassword, { shouldValidate: true });
        setValue("confirmPassword", restoredPassword, { shouldValidate: true });
      }
      update({
        ...(restoredDraft.data as Record<string, unknown>),
        email: restoredEmail,
        phone: restoredPhone,
        password: restoredPassword,
      });
      if (flowState === "idle") setFlowState("signup");
      return;
    }
    if (!email) {
      setValue("email", incomingEmail, { shouldValidate: true });
      update({ email: incomingEmail });
    }
  }, [email, flowState, incomingEmail, isOAuthOnboarding, password, phone, setFlowState, setValue, update]);

  useEffect(() => {
    if (isOAuthOnboarding) {
      // OAuth users are already authenticated — their email IS registered (expected).
      // Skip the email part of the duplicate check entirely.
      // Only check phone uniqueness: pass empty string for p_email so the RPC
      // matches on phone only. Phone is compared in normalized E.164 — no false
      // collisions from formatting differences.
      if (!phone || !isPhoneStructurallyValid(phone)) {
        // No valid phone yet — clear state, nothing to check.
        setCheckingDuplicate(false);
        setDuplicateDetected(false);
        setDuplicateCheckError(null);
        setSignupBlockedMessage(null);
        return;
      }
      const checkId = ++duplicateCheckRef.current;
      const timer = setTimeout(async () => {
        try {
          setCheckingDuplicate(true);
          setDuplicateCheckError(null);
          const { data: checkResult, error: checkError } = await supabase.rpc("check_identifier_registered", {
            p_email: "",        // empty — skip email uniqueness (their email is already registered)
            p_phone: phone,     // normalized E.164 from PhoneInput
          });
          if (checkId !== duplicateCheckRef.current) return;
          if (checkError) {
            setDuplicateDetected(false);
            setDuplicateCheckError("Could not verify phone right now. Please retry.");
            setSignupBlockedMessage(null);
            return;
          }
          if (checkResult?.blocked) {
            setDuplicateDetected(false);
            setDuplicateCheckError(null);
            setSignupBlockedMessage(String(checkResult?.public_message || ACCOUNT_UNAVAILABLE_MESSAGE));
            return;
          }
          if (checkResult?.review_required) {
            setDuplicateDetected(false);
            setSignupBlockedMessage(null);
            setDuplicateCheckError("Signup is temporarily unavailable. Please try again later.");
            return;
          }
          setDuplicateDetected(Boolean(checkResult?.registered));
          setSignupBlockedMessage(null);
          // Do NOT open the sign-in dialog for OAuth users — collision is on
          // phone, not their own email. Error is shown inline on the field.
        } catch {
          if (checkId !== duplicateCheckRef.current) return;
          setDuplicateDetected(false);
          setDuplicateCheckError("Could not verify phone right now. Please retry.");
          setSignupBlockedMessage(null);
        } finally {
          if (checkId === duplicateCheckRef.current) setCheckingDuplicate(false);
        }
      }, 400);
      return () => clearTimeout(timer);
    }
    if (shouldBypassDuplicateCheck) {
      setCheckingDuplicate(false);
      setDuplicateDetected(false);
      setDuplicateCheckError(null);
      setSignupBlockedMessage(null);
      return;
    }
    const trimmedEmail = email.trim();
    const trimmedPhone = phone.trim();
    const duplicateKey = `${trimmedEmail.toLowerCase()}|${trimmedPhone}`;
    const emailReady = emailSchema.safeParse(trimmedEmail).success;
    const phoneReady = Boolean(trimmedPhone) && isPhoneStructurallyValid(trimmedPhone);

    // Do not trigger duplicate checks (or sign-in modal) while user is still typing.
    // Only check once both identifiers are structurally valid.
    if (!emailReady || !phoneReady) {
      setDuplicateDetected(false);
      setDuplicateCheckError(null);
      setSignupBlockedMessage(null);
      if (showSignInModal) setShowSignInModal(false);
      return;
    }
    const checkId = ++duplicateCheckRef.current;
    const timer = setTimeout(async () => {
      try {
        setCheckingDuplicate(true);
        setDuplicateCheckError(null);
        const { data: checkResult, error: checkError } = await supabase.rpc("check_identifier_registered", {
          p_email: trimmedEmail,
          p_phone: trimmedPhone,
        });
        if (checkId !== duplicateCheckRef.current) return;
        if (checkError) {
          setDuplicateDetected(false);
          setDuplicateCheckError("Could not verify account details right now. Please retry.");
          setSignupBlockedMessage(null);
          return;
        }
        if (checkResult?.blocked) {
          setDuplicateDetected(false);
          setDuplicateCheckError(null);
          setSignupBlockedMessage(String(checkResult?.public_message || ACCOUNT_UNAVAILABLE_MESSAGE));
          if (showSignInModal) setShowSignInModal(false);
          return;
        }
        if (checkResult?.review_required) {
          setDuplicateDetected(false);
          setSignupBlockedMessage(null);
          setDuplicateCheckError("Signup is temporarily unavailable. Please try again later.");
          if (showSignInModal) setShowSignInModal(false);
          return;
        }
        const isRegistered = Boolean(checkResult?.registered);
        setDuplicateDetected(isRegistered);
        setSignupBlockedMessage(null);
        if (isRegistered && dismissedDuplicateKey !== duplicateKey) {
          setSigninEmail(trimmedEmail);
          setShowSignInModal(true);
        }
        else if (showSignInModal) setShowSignInModal(false);
      } catch (err) {
        if (checkId !== duplicateCheckRef.current) return;
        setDuplicateDetected(false);
        setDuplicateCheckError("Could not verify account details right now. Please retry.");
        setSignupBlockedMessage(null);
      } finally {
        if (checkId === duplicateCheckRef.current) setCheckingDuplicate(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [email, phone, showSignInModal, duplicateRetryToken, dismissedDuplicateKey, isOAuthOnboarding, isPhoneStructurallyValid]);

  useEffect(() => { if (showSignInModal) setSigninRemember(true); }, [showSignInModal]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  // onSubmit receives RHF-validated values after handleSubmit runs the conditional
  // schema (oauthCredentialsSchema for OAuth, credentialsSchema for email signup).
  // All field reads inside this handler use `values` — never raw watch() output —
  // so the handler works correctly regardless of which schema was active.
  // DOI (email_opt_in) is stored in client flow state only; it is NOT committed
  // to the database here. The final account-creation step commits it.
  const onSubmit = async (values: {
    email: string;
    phone: string;
    password?: string;
    confirmPassword?: string;
  }) => {
    if (signupBlockedMessage) {
      toast.error(signupBlockedMessage);
      return;
    }
    if (duplicateDetected || (!shouldBypassDuplicateCheck && duplicateCheckError)) return;
    if (shouldBypassDuplicateCheck) {
      update({ email: values.email, phone: values.phone, email_opt_in: emailOptIn });
      setFlowState("signup");
      goTo("/signup/name");
      return;
    }
    // Strict OAuth onboarding path — already authenticated via Google / Apple,
    // incomplete onboarding, signup flow active. Do NOT call signUp() again.
    // oauthCredentialsSchema validates the base E.164 shape; the lazy phone
    // validator above must pass selected-country rules before this can submit.
    if (isOAuthOnboarding) {
      if (duplicateDetected) return;
      update({
        email: user?.email || values.email,
        phone: values.phone,
        email_opt_in: emailOptIn,
      });
      setFlowState("signup");
      goTo("/signup/name");
      return;
    }
    // Email signup path — credentialsSchema validates email, password, and the
    // base E.164 phone shape; selected-country phone validation is enforced in
    // the CTA/duplicate-check guards above before submit can run.
    // Step order is:
    // credentials -> email-confirmation -> name -> create auth user -> verify identity
    // Skip the email-confirmation gate only if a usable pre-signup proof already exists.
    setSubmitting(true);
    try {
      const presignupToken = readTurnstileToken(presignupTurnstile);
      if (!presignupToken) {
        toast.error("Human verification is still loading. Please try again in a moment.");
        return;
      }
      const { data: checkResult, error: checkError } = await supabase.rpc("check_identifier_registered", {
        p_email: values.email,
        p_phone: values.phone,
      });
      if (checkError) {
        console.error("Duplicate check error:", checkError);
        setDuplicateCheckError("Could not verify account details right now. Please retry.");
        return;
      }
      if (checkResult?.blocked) {
        const blockedMessage = String(checkResult?.public_message || ACCOUNT_UNAVAILABLE_MESSAGE);
        setSignupBlockedMessage(blockedMessage);
        toast.error(blockedMessage);
        return;
      }
      if (checkResult?.review_required) {
        const reviewMessage = "Signup is temporarily unavailable. Please try again later.";
        setDuplicateCheckError(reviewMessage);
        toast.error(reviewMessage);
        return;
      }
      if (checkResult?.registered) {
        setSigninEmail(values.email);
        setShowSignInModal(true);
        return;
      }
      update({
        email: values.email.trim(),
        password: values.password ?? "",
        phone: values.phone.trim(),
        email_opt_in: emailOptIn,
        signup_proof: preVerifiedProof ?? "",
      });
      setFlowState("signup");
      sessionStorage.setItem(SIGNUP_TURNSTILE_TOKEN_KEY, presignupToken);
      if (preVerifiedProof) {
        goTo("/signup/name");
        return;
      }
      goTo("/signup/email-confirmation", {
        email: values.email.trim().toLowerCase(),
        from_credentials: true,
      });
    } catch (err) {
      console.error("Signup failed:", err);
      setFlowState("idle");
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Hint text helper ────────────────────────────────────────────────────────

  // OAuth onboarding CTA requirements (all must pass):
  //   • phone non-empty
  //   • phone structural validation passes selected country rules, NOT OTP ownership
  //   • no duplicate phone collision with another user's account
  //   • not mid-check, not mid-submit
  // Email signup CTA: unchanged.
  const ctaDisabled = isOAuthOnboarding
    ? !phone || phoneValidatorPending || phoneNotValid || duplicateDetected || checkingDuplicate || Boolean(duplicateCheckError) || submitting
    : !isValid ||
      phoneValidatorPending ||
      phoneNotValid ||
      !presignupTurnstile.isTokenUsable ||
      Boolean(signupBlockedMessage) ||
      duplicateDetected ||
      checkingDuplicate ||
      submitting ||
      (!shouldBypassDuplicateCheck && Boolean(duplicateCheckError));

  const hintText = isOAuthOnboarding
    ? (duplicateDetected
        ? "This phone number is already used by another account"
        : checkingDuplicate
          ? "Checking phone…"
          : duplicateCheckError
            ? "Could not verify phone. Retry."
            : phoneValidatorPending
              ? "Preparing phone validation…"
            : phoneNotValid
              ? "Phone number length is not valid for the selected country"
              : "Enter your phone number to continue")
    : (duplicateDetected
        ? "This email or phone number is already registered"
        : checkingDuplicate
          ? "Checking account details…"
          : signupBlockedMessage
            ? "Signup is currently unavailable for this account"
          : phoneValidatorPending
            ? "Preparing phone validation…"
          : !presignupTurnstile.isTokenUsable
            ? "Preparing verification…"
          : phoneInvalid || phoneNotValid
            ? "Enter a valid phone number"
            : "Complete all required fields to continue");

  // ── Form screen ──────────────────────────────────────────────────────────────

  return (
    <>
      <SignupShell
        step={2}
        onBack={() => goTo("/signup/dob")}
        isExiting={isExiting}
        cta={
          <div className="space-y-2">
            {!isOAuthOnboarding ? (
              <div data-testid="signup-credentials-turnstile">
                <TurnstileWidget
                  siteKeyMissing={presignupTurnstile.siteKeyMissing}
                  setContainer={presignupTurnstile.setContainer}
                  className="min-h-[65px]"
                />
              </div>
            ) : null}
            {!isOAuthOnboarding ? (
              <TurnstileDebugPanel visible={showTurnstileDiag} diag={presignupTurnstile.diag} />
            ) : null}
            {signupBlockedMessage ? (
              <div
                role="alert"
                className="rounded-xl border border-[#E84545]/30 bg-[#E84545]/8 px-3 py-2 text-xs text-[#A62424]"
              >
                {signupBlockedMessage}
              </div>
            ) : null}
            <NeuButton
              variant="primary"
              type="submit"
              form={FORM_ID}
              disabled={ctaDisabled}
              className="w-full h-12"
            >
              {submitting ? "Checking…" : "Continue"}
            </NeuButton>
            {ctaDisabled && (
              <p className="text-[11px] text-[rgba(74,73,101,0.55)] text-center">
                {hintText}
              </p>
            )}
          </div>
        }
      >
        {/* Headline */}
        <h1 className="text-[28px] font-[600] leading-[1.1] tracking-[-0.02em] text-[#424965]">
          Your login details
        </h1>
        <p className="text-[15px] text-[rgba(74,73,101,0.70)] leading-relaxed mt-2">
          We'll use these to keep your account secure.
        </p>

        <form id={FORM_ID} onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-6 pb-[calc(env(safe-area-inset-bottom,0px)+84px)]">
          {/* Email — read-only for OAuth users (tied to provider account) */}
          <FormField
            type="email"
            label="Email"
            leadingIcon={<Mail size={16} strokeWidth={1.75} />}
            autoComplete="email"
            error={errors.email?.message as string | undefined}
            autoFocus={!isOAuthOnboarding}
            disabled={isOAuthOnboarding}
            {...register("email")}
          />

          {/* Phone */}
          <div className="flex flex-col" style={{ gap: "var(--field-gap-lc, 6px)" }}>
            <label className="text-[13px] font-semibold text-[var(--text-primary,#424965)] pl-1">Phone Number</label>
            <div className={`form-field-rest relative flex items-center ${
              isOAuthOnboarding ? (phoneNotValid || duplicateDetected ? "form-field-error" : "") : ((errors.phone || phoneNotValid) ? "form-field-error" : "")
            }`}>
              <Phone className="absolute left-4 h-4 w-4 text-[var(--text-tertiary)] pointer-events-none" />
              <Suspense
                fallback={
                  <input
                    type="tel"
                    value={phone}
                    onChange={(event) => setPhoneValue(event.target.value)}
                    autoComplete="tel"
                    inputMode="tel"
                    placeholder="+852"
                    className="field-input-core w-full pl-10 pr-4 font-[var(--font)] focus:outline-none focus:ring-0 focus-visible:outline-none"
                  />
                }
              >
                <SignupPhoneInput
                  defaultCountry={defaultCountry}
                  value={phone}
                  onChange={setPhoneValue}
                />
              </Suspense>
            </div>
            {isOAuthOnboarding ? (
              <>
                {/* Country-aware digit-count validation — not OTP ownership */}
                {phoneValidatorPending && (
                  <p className="text-[12px] font-medium text-[rgba(74,73,101,0.55)] pl-1" aria-live="polite">
                    Preparing phone validation…
                  </p>
                )}
                {!phoneValidatorPending && phoneNotValid && (
                  <p className="text-[12px] font-medium text-[var(--color-error,#E84545)] pl-1" aria-live="polite">
                    Phone number length is not valid for the selected country
                  </p>
                )}
                {!phoneValidatorPending && !phoneNotValid && duplicateDetected && (
                  <p className="text-[12px] font-medium text-[var(--color-error,#E84545)] pl-1" aria-live="polite">
                    This phone number is already used by another account
                  </p>
                )}
              </>
            ) : (
              <>
                {phoneValidatorPending && (
                  <p className="text-[12px] font-medium text-[rgba(74,73,101,0.55)] pl-1" aria-live="polite">
                    Preparing phone validation…
                  </p>
                )}
                {!phoneValidatorPending && (errors.phone || phoneNotValid) && (
                  <p className="text-[12px] font-medium text-[var(--color-error,#E84545)] pl-1" aria-live="polite">
                    Your phone number is invalid
                  </p>
                )}
              </>
            )}
          </div>

          {/* Password / Confirm — hidden for OAuth users (they authenticate via provider) */}
          {!isOAuthOnboarding && (
            <>
              <div>
                <FormField
                  type="password"
                  label="Password"
                  leadingIcon={<Lock size={16} strokeWidth={1.75} />}
                  error={errors.password?.message as string | undefined}
                  {...register("password")}
                />
              </div>
              <FormField
                type="password"
                label="Confirm Password"
                leadingIcon={<Lock size={16} strokeWidth={1.75} />}
                error={confirmMismatch ? "Passwords do not match" : (errors.confirmPassword?.message as string | undefined)}
                {...register("confirmPassword")}
              />
            </>
          )}

          <div className="space-y-3">
            <label className="flex items-start gap-2 text-[12px] text-[rgba(74,73,101,0.80)] leading-relaxed cursor-pointer">
              <input
                type="checkbox"
                checked={emailOptIn}
                onChange={(e) => setEmailOptIn(e.target.checked)}
                className="mt-[2px] h-4 w-4 rounded border-[rgba(74,73,101,0.35)] shrink-0"
              />
              <span>
                I agree to receive emails from Huddle for pet care, community news, and product updates.
              </span>
            </label>

            <p className="text-[12px] text-[rgba(74,73,101,0.60)] leading-relaxed">
              By tapping Continue, you agree to our{" "}
              <button
                type="button"
                className="text-[#2145CF] underline"
                onClick={() => setLegalModal("terms")}
              >
                Terms of Service
              </button>{" "}
              and{" "}
              <button
                type="button"
                className="text-[#2145CF] underline"
                onClick={() => setLegalModal("privacy")}
              >
                Privacy Policy
              </button>
              .
            </p>
          </div>

          <div className="h-[calc(env(safe-area-inset-bottom,0px)+8px)]" aria-hidden="true" />
        </form>
      </SignupShell>

      {/* Legal modals */}
      <LegalModal isOpen={legalModal === "terms"}    onClose={() => setLegalModal(null)} type="terms" />
      <LegalModal isOpen={legalModal === "privacy"}  onClose={() => setLegalModal(null)} type="privacy" />

      {/* Already-registered sign-in dialog (unchanged) */}
      <Dialog
        open={showSignInModal}
        onOpenChange={(open) => {
          if (!open) {
            const trimmedEmail = email.trim();
            const trimmedPhone = phone.trim();
            setDismissedDuplicateKey(`${trimmedEmail.toLowerCase()}|${trimmedPhone}`);
          }
          setShowSignInModal(open);
          if (!open) setSigninError("");
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogTitle className="text-[18px] font-[600] text-[#424965]">
            Already Registered
          </DialogTitle>
          <DialogDescription className="text-[13px] text-[rgba(74,73,101,0.70)]">
            This email or phone number is already registered
          </DialogDescription>

          <div className="space-y-4 mt-4">
            <FormField
              type="email"
              label="Email"
              leadingIcon={<Mail size={16} strokeWidth={1.75} />}
              value={signinEmail}
              onChange={(e) => setSigninEmail(e.target.value)}
              placeholder="Email"
            />

            <FormField
              type="password"
              label="Password"
              leadingIcon={<Lock size={16} strokeWidth={1.75} />}
              value={signinPassword}
              onChange={(e) => setSigninPassword(e.target.value)}
              placeholder="Password"
            />

            <div className="flex items-center justify-between">
              <NeuCheckbox
                checked={signinRemember}
                onCheckedChange={(v) => setSigninRemember(Boolean(v))}
                label="Stay logged in"
              />
              <Link to="/reset-password" className="text-[13px] text-[#2145CF]">
                Forgot password?
              </Link>
            </div>

            {signinError && (
              <p className="text-[12px] text-[#EF4444]">{signinError}</p>
            )}

            <NeuButton
              className="w-full"
              disabled={!signinEmail || !signinPassword || signinLoading}
              onClick={async () => {
                setSigninLoading(true);
                setSigninError("");
                try {
                  const result = await signIn(signinEmail, signinPassword);
                  if (result.error) {
                    throw new Error(mapAuthFailureMessage(result.error.message));
                  }
                  if (result.mfaRequired) {
                    throw new Error("Two-step verification is required. Please continue from the Sign in screen.");
                  }

                  if (signinRemember) {
                    localStorage.setItem("auth_login_identifier", signinEmail);
                    enablePersistentSession();
                  } else {
                    localStorage.removeItem("auth_login_identifier");
                    enableSessionOnlyAuth();
                  }

                  toast.success("Signed in successfully");
                  setShowSignInModal(false);
                  goTo("/");
                } catch (err: unknown) {
                  setSigninError(mapAuthFailureMessage(err instanceof Error ? err.message : "Couldn’t sign you in."));
                } finally {
                  setSigninLoading(false);
                }
              }}
            >
              {signinLoading ? "Signing in…" : "Sign in"}
            </NeuButton>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default SignupCredentials;
