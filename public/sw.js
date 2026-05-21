// Sth1r Service Worker — offline-first PWA by Sthappit
const CACHE_NAME = "sth1r-v1";
const PRECACHE_URLS = [
  "/",
  "/pos",
  "/orders",
  "/stats",
  "/settings",
  "/stock",
  "/dashboard",
  "/manifest.json",
];

// ── Install: pre-cache app shell ──────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        // addAll can fail if server is down; catch silently so SW still installs
        cache.addAll(PRECACHE_URLS).catch(() => {})
      )
      .then(() => self.skipWaiting())
  );
});

// ── Activate: delete stale caches ─────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ── Fetch: stale-while-revalidate for pages, cache-first for static ───────────
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = event.request.url;

  // Never intercept Supabase — must go to network for auth/sync
  if (url.includes("supabase.co")) return;

  // Never cache QR generator
  if (url.includes("api.qrserver.com")) return;

  // Never cache Google Fonts requests (they have their own cache headers)
  if (url.includes("fonts.googleapis.com") || url.includes("fonts.gstatic.com")) return;

  // Next.js hashed static chunks — cache-first (safe forever, hash changes on redeploy)
  if (url.includes("/_next/static/")) {
    event.respondWith(
      caches.match(event.request).then(
        (cached) =>
          cached ||
          fetch(event.request).then((res) => {
            if (res.ok) {
              const clone = res.clone();
              caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
            }
            return res;
          })
      )
    );
    return;
  }

  // Navigation & page requests — network-first, fall back to cache
  // This ensures fresh HTML on reload when online, but works offline
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
          }
          return res;
        })
        .catch(() =>
          caches.match(event.request).then(
            (cached) => cached || caches.match("/")
          )
        )
    );
    return;
  }

  // Everything else — stale-while-revalidate
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request)
        .then((res) => {
          if (res.ok && (res.type === "basic" || res.type === "cors")) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
          }
          return res;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});
