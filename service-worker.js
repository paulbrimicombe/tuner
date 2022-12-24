const cacheStorageKey = "tuner-v1.0.1";

const cachedPaths = [
  "/tuner/",
  "/tuner/index.html",
  "/tuner/main.css",
  "/tuner/main.mjs",
  "/tuner/manifest.json",
  "/tuner/reset.css",
  "/tuner/tuner.mjs",
  "/tuner/assets/logo.svg",
  "/tuner/assets/logo-512.png"
];

self.addEventListener("install", (event) => {
  const install = async () => {
    const cache = await caches.open(cacheStorageKey);
    await cache.addAll(cachedPaths);
  };
  event.waitUntil(install());
});

self.addEventListener("activate", (event) => {
  const activate = async () => {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames
        .filter((name) => name !== cacheStorageKey)
        .map((name) => caches.delete(name))
    );
    await self.clients.claim();
  };
  event.waitUntil(activate());
});

self.addEventListener("fetch", async (event) => {
  const response = caches.match(event.request);
  if (response) {
    return event.respondWith(response);
  }
  return;
});
