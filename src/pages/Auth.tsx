import { useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Mail, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { NeuButton } from "@/components/ui/NeuButton";
import { FormField, NeuCheckbox } from "@/components/ui";
import { toast } from "sonner";
import huddleLogo from "@/assets/huddle-logo-transparent.png";
import appleIcon from "@/assets/Apple icon.png";
import { useLanguage } from "@/contexts/LanguageContext";
import { LegalModal } from "@/components/modals/LegalModal";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

const emailSchema = z.string().email("Invalid email format");
const passwordSchema = z.string().min(8, "Minimum 8 characters");

type LoginForm = {
  email?: string;
  password: string;
  remember: boolean;
};

type EmailModalStep = "choice" | "signin";

const Auth = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [authError, setAuthError] = useState("");
  const [legalModal, setLegalModal] = useState<"terms" | "privacy" | null>(null);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailModalStep, setEmailModalStep] = useState<EmailModalStep>("choice");
  const sessionOnlyHandlerRef = useRef<(() => void) | null>(null);

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
    const { error } = await supabase.auth.signInWithPassword({ email: values.email, password: values.password });
    if (error) {
      setAuthError("Couldn’t sign you in.");
      return;
    }

    if (values.remember) {
      localStorage.setItem("auth_login_identifier", values.email);
      disableSessionOnly();
    } else {
      localStorage.removeItem("auth_login_identifier");
      enableSessionOnly();
    }

    navigate("/");
  };

  const handleCreateAccount = () => {
    const prefillEmail = watch("email") || "";
    if (prefillEmail) {
      try {
        const existing = localStorage.getItem("huddle_signup_v2");
        const parsed = existing ? JSON.parse(existing) : {};
        localStorage.setItem("huddle_signup_v2", JSON.stringify({ ...parsed, email: prefillEmail }));
      } catch {
        localStorage.setItem("huddle_signup_v2", JSON.stringify({ email: prefillEmail }));
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
      toast.error("Couldn’t start sign in.");
    }
  };

  return (
    <div className="min-h-svh flex flex-col justify-center items-center px-6 pb-[calc(88px+env(safe-area-inset-bottom))]">
      <div className="w-full flex flex-col items-center">
        <div className="text-center">
          <img src={huddleLogo} alt={t("app.name")} className="mx-auto h-28 w-28 object-contain" />
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

      <Dialog open={emailModalOpen} onOpenChange={setEmailModalOpen}>
        <DialogContent className="max-w-sm">
          <DialogTitle className="text-brandText text-base font-semibold">
            {emailModalStep === "choice" ? "Continue with Email" : "Sign in"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {emailModalStep === "choice"
              ? "Choose how you want to continue with email."
              : "Sign in with your email and password."}
          </DialogDescription>
          {emailModalStep === "choice" ? (
            <div className="space-y-3">
              <NeuButton type="button" className="w-full h-10" onClick={openSignInModal}>
                Sign in
              </NeuButton>
              <NeuButton type="button" variant="secondary" className="w-full h-10" onClick={handleCreateAccount}>
                Create account
              </NeuButton>
            </div>
          ) : (
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

              <NeuButton type="submit" className="w-full h-10" disabled={!isValid}>
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
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Auth;
