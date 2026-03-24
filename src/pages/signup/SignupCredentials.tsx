/**
 * SignupCredentials — C.5  Step 2 of 4
 * Email + phone OTP + password + terms. Uses SignupShell for layout.
 * All business logic (OTP, duplicate detection, password strength, dialog) preserved.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Lock, Mail, Phone } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import PhoneInput from "react-phone-number-input";
import "react-phone-number-input/style.css";
import { credentialsSchema } from "@/lib/authSchemas";
import { useSignup } from "@/contexts/SignupContext";
import { humanizeError } from "@/lib/humanizeError";
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
  const { data, update, setFlowState } = useSignup();
  const [isExiting, setIsExiting] = useState(false);

  const goTo = (to: string) => {
    setIsExiting(true);
    setTimeout(() => navigate(to), 180);
  };

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
    resolver: zodResolver(credentialsSchema),
    mode: "onChange",
    defaultValues: {
      email: data.email,
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
  const phoneInvalid = Boolean(errors.phone);

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

  useEffect(() => {
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
  }, [email, phone, showSignInModal, duplicateRetryToken, dismissedDuplicateKey]);

  useEffect(() => { if (showSignInModal) setSigninRemember(true); }, [showSignInModal]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const onSubmit = async () => {
    if (duplicateDetected || (!shouldBypassDuplicateCheck && duplicateCheckError)) return;
    if (shouldBypassDuplicateCheck) {
      setFlowState("signup");
      goTo("/signup/name");
      return;
    }
    setSubmitting(true);
    try {
      const { data: checkResult, error: checkError } = await supabase.rpc("check_identifier_registered", {
        p_email: email,
        p_phone: phone,
      });
      if (checkError) {
        console.error("Duplicate check error:", checkError);
        setDuplicateCheckError("Could not verify account details right now. Please retry.");
        return;
      }
      if (checkResult?.registered) {
        setSigninEmail(email);
        setShowSignInModal(true);
        return;
      }
      // Create the auth account here (step 2) so a live session exists before
      // reaching /verify-identity. display_name is not yet collected; it will
      // be set when the user saves their profile on /set-profile.
      setFlowState("signup");
      const { error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { phone: phone.trim(), dob: data.dob } },
      });
      if (signUpError && !signUpError.message.toLowerCase().includes("already registered")) {
        setFlowState("idle");
        toast.error(humanizeError(signUpError) || "Account creation failed. Please try again.");
        return;
      }
      goTo("/signup/name");
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

  // ── Hint text helper ────────────────────────────────────────────────────────

  const ctaDisabled =
    !isValid ||
    duplicateDetected ||
    checkingDuplicate ||
    submitting ||
    (!shouldBypassDuplicateCheck && Boolean(duplicateCheckError));
  const hintText = duplicateDetected
    ? "This email or phone number is already registered"
    : checkingDuplicate
      ? "Checking account details…"
      : phoneInvalid
        ? "Enter a valid phone number"
        : "Complete all required fields to continue";

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
          {/* Email */}
          <FormField
            type="email"
            label="Email"
            leadingIcon={<Mail size={16} strokeWidth={1.75} />}
            autoComplete="email"
            error={errors.email?.message as string | undefined}
            autoFocus
            {...register("email")}
          />

          {/* Phone */}
          <div className="flex flex-col" style={{ gap: "var(--field-gap-lc, 6px)" }}>
            <label className="text-[13px] font-semibold text-[var(--text-primary,#424965)] pl-1">Phone Number</label>
            <div className={`form-field-rest relative flex items-center ${errors.phone ? "form-field-error" : ""}`}>
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
            {errors.phone && (
              <p className="text-[12px] font-medium text-[var(--color-error,#E84545)] pl-1" aria-live="polite">
                Your phone number is invalid
              </p>
            )}
          </div>

          {/* Password */}
          <div>
            <FormField
              type="password"
              label="Password"
              leadingIcon={<Lock size={16} strokeWidth={1.75} />}
              error={errors.password?.message as string | undefined}
              {...register("password")}
            />
          </div>

          {/* Confirm Password */}
          <FormField
            type="password"
            label="Confirm Password"
            leadingIcon={<Lock size={16} strokeWidth={1.75} />}
            error={confirmMismatch ? "Passwords do not match" : (errors.confirmPassword?.message as string | undefined)}
            {...register("confirmPassword")}
          />

          {/* Legal consent copy */}
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
            , and to receive community safety alerts, pet care tips, and Huddle updates. You can unsubscribe anytime from any email.
          </p>

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
