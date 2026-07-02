const CACHE_NAME = 'html-repo-v2';
const APP_SHELL = ['/manifest.json', '/icons/icon-192.svg', '/icons/icon-512.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

function putInCache(request, response) {
  if (request.method === 'GET' && response.ok) {
    const clone = response.clone();
    caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // API calls — network only, never cached.
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // Navigations (the HTML shell) — network-first, so a new deploy is visible
  // immediately instead of being stuck behind a stale cached index.html.
  // Falls back to whatever was last cached only when actually offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => putInCache(request, response))
        .catch(() => caches.match(request).then((cached) => cached || new Response('Offline', { status: 503 })))
    );
    return;
  }

  // Everything else (hashed build assets, icons, manifest) — cache-first.
  // Vite fingerprints /assets/* filenames per build, so a cached entry can
  // never go stale: a new deploy always means a new URL.
  event.respondWith(
    caches.match(request).then((cached) => {
      return (
        cached ||
        fetch(request)
          .then((response) => putInCache(request, response))
          .catch(() => new Response('Offline', { status: 503 }))
      );
    })
  );
});
