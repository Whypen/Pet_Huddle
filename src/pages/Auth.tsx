import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
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
import huddleLogoImage from "@/assets/huddle-logo-transparent.png";
import appleIcon from "@/assets/Apple icon.png";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { useSignup } from "@/contexts/SignupContext";
import { LegalModal } from "@/components/modals/LegalModal";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { challengeAndVerifyTotp, getAuthenticatorAssurance, mapMfaError } from "@/lib/mfa";
import { SIGNUP_STORAGE_KEY, buildScopedStorageKey, normalizeStorageOwner } from "@/lib/signupOnboarding";
import { useTurnstile } from "@/hooks/useTurnstile";
import { TurnstileDebugPanel, TurnstileWidget } from "@/components/security/TurnstileWidget";
import { enablePersistentSession, enableSessionOnlyAuth } from "@/lib/authSessionPersistence";
import { mapAuthFailureMessage, shouldResetTurnstileForAuthError } from "@/lib/authErrorMessages";

const emailSchema = z.string().email("Invalid email format");
const passwordSchema = z.string().min(8, "Minimum 8 characters");

type LoginForm = {
  email?: string;
  password: string;
  remember: boolean;
};

// ── Step machine: email modal ──────────────────────────────────────────────────
// "choice"        → Sign in / Create account picker
// "signin"        → Email + password
// "mfa-challenge" → Authenticator app TOTP challenge
type EmailModalStep = "choice" | "signin" | "mfa-challenge";

const Auth = () => {
  const { t } = useLanguage();
  const { signIn } = useAuth();
  const { setFlowState } = useSignup();
  const navigate = useNavigate();
  const location = useLocation();
  const blockedMessageFromState = String(
    ((location.state as { blocked_message?: string } | null)?.blocked_message || ""),
  ).trim();
  const showTurnstileDiag = useMemo(
    () => new URLSearchParams(location.search).get("turnstile_diag") === "1",
    [location.search],
  );
  const [authError, setAuthError] = useState("");
  const [authDebugReason, setAuthDebugReason] = useState("");
  const [authDebugCodes, setAuthDebugCodes] = useState<string[]>([]);
  const [legalModal, setLegalModal] = useState<"terms" | "privacy" | null>(null);
  const [emailModalOpen, setEmailModalOpen] = useState(showTurnstileDiag);
  const [emailModalStep, setEmailModalStep] = useState<EmailModalStep>(showTurnstileDiag ? "signin" : "choice");

  // ── MFA challenge state ────────────────────────────────────────────────────
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [mfaOtpCode, setMfaOtpCode] = useState("");
  const [mfaError, setMfaError] = useState("");
  const [mfaLoading, setMfaLoading] = useState(false);
  const [signInLoading, setSignInLoading] = useState(false);
  const signInPendingRef = useRef(false);
  const [videoStarted, setVideoStarted] = useState(false);
  const [useStaticLogo, setUseStaticLogo] = useState(false);
  const logoVideoRef = useRef<HTMLVideoElement | null>(null);
  const loginTurnstile = useTurnstile("login");
  const readLoginTurnstileToken = () => {
    const maybeGetToken = (loginTurnstile as { getToken?: unknown }).getToken;
    if (typeof maybeGetToken === "function") {
      return String((maybeGetToken as () => string)() || "").trim();
    }
    return String((loginTurnstile as { token?: string | null }).token || "").trim();
  };

  useEffect(() => {
    if (showTurnstileDiag) {
      setEmailModalOpen(true);
      setEmailModalStep("signin");
    }
  }, [showTurnstileDiag]);

  useEffect(() => {
    if (loginTurnstile.isTokenUsable || loginTurnstile.error) {
      setAuthError((current) => (
        current === "Complete human verification first." ? "" : current
      ));
    }
  }, [loginTurnstile.error, loginTurnstile.isTokenUsable]);

  useEffect(() => {
    if (!blockedMessageFromState) return;
    setAuthError(blockedMessageFromState);
    toast.error(blockedMessageFromState);
  }, [blockedMessageFromState]);

  useEffect(() => {
    const videoEl = logoVideoRef.current;
    if (!videoEl) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (!cancelled && !videoStarted) {
        setUseStaticLogo(true);
      }
    }, 1500);

    const tryPlay = async () => {
      try {
        await videoEl.play();
      } catch {
        if (!cancelled) setUseStaticLogo(true);
      }
    };
    void tryPlay();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [videoStarted]);

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

  const onSubmit = async (values: LoginForm) => {
    setAuthError("");
    setAuthDebugReason("");
    setAuthDebugCodes([]);
    if (!values.email) return;
    if (signInPendingRef.current) return;
    const turnstileToken = readLoginTurnstileToken();
    if (!turnstileToken) {
      loginTurnstile.reset();
      if (loginTurnstile.error) {
        setAuthError(mapAuthFailureMessage(loginTurnstile.error));
      } else {
        setAuthError("There's something wrong with your verification. Please try again later.");
      }
      return;
    }
    signInPendingRef.current = true;
    setSignInLoading(true);
    loginTurnstile.consumeToken();
    try {
      const result = await signIn(values.email, values.password, undefined, turnstileToken);
      if (result.error) {
        const debugDetails = (result.error as { details?: { turnstile_reason?: string; turnstile_error_codes?: unknown } }).details;
        const debugReason = typeof debugDetails?.turnstile_reason === "string"
          ? String(debugDetails?.turnstile_reason || "")
          : "";
        const debugCodes = Array.isArray(debugDetails?.turnstile_error_codes)
          ? debugDetails.turnstile_error_codes.map((value) => String(value || "").trim()).filter(Boolean)
          : [];
        if (shouldResetTurnstileForAuthError(result.error.message)) {
          loginTurnstile.reset();
        }
        if (showTurnstileDiag && (debugReason || debugCodes.length)) {
          setAuthDebugReason(debugReason);
          setAuthDebugCodes(debugCodes);
          console.debug("[auth.turnstile]", { reason: debugReason, errorCodes: debugCodes, details: debugDetails ?? null });
        }
        setAuthError(mapAuthFailureMessage(result.error.message));
        return;
      }
      loginTurnstile.reset();

      if (values.remember) {
        localStorage.setItem("auth_login_identifier", values.email);
        enablePersistentSession();
      } else {
        localStorage.removeItem("auth_login_identifier");
        enableSessionOnlyAuth();
      }

      if (result.mfaRequired && result.mfaFactorId) {
        setMfaFactorId(result.mfaFactorId);
        setMfaOtpCode("");
        setMfaError("");
        setEmailModalStep("mfa-challenge");
        return;
      }

      const { data: currentUserData } = await supabase.auth.getUser();
      const currentUserId = String(currentUserData.user?.id || "").trim();
      if (currentUserId) {
        const { data: profileRow, error: profileLookupError } = await supabase
          .from("profiles")
          .select("id")
          .eq("id", currentUserId)
          .maybeSingle();
        if (profileLookupError || !profileRow) {
          await supabase.auth.signOut({ scope: "local" });
          setAuthError("This account is unavailable. Please sign up again.");
          return;
        }
      }

      navigate("/");
    } finally {
      signInPendingRef.current = false;
      setSignInLoading(false);
    }
  };

  // ── MFA: verify 6-digit code ───────────────────────────────────────────────
  const onMfaVerify = async () => {
    if (!mfaFactorId) return;
    if (mfaOtpCode.length < 6) return;
    setMfaLoading(true);
    setMfaError("");
    try {
      await challengeAndVerifyTotp(supabase, mfaFactorId, mfaOtpCode);
      const aalData = await getAuthenticatorAssurance(supabase);
      if (aalData.currentLevel !== "aal2") throw new Error("aal_not_upgraded");
      setEmailModalOpen(false);
      navigate("/");
    } catch (error) {
      setMfaError(mapMfaError(error as { message?: string }, "Couldn’t verify your 2FA code."));
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
    setFlowState("signup");
    navigate("/signup/dob");
  };

  const openEmailChoice = () => {
    setAuthError("");
    setAuthDebugReason("");
    setEmailModalStep("choice");
    setEmailModalOpen(true);
  };

  const openSignInModal = () => {
    setAuthError("");
    setAuthDebugReason("");
    setEmailModalStep("signin");
    loginTurnstile.reset();
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
            {useStaticLogo ? (
              <img
                src={huddleLogoImage}
                alt={t("app.name")}
                className="block h-[84px] w-[160px] object-contain"
                loading="eager"
                decoding="async"
              />
            ) : (
              <video
                ref={logoVideoRef}
                autoPlay
                muted
                playsInline
                loop
                preload="auto"
                disablePictureInPicture
                controlsList="nodownload nofullscreen noremoteplayback"
                className="block h-[160px] w-[160px] object-contain -mt-[41px]"
                aria-label={t("app.name")}
                onPlaying={() => setVideoStarted(true)}
                onError={() => setUseStaticLogo(true)}
              >
                <source src={huddleVideo} type="video/mp4" />
              </video>
            )}
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
            setAuthDebugReason("");
            setEmailModalStep("choice");
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

          {/* ── Sign-in step: email + password ── */}
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
              <TurnstileDebugPanel visible={showTurnstileDiag} diag={loginTurnstile.diag} />
              {showTurnstileDiag && (authDebugReason || authDebugCodes.length) ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  <div>turnstile reason: {authDebugReason || "none"}</div>
                  <div>turnstile codes: {authDebugCodes.length ? authDebugCodes.join(", ") : "none"}</div>
                </div>
              ) : null}
              <NeuButton type="submit" className="w-full h-10" disabled={!isValid || mfaLoading || signInLoading}>
                Sign in
              </NeuButton>
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
              <p className="text-sm text-brandText/70 leading-relaxed">
                Enter the 6-digit code from your authenticator app.
              </p>
              <FormFieldOtp
                value={mfaOtpCode}
                onChange={setMfaOtpCode}
                error={mfaError}
                disabled={mfaLoading}
              />

              <NeuButton
                type="button"
                className="w-full h-10"
                disabled={mfaOtpCode.length < 6 || mfaLoading}
                loading={mfaLoading}
                onClick={() => void onMfaVerify()}
              >
                Verify
              </NeuButton>

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
