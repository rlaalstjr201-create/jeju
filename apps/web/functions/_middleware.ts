// yeochana.com is the site's address (ADR-0084). yeochana.pages.dev and www.yeochana.com answer every path with a 301 to the
// same path there — except /sw.js on yeochana.pages.dev: a phone that installed the app there keeps its cached shell through a
// 301 (audit #36, D5), so that address serves a worker that clears its caches, unregisters and moves open windows over.
// Every other host (yeochana.com itself, deploy previews) goes on untouched.
export const CANONICAL = 'https://yeochana.com';
const MOVED = new Set(['yeochana.pages.dev', 'www.yeochana.com']);

/** The same worker as scripts/redirect-site/sw.js (the old projects), sending windows to CANONICAL. */
export const RETIRE_SW = `self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await self.clients.claim();
    await Promise.all((await caches.keys()).map((k) => caches.delete(k)));
    await self.registration.unregister();
    for (const client of await self.clients.matchAll({ type: 'window', includeUncontrolled: true })) {
      const u = new URL(client.url);
      client.navigate('${CANONICAL}' + u.pathname + u.search + u.hash).catch(() => undefined);
    }
  })());
});
`;

interface Ctx {
  request: Request;
  next: () => Promise<Response>;
}

export async function onRequest(ctx: Ctx): Promise<Response> {
  const url = new URL(ctx.request.url);
  if (!MOVED.has(url.hostname)) return ctx.next();
  if (url.hostname === 'yeochana.pages.dev' && url.pathname === '/sw.js')
    return new Response(RETIRE_SW, { headers: { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache' } });
  return new Response(null, { status: 301, headers: { Location: `${CANONICAL}${url.pathname}${url.search}` } });
}
