/**
 * SignupCredentials — C.5  Step 2 of 4
 * Email + phone OTP + password + terms. Uses SignupShell for layout.
 * All business logic (OTP, duplicate detection, password strength, dialog) preserved.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle, Lock, Mail, Phone } from "lucide-react";
import { GlassSheet } from "@/components/ui/GlassSheet";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import PhoneInput, { isValidPhoneNumber } from "react-phone-number-input";
import "react-phone-number-input/style.css";
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
// ─── Constants ────────────────────────────────────────────────────────────────

const FORM_ID = "signup-credentials-form";
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
  const { data, update, setFlowState, flowState } = useSignup();
  const { user, profile } = useAuth();
  const [isExiting, setIsExiting] = useState(false);

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

  const goTo = (to: string) => {
    setIsExiting(true);
    setTimeout(() => navigate(to), 180);
  };

  const [verifySubState, setVerifySubState] = useState<"form" | "verifying">(
    () => sessionStorage.getItem("huddle_presignup_token") ? "verifying" : "form"
  );
  const [verifyToken, setVerifyToken] = useState<string>(
    () => sessionStorage.getItem("huddle_presignup_token") ?? ""
  );
  const [emailVerified, setEmailVerified] = useState(false);
  const [sendState, setSendState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [tokenExpired, setTokenExpired] = useState(false);
  const [showMailSheet, setShowMailSheet] = useState(false);
  const [emailOptIn, setEmailOptIn] = useState(false);
  const [legalModal, setLegalModal] = useState<"terms" | "privacy" | null>(null);
  const [showSignInModal, setShowSignInModal] = useState(false);
  const [duplicateDetected, setDuplicateDetected] = useState(false);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);
  const [duplicateCheckError, setDuplicateCheckError] = useState<string | null>(null);
  const [duplicateRetryToken, setDuplicateRetryToken] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [signinEmail, setSigninEmail] = useState("");
  const [signinPassword, setSigninPassword] = useState("");
  const [signinLoading, setSigninLoading] = useState(false);
  const [signinError, setSigninError] = useState("");
  const [signinRemember, setSigninRemember] = useState(true);
  const [dismissedDuplicateKey, setDismissedDuplicateKey] = useState<string | null>(null);
  const sessionOnlyHandlerRef = useRef<(() => void) | null>(null);
  const duplicateCheckRef = useRef(0);

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
  const defaultCountry = useMemo(() => {
    const locale = typeof navigator !== "undefined" ? navigator.language : "";
    const parts = locale.split("-");
    return (parts[1] || "HK") as string;
  }, []);
  const password = watch("password") || "";
  const confirmPassword = watch("confirmPassword") || "";
  const confirmMismatch = Boolean(confirmPassword) && confirmPassword !== password;
  // Email signup path: Zod schema validation (E.164 structural regex).
  const phoneInvalid = Boolean(errors.phone);

  // OAuth onboarding path: full structural validity check via libphonenumber
  // (shipped with react-phone-number-input).
  // isValidPhoneNumber checks actual national-number patterns, not just length ranges.
  // isPossiblePhoneNumber (length-range only) accepted partial inputs for any country whose
  // possible-length list spans a range — isValidPhoneNumber checks actual national-number
  // patterns and rejects any number not yet structurally complete for its country.
  // "valid" = structurally complete for the country, NOT OTP-verified ownership.
  const phoneNotValid = Boolean(phone) && !isValidPhoneNumber(phone);

  // ── Effects ──────────────────────────────────────────────────────────────────

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
  }, [email, phone]);

  // Sync email from OAuth provider metadata after first render (in case auth
  // context wasn't ready when defaultValues was computed).
  useEffect(() => {
    if (isOAuthOnboarding && user?.email && !email) {
      setValue("email", user.email, { shouldValidate: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOAuthOnboarding]);

  useEffect(() => {
    if (isOAuthOnboarding) {
      // OAuth users are already authenticated — their email IS registered (expected).
      // Skip the email part of the duplicate check entirely.
      // Only check phone uniqueness: pass empty string for p_email so the RPC
      // matches on phone only. Phone is compared in normalized E.164 — no false
      // collisions from formatting differences.
      if (!phone || !isValidPhoneNumber(phone)) {
        // No valid phone yet — clear state, nothing to check.
        setCheckingDuplicate(false);
        setDuplicateDetected(false);
        setDuplicateCheckError(null);
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
            return;
          }
          setDuplicateDetected(Boolean(checkResult?.registered));
          // Do NOT open the sign-in dialog for OAuth users — collision is on
          // phone, not their own email. Error is shown inline on the field.
        } catch {
          if (checkId !== duplicateCheckRef.current) return;
          setDuplicateDetected(false);
          setDuplicateCheckError("Could not verify phone right now. Please retry.");
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
      return;
    }
    const trimmedEmail = email.trim();
    const trimmedPhone = phone.trim();
    const duplicateKey = `${trimmedEmail.toLowerCase()}|${trimmedPhone}`;
    if (!trimmedEmail && !trimmedPhone) {
      setDuplicateDetected(false);
      setDuplicateCheckError(null);
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
          return;
        }
        const isRegistered = Boolean(checkResult?.registered);
        setDuplicateDetected(isRegistered);
        if (isRegistered && dismissedDuplicateKey !== duplicateKey) {
          setSigninEmail(trimmedEmail);
          setShowSignInModal(true);
        }
        else if (showSignInModal) setShowSignInModal(false);
      } catch (err) {
        if (checkId !== duplicateCheckRef.current) return;
        setDuplicateDetected(false);
        setDuplicateCheckError("Could not verify account details right now. Please retry.");
      } finally {
        if (checkId === duplicateCheckRef.current) setCheckingDuplicate(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [email, phone, showSignInModal, duplicateRetryToken, dismissedDuplicateKey, isOAuthOnboarding]);

  useEffect(() => { if (showSignInModal) setSigninRemember(true); }, [showSignInModal]);

  // Poll DB every 3s for pre-signup verification status.
  // Replaces the old localStorage polling — works cross-browser / mobile email clients.
  useEffect(() => {
    if (verifySubState !== "verifying" || !verifyToken || emailVerified) return;
    const poll = async () => {
      try {
        const { data, error } = await supabase.functions.invoke(
          "get-pre-signup-verify-status",
          { body: { token: verifyToken } },
        );
        if (error) return;
        if (data?.verified) {
          setEmailVerified(true);
          toast.success("Email verified!");
        } else if (data?.expired) {
          setTokenExpired(true);
        }
      } catch {
        // silent poll failure — retry on next tick
      }
    };
    const id = setInterval(poll, 3000);
    return () => clearInterval(id);
  }, [verifySubState, verifyToken, emailVerified]);

  // Attempt mailto: deep link 1s after the bottom sheet opens.
  useEffect(() => {
    if (!showMailSheet) return;
    const id = setTimeout(() => { window.location.href = "mailto:"; }, 1000);
    return () => clearTimeout(id);
  }, [showMailSheet]);

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
    if (duplicateDetected || (!shouldBypassDuplicateCheck && duplicateCheckError)) return;
    if (shouldBypassDuplicateCheck) {
      update({ email: values.email, phone: values.phone, email_opt_in: emailOptIn });
      setFlowState("signup");
      goTo("/signup/name");
      return;
    }
    // Strict OAuth onboarding path — already authenticated via Google / Apple,
    // incomplete onboarding, signup flow active. Do NOT call signUp() again.
    // oauthCredentialsSchema already validated phone structurally; the only
    // remaining runtime guard is the async duplicate-check state.
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
    // Email signup path — credentialsSchema validated all fields including password.
    setSubmitting(true);
    try {
      const { data: checkResult, error: checkError } = await supabase.rpc("check_identifier_registered", {
        p_email: values.email,
        p_phone: values.phone,
      });
      if (checkError) {
        console.error("Duplicate check error:", checkError);
        setDuplicateCheckError("Could not verify account details right now. Please retry.");
        return;
      }
      if (checkResult?.registered) {
        setSigninEmail(values.email);
        setShowSignInModal(true);
        return;
      }
      // Store credentials in flow state — signUp() is deferred to /signup/name so
      // the user's display name and social ID are collected before account creation.
      // This prevents orphaned accounts when users abandon mid-flow.
      // email_opt_in is stored in client state only; DB commit happens at account creation.
      update({
        email: values.email.trim(),
        password: values.password ?? "",
        phone: values.phone.trim(),
        email_opt_in: emailOptIn,
      });
      setFlowState("signup");
      // Send pre-signup verification email (awaited — no silent failures).
      // DB token is created server-side; client polls get-pre-signup-verify-status.
      const newToken = crypto.randomUUID();
      const { data: sendData, error: sendError } = await supabase.functions.invoke(
        "send-pre-signup-verify",
        { body: { email: values.email.trim(), token: newToken } },
      );
      if (sendError || !sendData?.ok) {
        setFlowState("idle");
        toast.error("Couldn't send verification email. Please try again.");
        return;
      }
      setVerifyToken(newToken);
      sessionStorage.setItem("huddle_presignup_token", newToken);
      sessionStorage.setItem("huddle_presignup_email", values.email.trim());
      setSendState("sent");
      setVerifySubState("verifying");
      return;
    } catch (err) {
      console.error("Signup failed:", err);
      setFlowState("idle");
      toast.error("Account creation failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const clearAuthTokens = () => {
    Object.keys(localStorage).forEach((key) => {
      if (key.includes("auth-token") && key.startsWith("sb-")) localStorage.removeItem(key);
      if (key.includes("supabase.auth.token")) localStorage.removeItem(key);
    });
  };

  const disableSessionOnly = () => {
    localStorage.setItem("huddle_stay_logged_in", "true");
    if (sessionOnlyHandlerRef.current) {
      window.removeEventListener("beforeunload", sessionOnlyHandlerRef.current);
      window.removeEventListener("pagehide", sessionOnlyHandlerRef.current);
      sessionOnlyHandlerRef.current = null;
    }
  };

  const enableSessionOnly = () => {
    localStorage.setItem("huddle_stay_logged_in", "false");
    if (!sessionOnlyHandlerRef.current) {
      sessionOnlyHandlerRef.current = clearAuthTokens;
      window.addEventListener("beforeunload", clearAuthTokens);
      window.addEventListener("pagehide", clearAuthTokens);
    }
  };

  const handleResend = async () => {
    if (sendState === "sending") return;
    setSendState("sending");
    const newToken = crypto.randomUUID();
    try {
      const { data, error } = await supabase.functions.invoke("send-pre-signup-verify", {
        body: { email: email.trim(), token: newToken },
      });
      if (error || !data?.ok) throw new Error("send_failed");
      setVerifyToken(newToken);
      sessionStorage.setItem("huddle_presignup_token", newToken);
      setTokenExpired(false);
      setEmailVerified(false);
      setSendState("sent");
      toast.success("Verification email sent");
    } catch {
      setSendState("error");
      toast.error("Couldn't send. Please try again.");
    }
  };

  const handleImmediateCheck = async () => {
    try {
      const { data, error } = await supabase.functions.invoke(
        "get-pre-signup-verify-status",
        { body: { token: verifyToken } },
      );
      if (error) throw error;
      if (data?.verified) {
        setEmailVerified(true);
        toast.success("Email verified!");
      } else if (data?.expired) {
        setTokenExpired(true);
      } else {
        toast.message("Not yet verified. Check your inbox and click the link.");
      }
    } catch {
      toast.error("Could not check status. Please try again.");
    }
  };

  const handleContinue = async () => {
    try {
      const { data, error } = await supabase.functions.invoke(
        "get-pre-signup-verify-status",
        { body: { token: verifyToken } },
      );
      if (error) throw error;
      if (data?.verified) {
        sessionStorage.removeItem("huddle_presignup_token");
        sessionStorage.removeItem("huddle_presignup_email");
        goTo("/signup/name");
      } else {
        setEmailVerified(false);
        toast.message("Not yet verified. Check your inbox and click the link.");
      }
    } catch {
      toast.error("Could not verify. Please try again.");
    }
  };

  // ── Hint text helper ────────────────────────────────────────────────────────

  // OAuth onboarding CTA requirements (all must pass):
  //   • phone non-empty
  //   • isValidPhoneNumber === true  (structural pattern check against selected country, NOT OTP ownership)
  //   • no duplicate phone collision with another user's account
  //   • not mid-check, not mid-submit
  // Email signup CTA: unchanged.
  const ctaDisabled = isOAuthOnboarding
    ? !phone || phoneNotValid || duplicateDetected || checkingDuplicate || Boolean(duplicateCheckError) || submitting
    : !isValid ||
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
            : phoneNotValid
              ? "Phone number length is not valid for the selected country"
              : "Enter your phone number to continue")
    : (duplicateDetected
        ? "This email or phone number is already registered"
        : checkingDuplicate
          ? "Checking account details…"
          : phoneInvalid
            ? "Enter a valid phone number"
            : "Complete all required fields to continue");

  // ── Verify sub-state screen ──────────────────────────────────────────────────

  if (verifySubState === "verifying") {
    return (
      <>
        <SignupShell
          step={2}
          onBack={() => {
            setVerifySubState("form");
            setEmailVerified(false);
            setVerifyToken("");
            setTokenExpired(false);
            setSendState("idle");
            sessionStorage.removeItem("huddle_presignup_token");
            sessionStorage.removeItem("huddle_presignup_email");
          }}
          isExiting={isExiting}
          cta={
            emailVerified ? (
              <NeuButton variant="primary" className="w-full h-12" onClick={handleContinue}>
                Continue
              </NeuButton>
            ) : (
              <NeuButton
                variant="primary"
                className="w-full h-12"
                onClick={() => setShowMailSheet(true)}
              >
                Check your email
              </NeuButton>
            )
          }
        >
          <h1 className="text-[28px] font-[600] leading-[1.1] tracking-[-0.02em] text-[#424965]">
            Verify your email
          </h1>
          <p className="text-[15px] text-[rgba(74,73,101,0.70)] leading-relaxed mt-2">
            We sent a link to{" "}
            <strong className="font-[600] text-[#424965]">{email}</strong>.
            Tap the button in the email to verify.
          </p>

          {emailVerified && (
            <div className="mt-4 flex items-center gap-2 text-[14px] font-[500] text-green-700">
              <CheckCircle size={16} />
              Email verified
            </div>
          )}

          {tokenExpired && (
            <div className="mt-4 p-3 rounded-xl bg-red-50 border border-red-100">
              <p className="text-[13px] text-[#e84545]">
                Your verification link has expired. Tap Resend below.
              </p>
            </div>
          )}

          {sendState === "error" && (
            <div className="mt-4 p-3 rounded-xl bg-red-50 border border-red-100">
              <p className="text-[13px] text-[#e84545]">
                We couldn't send the email. Tap Resend to try again.
              </p>
            </div>
          )}

          <div className="mt-8">
            <p className="text-[15px] font-[600] text-[#424965]">Didn't receive it?</p>
            <p className="text-[14px] text-[rgba(74,73,101,0.70)] mt-1">
              Check your spam and promotions folder.
            </p>
            <button
              type="button"
              className="mt-2 text-[14px] font-[500] text-[#2145CF] disabled:opacity-50"
              onClick={handleResend}
              disabled={sendState === "sending"}
            >
              {sendState === "sending" ? "Sending…" : "Resend email"}
            </button>
          </div>

          <p className="mt-6 text-[11px] text-[rgba(74,73,101,0.50)]">
            Wrong email?{" "}
            <Link
              to="/auth"
              className="text-[#2145CF] underline"
              onClick={() => {
                setFlowState("idle");
                sessionStorage.removeItem("huddle_presignup_token");
                sessionStorage.removeItem("huddle_presignup_email");
              }}
            >
              Start over
            </Link>
          </p>
        </SignupShell>

        <GlassSheet
          isOpen={showMailSheet}
          onClose={() => setShowMailSheet(false)}
          title="Check your email"
          className="pb-[max(env(safe-area-inset-bottom,0px),24px)]"
        >
          <p className="text-[14px] text-[rgba(74,73,101,0.70)] leading-relaxed mb-5">
            We'll try to open your mail app. If it doesn't open, return here after verifying.
          </p>
          <div className="space-y-3">
            <NeuButton
              variant="secondary"
              className="w-full h-12"
              onClick={() => {
                window.location.href = "mailto:";
                setShowMailSheet(false);
              }}
            >
              Open Mail App
            </NeuButton>
            <NeuButton
              variant="ghost"
              className="w-full h-11"
              onClick={() => {
                setShowMailSheet(false);
                handleImmediateCheck();
              }}
            >
              I've already verified
            </NeuButton>
          </div>
        </GlassSheet>

        <LegalModal isOpen={legalModal === "terms"}   onClose={() => setLegalModal(null)} type="terms" />
        <LegalModal isOpen={legalModal === "privacy"} onClose={() => setLegalModal(null)} type="privacy" />
      </>
    );
  }

  // ── Form screen (default) ────────────────────────────────────────────────────

  return (
    <>
      <SignupShell
        step={2}
        onBack={() => goTo("/signup/dob")}
        isExiting={isExiting}
        cta={
          <div className="space-y-2">
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
              isOAuthOnboarding ? (phoneNotValid || duplicateDetected ? "form-field-error" : "") : (errors.phone ? "form-field-error" : "")
            }`}>
              <Phone className="absolute left-4 h-4 w-4 text-[var(--text-tertiary)] pointer-events-none" />
              <PhoneInput
                defaultCountry={defaultCountry as never}
                international
                value={phone}
                onChange={(value) => setValue("phone", value || "", { shouldValidate: true, shouldTouch: true })}
                className="w-full pl-10 [&_.PhoneInputCountry]:bg-transparent [&_.PhoneInputCountry]:shadow-none [&_.PhoneInputCountrySelectArrow]:opacity-50 [&_.PhoneInputCountryIcon]:bg-transparent [&_.PhoneInputInput]:bg-transparent [&_.PhoneInputInput]:border-0 [&_.PhoneInputInput]:shadow-none [&_.PhoneInputInput]:outline-none"
                inputStyle={{
                  width: "100%",
                  height: "100%",
                  fontSize: "15px",
                  border: "none",
                  boxShadow: "none",
                  padding: 0,
                  background: "transparent",
                  color: "var(--text-primary,#424965)",
                  outline: "none",
                }}
              />
            </div>
            {isOAuthOnboarding ? (
              <>
                {/* Country-aware digit-count validation — not OTP ownership */}
                {phoneNotValid && (
                  <p className="text-[12px] font-medium text-[var(--color-error,#E84545)] pl-1" aria-live="polite">
                    Phone number length is not valid for the selected country
                  </p>
                )}
                {!phoneNotValid && duplicateDetected && (
                  <p className="text-[12px] font-medium text-[var(--color-error,#E84545)] pl-1" aria-live="polite">
                    This phone number is already used by another account
                  </p>
                )}
              </>
            ) : (
              errors.phone && (
                <p className="text-[12px] font-medium text-[var(--color-error,#E84545)] pl-1" aria-live="polite">
                  Your phone number is invalid
                </p>
              )
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

          {/* Legal consent copy */}
          <div className="space-y-3">
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

            {emailOptIn && (
              <p className="text-[12px] text-[rgba(74,73,101,0.55)] pl-6">
                We'll send you a separate email to confirm your subscription.
              </p>
            )}
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
                  const { error } = await supabase.auth.signInWithPassword({
                    email: signinEmail,
                    password: signinPassword,
                  });
                  if (error) throw error;

                  if (signinRemember) {
                    localStorage.setItem("auth_login_identifier", signinEmail);
                    disableSessionOnly();
                  } else {
                    localStorage.removeItem("auth_login_identifier");
                    enableSessionOnly();
                  }

                  toast.success("Signed in successfully");
                  setShowSignInModal(false);
                  goTo("/");
                } catch (err: unknown) {
                  setSigninError("Couldn’t sign you in.");
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
