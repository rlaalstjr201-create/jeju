// Old addresses (yeogwi.pages.dev, gwichana-jeju.pages.dev) only: the app's service worker there would keep answering pages from its
// cached shell (a 301 to a navigation comes back as an opaque redirect it treats as a failure — audit #36, D5).
// This one replaces it on the browser's next update check, removes itself and its caches, and sends any open
// window to the same address on the new site. It answers no requests.
const NEW_ORIGIN = 'https://yeochana.com';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      await self.clients.claim();
      await Promise.all((await caches.keys()).map((k) => caches.delete(k)));
      await self.registration.unregister();
      for (const client of await self.clients.matchAll({ type: 'window', includeUncontrolled: true })) {
        const u = new URL(client.url);
        client.navigate(`${NEW_ORIGIN}${u.pathname}${u.search}${u.hash}`).catch(() => undefined);
      }
    })(),
  );
});
