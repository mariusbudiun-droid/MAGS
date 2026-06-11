// ============================================================
// MAGS — Service Worker
// Cache-bump: incrementa CACHE_VERSION a ogni release.
// ============================================================
const CACHE_VERSION = 'mags-v0.4.0';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './config.js',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_VERSION).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  // Le chiamate a Supabase non vanno mai in cache
  if (req.url.includes('supabase.co')) return;
  if (req.method !== 'GET') return;

  // stale-while-revalidate per gli asset locali
  e.respondWith(
    caches.open(CACHE_VERSION).then(async (cache) => {
      const cached = await cache.match(req);
      const network = fetch(req).then(res => {
        if (res && res.status === 200 && res.type === 'basic') cache.put(req, res.clone());
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
