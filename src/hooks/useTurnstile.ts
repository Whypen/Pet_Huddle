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
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
    __huddleTurnstileDiag?: {
      nextInstanceId: number;
      routes: Record<string, {
        hookInstanceCount: number;
        maxHookInstanceCount: number;
        renderCount: number;
        widgetIds: string[];
        actions: string[];
        callbackFired: boolean;
        errorCallbackFired: boolean;
        expiredCallbackFired: boolean;
        tokenLengthAtCallback: number;
        tokenLengthAtSubmit: number;
        events: Array<{ type: string; action: string; tokenLength?: number; widgetId?: string | null }>;
      }>;
    };
  }
}

const TURNSTILE_SCRIPT_ID = "cf-turnstile-script";
const TURNSTILE_SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

let turnstileScriptPromise: Promise<void> | null = null;

function getTurnstileDiagRouteKey() {
  if (typeof window === "undefined") return "server";
  return window.location.pathname || "unknown";
}

function getTurnstileDiagRoute(action: string) {
  if (typeof window === "undefined") return null;
  if (!window.__huddleTurnstileDiag) {
    window.__huddleTurnstileDiag = { nextInstanceId: 1, routes: {} };
  }
  const routeKey = getTurnstileDiagRouteKey();
  if (!window.__huddleTurnstileDiag.routes[routeKey]) {
    window.__huddleTurnstileDiag.routes[routeKey] = {
      hookInstanceCount: 0,
      maxHookInstanceCount: 0,
      renderCount: 0,
      widgetIds: [],
      actions: [],
      callbackFired: false,
      errorCallbackFired: false,
      expiredCallbackFired: false,
      tokenLengthAtCallback: 0,
      tokenLengthAtSubmit: 0,
      events: [],
    };
  }
  const route = window.__huddleTurnstileDiag.routes[routeKey];
  if (!route.actions.includes(action)) route.actions.push(action);
  return route;
}

function recordTurnstileDiag(action: string, type: string, details: { tokenLength?: number; widgetId?: string | null } = {}) {
  const route = getTurnstileDiagRoute(action);
  if (!route) return;
  route.events.push({ type, action, ...details });
  if (route.events.length > 20) route.events = route.events.slice(-20);
}

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
  const instanceIdRef = useRef<number>(0);
  const env = getClientEnv();
  const siteKey = String(env.turnstileSiteKey || "").trim();
  const enabled = Boolean(siteKey);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tokenRef = useRef<string>("");
  const issuedAtRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const renderedContainerRef = useRef<HTMLDivElement | null>(null);
  const renderingRef = useRef(false);
  const actionRef = useRef(action);
  const storeTokenRef = useRef<(nextToken: string | null) => void>(() => undefined);
  const setErrorRef = useRef(setError);

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
      const route = getTurnstileDiagRoute(actionRef.current);
      if (route) route.tokenLengthAtSubmit = fromDom.length;
      recordTurnstileDiag(actionRef.current, "get-token-dom", { tokenLength: fromDom.length });
      return fromDom;
    }
    const route = getTurnstileDiagRoute(actionRef.current);
    if (route) route.tokenLengthAtSubmit = 0;
    recordTurnstileDiag(actionRef.current, "get-token-empty", { tokenLength: 0 });
    return "";
  }, [readTokenFromDom, storeToken]);

  useEffect(() => {
    actionRef.current = action;
    tokenRef.current = "";
    issuedAtRef.current = 0;
    setToken(null);
    setError(null);
    setReady(false);
  }, [action]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.__huddleTurnstileDiag) {
      window.__huddleTurnstileDiag = { nextInstanceId: 1, routes: {} };
    }
    if (!instanceIdRef.current) {
      instanceIdRef.current = window.__huddleTurnstileDiag.nextInstanceId++;
    }
    const route = getTurnstileDiagRoute(actionRef.current);
    if (!route) return;
    route.hookInstanceCount += 1;
    route.maxHookInstanceCount = Math.max(route.maxHookInstanceCount, route.hookInstanceCount);
    recordTurnstileDiag(actionRef.current, 'hook-mount', { widgetId: String(instanceIdRef.current) });
    return () => {
      const currentRoute = getTurnstileDiagRoute(actionRef.current);
      if (!currentRoute) return;
      currentRoute.hookInstanceCount = Math.max(0, currentRoute.hookInstanceCount - 1);
      recordTurnstileDiag(actionRef.current, 'hook-unmount', { widgetId: String(instanceIdRef.current) });
    };
  }, []);

  useEffect(() => {
    containerRef.current = container;
  }, [container]);

  useEffect(() => {
    storeTokenRef.current = storeToken;
    setErrorRef.current = setError;
  }, [storeToken]);

  const removeWidget = useCallback((targetContainer?: HTMLDivElement | null) => {
    const currentWidgetId = widgetIdRef.current;
    if (currentWidgetId && window.turnstile) {
      try {
        window.turnstile.remove(currentWidgetId);
      } catch {
        // no-op
      }
    }
    const containerToClear = targetContainer ?? renderedContainerRef.current;
    if (containerToClear) {
      containerToClear.innerHTML = "";
    }
    widgetIdRef.current = null;
    renderedContainerRef.current = null;
    renderingRef.current = false;
  }, []);

  useEffect(() => {
    if (!enabled || !container) return;
    let cancelled = false;

    if (renderingRef.current) {
      recordTurnstileDiag(actionRef.current, "render-skip-rendering", { widgetId: widgetIdRef.current });
      return;
    }
    if (widgetIdRef.current && renderedContainerRef.current === container) {
      recordTurnstileDiag(actionRef.current, "render-skip-existing", { widgetId: widgetIdRef.current });
      return;
    }

    if (widgetIdRef.current && renderedContainerRef.current && renderedContainerRef.current !== container) {
      removeWidget(renderedContainerRef.current);
    }

    renderingRef.current = true;

    void loadTurnstileScript()
      .then(() => {
        if (cancelled || !window.turnstile) {
          renderingRef.current = false;
          return;
        }
        if (widgetIdRef.current && renderedContainerRef.current === container) {
          renderingRef.current = false;
          return;
        }
        container.innerHTML = "";
        const route = getTurnstileDiagRoute(actionRef.current);
        if (route) route.renderCount += 1;
        recordTurnstileDiag(actionRef.current, "render-call", { widgetId: widgetIdRef.current });
        const nextWidgetId = window.turnstile.render(container, {
          sitekey: siteKey,
          action: actionRef.current,
          theme: "light",
          retry: "auto",
          "retry-interval": 800,
          "refresh-expired": "auto",
          "refresh-timeout": "auto",
          callback: (nextToken) => {
            const route = getTurnstileDiagRoute(actionRef.current);
            if (route) {
              route.callbackFired = true;
              route.tokenLengthAtCallback = String(nextToken || "").trim().length;
            }
            recordTurnstileDiag(actionRef.current, "callback", { tokenLength: String(nextToken || "").trim().length, widgetId: nextWidgetId });
            storeTokenRef.current(nextToken);
            setErrorRef.current(null);
          },
          "expired-callback": () => {
            const route = getTurnstileDiagRoute(actionRef.current);
            if (route) route.expiredCallbackFired = true;
            recordTurnstileDiag(actionRef.current, "expired-callback", { widgetId: nextWidgetId });
            storeTokenRef.current(null);
            setErrorRef.current("Verification expired. Please complete it again.");
          },
          "error-callback": () => {
            const route = getTurnstileDiagRoute(actionRef.current);
            if (route) route.errorCallbackFired = true;
            recordTurnstileDiag(actionRef.current, "error-callback", { widgetId: nextWidgetId });
            storeTokenRef.current(null);
            setErrorRef.current("Verification failed to load. Please retry.");
          },
        });
        widgetIdRef.current = nextWidgetId;
        renderedContainerRef.current = container;
        const nextRoute = getTurnstileDiagRoute(actionRef.current);
        if (nextRoute && !nextRoute.widgetIds.includes(nextWidgetId)) nextRoute.widgetIds.push(nextWidgetId);
        recordTurnstileDiag(actionRef.current, "render-success", { widgetId: nextWidgetId });
        renderingRef.current = false;
      })
      .catch(() => {
        if (cancelled) return;
        renderingRef.current = false;
        recordTurnstileDiag(actionRef.current, "render-error");
        setError("Verification failed to load. Please retry.");
        setReady(false);
      });

    return () => {
      cancelled = true;
      if (renderedContainerRef.current === container) {
        removeWidget(container);
      }
    };
  }, [container, enabled, removeWidget, siteKey]);

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
    recordTurnstileDiag(actionRef.current, "reset");
    storeToken(null);
    const currentWidgetId = widgetIdRef.current;
    if (currentWidgetId && window.turnstile) {
      try {
        window.turnstile.reset(currentWidgetId);
        const domToken = readTokenFromDom();
        if (domToken) storeToken(domToken);
        recordTurnstileDiag(actionRef.current, "reset-dom-token", { tokenLength: domToken.length, widgetId: currentWidgetId });
      } catch {
        recordTurnstileDiag(actionRef.current, "reset-error", { widgetId: currentWidgetId });
        setError("Verification failed to reset. Refresh and try again.");
      }
    }
  }, [readTokenFromDom, storeToken]);

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
