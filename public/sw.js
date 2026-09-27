// Service worker:
//  - shows reminder notifications and opens the app when one is tapped;
//  - keeps the app usable offline: app files are cached, and the Today page falls
//    back to its last copy when there's no internet (ticks are queued on the phone).

const CACHE = "ff-offline-v1";
const OFFLINE_PAGE = "/today";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;

  // Build files, icons and photos never change at a given URL: cache first.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/pwa-icon/") || url.pathname.startsWith("/api/photo/")) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  // Pages: always try the network; keep the latest Today page for offline use.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && url.pathname === OFFLINE_PAGE && !res.redirected) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(OFFLINE_PAGE, copy));
          }
          return res;
        })
        .catch(async () => (await caches.match(OFFLINE_PAGE)) || new Response("You're offline.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } })),
    );
  }
});

// The app asks us to forget the cached page (e.g. on log out, so the next person doesn't see it).
self.addEventListener("message", (event) => {
  if (event.data === "clear-cache") event.waitUntil(caches.delete(CACHE));
});

self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title || "Family Fit", {
      body: data.body || "",
      icon: "/pwa-icon/192",
      badge: "/pwa-icon/192",
      tag: data.tag,
      data: { url: data.url || "/today" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/today", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const w of windows) {
        if (w.url.startsWith(self.location.origin) && "focus" in w) {
          w.navigate(url);
          return w.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
