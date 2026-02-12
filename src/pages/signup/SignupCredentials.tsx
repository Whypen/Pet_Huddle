import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Eye, EyeOff, Lock, Mail, Phone, CheckCircle } from "lucide-react";
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
  const errorRef = useRef<HTMLDivElement | null>(null);

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

  const checks = passwordChecks(password);
  const strength = passwordStrengthLabel(password);
  const errorSummary = Object.values(errors).map((e) => e?.message).filter(Boolean);

  useEffect(() => {
    update({ email, phone, password, otp_verified: otpVerified });
  }, [email, phone, password, otpVerified, update]);

  useEffect(() => {
    if (Object.keys(errors).length > 0 && errorRef.current) {
      errorRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [errors]);

  const sendOtp = async () => {
    if (!phone) {
      toast.error("Enter a valid phone number");
      return;
    }
    setOtpError(null);
    const { error } = await supabase.auth.signInWithOtp({ phone });
    if (error) {
      setOtpError(error.message);
      return;
    }
    setOtpSent(true);
    setResendIn(60);
  };

  const verifyOtp = async () => {
    if (otpValue.length !== 6) {
      setOtpError("Invalid code");
      return;
    }
    const { error } = await supabase.auth.verifyOtp({ phone, token: otpValue, type: "sms" });
    if (error) {
      setOtpError(error.message || "Invalid code");
      return;
    }
    setOtpVerified(true);
    setOtpError(null);
  };

  const onSubmit = () => {
    if (!otpVerified) {
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

      {errorSummary.length > 0 && (
        <div ref={errorRef} className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-600" aria-live="polite">
          {errorSummary[0] as string}
        </div>
      )}
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
          {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email.message as string}</p>}
        </div>

        <div>
          <label className="text-xs text-muted-foreground">Phone Number</label>
          <div className={`rounded-md border ${errors.phone ? "border-red-500" : "border-input"} px-3 py-1 flex items-center gap-2`}>
            <Phone className="h-4 w-4 text-muted-foreground" />
            <PhoneInput
              defaultCountry={defaultCountry as never}
              international
              value={phone}
              onChange={(value) => setValue("phone", value || "", { shouldValidate: true })}
              inputClassName="!border-0 !shadow-none !p-0 !text-sm"
            />
            <Button type="button" variant="outline" size="sm" onClick={sendOtp} disabled={resendIn > 0}>
              {resendIn > 0 ? `Resend in ${resendIn}s` : "Send Code"}
            </Button>
          </div>
          {errors.phone && <p className="text-xs text-red-500 mt-1">{errors.phone.message as string}</p>}
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
              <Button type="button" variant="outline" size="sm" onClick={verifyOtp}>
                Verify
              </Button>
              {otpVerified && (
                <span className="flex items-center gap-1 text-xs text-green-600">
                  <CheckCircle className="h-3 w-3 animate-bounce" /> Verified
                </span>
              )}
              {otpError && <span className="text-xs text-red-500">{otpError}</span>}
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
              className={`h-9 pl-9 pr-10 ${errors.confirmPassword ? "border-red-500" : ""}`}
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
          {errors.confirmPassword && <p className="text-xs text-red-500 mt-1">{errors.confirmPassword.message as string}</p>}
        </div>

        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Checkbox checked={Boolean(watch("agreedToTerms"))} onCheckedChange={(v) => setValue("agreedToTerms", Boolean(v), { shouldValidate: true })} />
          <span>
            I have read and agree to the{" "}
            <a href="/terms" target="_blank" rel="noreferrer" className="text-brandBlue underline">Terms of Service</a> and{" "}
            <a href="/privacy" target="_blank" rel="noreferrer" className="text-brandBlue underline">Privacy Policy</a>.
          </span>
        </label>
        {errors.agreedToTerms && <p className="text-xs text-red-500">{errors.agreedToTerms.message as string}</p>}

        <Button type="submit" className="w-full h-10" disabled={!isValid || !otpVerified}>
          Continue
        </Button>
      </form>
    </div>
  );
};

export default SignupCredentials;
