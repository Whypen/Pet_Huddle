import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Mail, Phone, Lock } from "lucide-react";
import PhoneInput from "react-phone-number-input";
import "react-phone-number-input/style.css";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import huddleLogo from "@/assets/huddle-logo-transparent.png";
import { useLanguage } from "@/contexts/LanguageContext";

const emailSchema = z.string().email("Invalid email format");
const phoneSchema = z.string().regex(/^\+[1-9]\d{1,14}$/, "Invalid phone format");
const passwordSchema = z.string().min(8, "Minimum 8 characters");

type LoginForm = {
  email?: string;
  phone?: string;
  password: string;
  remember: boolean;
};

const Auth = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [loginMethod, setLoginMethod] = useState<"email" | "phone">("email");
  const [showPassword, setShowPassword] = useState(false);

  const schema = useMemo(() => {
    return z.object({
      email: loginMethod === "email" ? emailSchema : z.string().optional(),
      phone: loginMethod === "phone" ? phoneSchema : z.string().optional(),
      password: passwordSchema,
      remember: z.boolean().optional(),
    });
  }, [loginMethod]);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isValid },
  } = useForm<LoginForm>({
    resolver: zodResolver(schema),
    mode: "onChange",
    defaultValues: { remember: true },
  });

  useEffect(() => {
    const savedMethod = localStorage.getItem("auth_login_method");
    const savedIdentifier = localStorage.getItem("auth_login_identifier");
    if (savedMethod === "email" || savedMethod === "phone") {
      setLoginMethod(savedMethod);
      if (savedIdentifier) {
        if (savedMethod === "email") setValue("email", savedIdentifier, { shouldValidate: true });
        if (savedMethod === "phone") setValue("phone", savedIdentifier, { shouldValidate: true });
      }
    }
  }, [setValue]);

  const getOAuthErrorMessage = (message?: string) => {
    const msg = (message || "").toLowerCase();
    if (msg.includes("network") || msg.includes("fetch")) {
      return "Connection error. Please try again.";
    }
    if (msg.includes("redirect") || msg.includes("not allowed") || msg.includes("provider")) {
      return "Sign-in is not configured. Please contact support.";
    }
    return "Unable to sign in. Please try again.";
  };

  const handleOAuth = async (provider: "google" | "apple") => {
    const redirectTo = `${window.location.origin}/auth/callback`;
    const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo } });
    if (error) {
      toast.error(getOAuthErrorMessage(error.message));
    }
  };

  const onSubmit = async (values: LoginForm) => {
    const identifier = loginMethod === "email" ? values.email : values.phone;
    if (!identifier) return;
    const payload = loginMethod === "email"
      ? { email: identifier, password: values.password }
      : { phone: identifier, password: values.password };

    const { error } = await supabase.auth.signInWithPassword(payload);
    if (error) {
      const msg = error.message || "Invalid login";
      if (msg.toLowerCase().includes("invalid login credentials")) {
        toast.error("No account found. Please sign up.");
        navigate("/signup/dob");
        return;
      }
      toast.error(msg);
      return;
    }

    if (values.remember) {
      localStorage.setItem("auth_login_method", loginMethod);
      localStorage.setItem("auth_login_identifier", identifier);
    } else {
      localStorage.removeItem("auth_login_method");
      localStorage.removeItem("auth_login_identifier");
    }

    navigate("/");
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary-soft via-background to-accent-soft flex flex-col px-6">
      <div className="pt-10 pb-6 text-center">
        <div className="mx-auto h-16 w-16 rounded-full bg-white shadow-elevated flex items-center justify-center">
          <img src={huddleLogo} alt={t("app.name")} className="h-12 w-12 object-contain" />
        </div>
        <h1 className="mt-4 text-2xl font-bold text-brandBlue">Welcome to huddle</h1>
        <p className="text-sm text-muted-foreground">Your pet care community</p>
      </div>

      <div className="bg-card rounded-3xl shadow-elevated p-6 max-w-md mx-auto w-full">
        <div className="flex items-center gap-2 rounded-full bg-muted p-1 mb-4">
          <button
            type="button"
            onClick={() => setLoginMethod("email")}
            className={`flex-1 h-8 rounded-full text-xs font-semibold ${loginMethod === "email" ? "bg-white text-brandText shadow" : "text-muted-foreground"}`}
          >
            Email
          </button>
          <button
            type="button"
            onClick={() => setLoginMethod("phone")}
            className={`flex-1 h-8 rounded-full text-xs font-semibold ${loginMethod === "phone" ? "bg-white text-brandText shadow" : "text-muted-foreground"}`}
          >
            Phone
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          {loginMethod === "email" ? (
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
          ) : (
            <div>
              <label className="text-xs text-muted-foreground">Phone</label>
              <div className={`h-9 rounded-md border ${errors.phone ? "border-red-500" : "border-input"} bg-white px-2 flex items-center focus-within:border-brandBlue focus-within:ring-1 focus-within:ring-brandBlue`}>
                <PhoneInput
                  defaultCountry="HK"
                  international
                  value={watch("phone")}
                  onChange={(value) => setValue("phone", value || "", { shouldValidate: true })}
                  className="flex-1"
                  inputClassName="!border-0 !shadow-none !p-0 !text-sm !bg-transparent"
                />
              </div>
              {errors.phone && <p className="text-xs text-red-500 mt-1" aria-live="polite">{errors.phone.message}</p>}
            </div>
          )}

          <div>
            <label className="text-xs text-muted-foreground">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type={showPassword ? "text" : "password"}
                className={`h-9 pl-9 pr-10 ${errors.password ? "border-red-500" : ""}`}
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
            {errors.password && <p className="text-xs text-red-500 mt-1" aria-live="polite">{errors.password.message}</p>}
          </div>

          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Checkbox checked={watch("remember")} onCheckedChange={(v) => setValue("remember", Boolean(v))} />
              Remember me
            </label>
            <Link to="/reset-password" className="text-xs text-brandBlue">Forgot password?</Link>
          </div>

          <Button type="submit" className="w-full h-10" disabled={!isValid}>
            Sign in
          </Button>
        </form>

        <div className="my-4 border-t" />

        <div className="space-y-2">
          <Button
            type="button"
            variant="outline"
            className="w-full h-10 bg-black text-white hover:bg-black/90"
            onClick={() => handleOAuth("apple")}
          >
            <svg viewBox="0 0 24 24" aria-hidden className="mr-2 h-4 w-4 fill-white">
              <path d="M16.365 1.43c0 1.14-.43 2.22-1.23 3.03-.8.8-2.08 1.48-3.22 1.39-.13-1.1.4-2.24 1.18-3.03.77-.8 2.08-1.47 3.27-1.39zM20.64 17.07c-.48 1.1-.7 1.6-1.32 2.58-.87 1.33-2.1 3-3.61 3.01-1.35.01-1.7-.86-3.52-.86-1.81 0-2.2.85-3.52.87-1.5.02-2.65-1.5-3.52-2.83-2.4-3.67-2.66-7.98-1.17-10.27 1.06-1.65 2.75-2.62 4.34-2.62 1.62 0 2.65.88 3.99.88 1.3 0 2.1-.89 3.99-.89 1.41 0 2.9.77 3.96 2.1-3.48 1.9-2.92 6.91.38 8.03z" />\n            </svg>
            Sign in with Apple
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full h-10"
            onClick={() => handleOAuth("google")}
          >
            <svg viewBox="0 0 24 24" aria-hidden className="mr-2 h-4 w-4">
              <path fill="#EA4335" d="M12 10.2v3.6h5.1c-.2 1.1-1.3 3.3-5.1 3.3-3.1 0-5.6-2.6-5.6-5.7s2.5-5.7 5.6-5.7c1.8 0 3 .8 3.7 1.5l2.5-2.4C16.6 3.2 14.5 2.3 12 2.3 6.9 2.3 2.8 6.4 2.8 11.6S6.9 20.9 12 20.9c6.9 0 8.6-4.9 8.6-7.4 0-.5-.1-1-.2-1.3H12z" />
              <path fill="#34A853" d="M3.6 7.2l2.9 2.1C7.2 7.7 9.3 6 12 6c1.8 0 3 .8 3.7 1.5l2.5-2.4C16.6 3.2 14.5 2.3 12 2.3 8.5 2.3 5.4 4.3 3.6 7.2z" />
              <path fill="#4A90E2" d="M12 20.9c2.5 0 4.6-.8 6.1-2.1l-2.8-2.2c-.8.6-1.9 1-3.3 1-2.7 0-4.9-1.8-5.7-4.2l-2.9 2.2C5.2 18.9 8.3 20.9 12 20.9z" />
              <path fill="#FBBC05" d="M6.3 13.4c-.2-.6-.3-1.1-.3-1.8s.1-1.2.3-1.8L3.4 7.6C2.9 8.7 2.6 10.1 2.6 11.6s.3 2.9.8 4.1l2.9-2.3z" />
            </svg>
            Sign in with Google
          </Button>
        </div>

        <div className="mt-4 text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link to="/signup/dob" className="text-brandBlue font-semibold">Sign up</Link>
        </div>
      </div>
    </div>
  );
};

export default Auth;
