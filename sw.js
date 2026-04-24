// Vibestar Service Worker — offline-first cache for EDC LV 2026
const CACHE = 'vibestar-v6';
const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './app.jsx',
  './chrome.jsx',
  './data.jsx',
  './home.jsx',
  './map.jsx',
  './lineup.jsx',
  './artist.jsx',
  './spotify.jsx',
  './ios-frame.jsx',
  'https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@300;400;500;600;700&family=Geist+Mono:wght@400;500&display=swap',
];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(c =>
      Promise.all(PRECACHE.map(u =>
        c.add(u).catch(err => console.warn('[sw] precache miss', u, err))
      ))
    )
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  // Claude / Spotify API calls must never be cached (private, tokenized, time-sensitive)
  if (req.url.includes('anthropic.com') ||
      req.url.includes('/v1/messages') ||
      req.url.includes('api.spotify.com') ||
      req.url.includes('accounts.spotify.com')) {
    return;
  }

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  // App code (HTML / JSX / JSON / manifest) must update on deploy — network-first,
  // cache only as offline fallback. Otherwise a stale cached build sticks forever
  // (which is why the Spotify button stopped working in Chrome: old spotify.jsx).
  const isAppCode = sameOrigin && (
    url.pathname === '/' ||
    url.pathname.endsWith('/') ||
    /\.(html|jsx|js|json|svg)$/i.test(url.pathname)
  );

  if (isAppCode) {
    e.respondWith(
      fetch(req).then(resp => {
        if (resp && resp.status === 200) {
          const clone = resp.clone();
          caches.open(CACHE).then(c => c.put(req, clone));
        }
        return resp;
      }).catch(() =>
        caches.match(req).then(m => m || caches.match('./index.html'))
      )
    );
    return;
  }

  // Fonts, images, other CDN assets — stale-while-revalidate (fast, still fresh eventually)
  e.respondWith(
    caches.match(req).then(cached => {
      if (cached) {
        fetch(req).then(fresh => {
          if (fresh && fresh.status === 200) {
            caches.open(CACHE).then(c => c.put(req, fresh.clone()));
          }
        }).catch(() => {});
        return cached;
      }
      return fetch(req).then(resp => {
        if (resp && resp.status === 200 && (
          req.url.includes('fonts.g') ||
          req.url.includes('cdnjs')
        )) {
          caches.open(CACHE).then(c => c.put(req, resp.clone()));
        }
        return resp;
      }).catch(() => caches.match('./index.html'));
    })
  );
});

// Background sync placeholder for friend-location queue flush
self.addEventListener('sync', e => {
  if (e.tag === 'flush-location-queue') {
    e.waitUntil(Promise.resolve()); // hook IndexedDB queue flush here in v1.1
  }
});
