import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { authResetPassword } from "@/lib/publicAuthApi";
import { useTurnstile } from "@/hooks/useTurnstile";
import { TurnstileDebugPanel, TurnstileWidget } from "@/components/security/TurnstileWidget";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const schema = z.object({
  email: z.string().trim().email("Invalid email format"),
});

type FormData = z.infer<typeof schema>;

const ResetPassword = () => {
  const navigate = useNavigate();
  const [registeredEmail, setRegisteredEmail] = useState(false);
  const [checkingEmail, setCheckingEmail] = useState(false);
  const [emailCheckError, setEmailCheckError] = useState<string | null>(null);
  const duplicateCheckRef = useRef(0);
  const showTurnstileDiag =
    typeof window !== "undefined"
    && new URLSearchParams(window.location.search).get("turnstile_diag") === "1";
  const resetTurnstile = useTurnstile("reset_password");
  const readTurnstileToken = () => {
    const maybeGetToken = (resetTurnstile as { getToken?: unknown }).getToken;
    if (typeof maybeGetToken === "function") {
      return String((maybeGetToken as () => string)() || "").trim();
    }
    return String((resetTurnstile as { token?: string | null }).token || "").trim();
  };
  const { register, watch, handleSubmit, formState: { errors, isValid } } = useForm<FormData>({
    resolver: zodResolver(schema),
    mode: "onChange",
  });
  const email = watch("email") || "";

  useEffect(() => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!schema.safeParse({ email: trimmedEmail }).success) {
      setRegisteredEmail(false);
      setCheckingEmail(false);
      setEmailCheckError(null);
      return;
    }
    const checkId = ++duplicateCheckRef.current;
    const timer = window.setTimeout(async () => {
      try {
        setCheckingEmail(true);
        setEmailCheckError(null);
        const { data, error } = await supabase.rpc("check_identifier_registered", {
          p_email: trimmedEmail,
          p_phone: "",
        });
        if (checkId !== duplicateCheckRef.current) return;
        if (error) {
          setRegisteredEmail(false);
          setEmailCheckError("Could not verify this email right now. Please retry.");
          return;
        }
        if (data?.blocked) {
          setRegisteredEmail(false);
          setEmailCheckError(String(data?.public_message || "This account is unavailable."));
          return;
        }
        if (data?.review_required) {
          setRegisteredEmail(false);
          setEmailCheckError("This account is temporarily unavailable.");
          return;
        }
        const exists = Boolean(data?.registered);
        setRegisteredEmail(exists);
        setEmailCheckError(exists ? null : "No account found for this email.");
      } catch {
        if (checkId !== duplicateCheckRef.current) return;
        setRegisteredEmail(false);
        setEmailCheckError("Could not verify this email right now. Please retry.");
      } finally {
        if (checkId === duplicateCheckRef.current) setCheckingEmail(false);
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [email]);

  const onSubmit = async (values: FormData) => {
    const normalizedEmail = values.email.trim().toLowerCase();
    const token = readTurnstileToken();
    if (!token) {
      toast.error("Complete human verification first.");
      return;
    }
    const { error } = await authResetPassword({
      email: normalizedEmail,
      redirectTo: `${window.location.origin}/update-password`,
      turnstile_token: token,
      turnstile_action: "reset_password",
    });
    resetTurnstile.reset();
    if (error) {
      toast.error(error.message || "Failed to send reset link");
      return;
    }
    toast.success("Password reset link sent to your email");
  };

  return (
    <div className="min-h-screen bg-background px-6 pt-10">
      <button
        type="button"
        onClick={() => navigate("/auth")}
        className="mb-4 inline-flex h-9 w-9 items-center justify-center rounded-full border border-border text-brandText"
        aria-label="Back to sign in"
      >
        <ChevronLeft size={18} strokeWidth={1.75} />
      </button>
      <h1 className="text-xl font-bold text-brandText">Reset Password</h1>
      <p className="text-sm text-muted-foreground">Enter your email to receive a reset link.</p>
      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-3">
        <Input type="email" autoComplete="email" className={`h-9 ${errors.email ? "border-red-500" : ""}`} {...register("email")} />
        {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
        {!errors.email && emailCheckError && <p className="text-xs text-red-500">{emailCheckError}</p>}
        <TurnstileWidget
          siteKeyMissing={resetTurnstile.siteKeyMissing}
          setContainer={resetTurnstile.setContainer}
          className="min-h-[65px]"
        />
        <TurnstileDebugPanel visible={showTurnstileDiag} diag={resetTurnstile.diag} />
        <Button
          type="submit"
          className="w-full h-10"
          disabled={!isValid || !registeredEmail || checkingEmail || !resetTurnstile.isTokenUsable}
        >
          {checkingEmail ? "Checking…" : "Send reset link"}
        </Button>
      </form>
    </div>
  );
};

export default ResetPassword;
