import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
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

export const NativeRuntimeBridge = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, refreshProfile } = useAuth();

  useEffect(() => {
    syncNativeAuthState(Boolean(user?.id), user?.id ?? null);
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || !hasNativeShell()) return;
    let active = true;
    void (async () => {
      try {
        const { data } = await supabase
          .from("notification_preferences")
          .select("push_enabled,pause_all")
          .eq("user_id", user.id)
          .maybeSingle();
        const prefs = (data || {}) as { push_enabled?: boolean | null; pause_all?: boolean | null };
        const shouldRegisterPush = prefs.push_enabled !== false && prefs.pause_all !== true;
        if (!shouldRegisterPush) return;
        const registration = await requestNativePushRegistration({ forcePrompt: true });
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
  }, [location.hash, location.pathname, location.search, refreshProfile]);

  return null;
};
