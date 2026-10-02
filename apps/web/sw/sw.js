// Hand-written service worker. The build fills in VERSION and PRECACHE (vite.config.ts + scripts/sw-build.ts).
// VERSION hashes the built file names, index.html and every precached public file, so any change to code,
// shell or data gets a new cache; the old ones are deleted on activate.
const VERSION = '__VERSION__';
const PRECACHE = __PRECACHE__;
const CACHE = `tomorrow-${VERSION}`;
/** Weak signal: after this long, answer a navigation from the cached shell (S23). */
const NAV_TIMEOUT_MS = 3000;
const scoped = (p) => new URL(p, self.registration.scope).href;
/** Content-hashed build files (Vite's assets/<name>-<hash>.*) and spots.json?v=<hash>: a URL that names its
 * content can't be stale. */
const HASHED = /^assets\/|[?&]v=/;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // The unversioned entries ('./', manifest, icons) bypass the HTTP cache (cache: 'reload'), so a host's
      // max-age can't put last deploy's files into this deploy's cache. Hashed ones may come from it — on a
      // first visit that is the copy the page is already downloading, not a second 330 KB download.
      .then((cache) => cache.addAll(PRECACHE.map((u) => new Request(scoped(u), HASHED.test(u) ? {} : { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('tomorrow-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function navigate(req) {
  const shell = await caches.match(scoped('./'), { cacheName: CACHE });
  const network = fetch(req);
  if (!shell) return network; // first visit: nothing cached to fall back on
  // A 404 is the host's answer for an address that is no page (404.html, ADR-0063): shown as it is. Only a
  // failing host (5xx) or no network gets the shell.
  const fromNetwork = network.then((res) => (res.ok || res.status === 404 ? res : shell)).catch(() => shell);
  const late = new Promise((resolve) => setTimeout(() => resolve(shell), NAV_TIMEOUT_MS));
  return Promise.race([fromNetwork, late]);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Only this origin's GETs. Usage events (sendBeacon POST, ADR-0061) and other hosts go straight to the
  // network and are never cached.
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  // The static pages (/jeju/**, ADR-0072) are no part of the app shell: never cached, never answered with the shell.
  if (/^\/jeju(\/|$)/.test(new URL(req.url).pathname)) return;
  // The rain function (/api/**, ADR-0076): network only — a stale forecast must never come from the cache.
  if (new URL(req.url).pathname.startsWith('/api/')) return;

  // Pages: network first so a new deploy shows up; cached shell when offline, failing, or slow.
  if (req.mode === 'navigate') {
    event.respondWith(navigate(req));
    return;
  }

  // App shell files and spots.json?v=<hash>: cache first (hashed or versioned URLs).
  event.respondWith(
    caches.match(req, { cacheName: CACHE }).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            // Only into this version's cache while it still exists: once a newer worker has deleted it,
            // caches.open() would bring it back as an orphan that nothing ever cleans up.
            caches
              .has(CACHE)
              .then((live) => live && caches.open(CACHE).then((cache) => cache.put(req, copy)))
              .catch(() => undefined);
          }
          return res;
        }),
    ),
  );
});
