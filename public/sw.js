const CACHE_VERSION = 'judo-coach-pwa-v134';
const BASE_PATH = new URL('./', self.location.href).pathname;
const INDEX_URL = `${BASE_PATH}index.html`;
const OFFLINE_URL = `${BASE_PATH}offline.html`;

self.addEventListener('install', (event) => {
  // Don't cache APP_SHELL statically — Vite generates hashed filenames.
  // Navigation handler caches index.html, fetch handler caches assets on first access.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never cache Supabase or esm.sh (CDN) calls.
  if (url.hostname.endsWith('.supabase.co') || url.hostname.endsWith('esm.sh')) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request, { cache: 'no-cache' })
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(INDEX_URL, copy)).catch(() => {});
          return response;
        })
        .catch(async () => {
          const cachedIndex = await caches.match(INDEX_URL);
          if (cachedIndex) return cachedIndex;
          return caches.match(OFFLINE_URL);
        })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy)).catch(() => {});
          return response;
        })
        .catch(() => caches.match(OFFLINE_URL));
    })
  );
});
