const CACHE_NAME = 'bristol-game-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './src/main.ts',
  './src/mapManager.ts',
  './manifest.json',
  'https://unpkg.com',
  'https://unpkg.com'
];

// Installation: Cache structural assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Pre-caching offline asset pipeline');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Activation: Clean up older cache namespaces
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Clearing legacy cache footprint');
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetching: Intercept requests for instant performance & wake-up recovery
self.addEventListener('fetch', (event) => {
  // Allow external API metrics or Supabase pings to pass through unfettered
  if (event.request.url.includes('supabase') || event.request.url.includes('api')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      // Network fallback fetch for un-cached game graphics or maps
      return fetch(event.request)
        .then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
            return networkResponse;
          }

          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });

          return networkResponse;
        })
        .catch(() => {
          // Soft offline warning if connection dropped in a Bristol stone valley/pub
          console.warn('[Service Worker] App is completely offline. Visual tiles may fail.');
        });
    })
  );
});
