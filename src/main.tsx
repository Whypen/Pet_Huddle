import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "mapbox-gl/dist/mapbox-gl.css";

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

const SW_RESET_GUARD = "huddle:sw-reset-v1";
const resetServiceWorkerCachesOnce = async () => {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  try {
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
void resetServiceWorkerCachesOnce();

const CHUNK_RELOAD_GUARD = "huddle:chunk-reload-once";
const shouldReloadForChunkFailure = (input: unknown): boolean => {
  const text = String(input ?? "");
  return (
    text.includes("Failed to fetch dynamically imported module") ||
    text.includes("Importing a module script failed") ||
    text.includes("Expected a JavaScript-or-Wasm module script")
  );
};
const reloadOnceForChunkFailure = () => {
  try {
    if (sessionStorage.getItem(CHUNK_RELOAD_GUARD) === "1") return;
    sessionStorage.setItem(CHUNK_RELOAD_GUARD, "1");
    window.location.reload();
  } catch {
    window.location.reload();
  }
};
window.addEventListener("error", (event) => {
  if (shouldReloadForChunkFailure(event.message)) {
    reloadOnceForChunkFailure();
  }
});
window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason as { message?: unknown } | unknown;
  const message = typeof reason === "object" && reason !== null ? (reason as { message?: unknown }).message : reason;
  if (shouldReloadForChunkFailure(message)) {
    reloadOnceForChunkFailure();
  }
});

// Service worker caching can cause stale bundles and broken network handshakes during dev.
// Only register it for production builds.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  // Intentionally disabled for now to avoid stale bundle loops in production webviews.
}
