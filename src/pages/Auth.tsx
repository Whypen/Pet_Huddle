import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Mail, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { NeuButton } from "@/components/ui/NeuButton";
import { FormField, NeuCheckbox } from "@/components/ui";
import { FormFieldOtp } from "@/components/ui/FormFieldOtp";
import { toast } from "sonner";
import huddleVideo from "@/assets/huddle video.mp4";
import appleIcon from "@/assets/Apple icon.png";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { LegalModal } from "@/components/modals/LegalModal";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { challengeAndVerifyTotp, getAuthenticatorAssurance, mapMfaError } from "@/lib/mfa";
import { addPasskeyHint, hasPasskeyHint, mapPasskeyError, verifyPasskeyFactor } from "@/lib/passkey";
import { SIGNUP_STORAGE_KEY, buildScopedStorageKey, normalizeStorageOwner } from "@/lib/signupOnboarding";
import { useTurnstile } from "@/hooks/useTurnstile";
import { TurnstileWidget } from "@/components/security/TurnstileWidget";

const emailSchema = z.string().email("Invalid email format");
const passwordSchema = z.string().min(8, "Minimum 8 characters");

type LoginForm = {
  email?: string;
  password: string;
  remember: boolean;
};

// ── Step machine: email modal ──────────────────────────────────────────────────
// "choice"        → Sign in / Create account picker
// "signin"        → Email + password + optional "Continue with passkey" CTA
// "mfa-challenge" → TOTP only (passkey fires invisibly — modal is closed)
type EmailModalStep = "choice" | "signin" | "mfa-challenge";

const Auth = () => {
  const { t } = useLanguage();
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [authError, setAuthError] = useState("");
  const [legalModal, setLegalModal] = useState<"terms" | "privacy" | null>(null);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailModalStep, setEmailModalStep] = useState<EmailModalStep>("choice");
  const sessionOnlyHandlerRef = useRef<(() => void) | null>(null);

  // ── MFA challenge state ────────────────────────────────────────────────────
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [mfaMethod, setMfaMethod] = useState<"totp" | "passkey">("totp");
  const [mfaOtpCode, setMfaOtpCode] = useState("");
  const [mfaError, setMfaError] = useState("");
  const [mfaLoading, setMfaLoading] = useState(false);

  // ── Credentials step state ─────────────────────────────────────────────────
  const [passkeyInlineError, setPasskeyInlineError] = useState("");
  const loginTurnstile = useTurnstile("login");

  // Auto-fire passkey challenge — no button needed
  useEffect(() => {
    if (emailModalStep === "mfa-challenge" && mfaMethod === "passkey") {
      void onMfaVerify();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emailModalStep, mfaMethod]);

  const schema = useMemo(() => {
    return z.object({
      email: emailSchema,
      password: passwordSchema,
      remember: z.boolean().optional(),
    });
  }, []);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isValid },
  } = useForm<LoginForm>({
    resolver: zodResolver(schema),
    mode: "onChange",
    defaultValues: { remember: true },
  });

  const clearAuthTokens = () => {
    Object.keys(localStorage).forEach((key) => {
      if (key.includes("auth-token") && key.startsWith("sb-")) {
        localStorage.removeItem(key);
      }
      if (key.includes("supabase.auth.token")) {
        localStorage.removeItem(key);
      }
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

  const onSubmit = async (values: LoginForm) => {
    setAuthError("");
    if (!values.email) return;
    if (!loginTurnstile.token) {
      setAuthError("Complete human verification first.");
      return;
    }
    const result = await signIn(values.email, values.password, undefined, loginTurnstile.token);
    loginTurnstile.reset();
    if (result.error) {
      setAuthError(result.error.message || "Couldn't sign you in.");
      return;
    }

    if (values.remember) {
      localStorage.setItem("auth_login_identifier", values.email);
      disableSessionOnly();
    } else {
      localStorage.removeItem("auth_login_identifier");
      enableSessionOnly();
    }

    if (result.mfaRequired && result.mfaFactorId) {
      const isPasskey = result.mfaMethod === "passkey";
      setMfaFactorId(result.mfaFactorId);
      setMfaMethod(isPasskey ? "passkey" : "totp");
      setMfaOtpCode("");
      setMfaError("");
      if (isPasskey) {
        // Close modal first — OS biometric sheet takes over immediately
        setEmailModalOpen(false);
      }
      setEmailModalStep("mfa-challenge");
      return;
    }

    navigate("/");
  };

  // ── MFA: verify 6-digit code ───────────────────────────────────────────────
  const onMfaVerify = async () => {
    if (!mfaFactorId) return;
    if (mfaMethod === "totp" && mfaOtpCode.length < 6) return;
    setMfaLoading(true);
    setMfaError("");
    try {
      if (mfaMethod === "passkey") {
        await verifyPasskeyFactor(supabase, mfaFactorId);
      } else {
        await challengeAndVerifyTotp(supabase, mfaFactorId, mfaOtpCode);
      }
      const aalData = await getAuthenticatorAssurance(supabase);
      if (aalData.currentLevel !== "aal2") throw new Error("aal_not_upgraded");
      if (mfaMethod === "passkey") addPasskeyHint(watch("email") ?? "");
      setEmailModalOpen(false);
      navigate("/");
    } catch (error) {
      if (mfaMethod === "passkey") {
        const msg = mapPasskeyError(error as { message?: string }, "Couldn’t verify your passkey.");
        toast.error(msg);
        setEmailModalStep("signin");
        setEmailModalOpen(true);
      } else {
        setMfaError(mapMfaError(error as { message?: string }, "Couldn’t verify your 2FA code."));
      }
      setMfaOtpCode("");
    } finally {
      setMfaLoading(false);
    }
  };

  // ── MFA: back to sign-in form ──────────────────────────────────────────────
  const backToSignIn = () => {
    setEmailModalStep("signin");
    setMfaOtpCode("");
    setMfaError("");
    setMfaFactorId(null);
    setMfaMethod("totp");
  };

  // ── Sign-in step: passkey CTA handler ─────────────────────────────────────
  const handlePasskeyContinue = () => {
    const pwValue = watch("password");
    if (!pwValue) {
      setPasskeyInlineError("Enter your password once to continue with passkey.");
      const el = document.querySelector<HTMLInputElement>('[autocomplete="current-password"]');
      if (el) {
        el.focus();
        try { el.reportValidity(); } catch { /* best-effort */ }
      }
      return;
    }
    setPasskeyInlineError("");
    void handleSubmit(onSubmit)();
  };

  const handleCreateAccount = () => {
    const prefillEmail = watch("email") || "";
    if (prefillEmail) {
      const owner = normalizeStorageOwner(prefillEmail);
      const scopedSignupKey = buildScopedStorageKey(SIGNUP_STORAGE_KEY, owner);
      try {
        const existing = localStorage.getItem(scopedSignupKey);
        const parsed = existing ? JSON.parse(existing) : {};
        localStorage.setItem(scopedSignupKey, JSON.stringify({ ...parsed, email: prefillEmail }));
        localStorage.removeItem(SIGNUP_STORAGE_KEY);
      } catch {
        localStorage.setItem(scopedSignupKey, JSON.stringify({ email: prefillEmail }));
        localStorage.removeItem(SIGNUP_STORAGE_KEY);
      }
    }
    setEmailModalOpen(false);
    setEmailModalStep("choice");
    reset({ email: "", password: "", remember: true });
    navigate("/signup/dob");
  };

  const openEmailChoice = () => {
    setAuthError("");
    setEmailModalStep("choice");
    setEmailModalOpen(true);
  };

  const openSignInModal = () => {
    setAuthError("");
    setEmailModalStep("signin");
  };

  const handleOAuthLogin = async (provider: "apple" | "google") => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      toast.error("Couldn't start sign in.");
    }
  };

  // ── Dialog title / description keyed to current step ──────────────────────
  const dialogTitle =
    emailModalStep === "choice" ? "Continue with Email"
    : emailModalStep === "mfa-challenge" ? "Two-step verification"
    : "Sign in";

  const dialogDescription =
    emailModalStep === "choice" ? "Choose how you want to continue with email."
    : emailModalStep === "mfa-challenge" ? "Enter your verification code to complete sign in."
    : "Enter your email and password to sign in.";

  return (
    <div className="min-h-svh flex flex-col justify-center items-center px-6 pb-[calc(88px+env(safe-area-inset-bottom))]">
      <div className="w-full flex flex-col items-center">
        <div className="flex flex-col items-center">
          {/* video has ~41px blank at top + ~42px blank at bottom; shift up 41px and clip to logo content */}
          <div className="overflow-hidden relative -top-2" style={{ height: "84px", width: "160px" }}>
            <video
              autoPlay
              muted
              playsInline
              loop
              className="block h-[160px] w-[160px] object-contain -mt-[41px]"
              aria-label={t("app.name")}
            >
              <source src={huddleVideo} type="video/mp4" />
            </video>
          </div>
          <p className="mt-1 text-center text-lg font-bold leading-none" style={{ color: "#1e4ad4" }}>
            huddle
          </p>
        </div>

        <div className="mt-8 w-full max-w-sm rounded-[24px] border border-white/55 bg-white/28 backdrop-blur-xl shadow-[0_12px_26px_rgba(66,73,101,0.14)] p-4">
          <NeuButton
            type="button"
            variant="secondary"
            className="w-full h-11 rounded-[14px] justify-center border-brandText/25 bg-white/85 hover:bg-white active:border-2 active:border-brandBlue focus-visible:border-2 focus-visible:border-brandBlue focus-visible:ring-1 focus-visible:ring-brandBlue"
            onClick={openEmailChoice}
          >
            <span className="inline-flex w-[230px] translate-x-4 items-center justify-start gap-3">
              <span className="inline-flex h-5 w-5 items-center justify-center shrink-0">
                <Mail className="h-4 w-4 text-brandText" />
              </span>
              <span className="text-sm font-medium text-brandText">Continue with Email</span>
            </span>
          </NeuButton>

          <div className="my-3 flex items-center gap-3">
            <div className="h-px flex-1 bg-brandText/20" />
            <span className="text-xs font-medium text-brandText/60">or</span>
            <div className="h-px flex-1 bg-brandText/20" />
          </div>

          <NeuButton
            type="button"
            variant="secondary"
            className="w-full h-11 rounded-[14px] justify-center border-brandText/25 bg-white/85 hover:bg-white active:border-2 active:border-brandBlue focus-visible:border-2 focus-visible:border-brandBlue focus-visible:ring-1 focus-visible:ring-brandBlue"
            onClick={() => void handleOAuthLogin("apple")}
          >
              <span className="inline-flex w-[230px] translate-x-4 items-center justify-start gap-3">
              <span className="inline-flex h-5 w-5 items-center justify-center shrink-0">
                <img src={appleIcon} alt="" aria-hidden="true" className="block h-4 w-4 object-contain" draggable={false} />
              </span>
              <span className="text-sm font-medium text-brandText">Continue with Apple</span>
            </span>
          </NeuButton>
          <NeuButton
            type="button"
            variant="secondary"
            className="mt-3 w-full h-11 rounded-[14px] justify-center border-brandText/25 bg-white/85 hover:bg-white active:border-2 active:border-brandBlue focus-visible:border-2 focus-visible:border-brandBlue focus-visible:ring-1 focus-visible:ring-brandBlue"
            onClick={() => void handleOAuthLogin("google")}
          >
            <span className="inline-flex w-[230px] translate-x-4 items-center justify-start gap-3">
              <span className="inline-flex h-5 w-5 items-center justify-center shrink-0">
                <svg viewBox="0 0 24 24" aria-hidden className="block h-4.5 w-4.5">
                  <path fill="#EA4335" d="M12 10.2v3.6h5.1c-.2 1.1-1.3 3.3-5.1 3.3-3.1 0-5.6-2.6-5.6-5.7s2.5-5.7 5.6-5.7c1.8 0 3 .8 3.7 1.5l2.5-2.4C16.6 3.2 14.5 2.3 12 2.3 6.9 2.3 2.8 6.4 2.8 11.6S6.9 20.9 12 20.9c6.9 0 8.6-4.9 8.6-7.4 0-.5-.1-1-.2-1.3H12z" />
                  <path fill="#34A853" d="M3.6 7.2l2.9 2.1C7.2 7.7 9.3 6 12 6c1.8 0 3 .8 3.7 1.5l2.5-2.4C16.6 3.2 14.5 2.3 12 2.3 8.5 2.3 5.4 4.3 3.6 7.2z" />
                  <path fill="#4A90E2" d="M12 20.9c2.5 0 4.6-.8 6.1-2.1l-2.8-2.2c-.8.6-1.9 1-3.3 1-2.7 0-4.9-1.8-5.7-4.2l-2.9 2.2C5.2 18.9 8.3 20.9 12 20.9z" />
                  <path fill="#FBBC05" d="M6.3 13.4c-.2-.6-.3-1.1-.3-1.8s.1-1.2.3-1.8L3.4 7.6C2.9 8.7 2.6 10.1 2.6 11.6s.3 2.9.8 4.1l2.9-2.3z" />
                </svg>
              </span>
              <span className="text-sm font-medium text-brandText">Continue with Google</span>
            </span>
          </NeuButton>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-[#D5DFEF] pt-4 pb-[calc(16px+env(safe-area-inset-bottom))] text-center text-[10px] text-brandSubtext">
        By continuing, you agree to huddle&apos;s{" "}
        <button type="button" className="text-brandBlue underline" onClick={() => setLegalModal("terms")}>
          Terms
        </button>{" "}
        and{" "}
        <button type="button" className="text-brandBlue underline" onClick={() => setLegalModal("privacy")}>
          Privacy Policy
        </button>
        .
      </div>

      <LegalModal isOpen={legalModal === "terms"} onClose={() => setLegalModal(null)} type="terms" />
      <LegalModal isOpen={legalModal === "privacy"} onClose={() => setLegalModal(null)} type="privacy" />

      <Dialog
        open={emailModalOpen}
        onOpenChange={(open) => {
          setEmailModalOpen(open);
          if (!open) {
            setMfaError("");
            setMfaOtpCode("");
            setMfaFactorId(null);
            setMfaMethod("totp");
            setEmailModalStep("choice");
            setPasskeyInlineError("");
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogTitle className="text-brandText text-base font-semibold">
            {dialogTitle}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {dialogDescription}
          </DialogDescription>

          {/* ── Choice step ── */}
          {emailModalStep === "choice" && (
            <div className="space-y-3">
              <NeuButton type="button" className="w-full h-10" onClick={openSignInModal}>
                Sign in
              </NeuButton>
              <NeuButton type="button" variant="secondary" className="w-full h-10" onClick={handleCreateAccount}>
                Create account
              </NeuButton>
            </div>
          )}

          {/* ── Sign-in step: email + password + optional passkey CTA ── */}
          {emailModalStep === "signin" && (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
              <FormField
                type="email"
                label="Email"
                leadingIcon={<Mail size={16} strokeWidth={1.75} />}
                autoComplete="email"
                placeholder="name@email.com"
                error={errors.email?.message}
                autoFocus
                {...register("email")}
              />
              <FormField
                type="password"
                label="Password"
                leadingIcon={<Lock size={16} strokeWidth={1.75} />}
                placeholder="••••••••"
                autoComplete="current-password"
                error={errors.password?.message || authError || undefined}
                {...register("password")}
              />

              {passkeyInlineError && !errors.password?.message && !authError && (
                <p className="text-xs text-[var(--color-error,#E84545)] -mt-1 pl-1">
                  {passkeyInlineError}
                </p>
              )}

              <div className="flex items-center justify-between">
                <NeuCheckbox
                  checked={watch("remember")}
                  onCheckedChange={(v) => setValue("remember", Boolean(v))}
                  label="Stay logged in"
                />
                <Link to="/reset-password" className="text-xs text-brandBlue">Forgot password?</Link>
              </div>

              <TurnstileWidget
                siteKeyMissing={loginTurnstile.siteKeyMissing}
                setContainer={loginTurnstile.setContainer}
                className="min-h-[65px]"
              />

              {hasPasskeyHint(watch("email") ?? "") ? (
                <NeuButton
                  type="button"
                  className="w-full h-10"
                  onClick={handlePasskeyContinue}
                  loading={mfaLoading}
                  disabled={mfaLoading}
                >
                  Continue with passkey
                </NeuButton>
              ) : (
                <NeuButton type="submit" className="w-full h-10" disabled={!isValid || mfaLoading}>
                  Sign in
                </NeuButton>
              )}
              {authError ? (
                <NeuButton
                  type="button"
                  variant="secondary"
                  className="w-full h-10"
                  onClick={handleCreateAccount}
                >
                  New here? Create an account
                </NeuButton>
              ) : (
                <NeuButton
                  type="button"
                  variant="secondary"
                  className="w-full h-10"
                  onClick={handleCreateAccount}
                >
                  Create account
                </NeuButton>
              )}
            </form>
          )}

          {/* ── MFA challenge step ── */}
          {emailModalStep === "mfa-challenge" && (
            <div className="space-y-4">
              {mfaMethod === "passkey" ? null : (
                <>
                  <p className="text-sm text-brandText/70 leading-relaxed">
                    Enter the 6-digit code from your authenticator app.
                  </p>
                  <FormFieldOtp
                    value={mfaOtpCode}
                    onChange={setMfaOtpCode}
                    error={mfaError}
                    disabled={mfaLoading}
                  />
                </>
              )}

              {mfaMethod === "totp" && (
                <NeuButton
                  type="button"
                  className="w-full h-10"
                  disabled={mfaOtpCode.length < 6 || mfaLoading}
                  loading={mfaLoading}
                  onClick={() => void onMfaVerify()}
                >
                  Verify
                </NeuButton>
              )}

              <button
                type="button"
                className="w-full text-center text-xs text-brandText/50 hover:text-brandText/70 transition-colors py-1"
                onClick={backToSignIn}
              >
                ← Back to sign in
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Auth;
