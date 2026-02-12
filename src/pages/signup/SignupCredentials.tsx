import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Eye, EyeOff, Lock, Mail, Phone } from "lucide-react";
import { useNavigate } from "react-router-dom";
import PhoneInput from "react-phone-number-input";
import "react-phone-number-input/style.css";
import { credentialsSchema } from "@/lib/authSchemas";
import { passwordChecks, passwordStrengthLabel } from "@/lib/passwordStrength";
import { useSignup } from "@/contexts/SignupContext";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { LegalModal } from "@/components/modals/LegalModal";

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
  const otpBypass = import.meta.env.DEV || import.meta.env.VITE_DISABLE_OTP === "true";
  const e164Regex = /^\+[1-9]\d{1,14}$/;

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    trigger,
    formState: { errors, isValid, touchedFields },
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
  const phoneTouched = Boolean(touchedFields.phone);
  const phoneInvalid = phoneTouched && !e164Regex.test(phone);
  const otpRequirementMet = otpBypass ? true : otpVerified;

  const checks = passwordChecks(password);
  const strength = passwordStrengthLabel(password);
  useEffect(() => {
    update({ email, phone, password, otp_verified: otpVerified });
  }, [email, phone, password, otpVerified, update]);

  const sendOtp = async () => {
    if (!phone || !e164Regex.test(phone)) {
      toast.error("Enter a valid phone number");
      return;
    }
    setOtpError(null);
    if (!otpBypass) {
      const { error } = await supabase.auth.signInWithOtp({ phone });
      if (error) {
        setOtpError(error.message);
        return;
      }
    }
    setOtpSent(true);
    setResendIn(60);
  };

  const verifyOtp = async () => {
    if (otpValue.length !== 6) {
      setOtpError("Invalid code");
      return;
    }
    if (otpBypass) {
      if (otpValue !== "123456") {
        setOtpError("Invalid code");
        return;
      }
    } else {
      const { error } = await supabase.auth.verifyOtp({ phone, token: otpValue, type: "sms" });
      if (error) {
        setOtpError(error.message || "Invalid code");
        return;
      }
    }
    setOtpVerified(true);
    setOtpError(null);
    void trigger();
  };

  const onSubmit = () => {
    if (!otpRequirementMet) {
      toast.error("Please verify your phone number");
      return;
    }
    navigate("/signup/verify");
  };

  useEffect(() => {
    if (!resendIn) return;
    const timer = setInterval(() => {
      setResendIn((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendIn]);

  return (
    <div className="min-h-screen bg-background px-6">
      <div className="pt-6 flex items-center justify-between">
        <button onClick={() => navigate("/signup/name")} className="p-2 -ml-2" aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="text-sm text-muted-foreground">3 of 4</div>
      </div>

      <div className="mt-4 h-2 w-full rounded-full bg-muted">
        <div className="h-2 w-3/4 rounded-full bg-brandBlue" />
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
              className={`h-9 pl-9 ${errors.email ? "border-red-500" : ""}`}
              {...register("email")}
              autoFocus
            />
          </div>
          {errors.email && <p className="text-xs text-red-500 mt-1" aria-live="polite">{errors.email.message as string}</p>}
        </div>

        <div>
          <label className="text-xs text-muted-foreground">Phone Number</label>
          <div className={`h-9 rounded-md border ${errors.phone ? "border-red-500" : "border-brandText/40"} bg-white px-2 flex items-center gap-2 focus-within:border-brandBlue focus-within:ring-1 focus-within:ring-brandBlue`}>
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
          {phoneInvalid && <p className="text-xs text-red-500 mt-1" aria-live="polite">Your phone number is invalid</p>}
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
                  className="h-9 w-10 text-center"
                  ref={(el) => (otpRefs.current[idx] = el)}
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
                className={otpVerified ? "bg-green-600 hover:bg-green-600 text-white" : ""}
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
              className={`h-9 pl-9 pr-10 ${errors.password ? "border-red-500" : ""}`}
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
              className={`h-9 pl-9 pr-10 ${errors.confirmPassword || confirmMismatch ? "border-red-500" : ""}`}
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

        <Button type="submit" className="w-full h-10" disabled={!isValid || !otpRequirementMet}>
          Continue
        </Button>
        {!isValid || !otpRequirementMet ? (
          <p className="text-xs text-muted-foreground">
            {!watch("agreedToTerms")
              ? "Agree to Terms to continue"
              : !otpRequirementMet
                ? "Verify your phone number to continue"
                : phoneInvalid
                  ? "Enter a valid phone number to continue"
                  : "Complete all required fields to continue"}
          </p>
        ) : null}
      </form>
      <LegalModal isOpen={legalModal === "terms"} onClose={() => setLegalModal(null)} type="terms" />
      <LegalModal isOpen={legalModal === "privacy"} onClose={() => setLegalModal(null)} type="privacy" />
    </div>
  );
};

export default SignupCredentials;
