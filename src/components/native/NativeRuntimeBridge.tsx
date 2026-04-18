import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import {
  clearPendingExternalFlow,
  hasNativeShell,
  isReturnLikePath,
  normalizeInboundUrlToAppPath,
  readPendingExternalFlow,
  requestNativePushRegistration,
  syncNativeAuthState,
  upsertPushRegistration,
} from "@/lib/nativeShell";
import { supabase } from "@/integrations/supabase/client";

const REFRESH_THROTTLE_MS = 4_000;

export const NativeRuntimeBridge = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { user, refreshProfile } = useAuth();
  const lastResumeRefreshRef = useRef(0);

  useEffect(() => {
    syncNativeAuthState(Boolean(user?.id), user?.id ?? null);
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || !hasNativeShell()) return;
    let active = true;
    void (async () => {
      try {
        const registration = await requestNativePushRegistration();
        if (!active || !registration.token) return;
        await upsertPushRegistration(supabase, user.id, registration);
      } catch {
        // best effort only
      }
    })();
    return () => {
      active = false;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!hasNativeShell()) return;

    const handleInbound = (rawUrl: string | null | undefined) => {
      const nextPath = normalizeInboundUrlToAppPath(rawUrl || "");
      if (!nextPath) return;
      const currentPath = `${location.pathname}${location.search}${location.hash}`;
      if (currentPath === nextPath) return;
      navigate(nextPath, { replace: isReturnLikePath(nextPath) });
    };

    const onMessage = (event: MessageEvent) => {
      const payload = event.data as { type?: unknown; url?: unknown } | null;
      if (!payload || payload.type !== "huddle-native-link" || typeof payload.url !== "string") return;
      handleInbound(payload.url);
    };

    const onCustom = (event: Event) => {
      const detail = (event as CustomEvent<{ url?: string }>).detail;
      if (!detail || typeof detail.url !== "string") return;
      handleInbound(detail.url);
    };

    window.addEventListener("message", onMessage);
    window.addEventListener("huddle:native-link", onCustom as EventListener);
    return () => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("huddle:native-link", onCustom as EventListener);
    };
  }, [location.hash, location.pathname, location.search, navigate]);

  useEffect(() => {
    const currentPath = `${location.pathname}${location.search}${location.hash}`;
    if (!isReturnLikePath(currentPath)) return;
    if (!readPendingExternalFlow()) return;
    clearPendingExternalFlow();
    void refreshProfile();
    void queryClient.invalidateQueries();
  }, [location.hash, location.pathname, location.search, queryClient, refreshProfile]);

  useEffect(() => {
    const refreshRuntimeState = () => {
      const now = Date.now();
      if (now - lastResumeRefreshRef.current < REFRESH_THROTTLE_MS) return;
      lastResumeRefreshRef.current = now;
      if (document.visibilityState === "hidden") return;
      void refreshProfile();
      void queryClient.invalidateQueries();
    };

    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      refreshRuntimeState();
    };

    const onFocus = () => {
      refreshRuntimeState();
    };

    const onNativeResume = () => {
      refreshRuntimeState();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    window.addEventListener("huddle:native-resume", onNativeResume as EventListener);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("huddle:native-resume", onNativeResume as EventListener);
    };
  }, [queryClient, refreshProfile]);

  return null;
};
