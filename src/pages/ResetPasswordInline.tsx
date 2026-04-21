import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, ChevronLeft, Mail } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { authResetPassword } from "@/lib/publicAuthApi";
import { getClientEnv } from "@/lib/env";
import { supabase } from "@/integrations/supabase/client";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          action?: string;
          retry?: "auto" | "never";
          "retry-interval"?: number;
          "refresh-expired"?: "auto" | "manual" | "never";
          "refresh-timeout"?: "auto" | "manual" | "never";
          callback?: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
        },
      ) => string;
      remove?: (widgetId?: string) => void;
      reset?: (widgetId?: string) => void;
    };
  }
}

const schema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
});

type FormData = z.infer<typeof schema>;
type RequestState = "idle" | "sending" | "sent";

const SCRIPT_ID = "cf-turnstile-reset-inline-script";
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const ACTION = "reset_password";

function ensureScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("turnstile_script_failed")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("turnstile_script_failed"));
    document.head.appendChild(script);
  });
}

const ResetPasswordInline = () => {
  const navigate = useNavigate();
  const siteKey = String(getClientEnv().turnstileSiteKey || "").trim();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [token, setToken] = useState("");
  const [widgetReady, setWidgetReady] = useState(false);
  const [widgetError, setWidgetError] = useState<string | null>(null);
  const [registeredEmail, setRegisteredEmail] = useState(false);
  const [checkingEmail, setCheckingEmail] = useState(false);
  const [emailCheckError, setEmailCheckError] = useState<string | null>(null);
  const [requestState, setRequestState] = useState<RequestState>("idle");
  const [submittedEmail, setSubmittedEmail] = useState("");
  const duplicateCheckRef = useRef(0);
  const { register, watch, handleSubmit, formState: { errors, isValid } } = useForm<FormData>({
    resolver: zodResolver(schema),
    mode: "onChange",
  });
  const email = watch("email") || "";

  useEffect(() => {
    if (!siteKey || !containerRef.current) return;
    let cancelled = false;

    void ensureScript()
      .then(() => {
        if (cancelled || !window.turnstile || !containerRef.current) return;
        const nextWidgetId = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          action: ACTION,
          theme: "light",
          retry: "auto",
          "retry-interval": 800,
          "refresh-expired": "auto",
          "refresh-timeout": "auto",
          callback: (nextToken) => {
            setToken(String(nextToken || "").trim());
            setWidgetError(null);
          },
          "expired-callback": () => {
            setToken("");
            setWidgetError("Verification expired. Please complete it again.");
          },
          "error-callback": () => {
            setToken("");
            setWidgetError("Verification failed to load. Please retry.");
          },
        });
        widgetIdRef.current = nextWidgetId;
        setWidgetReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setWidgetError("Verification failed to load. Please retry.");
      });

    return () => {
      cancelled = true;
      const currentWidgetId = widgetIdRef.current;
      if (currentWidgetId && window.turnstile?.remove) {
        try {
          window.turnstile.remove(currentWidgetId);
        } catch {
          // no-op
        }
      }
    };
  }, [siteKey]);

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
    if (widgetIdRef.current && window.turnstile?.reset) {
      try {
        window.turnstile.reset(widgetIdRef.current);
      } catch {
        // no-op
      }
    }
    setToken("");
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
        <Input
          type="email"
          autoComplete="email"
          className={`h-9 ${errors.email ? "border-red-500" : ""}`}
          {...register("email")}
        />
        {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
        {!errors.email && emailCheckError && <p className="text-xs text-red-500">{emailCheckError}</p>}
        <div className="min-h-[65px]">
          {siteKey ? <div ref={containerRef} className="min-h-[65px]" /> : <p className="text-xs text-muted-foreground">Human verification unavailable.</p>}
        </div>
        {widgetError && <p className="text-xs text-red-500">{widgetError}</p>}
        <Button
          type="submit"
          className="h-10 w-full"
          disabled={!isValid || !registeredEmail || checkingEmail || requestState === "sending" || !widgetReady || !token}
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

export default ResetPasswordInline;
