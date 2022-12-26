const CACHE_STORAGE_KEY = "tuner-v1.0.5";

const cachedPaths = [
  "/tuner/",
  "/tuner/index.html",
  "/tuner/main.css",
  "/tuner/main.mjs",
  "/tuner/manifest.json",
  "/tuner/reset.css",
  "/tuner/tuner.mjs",
  "/tuner/assets/logo.svg",
  "/tuner/assets/logo-512.png",
  "/tuner/assets/maskable_icon.png",
];

self.oninstall = (event) => {
  event.waitUntil(
    caches.open(CACHE_STORAGE_KEY).then(async (cache) => {
      await cache.addAll(cachedPaths);
      await cache.add("/tuner");
      await self.skipWaiting();
    })
  );
};

self.onactivate = (event) => {
  event.waitUntil(
    self.clients
      .matchAll({
        includeUncontrolled: true,
      })
      .then(async (clients) => {
        const cacheKeys = await caches.keys();
        // delete old caches
        for (const key of cacheKeys) {
          if (key !== CACHE_STORAGE_KEY) await caches.delete(key);
        }
        await self.clients.claim();
        // Hard-refresh clients
        clients.map((client) => client.navigate(client.url));
      })
  );
};

self.addEventListener("fetch", async (event) => {
  const response = caches.match(event.request);
  if (response) {
    return event.respondWith(response);
  }
  return;
});
