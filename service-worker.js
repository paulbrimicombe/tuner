var cacheStorageKey = "tuner-v1";

var cachedPaths = [
  "/tuner/",
  "index.html",
  "main.css",
  "main.mjs",
  "reset.css",
  "tuner.mjs",
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
  const response = await caches.match(event.request);
  if (response) {
    return event.respondWith(response);
  }
  return;
});
