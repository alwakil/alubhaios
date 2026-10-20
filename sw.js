/* ============================================================
   AluBhaiOS — Service Worker (PWA)
   Static files: cache-first (each release uses new ?v= URLs, so a
   new deploy is always fetched fresh). Page navigation: network-first
   with cache fallback (offline still opens the app). The Google
   Apps Script API is cross-origin POST — intentionally untouched.
   ============================================================ */
'use strict';

const CACHE = 'alubhaios-v2.10.7';
/* everything index.html references + the fonts its vendor CSS pulls in —
   offline must open the full app, not a blank screen */
const CORE = [
  'index.html',
  'manifest.webmanifest',
  'assets/icons/favicon.svg',
  'assets/icons/icon-180.png',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/vendor/chart.umd.min.js',
  'assets/vendor/fonts/inter.css',
  'assets/vendor/fonts/inter-var-latin.woff2',
  'assets/vendor/fontawesome/css/all.min.css',
  'assets/vendor/fontawesome/webfonts/fa-solid-900.woff2',
  'assets/vendor/fontawesome/webfonts/fa-solid-900.ttf',
  'assets/vendor/fontawesome/webfonts/fa-regular-400.woff2',
  'assets/vendor/fontawesome/webfonts/fa-regular-400.ttf',
  'assets/vendor/fontawesome/webfonts/fa-brands-400.woff2',
  'assets/vendor/fontawesome/webfonts/fa-brands-400.ttf',
  'assets/vendor/fontawesome/webfonts/fa-v4compatibility.woff2',
  'assets/vendor/fontawesome/webfonts/fa-v4compatibility.ttf',
  'css/style.css',
  'css/dashboard.css',
  'css/fishbone.css',
  'css/gamify.css',
  'css/arena.css',
  'css/study.css',
  'css/salah.css',
  'css/responsive.css',
  'js/config.js',
  'js/utils.js',
  'js/api.js',
  'js/analytics.js',
  'js/app.js',
  'js/arena.js',
  'js/badges.js',
  'js/dashboard.js',
  'js/fishbone.js',
  'js/focus.js',
  'js/gamify.js',
  'js/goals.js',
  'js/habits.js',
  'js/options.js',
  'js/reviews.js',
  'js/routines.js',
  'js/salah.js',
  'js/settings.js',
  'js/study.js',
  'js/tasks.js'
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
  // ignoreSearch: ?utm_... or ?source=pwa variants still hit the cached page
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => { caches.open(CACHE).then(c => c.put('index.html', res.clone())); return res; })
        .catch(() => caches.match('index.html', { ignoreSearch: true }))
    );
    return;
  }

  // everything else: cache first, then network (and keep a copy).
  // ignoreSearch so a stale ?v=2.10.5 URL still serves the freshly cached
  // ?v=2.10.5 asset instead of refetching from the network.
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(hit => hit ||
      fetch(req).then(res => {
        if (res.ok) caches.open(CACHE).then(c => c.put(req, res.clone()));
        return res;
      })
    )
  );
});
