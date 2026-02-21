import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "mapbox-gl/dist/mapbox-gl.css";

if (import.meta.env.DEV && import.meta.env.VITE_UAT_DEBUG === "true") {
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input.url;
    if (url.includes("/rest/v1/map_alerts")) {
      const headers = new Headers(init?.headers || (typeof input === "string" ? undefined : input.headers));
      const auth = headers.get("Authorization");
      const apikey = headers.get("apikey");
      console.debug("[UAT_FETCH]", {
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

// Service worker caching can cause stale bundles and broken network handshakes during dev.
// Only register it for production builds.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("Service worker registration failed:", err);
    });
  });
}
