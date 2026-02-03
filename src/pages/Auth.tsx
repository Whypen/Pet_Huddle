import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, Lock, User, Eye, EyeOff, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { z } from "zod";
import PhoneInput from 'react-phone-number-input';
import 'react-phone-number-input/style.css';
import huddleLogo from "@/assets/huddle-logo.jpg";

const emailSchema = z.string().email("Please enter a valid email address");
const phoneSchema = z.string().regex(/^\+?[1-9]\d{7,14}$/, "Please enter a valid phone number");
// SPRINT 1: Strict password validation - 8+ chars, 1 upper, 1 number, 1 special
const passwordSchema = z.string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Password must contain at least 1 uppercase letter")
  .regex(/[0-9]/, "Password must contain at least 1 number")
  .regex(/[^A-Za-z0-9]/, "Password must contain at least 1 special character");

const Auth = () => {
  const navigate = useNavigate();
  const { signIn, signUp, user, profile } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [errors, setErrors] = useState<{ identifier?: string; password?: string }>({});

  // Load remembered identifier on mount
  useEffect(() => {
    const remembered = localStorage.getItem('rememberedIdentifier');
    if (remembered) {
      setIdentifier(remembered);
      setRememberMe(true);
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

  const isEmail = (value: string) => value.includes('@');
  const isPhone = (value: string) => /^\+?[0-9\s-]+$/.test(value) && !value.includes('@');

  const validateForm = () => {
    const newErrors: { identifier?: string; password?: string } = {};

    // Validate identifier (email or phone)
    if (isEmail(identifier)) {
      const emailResult = emailSchema.safeParse(identifier);
      if (!emailResult.success) {
        newErrors.identifier = emailResult.error.errors[0].message;
      }
    } else if (isPhone(identifier)) {
      const cleaned = identifier.replace(/[\s-]/g, '');
      const phoneResult = phoneSchema.safeParse(cleaned);
      if (!phoneResult.success) {
        newErrors.identifier = phoneResult.error.errors[0].message;
      }
    } else {
      newErrors.identifier = "Please enter a valid email or phone number";
    }

    const passwordResult = passwordSchema.safeParse(password);
    if (!passwordResult.success) {
      newErrors.password = passwordResult.error.errors[0].message;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setLoading(true);

    try {
      const isEmailLogin = isEmail(identifier);
      const cleanedIdentifier = isEmailLogin ? identifier : identifier.replace(/[\s-]/g, '');

      if (isLogin) {
        // Attempt sign in with email or phone
        const { error } = await signIn(
          isEmailLogin ? cleanedIdentifier : '',
          password,
          isEmailLogin ? undefined : cleanedIdentifier
        );

        if (error) {
          if (error.message.includes("Invalid login credentials")) {
            toast.error("Invalid email/phone or password");
          } else {
            toast.error(error.message);
          }
        } else {
          // Save identifier if remember me is checked
          if (rememberMe) {
            localStorage.setItem('rememberedIdentifier', identifier);
          } else {
            localStorage.removeItem('rememberedIdentifier');
          }
          toast.success("Welcome back!");
        }
      } else {
        // Sign up - only support email for now
        if (!isEmailLogin) {
          toast.error("Please use an email address to sign up");
          setLoading(false);
          return;
        }

        const { error } = await signUp(cleanedIdentifier, password, displayName);
        if (error) {
          if (error.message.includes("User already registered")) {
            toast.error("An account with this email already exists");
          } else {
            toast.error(error.message);
          }
        } else {
          toast.success("Account created! Let's set up your profile.");
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
          <img src={huddleLogo} alt="huddle" className="w-full h-full object-cover" />
        </motion.div>
        <motion.h1
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="text-3xl font-bold text-foreground lowercase"
        >
          huddle
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
              onClick={() => setIsLogin(true)}
              className={`flex-1 py-2.5 rounded-full text-sm font-medium transition-all ${
                isLogin
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Login
            </button>
            <button
              onClick={() => setIsLogin(false)}
              className={`flex-1 py-2.5 rounded-full text-sm font-medium transition-all ${
                !isLogin
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Sign Up
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <AnimatePresence mode="wait">
              {!isLogin && (
                <motion.div
                  key="displayName"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                >
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                      type="text"
                      placeholder="Display Name"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="pl-12 h-12 rounded-xl border-border"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div>
              <div className="relative">
                {isEmail(identifier) ? (
                  <>
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground z-10" />
                    <Input
                      type="text"
                      placeholder="Email"
                      value={identifier}
                      onChange={(e) => {
                        setIdentifier(e.target.value);
                        setErrors((prev) => ({ ...prev, identifier: undefined }));
                      }}
                      className={`pl-12 h-12 rounded-xl ${errors.identifier ? "border-destructive" : "border-border"}`}
                    />
                  </>
                ) : (
                  <PhoneInput
                    international
                    defaultCountry="HK"
                    value={identifier}
                    onChange={(value) => {
                      setIdentifier(value || '');
                      setErrors((prev) => ({ ...prev, identifier: undefined }));
                    }}
                    className={`phone-input-auth h-12 rounded-xl ${errors.identifier ? "border-destructive" : "border-border"}`}
                    placeholder="Mobile Number"
                  />
                )}
              </div>
              <button
                type="button"
                onClick={() => setIdentifier('')}
                className="text-xs text-muted-foreground mt-1 ml-1 hover:underline"
              >
                {isEmail(identifier) ? 'Use phone number instead' : 'Use email instead'}
              </button>
              {errors.identifier && (
                <p className="text-destructive text-xs mt-1 ml-1">{errors.identifier}</p>
              )}
            </div>

            <div>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="Password"
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
                  <p className={password.length >= 8 ? "text-[#22C55E]" : "text-muted-foreground"}>
                    ✓ At least 8 characters
                  </p>
                  <p className={/[A-Z]/.test(password) ? "text-[#22C55E]" : "text-muted-foreground"}>
                    ✓ One uppercase letter
                  </p>
                  <p className={/[0-9]/.test(password) ? "text-[#22C55E]" : "text-muted-foreground"}>
                    ✓ One number
                  </p>
                  <p className={/[^A-Za-z0-9]/.test(password) ? "text-[#22C55E]" : "text-muted-foreground"}>
                    ✓ One special character
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
                  Remember Me
                </label>
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-12 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : isLogin ? (
                "Login"
              ) : (
                "Create Account"
              )}
            </Button>
          </form>

          {/* SSO Placeholders - Sprint 1 */}
          <div className="mt-6 space-y-3">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border"></div>
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Button
                type="button"
                variant="outline"
                disabled
                className="h-12 rounded-xl relative"
              >
                <Lock className="w-4 h-4 mr-2" />
                Apple
                <span className="absolute -top-1 -right-1 text-[10px] bg-muted px-1.5 py-0.5 rounded-full">Soon</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled
                className="h-12 rounded-xl relative"
              >
                <Lock className="w-4 h-4 mr-2" />
                Google
                <span className="absolute -top-1 -right-1 text-[10px] bg-muted px-1.5 py-0.5 rounded-full">Soon</span>
              </Button>
            </div>
          </div>

          {isLogin && (
            <button
              className="w-full text-center text-sm text-primary mt-4 hover:underline"
              onClick={async () => {
                if (!identifier || !identifier.includes("@")) {
                  toast.error("Enter your email address to reset password");
                  return;
                }
                const { error } = await supabase.auth.resetPasswordForEmail(identifier, {
                  redirectTo: `${window.location.origin}/auth`,
                });
                toast[error ? "error" : "success"](
                  error ? "Failed to send reset email" : "Reset link sent to your email!"
                );
              }}
            >
              Forgot Password?
            </button>
          )}
        </div>
      </motion.div>

      {/* Footer */}
      <div className="py-8 text-center">
        <p className="text-xs text-muted-foreground">
          By continuing, you agree to our{" "}
          <span className="text-primary">Terms of Service</span> and{" "}
          <span className="text-primary">Privacy Policy</span>
        </p>
      </div>
    </div>
  );
};

export default Auth;
