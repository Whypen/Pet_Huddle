import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
      execute?: (widgetId?: string) => void;
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

function triggerTurnstileExecution(widgetId: string | null) {
  if (!widgetId || typeof window === "undefined" || !window.turnstile) return;
  const maybeExecute = window.turnstile.execute;
  if (typeof maybeExecute !== "function") return;
  try {
    maybeExecute(widgetId);
  } catch {
    // no-op: some widget modes do not support explicit execute
  }
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
  const tokenRef = useRef<string>("");
  const issuedAtRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const storeToken = useCallback((nextToken: string | null) => {
    const normalized = String(nextToken || "").trim();
    tokenRef.current = normalized;
    issuedAtRef.current = normalized ? Date.now() : 0;
    setToken(normalized || null);
    setReady(Boolean(normalized));
  }, []);

  const readTokenFromDom = useCallback(() => {
    const root = containerRef.current;
    if (!root) return "";
    const field = root.querySelector<HTMLInputElement | HTMLTextAreaElement>(
      'input[name="cf-turnstile-response"], textarea[name="cf-turnstile-response"]',
    );
    return String(field?.value || field?.textContent || "").trim();
  }, []);

  const getToken = useCallback(() => {
    const fromState = String(tokenRef.current || "").trim();
    if (fromState) return fromState;
    const fromDom = readTokenFromDom();
    if (fromDom) {
      storeToken(fromDom);
      return fromDom;
    }
    return "";
  }, [readTokenFromDom, storeToken]);

  useEffect(() => {
    tokenRef.current = "";
    issuedAtRef.current = 0;
    setToken(null);
    setError(null);
    setReady(false);
  }, [action]);

  useEffect(() => {
    containerRef.current = container;
  }, [container]);

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
          retry: "auto",
          "retry-interval": 800,
          "refresh-expired": "auto",
          "refresh-timeout": "auto",
          callback: (nextToken) => {
            storeToken(nextToken);
            setError(null);
          },
          "expired-callback": () => {
            storeToken(null);
            setError("Verification expired. Please complete it again.");
          },
          "error-callback": () => {
            storeToken(null);
            setError("Verification failed to load. Please retry.");
          },
        });
        setWidgetId(localWidgetId);
        // Some widget modes require explicit execution before a token is issued.
        triggerTurnstileExecution(localWidgetId);
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
  }, [action, container, enabled, siteKey, storeToken]);

  useEffect(() => {
    if (!enabled || !container) return;
    const sync = () => {
      const domToken = readTokenFromDom();
      if (domToken && domToken !== tokenRef.current) {
        storeToken(domToken);
        setError(null);
      }
    };
    sync();
    const interval = window.setInterval(sync, 350);
    const observer = new MutationObserver(sync);
    observer.observe(container, { childList: true, subtree: true, attributes: true, characterData: true });
    return () => {
      window.clearInterval(interval);
      observer.disconnect();
    };
  }, [container, enabled, readTokenFromDom, storeToken]);

  const reset = useCallback(() => {
    storeToken(null);
    if (widgetId && window.turnstile) {
      try {
        window.turnstile.reset(widgetId);
        triggerTurnstileExecution(widgetId);
        const domToken = readTokenFromDom();
        if (domToken) storeToken(domToken);
      } catch {
        setError("Verification failed to reset. Refresh and try again.");
      }
    }
  }, [readTokenFromDom, storeToken, widgetId]);

  const isTokenUsable = useMemo(() => {
    const current = String(token || "").trim() || readTokenFromDom();
    if (!current) return false;
    if (!tokenRef.current && current) {
      tokenRef.current = current;
      issuedAtRef.current = issuedAtRef.current || Date.now();
    }
    const ageMs = Date.now() - issuedAtRef.current;
    return ageMs >= 0 && ageMs < 4 * 60 * 1000;
  }, [readTokenFromDom, token]);

  const state = useMemo(
    () => ({
      enabled,
      token,
      ready,
      isTokenUsable,
      error,
      siteKeyMissing: !enabled,
    }),
    [enabled, token, ready, isTokenUsable, error],
  );

  return {
    ...state,
    setContainer,
    getToken,
    reset,
  };
}
