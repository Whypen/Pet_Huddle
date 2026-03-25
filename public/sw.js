const CACHE_NAME = "huddle-shell-v4";
const OFFLINE_ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/huddle-favicon.png",
  "/huddle-favicon-32.png",
  "/huddle-apple-touch-icon.png",
  "/huddle-icon-192.png",
  "/huddle-icon-512.png",
  "/huddle-logo.jpg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(OFFLINE_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  const isNavigation = event.request.mode === "navigate";
  const isStaticAsset = ["script", "style", "image", "font"].includes(event.request.destination);

  // Navigation must be network-first to avoid serving stale shells after new deploys.
  if (isNavigation) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put("/index.html", responseClone));
          return response;
        })
        .catch(() => caches.match("/index.html"))
    );
    return;
  }

  if (!isStaticAsset) {
    event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        return response;
      });
    })
  );
});
