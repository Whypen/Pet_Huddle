import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { authResetPassword } from "@/lib/publicAuthApi";
import { getClientEnv } from "@/lib/env";

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
  email: z.string().email("Invalid email format"),
});

type FormData = z.infer<typeof schema>;

const SCRIPT_ID = "cf-turnstile-reset-inline-healthaction-script";
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const ACTION = "turnstile_health";

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

const ResetPasswordInlineHealthAction = () => {
  const navigate = useNavigate();
  const siteKey = String(getClientEnv().turnstileSiteKey || "").trim();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [token, setToken] = useState("");
  const [widgetReady, setWidgetReady] = useState(false);
  const [widgetError, setWidgetError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isValid } } = useForm<FormData>({
    resolver: zodResolver(schema),
    mode: "onChange",
  });

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

  const onSubmit = async (values: FormData) => {
    if (!token) {
      toast.error("Complete human verification first.");
      return;
    }
    const { error } = await authResetPassword({
      email: values.email,
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
        <Input type="email" className={`h-9 ${errors.email ? "border-red-500" : ""}`} {...register("email")} />
        {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
        <div className="min-h-[65px]">
          {siteKey ? <div ref={containerRef} className="min-h-[65px]" /> : <p className="text-xs text-muted-foreground">Human verification unavailable.</p>}
        </div>
        {widgetError && <p className="text-xs text-red-500">{widgetError}</p>}
        <Button type="submit" className="w-full h-10" disabled={!isValid || !widgetReady || !token}>Send reset link</Button>
      </form>
    </div>
  );
};

export default ResetPasswordInlineHealthAction;
