import type { SupabaseClient } from "@supabase/supabase-js";

type NativeBridgeMessage =
  | {
      type: "huddle-open-external-url";
      url: string;
      context?: string;
    }
  | {
      type: "huddle-pick-files";
      requestId: string;
      accept?: string;
      multiple?: boolean;
      source?: "any" | "camera" | "photo-library";
    }
  | {
      type: "huddle-request-push-registration";
      requestId: string;
      forcePrompt?: boolean;
    }
  | {
      type: "huddle-auth-state";
      signedIn: boolean;
      userId?: string | null;
    };

type NativeBridgePayload = {
  type?: string;
  requestId?: string;
  url?: string;
  files?: NativePickedFile[];
  granted?: boolean;
  token?: string | null;
  platform?: string | null;
  error?: string | null;
  denied?: boolean;
};

type NativeBridgeEventDetail = NativeBridgePayload;

export type NativePickedFile = {
  name?: string | null;
  type?: string | null;
  uri?: string | null;
  base64?: string | null;
  lastModified?: number | null;
};

export type NativePushRegistrationResult = {
  granted: boolean;
  token: string | null;
  platform: "ios" | "android" | "web";
};

type NativePushRegistrationRequestOptions = {
  forcePrompt?: boolean;
};

type PickFilesOptions = {
  accept?: string;
  multiple?: boolean;
  source?: "any" | "camera" | "photo-library";
};

const PENDING_EXTERNAL_FLOW_KEY = "huddle:native:pending-external-flow";
const NATIVE_DEVICE_ID_KEY = "huddle:native:device-id";

declare global {
  interface Window {
    ReactNativeWebView?: {
      postMessage: (message: string) => void;
    };
    webkit?: {
      messageHandlers?: Record<string, { postMessage: (message: unknown) => void }>;
    };
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

const postNativeMessage = (payload: NativeBridgeMessage) => {
  const serialized = JSON.stringify(payload);
  if (typeof window.ReactNativeWebView?.postMessage === "function") {
    window.ReactNativeWebView.postMessage(serialized);
    return true;
  }
  const handler = window.webkit?.messageHandlers?.huddle;
  if (handler && typeof handler.postMessage === "function") {
    handler.postMessage(payload);
    return true;
  }
  return false;
};

const parseNativeBridgePayload = (input: unknown): NativeBridgePayload | null => {
  if (typeof input === "string") {
    try {
      return parseNativeBridgePayload(JSON.parse(input));
    } catch {
      return null;
    }
  }
  if (!isRecord(input)) return null;
  return {
    type: typeof input.type === "string" ? input.type : undefined,
    requestId: typeof input.requestId === "string" ? input.requestId : undefined,
    url: typeof input.url === "string" ? input.url : undefined,
    files: Array.isArray(input.files) ? (input.files as NativePickedFile[]) : undefined,
    granted: input.granted === true,
    token: typeof input.token === "string" ? input.token : null,
    platform: typeof input.platform === "string" ? input.platform : null,
    error: typeof input.error === "string" ? input.error : null,
    denied: input.denied === true,
  };
};

const waitForBridgeResponse = <T extends NativeBridgePayload>(
  matcher: (payload: NativeBridgePayload) => payload is T,
  timeoutMs = 45_000,
) =>
  new Promise<T>((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("huddle:native-message", onCustomEvent as EventListener);
    };

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn();
    };

    const onPayload = (payload: NativeBridgePayload | null) => {
      if (!payload || !matcher(payload)) return;
      finish(() => resolve(payload));
    };

    const onMessage = (event: MessageEvent) => {
      onPayload(parseNativeBridgePayload(event.data));
    };

    const onCustomEvent = (event: Event) => {
      const detail = (event as CustomEvent<NativeBridgeEventDetail>).detail;
      onPayload(parseNativeBridgePayload(detail));
    };

    window.addEventListener("message", onMessage);
    window.addEventListener("huddle:native-message", onCustomEvent as EventListener);

    window.setTimeout(() => {
      finish(() => reject(new Error("native_bridge_timeout")));
    }, timeoutMs);
  });

const createBrowserFileInput = async ({
  accept,
  multiple,
  source,
}: PickFilesOptions): Promise<File[]> => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = accept || "*/*";
  input.multiple = Boolean(multiple);
  if (source === "camera") {
    input.capture = "user";
  }
  return new Promise<File[]>((resolve) => {
    input.onchange = () => {
      resolve(Array.from(input.files || []));
      input.remove();
    };
    input.click();
  });
};

const fileFromNativePickedFile = async (file: NativePickedFile, index: number): Promise<File | null> => {
  const name = String(file.name || `native-upload-${index + 1}`);
  const type = String(file.type || "application/octet-stream");
  const lastModified = Number.isFinite(file.lastModified) ? Number(file.lastModified) : Date.now();

  if (file.base64) {
    const response = await fetch(`data:${type};base64,${file.base64}`);
    const blob = await response.blob();
    return new File([blob], name, { type: blob.type || type, lastModified });
  }

  if (file.uri) {
    const response = await fetch(file.uri);
    const blob = await response.blob();
    return new File([blob], name, { type: blob.type || type, lastModified });
  }

  return null;
};

const openViaWindow = (url: string) => {
  window.location.assign(url);
};

export const hasNativeShell = () => {
  return typeof window !== "undefined" && (
    typeof window.ReactNativeWebView?.postMessage === "function"
    || typeof window.webkit?.messageHandlers?.huddle?.postMessage === "function"
  );
};

export const syncNativeAuthState = (signedIn: boolean, userId?: string | null) => {
  if (!hasNativeShell()) return;
  postNativeMessage({
    type: "huddle-auth-state",
    signedIn,
    userId: userId || null,
  });
};

export const beginExternalFlow = (context: string, url: string) => {
  try {
    sessionStorage.setItem(
      PENDING_EXTERNAL_FLOW_KEY,
      JSON.stringify({
        context,
        startedAt: Date.now(),
        from: `${window.location.pathname}${window.location.search}`,
        url,
      }),
    );
  } catch {
    // best effort only
  }
};

export const clearPendingExternalFlow = () => {
  try {
    sessionStorage.removeItem(PENDING_EXTERNAL_FLOW_KEY);
  } catch {
    // best effort only
  }
};

export const readPendingExternalFlow = (): { context: string; startedAt: number; from: string; url: string } | null => {
  try {
    const raw = sessionStorage.getItem(PENDING_EXTERNAL_FLOW_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<{ context: string; startedAt: number; from: string; url: string }>;
    if (typeof parsed.context !== "string" || typeof parsed.url !== "string") return null;
    return {
      context: parsed.context,
      startedAt: Number.isFinite(parsed.startedAt) ? Number(parsed.startedAt) : 0,
      from: typeof parsed.from === "string" ? parsed.from : "/",
      url: parsed.url,
    };
  } catch {
    return null;
  }
};

export const openExternalUrl = (url: string, context = "external") => {
  beginExternalFlow(context, url);
  if (hasNativeShell() && postNativeMessage({ type: "huddle-open-external-url", url, context })) {
    return;
  }
  openViaWindow(url);
};

export const pickFiles = async (options: PickFilesOptions = {}): Promise<File[]> => {
  if (!hasNativeShell()) {
    return createBrowserFileInput(options);
  }

  const requestId = crypto.randomUUID();
  const responsePromise = waitForBridgeResponse(
    (payload): payload is NativeBridgePayload =>
      payload.type === "huddle-native-files" && payload.requestId === requestId,
  );

  const posted = postNativeMessage({
    type: "huddle-pick-files",
    requestId,
    accept: options.accept,
    multiple: options.multiple,
    source: options.source,
  });

  if (!posted) {
    return createBrowserFileInput(options);
  }

  try {
    const response = await responsePromise;
    const nativeFiles = Array.isArray(response.files) ? response.files : [];
    const resolved = await Promise.all(nativeFiles.map((file, index) => fileFromNativePickedFile(file, index)));
    return resolved.filter((entry): entry is File => entry instanceof File);
  } catch {
    return createBrowserFileInput(options);
  }
};

export const requestNativePushRegistration = async (
  options: NativePushRegistrationRequestOptions = {},
): Promise<NativePushRegistrationResult> => {
  if (!hasNativeShell()) {
    if (typeof Notification !== "undefined" && typeof Notification.requestPermission === "function") {
      const permission = await Notification.requestPermission();
      return {
        granted: permission === "granted",
        token: null,
        platform: "web",
      };
    }
    return {
      granted: false,
      token: null,
      platform: "web",
    };
  }

  const requestId = crypto.randomUUID();
  const responsePromise = waitForBridgeResponse(
    (payload): payload is NativeBridgePayload =>
      payload.type === "huddle-native-push-registration" && payload.requestId === requestId,
    30_000,
  );

  const posted = postNativeMessage({
    type: "huddle-request-push-registration",
    requestId,
    forcePrompt: options.forcePrompt,
  });

  if (!posted) {
    return {
      granted: false,
      token: null,
      platform: "web",
    };
  }

  const response = await responsePromise;
  return {
    granted: response.granted === true && !response.denied,
    token: response.token || null,
    platform: response.platform === "ios" || response.platform === "android" ? response.platform : "web",
  };
};

export const getOrCreateNativeDeviceId = () => {
  try {
    const existing = localStorage.getItem(NATIVE_DEVICE_ID_KEY);
    if (existing) return existing;
    const next = crypto.randomUUID();
    localStorage.setItem(NATIVE_DEVICE_ID_KEY, next);
    return next;
  } catch {
    return crypto.randomUUID();
  }
};

export const upsertPushRegistration = async (
  supabase: SupabaseClient,
  userId: string,
  registration: NativePushRegistrationResult,
) => {
  if (!registration.token) return;
  const deviceId = getOrCreateNativeDeviceId();
  const platform = registration.platform === "ios" || registration.platform === "android"
    ? registration.platform
    : "web";

  await supabase
    .from("push_tokens")
    .upsert(
      {
        user_id: userId,
        token: registration.token,
        platform,
        device_id: deviceId,
        is_active: true,
        last_used_at: new Date().toISOString(),
      },
      { onConflict: "user_id,token" },
    );

  await supabase
    .from("profiles")
    .update({
      fcm_token: registration.token,
    } as Record<string, unknown>)
    .eq("id", userId);
};

const toInternalPath = (url: URL) => {
  let pathname = url.pathname || "/";
  if (!/^https?:$/i.test(url.protocol)) {
    const host = url.hostname ? `/${url.hostname}` : "";
    pathname = `${host}${pathname === "/" ? "" : pathname}` || "/";
  }
  return `${pathname}${url.search}${url.hash}`;
};

export const normalizeInboundUrlToAppPath = (rawUrl: string): string | null => {
  const trimmed = String(rawUrl || "").trim();
  if (!trimmed) return null;

  try {
    const hasExplicitScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed);
    const parsed = hasExplicitScheme
      ? new URL(trimmed)
      : new URL(trimmed, window.location.origin);
    return toInternalPath(parsed);
  } catch {
    if (trimmed.startsWith("/")) return trimmed;
    return null;
  }
};

export const isReturnLikePath = (path: string) => {
  const normalized = path.toLowerCase();
  return normalized.includes("/auth/callback")
    || normalized.includes("/verify")
    || normalized.includes("/join/")
    || normalized.includes("/map")
    || normalized.includes("plan_done=1")
    || normalized.includes("addon_done=1")
    || normalized.includes("paid=1")
    || normalized.includes("paid=0");
};
