import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Eye, EyeOff, Lock, Mail, Phone } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import PhoneInput from "react-phone-number-input";
import "react-phone-number-input/style.css";
import { credentialsSchema } from "@/lib/authSchemas";
import { passwordChecks, passwordStrengthLabel } from "@/lib/passwordStrength";
import { useSignup } from "@/contexts/SignupContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { LegalModal } from "@/components/modals/LegalModal";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

const SignupCredentials = () => {
  const navigate = useNavigate();
  const { data, update } = useSignup();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpValue, setOtpValue] = useState("");
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpVerified, setOtpVerified] = useState(data.otp_verified);
  const [resendIn, setResendIn] = useState(0);
  const otpRefs = useRef<Array<HTMLInputElement | null>>([]);
  const [legalModal, setLegalModal] = useState<"terms" | "privacy" | null>(null);
  const [showSignInModal, setShowSignInModal] = useState(false);
  const [duplicateField, setDuplicateField] = useState<"email" | "phone" | null>(null);
  const [duplicateDetected, setDuplicateDetected] = useState(false);
  const [signinEmail, setSigninEmail] = useState("");
  const [signinPassword, setSigninPassword] = useState("");
  const [signinLoading, setSigninLoading] = useState(false);
  const [signinError, setSigninError] = useState("");
  const [signinRemember, setSigninRemember] = useState(true);
  const sessionOnlyHandlerRef = useRef<(() => void) | null>(null);
  const duplicateCheckRef = useRef(0);
  const OTP_FAKE_MODE = true; // temporary, until real provider exists
  const e164Regex = /^\+[1-9]\d{1,14}$/;

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    trigger,
    setError,
    formState: { errors, isValid },
  } = useForm({
    resolver: zodResolver(credentialsSchema),
    mode: "onChange",
    defaultValues: {
      email: data.email,
      phone: data.phone,
      password: data.password,
      confirmPassword: data.password,
      agreedToTerms: false,
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
  const otpRequirementMet = otpVerified;

  const checks = passwordChecks(password);
  const strength = passwordStrengthLabel(password);
  useEffect(() => {
    const hasChanges =
      data.email !== email ||
      data.phone !== phone ||
      data.password !== password ||
      data.otp_verified !== otpVerified;
    if (!hasChanges) return;
    update({ email, phone, password, otp_verified: otpVerified });
  }, [data.email, data.phone, data.password, data.otp_verified, email, phone, password, otpVerified, update]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    console.debug(errors, isValid);
  }, [errors, isValid]);

  useEffect(() => {
    setOtpSent(false);
    setOtpVerified(false);
    setOtpValue("");
    setOtpError(null);
    setResendIn(0);
  }, [phone]);

  useEffect(() => {
    const trimmedEmail = email.trim();
    const trimmedPhone = phone.trim();
    if (!trimmedEmail && !trimmedPhone) {
      setDuplicateDetected(false);
      setDuplicateField(null);
      return;
    }

    const checkId = ++duplicateCheckRef.current;
    const timer = setTimeout(async () => {
      try {
        const { data: checkResult, error: checkError } = await supabase.rpc("check_identifier_registered", {
          p_email: trimmedEmail,
          p_phone: trimmedPhone,
        });

        if (checkId !== duplicateCheckRef.current) return;
        if (checkError) {
          console.error("Duplicate check error:", checkError);
          return;
        }

        const isRegistered = Boolean(checkResult?.registered);
        setDuplicateDetected(isRegistered);
        setDuplicateField(checkResult?.field || null);

        if (isRegistered) {
          setSigninEmail(trimmedEmail);
          setShowSignInModal(true);
        } else if (showSignInModal) {
          setShowSignInModal(false);
        }
      } catch (err) {
        if (checkId !== duplicateCheckRef.current) return;
        console.error("Duplicate check failed:", err);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [email, phone, showSignInModal]);

  const sendOtp = async () => {
    if (!phone || !e164Regex.test(phone)) {
      setError("phone", { type: "manual", message: "Your phone number is invalid" });
      return;
    }
    setOtpSent(true);
    setResendIn(60);
    setOtpVerified(false);
    setOtpValue("");
    setOtpError(null);
    // Fake mode: no provider calls
  };

  const verifyOtp = async () => {
    if (otpValue.length !== 6) {
      setOtpError("Invalid code");
      setOtpVerified(false);
      return;
    }
    if (OTP_FAKE_MODE) {
      if (otpValue !== "123456") {
        setOtpError("Invalid code");
        setOtpVerified(false);
        return;
      }
      setOtpVerified(true);
      setOtpError(null);
      void trigger();
      return;
    }
    setOtpVerified(true);
    setOtpError(null);
    void trigger();
  };

  const onSubmit = async () => {
    if (!otpRequirementMet || duplicateDetected) {
      return;
    }

    // Check if email or phone is already registered
    try {
      const { data: checkResult, error: checkError } = await supabase.rpc("check_identifier_registered", {
        p_email: email,
        p_phone: phone,
      });

      if (checkError) {
        console.error("Duplicate check error:", checkError);
        // Continue anyway - error will be caught at signup
        navigate("/signup/name");
        return;
      }

      if (checkResult?.registered) {
        // Show sign-in modal with exact subtext
        setDuplicateField(checkResult.field || "email");
        setSigninEmail(email);
        setShowSignInModal(true);
        return;
      }

      // Not registered - proceed to name step
      navigate("/signup/name");
    } catch (err) {
      console.error("Duplicate check failed:", err);
      // Continue anyway - error will be caught at signup
      navigate("/signup/name");
    }
  };

  useEffect(() => {
    if (!resendIn) return;
    const timer = setInterval(() => {
      setResendIn((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendIn]);

  useEffect(() => {
    if (showSignInModal) {
      setSigninRemember(true);
    }
  }, [showSignInModal]);

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

  return (
    <div className="min-h-screen bg-background px-6">
      <div className="pt-6 flex items-center justify-between">
        <button onClick={() => navigate("/signup/dob")} className="p-2 -ml-2" aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="text-sm text-muted-foreground">2 of 4</div>
      </div>

      <div className="mt-4 h-2 w-full rounded-full bg-muted">
        <div className="h-2 w-2/4 rounded-full bg-brandBlue" />
      </div>

      <h1 className="mt-6 text-xl font-bold text-brandText">Please fill in your login credentials</h1>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
        <div>
          <label className="text-xs text-muted-foreground">Email</label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="email"
              autoComplete="email"
              className={`h-10 pl-9 ${errors.email ? "border-red-500" : ""}`}
              {...register("email")}
              autoFocus
            />
          </div>
          {errors.email && <p className="text-xs text-red-500 mt-1" aria-live="polite">{errors.email.message as string}</p>}
        </div>

        <div>
          <label className="text-xs text-muted-foreground">Phone Number</label>
          <div className={`h-10 rounded-md border ${errors.phone ? "border-red-500" : "border-brandText/40"} bg-white px-2 flex items-center gap-2 focus-within:border-brandBlue focus-within:ring-1 focus-within:ring-brandBlue`}>
            <Phone className="h-4 w-4 text-muted-foreground" />
            <PhoneInput
              defaultCountry={defaultCountry as never}
              international
              value={phone}
              onChange={(value) => setValue("phone", value || "", { shouldValidate: true, shouldTouch: true })}
              className="flex-1"
              inputClassName="!border-0 !shadow-none !p-0 !text-sm !bg-transparent"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-brandBlue hover:bg-transparent"
              onClick={sendOtp}
              disabled={resendIn > 0}
            >
              {resendIn > 0 ? `Resend in ${resendIn}s` : "Send Code"}
            </Button>
          </div>
          {errors.phone && (
            <p className="text-xs text-red-500 mt-1" aria-live="polite">
              Your phone number is invalid
            </p>
          )}
        </div>

        {otpSent && (
          <div>
            <label className="text-xs text-muted-foreground">Verification Code</label>
            <div className="flex gap-2">
              {Array.from({ length: 6 }).map((_, idx) => (
                <Input
                  key={idx}
                  inputMode="numeric"
                  maxLength={1}
                  className="h-10 w-10 text-center"
                  ref={(el) => (otpRefs.current[idx] = el)}
                  value={otpValue[idx] ?? ""}
                  onChange={(e) => {
                    const next = e.target.value.replace(/\D/g, "");
                    const chars = otpValue.split("");
                    chars[idx] = next;
                    const combined = chars.join("").slice(0, 6);
                    setOtpValue(combined);
                    if (next && otpRefs.current[idx + 1]) otpRefs.current[idx + 1]?.focus();
                  }}
                  onPaste={(e) => {
                    const paste = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
                    setOtpValue(paste);
                    e.preventDefault();
                  }}
                />
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                onClick={verifyOtp}
                className={
                  otpVerified
                    ? "bg-green-600 hover:bg-green-600 text-white"
                    : "bg-brandBlue hover:bg-brandBlue/90 text-white"
                }
              >
                {otpVerified ? "✓ Verified" : "Verify"}
              </Button>
              {otpError && <span className="text-xs text-red-500" aria-live="polite">{otpError}</span>}
            </div>
          </div>
        )}

        <div>
          <label className="text-xs text-muted-foreground">Password</label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type={showPassword ? "text" : "password"}
              className={`h-10 pl-9 pr-10 ${errors.password ? "border-red-500" : ""}`}
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
          <div className="mt-2 space-y-1 text-xs">
            <div className={checks.length ? "text-green-600" : "text-muted-foreground"}>Minimum 8 characters</div>
            <div className={checks.upper ? "text-green-600" : "text-muted-foreground"}>At least one uppercase letter</div>
            <div className={checks.number ? "text-green-600" : "text-muted-foreground"}>At least one number</div>
            <div className={checks.special ? "text-green-600" : "text-muted-foreground"}>At least one special character (!@#$%^&*)</div>
          </div>
          <div className={`mt-2 text-xs ${strength === "strong" ? "text-green-600" : strength === "medium" ? "text-yellow-600" : "text-red-500"}`}>
            Strength: {strength}
          </div>
        </div>

        <div>
          <label className="text-xs text-muted-foreground">Confirm Password</label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type={showConfirm ? "text" : "password"}
              className={`h-10 pl-9 pr-10 ${errors.confirmPassword || confirmMismatch ? "border-red-500" : ""}`}
              {...register("confirmPassword")}
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              onClick={() => setShowConfirm((s) => !s)}
              aria-label="Toggle confirm password"
            >
              {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {(confirmMismatch || errors.confirmPassword) && (
            <p className="text-xs text-red-500 mt-1" aria-live="polite">
              {confirmMismatch ? "Passwords do not match" : (errors.confirmPassword?.message as string)}
            </p>
          )}
        </div>

        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Checkbox checked={Boolean(watch("agreedToTerms"))} onCheckedChange={(v) => setValue("agreedToTerms", Boolean(v), { shouldValidate: true })} />
          <span>
            I have read and agree to the{" "}
            <button
              type="button"
              className="text-brandBlue underline"
              onClick={() => setLegalModal("terms")}
            >
              Terms of Service
            </button>{" "}
            and{" "}
            <button
              type="button"
              className="text-brandBlue underline"
              onClick={() => setLegalModal("privacy")}
            >
              Privacy Policy
            </button>
            .
          </span>
        </label>
        {errors.agreedToTerms && <p className="text-xs text-red-500">{errors.agreedToTerms.message as string}</p>}

        <Button type="submit" className="w-full h-10" disabled={!isValid || !otpRequirementMet || duplicateDetected}>
          Continue
        </Button>
        {!isValid || !otpRequirementMet || duplicateDetected ? (
          <p className="text-xs text-muted-foreground">
            {duplicateDetected
              ? "This email/ phone number is already registered"
              : !watch("agreedToTerms")
              ? "Agree to Terms to continue"
              : phoneInvalid
                ? "Enter a valid phone number"
                : otpSent && otpError
                  ? "Invalid code"
                  : otpSent && otpValue.length < 6
                    ? "Enter the 6-digit code"
                    : !otpRequirementMet
                      ? "Verify your phone number"
                      : "Complete all required fields to continue"}
          </p>
        ) : null}
      </form>
      <LegalModal isOpen={legalModal === "terms"} onClose={() => setLegalModal(null)} type="terms" />
      <LegalModal isOpen={legalModal === "privacy"} onClose={() => setLegalModal(null)} type="privacy" />

      {/* Sign-In Modal for Already Registered Users */}
      <Dialog open={showSignInModal} onOpenChange={setShowSignInModal}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>Already Registered</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            This email/ phone number is already registered
          </DialogDescription>

          <div className="space-y-4 mt-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Email</label>
              <div className="relative mt-1">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="email"
                  className="pl-10 h-10"
                  value={signinEmail}
                  onChange={(e) => setSigninEmail(e.target.value)}
                  placeholder="Email"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">Password</label>
              <div className="relative mt-1">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="password"
                  className="pl-10 h-10"
                  value={signinPassword}
                  onChange={(e) => setSigninPassword(e.target.value)}
                  placeholder="Password"
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Checkbox checked={signinRemember} onCheckedChange={(v) => setSigninRemember(Boolean(v))} />
                Stay logged in
              </label>
              <Link to="/reset-password" className="text-xs text-brandBlue">Forgot password?</Link>
            </div>

            {signinError && (
              <p className="text-xs text-red-500">{signinError}</p>
            )}

            <Button
              className="w-full h-10"
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

                  // Update last_login
                  const { data: { user } } = await supabase.auth.getUser();
                  if (user?.id) {
                    await supabase.from("profiles").update({ last_login: new Date().toISOString() }).eq("id", user.id);
                  }

                  toast.success("Signed in successfully");
                  setShowSignInModal(false);
                  navigate("/");
                } catch (err: unknown) {
                  setSigninError(err instanceof Error ? err.message : "Sign in failed");
                } finally {
                  setSigninLoading(false);
                }
              }}
            >
              {signinLoading ? "Signing in..." : "Sign in"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SignupCredentials;
