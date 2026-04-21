import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, ChevronLeft, Mail } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { authResetPassword } from "@/lib/publicAuthApi";
import { useTurnstile } from "@/hooks/useTurnstile";
import { TurnstileDebugPanel, TurnstileWidget } from "@/components/security/TurnstileWidget";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const schema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
});

type FormData = z.infer<typeof schema>;
type RequestState = "idle" | "sending" | "sent";

const ResetPassword = () => {
  const navigate = useNavigate();
  const [registeredEmail, setRegisteredEmail] = useState(false);
  const [checkingEmail, setCheckingEmail] = useState(false);
  const [emailCheckError, setEmailCheckError] = useState<string | null>(null);
  const [requestState, setRequestState] = useState<RequestState>("idle");
  const [submittedEmail, setSubmittedEmail] = useState("");
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
    setRequestState("idle");
    setSubmittedEmail("");
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
          setEmailCheckError("We couldn't check this email right now. Please try again.");
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
        setEmailCheckError(exists ? null : "We couldn't find an account with that email.");
      } catch {
        if (checkId !== duplicateCheckRef.current) return;
        setRegisteredEmail(false);
        setEmailCheckError("We couldn't check this email right now. Please try again.");
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
      toast.error("Please complete verification first.");
      return;
    }
    setRequestState("sending");
    const { error } = await authResetPassword({
      email: normalizedEmail,
      redirectTo: `${window.location.origin}/update-password`,
      turnstile_token: token,
      turnstile_action: "reset_password",
    });
    resetTurnstile.reset();
    if (error) {
      setRequestState("idle");
      setEmailCheckError("We couldn't send that reset email just now. Please try again in a moment.");
      return;
    }
    setSubmittedEmail(normalizedEmail);
    setEmailCheckError(null);
    setRequestState("sent");
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

      {requestState === "sent" && (
        <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-900">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <div>
              <p className="font-medium">Check your inbox</p>
              <p className="mt-1 leading-6 text-emerald-800">
                We&apos;ve sent a password reset link to <span className="font-medium">{submittedEmail}</span>.
                If it doesn&apos;t arrive in a few minutes, check your spam folder or try again.
              </p>
            </div>
          </div>
        </div>
      )}

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
          className="h-10 w-full"
          disabled={!isValid || !registeredEmail || checkingEmail || requestState === "sending" || !resetTurnstile.isTokenUsable}
        >
          {checkingEmail ? "Checking…" : requestState === "sending" ? "Sending…" : "Send reset link"}
        </Button>
      </form>

      {requestState === "sent" && (
        <button
          type="button"
          onClick={() => setRequestState("idle")}
          className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-primary"
        >
          <Mail size={16} strokeWidth={1.75} />
          Send another link
        </button>
      )}
    </div>
  );
};

export default ResetPassword;
