/* ============================================================
   PersonalOS — Service Worker (PWA)
   Static files: cache-first (each release uses new ?v= URLs, so a
   new deploy is always fetched fresh). Page navigation: network-first
   with cache fallback (offline still opens the app). The Google
   Apps Script API is cross-origin POST — intentionally untouched.
   ============================================================ */
'use strict';

const CACHE = 'personalos-v1.5.0';
const CORE = [
  'index.html',
  'manifest.webmanifest',
  'assets/icons/favicon.svg',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/vendor/chart.umd.min.js',
  'assets/vendor/fonts/inter.css',
  'assets/vendor/fonts/inter-var-latin.woff2',
  'assets/vendor/fontawesome/css/all.min.css',
  'assets/vendor/fontawesome/webfonts/fa-solid-900.woff2',
  'assets/vendor/fontawesome/webfonts/fa-regular-400.woff2',
  'assets/vendor/fontawesome/webfonts/fa-brands-400.woff2'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;                     // API writes: never touched
  if (new URL(req.url).origin !== self.location.origin) return; // GAS API: never touched

  // page navigations: network first, offline -> cached index.html
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => { caches.open(CACHE).then(c => c.put('index.html', res.clone())); return res; })
        .catch(() => caches.match('index.html'))
    );
    return;
  }

  // everything else: cache first, then network (and keep a copy)
  event.respondWith(
    caches.match(req).then(hit => hit ||
      fetch(req).then(res => {
        if (res.ok) caches.open(CACHE).then(c => c.put(req, res.clone()));
        return res;
      })
    )
  );
});
