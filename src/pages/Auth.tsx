import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, Lock, User, Eye, EyeOff, Loader2, Phone } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { z } from "zod";
import PhoneInput from 'react-phone-number-input';
import 'react-phone-number-input/style.css';
import huddleLogo from "@/assets/huddle-logo-transparent.png";
import { useLanguage } from "@/contexts/LanguageContext";

const Auth = () => {
  const { t } = useLanguage();
  const emailSchema = z.string().email(t("auth.errors.invalid_email"));
  const phoneSchema = z.string().regex(/^\+?[1-9]\d{7,14}$/, t("auth.errors.invalid_phone"));
  // SPRINT 1: Strict password validation - 8+ chars, 1 upper, 1 number, 1 special
  const passwordSchema = z.string()
    .min(8, t("auth.errors.password_min"))
    .regex(/[A-Z]/, t("auth.errors.password_upper"))
    .regex(/[0-9]/, t("auth.errors.password_number"))
    .regex(/[^A-Za-z0-9]/, t("auth.errors.password_special"));
  const navigate = useNavigate();
  const { signIn, signUp, user, profile } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loginMethod, setLoginMethod] = useState<"email" | "phone">("email");
  const [consentAccepted, setConsentAccepted] = useState(false);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPhone, setLoginPhone] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [signupPhone, setSignupPhone] = useState("");
  const [errors, setErrors] = useState<{
    loginEmail?: string;
    loginPhone?: string;
    signupEmail?: string;
    password?: string;
    displayName?: string;
    phone?: string;
  }>({});

  // Load remembered identifier on mount
  useEffect(() => {
    setRememberMe(localStorage.getItem("rememberMe") === "true");
    const rememberedMethod = localStorage.getItem("rememberedLoginMethod");
    const rememberedIdentifier = localStorage.getItem("rememberedIdentifier");
    if (rememberedMethod === "phone" || rememberedMethod === "email") {
      setLoginMethod(rememberedMethod);
      if (rememberedIdentifier) {
        if (rememberedMethod === "phone") {
          setLoginPhone(rememberedIdentifier);
        } else {
          setLoginEmail(rememberedIdentifier);
        }
      }
    }
  }, []);

  // Redirect if already authenticated
  if (user) {
    if (profile?.onboarding_completed) {
      navigate("/", { replace: true });
    } else {
      navigate("/onboarding", { replace: true });
    }
    return null;
  }

  const validateForm = () => {
    const newErrors: {
      loginEmail?: string;
      loginPhone?: string;
      signupEmail?: string;
      password?: string;
      displayName?: string;
      phone?: string;
    } = {};

    if (isLogin && loginMethod === "email") {
      const emailResult = emailSchema.safeParse(loginEmail);
      if (!emailResult.success) {
        newErrors.loginEmail = emailResult.error.errors[0].message;
      }
    }

    if (isLogin && loginMethod === "phone") {
      const phoneResult = phoneSchema.safeParse(loginPhone || "");
      if (!phoneResult.success) {
        newErrors.loginPhone = phoneResult.error.errors[0].message;
      }
    }

    const passwordResult = passwordSchema.safeParse(password);
    if (!passwordResult.success) {
      newErrors.password = passwordResult.error.errors[0].message;
    }

    if (!isLogin) {
      if (!displayName.trim() || !signupPhone.trim() || !signupEmail.trim()) {
        newErrors.displayName = !displayName.trim() ? t("error.missing_fields") : undefined;
        newErrors.phone = !signupPhone.trim() ? t("error.missing_fields") : undefined;
        newErrors.signupEmail = !signupEmail.trim() ? t("error.missing_fields") : undefined;
      }
      if (!displayName.trim()) {
        newErrors.displayName = t("auth.errors.display_name_required");
      }
      if (/\d/.test(displayName)) {
        newErrors.displayName = t("auth.errors.display_name_required");
      }
      const phoneResult = phoneSchema.safeParse(signupPhone || "");
      if (!phoneResult.success) {
        newErrors.phone = phoneResult.error.errors[0].message;
      }
      const emailResult = emailSchema.safeParse(signupEmail || "");
      if (!emailResult.success) {
        newErrors.signupEmail = emailResult.error.errors[0].message;
      }
    }

    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0 && !isLogin && (!displayName.trim() || !signupPhone.trim() || !signupEmail.trim())) {
      toast.error(t("error.missing_fields"));
    }
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setLoading(true);

    try {
      if (isLogin) {
        const loginIdentifier = loginMethod === "email" ? loginEmail : loginPhone;
        const { error } = await signIn(
          loginMethod === "email" ? loginIdentifier : "",
          password,
          loginMethod === "phone" ? loginIdentifier : undefined
        );

        if (error) {
          if (error.message.includes("Invalid login credentials")) {
            toast.error(t("auth.errors.invalid"));
          } else {
            toast.error(error.message);
          }
        } else {
          if (rememberMe) {
            localStorage.setItem("rememberMe", "true");
            localStorage.setItem("rememberedLoginMethod", loginMethod);
            localStorage.setItem("rememberedIdentifier", loginMethod === "email" ? loginEmail : loginPhone);
          } else {
            localStorage.removeItem("rememberMe");
            localStorage.removeItem("rememberedLoginMethod");
            localStorage.removeItem("rememberedIdentifier");
          }
          toast.success(t("auth.welcome_back"));
        }
      } else {
        const { error } = await signUp(signupEmail, password, displayName, signupPhone, {
          acceptedAtIso: new Date().toISOString(),
          version: "v2.0",
        });
        if (error) {
          if (error.message.includes("User already registered")) {
            toast.error(t("auth.errors.account_exists"));
          } else {
            toast.error(error.message);
          }
        } else {
          toast.success(t("auth.account_created"));
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary-soft via-background to-accent-soft flex flex-col">
      {/* Header */}
      <div className="pt-12 pb-8 text-center">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-white shadow-elevated mb-4 overflow-hidden"
        >
          <img src={huddleLogo} alt={t("app.name")} className="w-full h-full object-contain" />
        </motion.div>
        <motion.h1
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="text-3xl font-bold text-brandText lowercase"
        >
          {t("app.name")}
        </motion.h1>
        {/* Subheadline intentionally removed per spec */}
      </div>

      {/* Auth Card */}
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="flex-1 px-6"
      >
        <div className="bg-card rounded-3xl shadow-elevated p-6 max-w-md mx-auto">
          {/* Tab Switcher */}
          <div className="flex bg-muted rounded-full p-1 mb-6">
            <button
              onClick={() => {
                setIsLogin(true);
                setConsentAccepted(false);
              }}
              className={`flex-1 py-2.5 rounded-full text-sm font-medium transition-all ${
                isLogin
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t("auth.login")}
            </button>
            <button
              onClick={() => {
                setIsLogin(false);
                setConsentAccepted(false);
              }}
              className={`flex-1 py-2.5 rounded-full text-sm font-medium transition-all ${
                !isLogin
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t("auth.signup")}
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <AnimatePresence mode="wait">
              {!isLogin && (
                <motion.div
                  key="signupFields"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="space-y-3"
                >
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                      type="text"
                      placeholder={t("Display/User Name")}
                      value={displayName}
                      onChange={(e) => {
                        setDisplayName(e.target.value);
                        setErrors((prev) => ({ ...prev, displayName: undefined }));
                      }}
                      className={`pl-12 h-12 rounded-xl ${errors.displayName ? "border-destructive" : "border-border"}`}
                    />
                  </div>
                  {errors.displayName && (
                    <p className="text-destructive text-xs mt-1 ml-1">{errors.displayName}</p>
                  )}

                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground z-10" />
                    <Input
                      type="email"
                      placeholder={t("Email")}
                      value={signupEmail}
                      onChange={(e) => {
                        setSignupEmail(e.target.value);
                        setErrors((prev) => ({ ...prev, signupEmail: undefined }));
                      }}
                      className={`pl-12 h-12 rounded-xl ${errors.signupEmail ? "border-destructive" : "border-border"}`}
                    />
                  </div>
                  {errors.signupEmail && (
                    <p className="text-destructive text-xs mt-1 ml-1">{errors.signupEmail}</p>
                  )}

                  <div className="relative">
                    <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground z-10" />
                    <PhoneInput
                      international
                      defaultCountry="HK"
                      value={signupPhone}
                      onChange={(value) => {
                        setSignupPhone(value || "");
                        setErrors((prev) => ({ ...prev, phone: undefined }));
                      }}
                      className={`phone-input-auth h-12 rounded-xl bg-muted border ${errors.phone ? "border-destructive" : "border-border"} pl-12`}
                      placeholder={t("Phone (+XXX)")}
                    />
                  </div>
                  {errors.phone && (
                    <p className="text-destructive text-xs mt-1 ml-1">{errors.phone}</p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {isLogin && (
              <div>
                <div className="relative">
                  {loginMethod === "email" ? (
                    <>
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground z-10" />
                      <Input
                        type="email"
                        placeholder={t("Email")}
                        value={loginEmail}
                        onChange={(e) => {
                          setLoginEmail(e.target.value);
                          setErrors((prev) => ({ ...prev, loginEmail: undefined }));
                        }}
                        className={`pl-12 h-12 rounded-xl ${errors.loginEmail ? "border-destructive" : "border-border"}`}
                      />
                    </>
                  ) : (
                    <PhoneInput
                      international
                      defaultCountry="HK"
                      value={loginPhone}
                      onChange={(value) => {
                        setLoginPhone(value || "");
                        setErrors((prev) => ({ ...prev, loginPhone: undefined }));
                      }}
                      className={`phone-input-auth h-12 rounded-xl ${errors.loginPhone ? "border-destructive" : "border-border"}`}
                      placeholder={t("Mobile Number")}
                    />
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setLoginMethod((prev) => (prev === "email" ? "phone" : "email"));
                    setErrors((prev) => ({ ...prev, loginEmail: undefined, loginPhone: undefined }));
                  }}
                  className="text-xs text-primary mt-1 ml-1 hover:underline"
                >
                  {loginMethod === "email" ? t("Use phone instead") : t("Use email instead")}
                </button>
                {errors.loginEmail && (
                  <p className="text-destructive text-xs mt-1 ml-1">{errors.loginEmail}</p>
                )}
                {errors.loginPhone && (
                  <p className="text-destructive text-xs mt-1 ml-1">{errors.loginPhone}</p>
                )}
              </div>
            )}

            <div>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder={t("Password")}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setErrors((prev) => ({ ...prev, password: undefined }));
                  }}
                  className={`pl-12 pr-12 h-12 rounded-xl ${errors.password ? "border-destructive" : "border-border"}`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2"
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5 text-muted-foreground" />
                  ) : (
                    <Eye className="w-5 h-5 text-muted-foreground" />
                  )}
                </button>
              </div>
              {errors.password && (
                <p className="text-destructive text-xs mt-1 ml-1">{errors.password}</p>
              )}
              {!isLogin && !errors.password && password.length > 0 && (
                <div className="mt-2 space-y-1 text-xs ml-1">
                  <p className={password.length >= 8 ? "text-[#A6D539]" : "text-muted-foreground"}>
                    {t("auth.password_strength.length")}
                  </p>
                  <p className={/[A-Z]/.test(password) ? "text-[#A6D539]" : "text-muted-foreground"}>
                    {t("auth.password_strength.upper")}
                  </p>
                  <p className={/[0-9]/.test(password) ? "text-[#A6D539]" : "text-muted-foreground"}>
                    {t("auth.password_strength.number")}
                  </p>
                  <p className={/[^A-Za-z0-9]/.test(password) ? "text-[#A6D539]" : "text-muted-foreground"}>
                    {t("auth.password_strength.special")}
                  </p>
                </div>
              )}
            </div>

            {/* Remember Me Checkbox - Login only */}
            {isLogin && (
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="rememberMe"
                  checked={rememberMe}
                  onCheckedChange={(checked) => setRememberMe(checked as boolean)}
                />
                <label
                  htmlFor="rememberMe"
                  className="text-sm text-muted-foreground cursor-pointer"
                >
                  {t("auth.remember")}
                </label>
              </div>
            )}

            {!isLogin && (
              <div className="flex items-start space-x-2">
                <Checkbox
                  id="consent"
                  checked={consentAccepted}
                  onCheckedChange={(checked) => setConsentAccepted(Boolean(checked))}
                />
                <label htmlFor="consent" className="text-xs text-muted-foreground leading-snug cursor-pointer">
                  I have read and agree to the{" "}
                  <Link to="/terms" className="text-primary underline underline-offset-2">
                    Terms of Service
                  </Link>{" "}
                  and{" "}
                  <Link to="/privacy" className="text-primary underline underline-offset-2">
                    Privacy Policy
                  </Link>
                  .
                </label>
              </div>
            )}

            <Button
              type="submit"
              disabled={loading || (!isLogin && !consentAccepted)}
              className="w-full h-12 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : isLogin ? (
                t("auth.login")
              ) : (
                t("auth.create_account")
              )}
            </Button>
          </form>

          {isLogin && (
            <button
              className="w-full text-center text-sm text-primary mt-4 hover:underline"
              onClick={async () => {
                if (!loginEmail || !loginEmail.includes("@")) {
                  toast.error(t("auth.reset_enter_email"));
                  return;
                }
                const { error } = await supabase.auth.resetPasswordForEmail(loginEmail, {
                  redirectTo: `${window.location.origin}/auth`,
                });
                toast[error ? "error" : "success"](
                  error ? t("auth.reset_failed") : t("auth.reset_sent")
                );
              }}
            >
              {t("auth.forgot_password")}
            </button>
          )}
        </div>
      </motion.div>

      {/* Footer */}
      <div className="py-8 text-center">
        <p className="text-xs text-muted-foreground">
          {t("auth.by_continuing")}{" "}
          <Link to="/terms" className="text-brandBlue hover:underline">
            {t("auth.terms")}
          </Link>{" "}
          {t("auth.and")}{" "}
          <Link to="/privacy" className="text-brandBlue hover:underline">
            {t("auth.privacy")}
          </Link>
        </p>
      </div>
    </div>
  );
};

export default Auth;
