import { useEffect, useMemo, useRef, useState } from "react";
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
    };
    __huddleTurnstileHealthResetAction?: {
      widgetRendered: boolean;
      callbackFired: boolean;
      errorCallbackFired: boolean;
      expiredCallbackFired: boolean;
      tokenLength: number;
      widgetId: string | null;
    };
  }
}

const SCRIPT_ID = "cf-turnstile-health-resetaction-script";
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

const TurnstileHealthResetAction = () => {
  const siteKey = String(getClientEnv().turnstileSiteKey || "").trim();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [widgetRendered, setWidgetRendered] = useState(false);
  const [callbackFired, setCallbackFired] = useState(false);
  const [errorCallbackFired, setErrorCallbackFired] = useState(false);
  const [expiredCallbackFired, setExpiredCallbackFired] = useState(false);
  const [tokenLength, setTokenLength] = useState(0);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [widgetId, setWidgetId] = useState<string | null>(null);

  useEffect(() => {
    window.__huddleTurnstileHealthResetAction = {
      widgetRendered: false,
      callbackFired: false,
      errorCallbackFired: false,
      expiredCallbackFired: false,
      tokenLength: 0,
      widgetId: null,
    };
  }, []);

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
          callback: (token) => {
            const nextLength = String(token || "").trim().length;
            setCallbackFired(true);
            setTokenLength(nextLength);
            if (window.__huddleTurnstileHealthResetAction) {
              window.__huddleTurnstileHealthResetAction.callbackFired = true;
              window.__huddleTurnstileHealthResetAction.tokenLength = nextLength;
            }
          },
          "error-callback": () => {
            setErrorCallbackFired(true);
            if (window.__huddleTurnstileHealthResetAction) {
              window.__huddleTurnstileHealthResetAction.errorCallbackFired = true;
            }
          },
          "expired-callback": () => {
            setExpiredCallbackFired(true);
            if (window.__huddleTurnstileHealthResetAction) {
              window.__huddleTurnstileHealthResetAction.expiredCallbackFired = true;
            }
          },
        });

        widgetIdRef.current = nextWidgetId;
        setWidgetId(nextWidgetId);
        setScriptLoaded(true);
        setWidgetRendered(true);
        if (window.__huddleTurnstileHealthResetAction) {
          window.__huddleTurnstileHealthResetAction.widgetRendered = true;
          window.__huddleTurnstileHealthResetAction.widgetId = nextWidgetId;
        }
      })
      .catch(() => {
        setScriptLoaded(false);
      });

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile?.remove) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // no-op
        }
      }
    };
  }, [siteKey]);

  const rows = useMemo(
    () => [
      ["widget rendered", widgetRendered ? "yes" : "no"],
      ["callback fired", callbackFired ? "yes" : "no"],
      ["error-callback fired", errorCallbackFired ? "yes" : "no"],
      ["expired-callback fired", expiredCallbackFired ? "yes" : "no"],
      ["token length", String(tokenLength)],
      ["widget id", widgetId ?? "none"],
      ["site key present", siteKey ? "yes" : "no"],
      ["script loaded", scriptLoaded ? "yes" : "no"],
    ],
    [callbackFired, errorCallbackFired, expiredCallbackFired, scriptLoaded, siteKey, tokenLength, widgetId, widgetRendered],
  );

  return (
    <div className="min-h-svh bg-background px-6 py-10 text-brandText">
      <div className="mx-auto max-w-md space-y-6 rounded-3xl bg-white/90 p-6 shadow-[0_20px_60px_rgba(70,90,130,0.18)]">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">Turnstile Health Reset Action</h1>
          <p className="text-sm text-muted-foreground">Minimal live widget probe using the reset_password action.</p>
        </div>

        <div ref={containerRef} className="min-h-[72px]" />

        <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-4">
              <span className="text-slate-600">{label}</span>
              <span className="font-medium text-brandText">{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default TurnstileHealthResetAction;
