// Bei jeder inhaltlichen Änderung an den Dateien diese Version erhöhen,
// sonst liefern Browser (v. a. Safari/iOS) weiterhin die alte, zwischengespeicherte
// Fassung aus – das ist der übliche "ich sehe mein Update nicht"-Fallstrick bei PWAs.
const CACHE_VERSION = "tw-stats-v3";

const PRECACHE_URLS = [
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-180.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(PRECACHE_URLS))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_VERSION)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Nur eigene GET-Anfragen behandeln, alles andere normal durchlassen
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) {
    return;
  }

  // Navigationsanfragen (z. B. direkter Aufruf/Reload) immer auf index.html zurückführen,
  // damit die App auch offline startet.
  if (request.mode === "navigate") {
    event.respondWith(
      caches.match("./index.html").then((cached) => cached || fetch(request))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => cached);
    })
  );
});
