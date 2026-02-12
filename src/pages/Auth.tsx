import { useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Mail, Lock, Apple, Facebook, AtSign } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import huddleLogo from "@/assets/huddle-logo-transparent.png";
import { useLanguage } from "@/contexts/LanguageContext";
import { LegalModal } from "@/components/modals/LegalModal";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

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
  const [showPassword, setShowPassword] = useState(false);
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
      const msg = error.message || "Email or password incorrect";
      setAuthError(msg.includes("Invalid login credentials") ? "Email or password incorrect" : msg);
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

  return (
    <div className="min-h-screen bg-white flex flex-col px-6">
      <div className="flex-1 flex flex-col justify-center">
        <div className="text-center">
          <img src={huddleLogo} alt={t("app.name")} className="mx-auto h-28 w-28 object-contain" />
          <div
            className="mt-3 text-2xl font-semibold text-brandBlue"
            style={{ fontFamily: "\"Arial Rounded MT Bold\",\"Arial Rounded MT\",\"Arial\",sans-serif" }}
          >
            huddle
          </div>
        </div>

        <div className="mt-10 w-full max-w-md mx-auto space-y-3">
          <Button
            type="button"
            variant="outline"
            className="w-[80%] mx-auto h-11 justify-start gap-3 border-brandText/40 bg-white hover:bg-white active:border-2 active:border-brandBlue focus-visible:border-2 focus-visible:border-brandBlue focus-visible:ring-1 focus-visible:ring-brandBlue"
            onClick={openEmailChoice}
          >
            <AtSign className="h-5 w-5 text-brandText" />
            <span className="text-sm font-medium text-brandText">Continue with Email</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-[80%] mx-auto h-11 justify-start gap-3 border-brandText/40 bg-white hover:bg-white active:border-2 active:border-brandBlue focus-visible:border-2 focus-visible:border-brandBlue focus-visible:ring-1 focus-visible:ring-brandBlue"
            onClick={() => toast.error("Coming soon")}
          >
            <Apple className="h-5 w-5 text-brandText" />
            <span className="text-sm font-medium text-brandText">Continue with Apple</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-[80%] mx-auto h-11 justify-start gap-3 border-brandText/40 bg-white hover:bg-white active:border-2 active:border-brandBlue focus-visible:border-2 focus-visible:border-brandBlue focus-visible:ring-1 focus-visible:ring-brandBlue"
            onClick={() => toast.error("Coming soon")}
          >
            <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5">
              <path fill="#EA4335" d="M12 10.2v3.6h5.1c-.2 1.1-1.3 3.3-5.1 3.3-3.1 0-5.6-2.6-5.6-5.7s2.5-5.7 5.6-5.7c1.8 0 3 .8 3.7 1.5l2.5-2.4C16.6 3.2 14.5 2.3 12 2.3 6.9 2.3 2.8 6.4 2.8 11.6S6.9 20.9 12 20.9c6.9 0 8.6-4.9 8.6-7.4 0-.5-.1-1-.2-1.3H12z" />
              <path fill="#34A853" d="M3.6 7.2l2.9 2.1C7.2 7.7 9.3 6 12 6c1.8 0 3 .8 3.7 1.5l2.5-2.4C16.6 3.2 14.5 2.3 12 2.3 8.5 2.3 5.4 4.3 3.6 7.2z" />
              <path fill="#4A90E2" d="M12 20.9c2.5 0 4.6-.8 6.1-2.1l-2.8-2.2c-.8.6-1.9 1-3.3 1-2.7 0-4.9-1.8-5.7-4.2l-2.9 2.2C5.2 18.9 8.3 20.9 12 20.9z" />
              <path fill="#FBBC05" d="M6.3 13.4c-.2-.6-.3-1.1-.3-1.8s.1-1.2.3-1.8L3.4 7.6C2.9 8.7 2.6 10.1 2.6 11.6s.3 2.9.8 4.1l2.9-2.3z" />
            </svg>
            <span className="text-sm font-medium text-brandText">Continue with Google</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-[80%] mx-auto h-11 justify-start gap-3 border-brandText/40 bg-white hover:bg-white active:border-2 active:border-brandBlue focus-visible:border-2 focus-visible:border-brandBlue focus-visible:ring-1 focus-visible:ring-brandBlue"
            onClick={() => toast.error("Coming soon")}
          >
            <Facebook className="h-5 w-5 text-brandText" />
            <span className="text-sm font-medium text-brandText">Continue with Facebook</span>
          </Button>
        </div>
      </div>

      <div className="sticky bottom-0 bg-white py-4 text-center text-[10px] text-brandSubtext">
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
          {emailModalStep === "choice" ? (
            <div className="space-y-3">
              <Button type="button" className="w-full h-10" onClick={openSignInModal}>
                Sign in
              </Button>
              <Button type="button" variant="outline" className="w-full h-10" onClick={handleCreateAccount}>
                Create account
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
              <div>
                <label className="text-xs text-muted-foreground">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="email"
                    autoComplete="email"
                    className={`h-9 pl-9 ${errors.email ? "border-red-500" : ""}`}
                    placeholder="name@email.com"
                    {...register("email")}
                    autoFocus
                  />
                </div>
                {errors.email && <p className="text-xs text-red-500 mt-1" aria-live="polite">{errors.email.message}</p>}
              </div>

              <div>
                <label className="text-xs text-muted-foreground">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type={showPassword ? "text" : "password"}
                    className={`h-9 pl-9 pr-10 ${errors.password || authError ? "border-red-500" : ""}`}
                    placeholder="********"
                    {...register("password")}
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label="Toggle password"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {(errors.password || authError) && (
                  <p className="text-xs text-red-500 mt-1" aria-live="polite">
                    {errors.password?.message || authError}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Checkbox checked={watch("remember")} onCheckedChange={(v) => setValue("remember", Boolean(v))} />
                  Stay logged in
                </label>
                <Link to="/reset-password" className="text-xs text-brandBlue">Forgot password?</Link>
              </div>

              <Button type="submit" className="w-full h-10" disabled={!isValid}>
                Sign in
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full h-10"
                onClick={handleCreateAccount}
              >
                Create account
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Auth;
