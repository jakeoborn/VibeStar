const CACHE      = 'plursky-v111';
// Tile cache is intentionally separate from the app cache so map tiles
// survive APP_VER bumps. Tiles for a given (z, x, y) are immutable, so
// cache-first forever is correct.
const TILE_CACHE = 'plursky-tiles-v1';
const APP_VER    = 'v111';

// Own-origin app files â€” versioned to match what index.html requests.
// addAll is atomic so a missed own-origin file fails the install fast.
const LOCAL = [
  './',
  './index.html',
  './manifest.json',
  './callback.html',
  './share.html',
  './edc-map-overlay.png',
  './og.svg',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  `./ios-frame.jsx?v=${APP_VER}`,
  `./data.jsx?v=${APP_VER}`,
  `./supabase.jsx?v=${APP_VER}`,
  `./chrome.jsx?v=${APP_VER}`,
  `./home.jsx?v=${APP_VER}`,
  `./map.jsx?v=${APP_VER}`,
  `./lineup.jsx?v=${APP_VER}`,
  `./artist.jsx?v=${APP_VER}`,
  `./spotify.jsx?v=${APP_VER}`,
  `./app.jsx?v=${APP_VER}`,
];

// Third-party CDN scripts â€” pinned exact versions, content is immutable.
// Precached so the app boots with zero connectivity at the EDC venue.
// Each is caught individually so a CDN hiccup doesn't abort SW install.
const CDN = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js',
  'https://unpkg.com/react@18.3.1/umd/react.development.js',
  'https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js',
  'https://unpkg.com/@babel/standalone@7.29.0/babel.min.js',
  'https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@300;400;500;600;700&family=Geist+Mono:wght@400;500&display=swap',
];

const CDN_HOSTS = ['cdn.jsdelivr.net', 'unpkg.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

// Map basemap providers used by the Real Map (BETA). Vector tiles + style
// JSON + glyphs + sprites from OpenFreeMap; raster satellite imagery from
// Esri. Cached opportunistically: pan around the LVMS area while online
// and the tiles you visit get stored, then work offline at the festival.
const TILE_HOSTS = ['tiles.openfreemap.org', 'server.arcgisonline.com'];

// Never intercept live API calls â€” let them fail naturally when offline.
function isPassThrough(url) {
  return url.includes('accounts.spotify.com') ||
         url.includes('api.spotify.com')       ||
         url.includes('api.music.apple.com')   ||
         url.includes('anthropic.com')          ||
         url.includes('/v1/messages')           ||
         url.includes('.supabase.co');
}

function isCDN(url) {
  return CDN_HOSTS.some(h => url.includes(h));
}

function isTile(url) {
  return TILE_HOSTS.some(h => url.includes(h));
}

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(async c => {
      // Own-origin critical path â€” atomic, fail-fast
      await c.addAll(LOCAL.map(u => new Request(u, { cache: 'no-store' })))
             .catch(err => console.warn('[sw] local precache fail', err));
      // CDN â€” best-effort, each caught individually
      await Promise.all(CDN.map(u =>
        c.add(new Request(u, { mode: 'cors', credentials: 'omit' }))
         .catch(err => console.warn('[sw] cdn precache miss', u, err))
      ));
    })
  );
});

self.addEventListener('activate', e => {
  // Keep both the current app cache and the tile cache. Drop only old
  // plursky-* caches from previous versions. Tile cache survives bumps so
  // users don't re-download the LVMS area on every deploy.
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE && k !== TILE_CACHE && k.startsWith('plursky-'))
            .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (isPassThrough(req.url)) return;

  // Map tiles + style + glyphs + sprites: cache-first into the dedicated
  // tile cache. Tiles for a given (z, x, y) are immutable so we never need
  // to revalidate; first visit while online stores it forever (or until
  // browser evicts the cache under storage pressure).
  if (isTile(req.url)) {
    e.respondWith(
      caches.match(req).then(cached => {
        if (cached) return cached;
        return fetch(req, { mode: 'cors', credentials: 'omit' }).then(resp => {
          if (resp && resp.status === 200)
            caches.open(TILE_CACHE).then(c => c.put(req, resp.clone()));
          return resp;
        }).catch(() => cached);
      })
    );
    return;
  }

  // CDN + fonts: cache-first (immutable pinned versions; woff2 cached on first use)
  if (isCDN(req.url)) {
    e.respondWith(
      caches.match(req).then(cached => {
        if (cached) return cached;
        return fetch(req, { mode: 'cors', credentials: 'omit' }).then(resp => {
          if (resp && resp.status === 200)
            caches.open(CACHE).then(c => c.put(req, resp.clone()));
          return resp;
        });
      })
    );
    return;
  }

  // Own-origin: network-first so deploys propagate; SW cache fallback when offline.
  // cache:'no-store' bypasses browser HTTP cache so GH-Pages max-age=600 can't pin
  // users to stale index.html between SW updates.
  e.respondWith(
    fetch(req, { cache: 'no-store' }).then(resp => {
      if (resp && resp.status === 200)
        caches.open(CACHE).then(c => c.put(req, resp.clone()));
      return resp;
    }).catch(() =>
      caches.match(req).then(c => c || caches.match('./index.html'))
    )
  );
});

// â”€â”€ Push (server-driven) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
self.addEventListener('push', e => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch {
    try { data = { title: 'Plursky', body: e.data ? e.data.text() : '' }; } catch {}
  }
  e.waitUntil(self.registration.showNotification(data.title || 'Plursky', {
    body:    data.body  || '',
    icon:    data.icon  || '/og.svg',
    badge:   data.badge || '/og.svg',
    tag:     data.tag   || 'plursky',
    data:    { url: data.url || '/' },
    vibrate: [80, 40, 80],
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const target = e.notification.data?.url || '/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    .then(list => {
      const existing = list.find(c => c.url.includes(self.location.origin));
      if (existing) { existing.focus(); return existing.navigate?.(target); }
      return self.clients.openWindow(target);
    })
  );
});

self.addEventListener('sync', e => {
  if (e.tag === 'flush-location-queue') e.waitUntil(Promise.resolve());
});
