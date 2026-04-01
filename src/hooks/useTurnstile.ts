import { useCallback, useEffect, useMemo, useState } from "react";
import { getClientEnv } from "@/lib/env";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          action?: string;
          callback?: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
        },
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
  }
}

const TURNSTILE_SCRIPT_ID = "cf-turnstile-script";
const TURNSTILE_SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

let turnstileScriptPromise: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (turnstileScriptPromise) return turnstileScriptPromise;

  turnstileScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(TURNSTILE_SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("turnstile_script_failed")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = TURNSTILE_SCRIPT_ID;
    script.src = TURNSTILE_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("turnstile_script_failed"));
    document.head.appendChild(script);
  });

  return turnstileScriptPromise;
}

export function useTurnstile(action: string) {
  const env = getClientEnv();
  const siteKey = String(env.turnstileSiteKey || "").trim();
  const enabled = Boolean(siteKey);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [widgetId, setWidgetId] = useState<string | null>(null);

  useEffect(() => {
    setToken(null);
    setError(null);
    setReady(false);
  }, [action]);

  useEffect(() => {
    if (!enabled || !container) return;
    let cancelled = false;
    let localWidgetId: string | null = null;

    void loadTurnstileScript()
      .then(() => {
        if (cancelled || !window.turnstile) return;
        container.innerHTML = "";
        localWidgetId = window.turnstile.render(container, {
          sitekey: siteKey,
          action,
          theme: "light",
          callback: (nextToken) => {
            setToken(nextToken);
            setError(null);
            setReady(true);
          },
          "expired-callback": () => {
            setToken(null);
            setReady(false);
            setError("Verification expired. Please complete it again.");
          },
          "error-callback": () => {
            setToken(null);
            setReady(false);
            setError("Verification failed to load. Please retry.");
          },
        });
        setWidgetId(localWidgetId);
      })
      .catch(() => {
        if (cancelled) return;
        setError("Verification failed to load. Please retry.");
        setReady(false);
      });

    return () => {
      cancelled = true;
      if (localWidgetId && window.turnstile) {
        try {
          window.turnstile.remove(localWidgetId);
        } catch {
          // no-op
        }
      }
    };
  }, [action, container, enabled, siteKey]);

  const reset = useCallback(() => {
    setToken(null);
    setReady(false);
    if (widgetId && window.turnstile) {
      try {
        window.turnstile.reset(widgetId);
      } catch {
        setError("Verification failed to reset. Refresh and try again.");
      }
    }
  }, [widgetId]);

  const state = useMemo(
    () => ({
      enabled,
      token,
      ready,
      error,
      siteKeyMissing: !enabled,
    }),
    [enabled, token, ready, error],
  );

  return {
    ...state,
    setContainer,
    reset,
  };
}
