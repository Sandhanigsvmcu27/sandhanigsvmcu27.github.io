/* Sandhani GSVMC Unit — service worker (PWA)
   Rules:
   - Only same-origin GET requests are handled. Supabase API/Auth calls are
     cross-origin and are NEVER intercepted or cached.
   - Page navigations: network-first, fall back to cache, then offline page.
   - Static assets (css/js/images): stale-while-revalidate.
   Bump VERSION whenever this file or the precache list changes. */
var VERSION = 'sandhani-pwa-v4';
var CORE = [
  './',
  './index.html',
  './request.html',
  './track.html',
  './vaccine.html',
  './shikkha.html',
  './gallery.html',
  './login.html',
  './offline.html',
  './css/style.css',
  './js/config.js',
  './js/app.js',
  './js/nav.js',
  './js/photos.js',
  './js/feed.js',
  './js/pwa.js',
  './assets/sandhani-logo.jpg',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './manifest.webmanifest'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(VERSION).then(function (cache) {
      // addAll fails entirely if one file 404s; add one-by-one to be safe.
      return Promise.all(CORE.map(function (url) {
        return cache.add(url).catch(function () { /* keep going */ });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== VERSION) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase etc: hands off

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(function (res) {
        // Cache only successful pages — never cache a 404/error response,
        // or the offline fallback would serve that error page later.
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(VERSION).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () {
        return caches.match(req, { ignoreSearch: true }).then(function (hit) {
          return hit || caches.match('./offline.html');
        });
      })
    );
    return;
  }

  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(function (hit) {
      var network = fetch(req).then(function (res) {
        if (res && res.status === 200) {
          var copy = res.clone();
          caches.open(VERSION).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () { return hit; });
      return hit || network;
    })
  );
});
