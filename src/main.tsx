import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

if (import.meta.env.DEV && import.meta.env.VITE_UAT_DEBUG === "true") {
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input.url;
    if (url.includes("/rest/v1/broadcast_alerts")) {
      const headers = new Headers(init?.headers || (typeof input === "string" ? undefined : input.headers));
      const auth = headers.get("Authorization");
      const apikey = headers.get("apikey");
      if (import.meta.env.DEV) console.debug("[UAT_FETCH]", {
        method: init?.method || (typeof input === "string" ? "GET" : input.method),
        url,
        hasAuthorizationHeader: Boolean(auth),
        apikeyPrefix: apikey ? apikey.slice(0, 8) : "missing",
      });
    }
    return originalFetch(input, init);
  };
}

createRoot(document.getElementById("root")!).render(<App />);

const SW_RESET_GUARD = "huddle:sw-reset-v2";
const hasAuthRedirectParams = () => {
  const url = new URL(window.location.href);
  const hashParams = new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : url.hash);
  return Boolean(
    url.searchParams.get("code")
    || url.searchParams.get("token_hash")
    || url.searchParams.get("access_token")
    || hashParams.get("code")
    || hashParams.get("token_hash")
    || hashParams.get("access_token")
    || hashParams.get("refresh_token"),
  );
};
const shouldSkipServiceWorkerResetReload = () =>
  window.location.pathname === "/auth/callback"
  || window.location.pathname === "/update-password"
  || hasAuthRedirectParams();

const resetServiceWorkerCachesOnce = async () => {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  try {
    if (shouldSkipServiceWorkerResetReload()) return;
    if (sessionStorage.getItem(SW_RESET_GUARD) === "1") return;
    sessionStorage.setItem(SW_RESET_GUARD, "1");
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
    window.location.reload();
  } catch (error) {
    console.warn("Service worker reset failed:", error);
  }
};
const ENABLE_AUTOMATIC_RUNTIME_RELOAD = true;
if (ENABLE_AUTOMATIC_RUNTIME_RELOAD) {
  void resetServiceWorkerCachesOnce();
}

const CHUNK_RELOAD_ATTEMPTS_KEY = "huddle:chunk-reload-attempts";
const CHUNK_RELOAD_MAX_ATTEMPTS = 6;
const CHUNK_RELOAD_RESET_AFTER_MS = 30_000;
const CHUNK_RECOVERY_GUARD_KEY = "huddle:chunk-recovering";
const ENTRY_SYNC_GUARD_KEY = "huddle:entry-sync-reload";
type ChunkReloadState = {
  attempts: number;
  lastAttemptAt: number;
  fingerprint: string;
};
const readChunkReloadState = (): ChunkReloadState => {
  try {
    const raw = sessionStorage.getItem(CHUNK_RELOAD_ATTEMPTS_KEY);
    if (!raw) return { attempts: 0, lastAttemptAt: 0, fingerprint: "" };
    const parsed = JSON.parse(raw) as Partial<ChunkReloadState>;
    return {
      attempts: Number.isFinite(parsed.attempts) ? Number(parsed.attempts) : 0,
      lastAttemptAt: Number.isFinite(parsed.lastAttemptAt) ? Number(parsed.lastAttemptAt) : 0,
      fingerprint: typeof parsed.fingerprint === "string" ? parsed.fingerprint : "",
    };
  } catch {
    return { attempts: 0, lastAttemptAt: 0, fingerprint: "" };
  }
};
const writeChunkReloadState = (state: ChunkReloadState) => {
  try {
    sessionStorage.setItem(CHUNK_RELOAD_ATTEMPTS_KEY, JSON.stringify(state));
  } catch {
    // ignore storage write failures
  }
};
const getBundleFingerprint = () => {
  const script = document.querySelector('script[type="module"][src*="/assets/index-"]') as HTMLScriptElement | null;
  return script?.src || `${window.location.origin}/unknown-bundle`;
};

const extractEntryBundleFromHtml = (html: string): string | null => {
  const match = html.match(/assets\/index-[^"'\s>]+\.js/);
  if (!match) return null;
  try {
    return new URL(match[0], window.location.origin).toString();
  } catch {
    return null;
  }
};
const shouldReloadForChunkFailure = (input: unknown): boolean => {
  const text = String(input ?? "");
  return (
    text.includes("Failed to fetch dynamically imported module") ||
    text.includes("Importing a module script failed") ||
    text.includes("Expected a JavaScript-or-Wasm module script")
  );
};
const reloadForChunkFailure = async () => {
  if (sessionStorage.getItem(CHUNK_RECOVERY_GUARD_KEY) === "1") return;
  sessionStorage.setItem(CHUNK_RECOVERY_GUARD_KEY, "1");

  const now = Date.now();
  const fingerprint = getBundleFingerprint();
  const previous = readChunkReloadState();
  const staleWindow = now - previous.lastAttemptAt > CHUNK_RELOAD_RESET_AFTER_MS;
  const sameFingerprint = previous.fingerprint === fingerprint;
  const previousAttempts = staleWindow || !sameFingerprint ? 0 : previous.attempts;
  const nextAttempts = previousAttempts + 1;
  writeChunkReloadState({
    attempts: nextAttempts,
    lastAttemptAt: now,
    fingerprint,
  });

  // Never silently fail recovery. If repeated attempts exceed threshold,
  // force a root-level hard navigation with a cache-busting marker.
  const hardReset = nextAttempts > CHUNK_RELOAD_MAX_ATTEMPTS;

  try {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } catch {
    // Best effort cleanup.
  }

  const current = hardReset
    ? new URL("/", window.location.origin)
    : new URL(window.location.href);
  current.searchParams.set("__chunk_recover", String(Date.now()));
  current.searchParams.set("__bundle", String(Date.now()));
  window.location.replace(current.toString());
};

const syncToLatestEntryBundleOnce = async () => {
  if (!import.meta.env.PROD) return;
  if (sessionStorage.getItem(ENTRY_SYNC_GUARD_KEY) === "1") return;
  const currentBundle = getBundleFingerprint();
  if (!currentBundle.includes("/assets/index-")) return;

  try {
    const res = await fetch(window.location.origin + "/", { cache: "no-store", credentials: "same-origin" });
    if (!res.ok) return;
    const html = await res.text();
    const latestBundle = extractEntryBundleFromHtml(html);
    if (!latestBundle) return;
    if (latestBundle === currentBundle) return;

    sessionStorage.setItem(ENTRY_SYNC_GUARD_KEY, "1");
    const url = new URL(window.location.href);
    url.searchParams.set("__entry_sync", String(Date.now()));
    window.location.replace(url.toString());
  } catch {
    // Best effort only.
  }
};

if (ENABLE_AUTOMATIC_RUNTIME_RELOAD) {
  void syncToLatestEntryBundleOnce();
} else {
  // Always run the proactive entry-bundle sync in production — it's targeted and safe.
  // It reloads only when the cached main bundle is stale vs. the live index.html.
  void syncToLatestEntryBundleOnce();
}

// Vite-native hook: fired when any dynamic import() fails to load.
// Belt-and-suspenders on top of the error/unhandledrejection handlers below.
window.addEventListener("vite:preloadError", () => {
  void reloadForChunkFailure();
});

window.addEventListener("error", (event) => {
  const target = event.target as (EventTarget & { tagName?: string; src?: string }) | null;
  const scriptSrc = typeof target?.src === "string" ? target.src : "";
  const isChunkScriptLoadError =
    target?.tagName === "SCRIPT" &&
    scriptSrc.includes("/assets/") &&
    scriptSrc.endsWith(".js");
  if (isChunkScriptLoadError) {
    void reloadForChunkFailure();
    return;
  }
  if (shouldReloadForChunkFailure(event.message)) {
    void reloadForChunkFailure();
  }
}, true);
window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason as { message?: unknown } | unknown;
  const message = typeof reason === "object" && reason !== null ? (reason as { message?: unknown }).message : reason;
  if (shouldReloadForChunkFailure(message)) {
    void reloadForChunkFailure();
  }
});

// If the app stays up without chunk failures for a short period, clear retry state.
window.setTimeout(() => {
  try {
    sessionStorage.removeItem(CHUNK_RELOAD_ATTEMPTS_KEY);
    sessionStorage.removeItem(CHUNK_RECOVERY_GUARD_KEY);
  } catch {
    // ignore
  }
}, 10_000);

// Service worker caching can cause stale bundles and broken network handshakes during dev.
// Only register it for production builds.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  // Intentionally disabled for now to avoid stale bundle loops in production webviews.
}
