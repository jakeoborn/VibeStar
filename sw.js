// Vibestar Service Worker — offline-first cache for EDC LV 2026
const CACHE = 'vibestar-v3';
const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
  'https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700;900&family=Inter:wght@300;400;500;600&display=swap',
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

  // Claude API calls must never be cached (private, tokenized)
  if (req.url.includes('anthropic.com') || req.url.includes('/v1/messages')) {
    return;
  }

  e.respondWith(
    caches.match(req).then(cached => {
      if (cached) {
        // Stale-while-revalidate for static assets
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
          req.url.includes('cdnjs') ||
          req.url.startsWith(self.location.origin)
        )) {
          const clone = resp.clone();
          caches.open(CACHE).then(c => c.put(req, clone));
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
