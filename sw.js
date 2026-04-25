const CACHE = 'vibestar-v21';
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

const LOCAL_EXTENSIONS = ['.html', '.jsx', '.js', '.json'];

function isLocalAsset(url) {
  try {
    const u = new URL(url);
    return u.origin === self.location.origin &&
      LOCAL_EXTENSIONS.some(ext => u.pathname.endsWith(ext));
  } catch { return false; }
}

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
  if (req.url.includes('anthropic.com') || req.url.includes('/v1/messages')) return;
  if (req.url.includes('accounts.spotify.com') || req.url.includes('api.spotify.com')) return;

  if (isLocalAsset(req.url)) {
    // Network-first with cache:'no-store' so the browser HTTP cache can't
    // serve us a stale index.html or stale JSX after a deploy. Falls back
    // to the SW cache if offline.
    e.respondWith(
      fetch(req, { cache: 'no-store' }).then(resp => {
        if (resp && resp.status === 200) {
          caches.open(CACHE).then(c => c.put(req, resp.clone()));
        }
        return resp;
      }).catch(() => caches.match(req).then(c => c || caches.match('./index.html')))
    );
    return;
  }

  // Stale-while-revalidate for fonts/CDN
  e.respondWith(
    caches.match(req).then(cached => {
      if (cached) {
        fetch(req).then(fresh => {
          if (fresh && fresh.status === 200)
            caches.open(CACHE).then(c => c.put(req, fresh.clone()));
        }).catch(() => {});
        return cached;
      }
      return fetch(req).then(resp => {
        if (resp && resp.status === 200 &&
          (req.url.includes('fonts.g') || req.url.includes('cdnjs') ||
           req.url.startsWith(self.location.origin))) {
          caches.open(CACHE).then(c => c.put(req, resp.clone()));
        }
        return resp;
      }).catch(() => caches.match('./index.html'));
    })
  );
});

// ── Push (server-driven) ──
// No backend wired yet, but the handler is ready: a Web Push send from any
// future server (Supabase Edge Fn, Firebase, custom) will display via the
// data envelope { title, body, tag, url, icon, badge }.
self.addEventListener('push', e => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch {
    try { data = { title: 'Plursky', body: e.data ? e.data.text() : '' }; } catch {}
  }
  e.waitUntil(self.registration.showNotification(data.title || 'Plursky', {
    body:  data.body  || '',
    icon:  data.icon  || '/og.svg',
    badge: data.badge || '/og.svg',
    tag:   data.tag   || 'plursky',
    data:  { url: data.url || '/' },
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
  if (e.tag === 'flush-location-queue') {
    e.waitUntil(Promise.resolve());
  }
});
