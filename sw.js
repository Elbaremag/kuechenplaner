// Kombüse Service Worker: macht die App installierbar und lädt die Oberfläche
// auch bei schlechter Verbindung. Daten (Supabase) werden bewusst NICHT zwischengespeichert.
//
// WICHTIG bei jeder neuen Auslieferung: VERSION erhöhen (z. B. 2026.11.20-1).
// Dann erkennen Geräte die neue Version, die App zeigt „Neue Version verfügbar“,
// und der alte Zwischenspeicher wird automatisch gelöscht.
const VERSION = '2026.11.06-2';
const CACHE = 'kombuese-' + VERSION;
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  './css/app.css',
  './js/config.js',
  './js/session.js',
  './js/state.js',
  './js/images.js',
  './js/helpers.js',
  './js/units.js',
  './js/data.js',
  './js/auth.js',
  './js/sync.js',
  './js/render.js',
  './js/recipes.js',
  './js/actions.js',
  './js/admin.js',
  './js/merge.js',
  './js/export.js',
  './js/profile.js',
  './js/pwa.js',
  './js/start.js',
];

self.addEventListener('install', (e) => {
  // Kein skipWaiting hier: Eine neue Version wartet, bis der Nutzer in der App auf „Jetzt aktualisieren“ tippt.
  // (Bei der allerersten Installation gibt es keinen alten Worker, dann wird sofort aktiviert.)
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS.map((a) => new Request(a, { cache: 'reload' }))))
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('kombuese-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (e) => {
  const d = e.data || {};
  if (d.type === 'SKIP_WAITING') self.skipWaiting();
  if (d.type === 'GET_VERSION' && e.source) e.source.postMessage({ type: 'VERSION', version: VERSION });
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase, CDN, Schriften: nicht anfassen
  // Erst Netzwerk (damit Änderungen sofort ankommen), sonst Zwischenspeicher
  // cache:'no-cache' = immer beim Server nachfragen (304, wenn unverändert). So passen index.html und die
  // js-/css-Dateien immer zusammen, auch wenn GitHub Pages sie sonst bis zu 10 Minuten zwischenspeichert.
  const fresh = new Request(req.url, { cache: 'no-cache', credentials: 'same-origin', redirect: 'follow' });
  e.respondWith(
    fetch(fresh)
      .then((res) => {
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || (req.mode === 'navigate' ? caches.match('./index.html') : undefined)))
  );
});
