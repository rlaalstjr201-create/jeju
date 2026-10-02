// S23·S26 + audit "service worker update path": cache version, HTTP-cache bypass, versioned data URL,
// navigation timeout. The real sw.js source is run against fake caches/fetch.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildServiceWorker, spotsVersion, type SwInput } from '../scripts/sw-build';

const root = resolve(__dirname, '..');
const template = readFileSync(resolve(root, 'sw/sw.js'), 'utf8');
const base = (over: Partial<SwInput> = {}): SwInput => ({
  template,
  built: ['index.html', 'assets/index-abc.js', 'assets/index-def.css', 'assets/index-abc.js.map'],
  indexHtml: '<html>v1</html>',
  publicFiles: [
    ['spots.json', '[1]'],
    ['manifest.webmanifest', '{}'],
  ],
  spotsV: spotsVersion('[1]'),
  ...over,
});

describe('S26 배포 직후 — 새 코드와 새 데이터가 함께', () => {
  it('the app fetches spots.json with a content-hash query, and the SW precaches that same URL', () => {
    const main = readFileSync(resolve(root, 'src/main.ts'), 'utf8');
    expect(main).toContain('${BASE}spots.json?v=${__SPOTS_V__}');
    const cfg = readFileSync(resolve(root, 'vite.config.ts'), 'utf8');
    expect(cfg).toMatch(/__SPOTS_V__: JSON\.stringify\(SPOTS_V\)/);
    const { precache } = buildServiceWorker(base());
    expect(precache).toContain(`spots.json?v=${spotsVersion('[1]')}`);
    expect(precache).not.toContain('spots.json');
  });

  it('new data → new ?v= and new cache version', () => {
    const a = buildServiceWorker(base());
    const b = buildServiceWorker(base({ publicFiles: [['spots.json', '[2]'], ['manifest.webmanifest', '{}']], spotsV: spotsVersion('[2]') }));
    expect(spotsVersion('[1]')).not.toBe(spotsVersion('[2]'));
    expect(a.version).not.toBe(b.version);
  });

  it('an index.html-only change (copy/meta) also gets a new cache version', () => {
    expect(buildServiceWorker(base()).version).not.toBe(buildServiceWorker(base({ indexHtml: '<html>v2</html>' })).version);
  });

  it('same input → same version (no needless reinstall); placeholders filled; maps and index.html not precached', () => {
    const a = buildServiceWorker(base());
    expect(buildServiceWorker(base()).version).toBe(a.version);
    expect(a.source).not.toMatch(/__VERSION__|__PRECACHE__/);
    expect(a.precache[0]).toBe('./');
    expect(a.precache.some((f) => f.endsWith('.map') || f === 'index.html')).toBe(false);
  });
});

// --- run the real sw.js ---
class FakeRequest {
  url: string;
  cache: string;
  mode: string;
  method: string;
  constructor(url: string, init: { cache?: string; mode?: string; method?: string } = {}) {
    this.url = url;
    this.cache = init.cache ?? 'default';
    this.mode = init.mode ?? 'cors';
    this.method = init.method ?? 'GET';
  }
}
function fakeCaches() {
  const stores = new Map<string, Map<string, unknown>>();
  const added: FakeRequest[] = [];
  const open = async (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const m = stores.get(name)!;
    return {
      addAll: async (reqs: FakeRequest[]) => {
        for (const r of reqs) {
          added.push(r);
          m.set(r.url, { body: r.url });
        }
      },
      put: async (req: FakeRequest, res: unknown) => void m.set(req.url, res),
    };
  };
  return {
    stores,
    added,
    api: {
      open,
      keys: async () => [...stores.keys()],
      has: async (n: string) => stores.has(n),
      delete: async (n: string) => stores.delete(n),
      match: async (req: FakeRequest | string, opts: { cacheName: string }) => stores.get(opts.cacheName)?.get(typeof req === 'string' ? req : req.url),
    },
  };
}
function runSw(source: string, fetchImpl: (req: unknown) => Promise<unknown>, caches: ReturnType<typeof fakeCaches>) {
  const listeners: Record<string, (e: unknown) => void> = {};
  const self = {
    registration: { scope: 'https://app.test/' },
    location: { origin: 'https://app.test' },
    addEventListener: (t: string, fn: (e: unknown) => void) => (listeners[t] = fn),
    skipWaiting: vi.fn(async () => undefined),
    clients: { claim: vi.fn(async () => undefined) },
  };
  new Function('self', 'caches', 'fetch', 'Request', 'setTimeout', 'URL', source)(self, caches.api, fetchImpl, FakeRequest, setTimeout, URL);
  const extend = (e: Record<string, unknown>) => {
    let p: Promise<unknown> = Promise.resolve();
    e.waitUntil = (x: Promise<unknown>) => (p = x);
    e.respondWith = (x: Promise<unknown>) => (p = x);
    return { e, done: () => p };
  };
  return {
    async install() {
      const { e, done } = extend({});
      listeners.install(e);
      await done();
    },
    async activate() {
      const { e, done } = extend({});
      listeners.activate(e);
      await done();
    },
    navigate(url = 'https://app.test/') {
      const { e, done } = extend({ request: new FakeRequest(url, { mode: 'navigate' }) });
      listeners.fetch(e);
      return done();
    },
    get(url: string) {
      const { e, done } = extend({ request: new FakeRequest(url) });
      listeners.fetch(e);
      return done();
    },
    /** true when the worker answered the request itself (respondWith). */
    handles(url: string, init: { method?: string } = {}) {
      let responded = false;
      listeners.fetch({ request: new FakeRequest(url, init), respondWith: () => (responded = true), waitUntil: () => undefined });
      return responded;
    },
  };
}

describe('sw.js — install / activate', () => {
  it('precaches every entry; the unversioned ones with cache: "reload" so a host max-age can\'t put last deploy\'s files into this cache', async () => {
    const c = fakeCaches();
    const input = base({ publicFiles: [...base().publicFiles, ['icons/icon-192.png', 'png']] });
    const { source, precache, version } = buildServiceWorker(input);
    const sw = runSw(source, async () => ({ ok: true }), c);
    await sw.install();
    expect(c.added.map((r) => r.url)).toEqual(precache.map((p) => new URL(p, 'https://app.test/').href));
    const mode = (p: string) => c.added.find((r) => r.url === new URL(p, 'https://app.test/').href)?.cache;
    for (const p of ['./', 'manifest.webmanifest', 'icons/icon-192.png']) expect(mode(p), p).toBe('reload');
    expect([...c.stores.keys()]).toEqual([`tomorrow-${version}`]);
  });

  it('QA 2026-09-30: content-hashed files and spots.json?v= may come from the HTTP cache (first visit: one spots.json download, not two)', async () => {
    const c = fakeCaches();
    const { source, precache } = buildServiceWorker(base());
    const sw = runSw(source, async () => ({ ok: true }), c);
    await sw.install();
    const hashed = precache.filter((p) => p.startsWith('assets/') || p.includes('?v='));
    expect(hashed).toEqual(['assets/index-abc.js', 'assets/index-def.css', `spots.json?v=${spotsVersion('[1]')}`]);
    for (const p of hashed) expect(c.added.find((r) => r.url === new URL(p, 'https://app.test/').href)?.cache, p).toBe('default');
  });

  it('Vite still names every built asset by its content (the rule above relies on it)', () => {
    const cfg = readFileSync(resolve(root, 'vite.config.ts'), 'utf8');
    expect(cfg).not.toMatch(/assetFileNames|chunkFileNames|entryFileNames|assetsDir/);
  });

  it('activate deletes the old versions only', async () => {
    const c = fakeCaches();
    c.stores.set('tomorrow-old', new Map());
    c.stores.set('other-app', new Map());
    const { source, version } = buildServiceWorker(base());
    const sw = runSw(source, async () => ({ ok: true }), c);
    await sw.install();
    await sw.activate();
    expect([...c.stores.keys()].sort()).toEqual(['other-app', `tomorrow-${version}`]);
  });
});

describe('S23 약한 망 — 내비게이션', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('a hanging network answers from the cached shell after 3s', async () => {
    vi.useFakeTimers();
    const c = fakeCaches();
    const { source } = buildServiceWorker(base());
    const sw = runSw(source, () => new Promise(() => undefined), c);
    await sw.install();
    const res = sw.navigate();
    await vi.advanceTimersByTimeAsync(3000);
    await expect(res).resolves.toEqual({ body: 'https://app.test/' });
  });

  it('offline → cached shell at once; a 5xx → cached shell; a good response → the network', async () => {
    const c = fakeCaches();
    const { source } = buildServiceWorker(base());
    let next: () => Promise<unknown> = () => Promise.reject(new TypeError('offline'));
    const sw = runSw(source, () => next(), c);
    await sw.install();
    await expect(sw.navigate()).resolves.toEqual({ body: 'https://app.test/' });
    next = async () => ({ ok: false, status: 503 });
    await expect(sw.navigate()).resolves.toEqual({ body: 'https://app.test/' });
    next = async () => ({ ok: true, fresh: true });
    await expect(sw.navigate()).resolves.toEqual({ ok: true, fresh: true });
  });

  it("ADR-0063: the host's 404 (an unknown address) is shown as it is, not swapped for the app shell", async () => {
    const c = fakeCaches();
    const { source } = buildServiceWorker(base());
    const sw = runSw(source, async () => ({ ok: false, status: 404, page: '404.html' }), c);
    await sw.install();
    await expect(sw.navigate('https://app.test/nope/deep')).resolves.toEqual({ ok: false, status: 404, page: '404.html' });
  });

  it('S21 first visit offline (nothing cached): the browser\'s own offline page', async () => {
    const c = fakeCaches();
    const { source } = buildServiceWorker(base());
    const sw = runSw(source, () => Promise.reject(new TypeError('offline')), c);
    await expect(sw.navigate()).rejects.toThrow('offline');
  });
});

describe('U 익명 사용 기록 (ADR-0061) — 서비스워커는 이벤트 요청을 건드리지 않는다', () => {
  it('a sendBeacon POST, same-origin or not, goes straight to the network: never answered from or put in the cache', async () => {
    const c = fakeCaches();
    const { source } = buildServiceWorker(base());
    const fetched: unknown[] = [];
    const sw = runSw(source, async (r) => (fetched.push(r), { ok: true }), c);
    await sw.install();
    const before = JSON.stringify([...(await c.api.keys())]);
    expect(sw.handles('https://app.test/events', { method: 'POST' })).toBe(false);
    expect(sw.handles('https://events.example/e', { method: 'POST' })).toBe(false);
    expect(sw.handles('https://events.example/e')).toBe(false);
    expect(fetched).toHaveLength(0);
    expect(await c.api.match('https://app.test/events', { cacheName: (await c.api.keys())[0] })).toBeUndefined();
    expect(JSON.stringify([...(await c.api.keys())])).toBe(before);
  });
});

describe('정적 랜딩 (ADR-0072) — 서비스워커는 /jeju/**를 건드리지 않는다', () => {
  it('pages and their stylesheet under /jeju go to the network as they are; the app and its files are still handled', async () => {
    const c = fakeCaches();
    const { source } = buildServiceWorker(base());
    const res = { ok: true, clone: () => res };
    const sw = runSw(source, async () => res, c);
    await sw.install();
    for (const u of ['https://app.test/jeju/', 'https://app.test/jeju', 'https://app.test/jeju/aewol/', 'https://app.test/jeju/aewol/some-place/', 'https://app.test/jeju/landing.css']) {
      expect(sw.handles(u), u).toBe(false);
    }
    expect(sw.handles('https://app.test/')).toBe(true);
    expect(sw.handles('https://app.test/assets/index-abc.js')).toBe(true);
    expect(sw.handles('https://app.test/jejudo.png')).toBe(true);
  });
});

describe('비 소식 (ADR-0076) — 서비스워커는 /api/**를 건드리지 않는다', () => {
  it('/api/rain goes to the network as it is (never cached); a file merely named api still is handled', async () => {
    const c = fakeCaches();
    const { source } = buildServiceWorker(base());
    const res = { ok: true, clone: () => res };
    const sw = runSw(source, async () => res, c);
    await sw.install();
    for (const u of ['https://app.test/api/rain?area=aewol', 'https://app.test/api/rain', 'https://app.test/api/other']) {
      expect(sw.handles(u), u).toBe(false);
    }
    expect(sw.handles('https://app.test/apiary.png')).toBe(true);
    expect(sw.handles('https://app.test/')).toBe(true);
  });
});

describe('PWA 상주 앱 갱신', () => {
  it('main.ts checks for a new deploy when the app comes back to the foreground', () => {
    const main = readFileSync(resolve(root, 'src/main.ts'), 'utf8');
    expect(main).toMatch(/visibilitychange[\s\S]*reg\.update\(\)/);
  });
});

describe('QA 2026-09-30 — 새 배포가 상주 앱에 닿는 길', () => {
  it('an old worker still answering a page never re-creates the cache a newer worker deleted (no orphan cache)', async () => {
    const c = fakeCaches();
    const { source, version } = buildServiceWorker(base());
    const sw = runSw(source, async () => ({ ok: true, clone: () => ({ copy: true }) }), c);
    await sw.install();
    await sw.get('https://app.test/assets/late-chunk.js');
    await new Promise((r) => setTimeout(r, 0));
    expect(c.stores.get(`tomorrow-${version}`)?.has('https://app.test/assets/late-chunk.js')).toBe(true);
    c.stores.clear(); // a newer worker activated and deleted this version's cache
    await sw.get('https://app.test/assets/other.js');
    await new Promise((r) => setTimeout(r, 0));
    expect([...c.stores.keys()]).toEqual([]);
  });

  /** `current`: what the page's own-code check answers when the new worker takes over. */
  const setupUpdate = async (controller: unknown, idle: boolean, current: () => Promise<boolean> = async () => false) => {
    const { reloadOnUpdate } = await import('../src/update');
    const on: Record<string, () => void> = {};
    const doc = { visibilityState: 'visible' as DocumentVisibilityState, addEventListener: (t: string, fn: () => void) => void (on[t] = fn) };
    const sw = { controller, addEventListener: (t: string, fn: () => void) => void (on[t] = fn) };
    const reload = vi.fn();
    const check = vi.fn(current);
    reloadOnUpdate({ sw, doc: doc as unknown as Document, idle: () => idle, current: check, reload });
    return { on, doc, reload, check };
  };
  const tick = () => new Promise((r) => setTimeout(r, 0));

  it('when a new worker takes over, the page reloads onto the new code: at once on an idle first screen, else when the app goes to the background', async () => {
    // first install claiming an uncontrolled page: same code, no reload (and nothing to check)
    const first = await setupUpdate(null, true);
    first.on.controllerchange();
    await tick();
    expect(first.reload).not.toHaveBeenCalled();
    expect(first.check).not.toHaveBeenCalled();
    // update while idle on the first screen: reload now
    const idle = await setupUpdate({}, true);
    idle.on.controllerchange();
    await tick();
    expect(idle.reload).toHaveBeenCalledTimes(1);
    // update while looking at cards: wait; coming back to the foreground doesn't do it, going away does
    const busy = await setupUpdate({}, false);
    busy.on.controllerchange();
    await tick();
    busy.on.visibilitychange();
    expect(busy.reload).not.toHaveBeenCalled();
    busy.doc.visibilityState = 'hidden';
    busy.on.visibilitychange();
    busy.on.visibilitychange();
    expect(busy.reload).toHaveBeenCalledTimes(1);
  });

  it('QA 2026-09-30 (MAJOR): controllerchange while the page already runs the new bundle → no reload, idle or not, now or in the background', async () => {
    const idle = await setupUpdate({}, true, async () => true);
    idle.on.controllerchange();
    await tick();
    expect(idle.check).toHaveBeenCalledTimes(1);
    expect(idle.reload).not.toHaveBeenCalled();
    const busy = await setupUpdate({}, false, async () => true);
    busy.on.controllerchange();
    await tick();
    busy.doc.visibilityState = 'hidden'; // e.g. a card opened Kakao Map
    busy.on.visibilitychange();
    expect(busy.reload).not.toHaveBeenCalled();
    // a later deploy that does bring new code still gets the reload
    let same = true;
    const later = await setupUpdate({}, true, async () => same);
    later.on.controllerchange();
    await tick();
    same = false;
    later.on.controllerchange();
    await tick();
    expect(later.reload).toHaveBeenCalledTimes(1);
  });

  it('a failed check counts as old code (a needless reload beats a stale app)', async () => {
    const u = await setupUpdate({}, true, () => Promise.reject(new Error('caches unavailable')));
    u.on.controllerchange();
    await tick();
    expect(u.reload).toHaveBeenCalledTimes(1);
  });

  it('main.ts wires it up with the app state, and checks this page\'s own script (import.meta.url) against the cache', () => {
    const main = readFileSync(resolve(root, 'src/main.ts'), 'utf8');
    expect(main).toMatch(/reloadOnUpdate\(\{[\s\S]*app\.state\(\)/);
    expect(main).toMatch(/current: \(\) => runsCachedCode\(document, [^,]*caches[^,]*, new URL\(import\.meta\.url\)\.href\)/);
  });

  it('the own-code check: script and stylesheet both in the (new) cache → current; either missing, or no Cache API → not', async () => {
    const { runsCachedCode } = await import('../src/update');
    const JS = 'https://app.test/assets/index-new.js';
    const CSS = 'https://app.test/assets/index-new.css';
    const doc = (css: string | null) => ({ querySelector: () => (css ? { href: css } : null) }) as unknown as Document;
    const cache = (...urls: string[]) => ({ match: async (u: RequestInfo | URL) => (urls.includes(String(u)) ? ({} as Response) : undefined) });
    expect(await runsCachedCode(doc(CSS), cache(JS, CSS), JS)).toBe(true);
    expect(await runsCachedCode(doc(CSS), cache(JS), JS)).toBe(false); // a CSS-only deploy
    expect(await runsCachedCode(doc(CSS), cache(CSS), JS)).toBe(false); // new code, same styles
    expect(await runsCachedCode(doc(null), cache(JS), JS)).toBe(true);
    expect(await runsCachedCode(doc(CSS), undefined, JS)).toBe(false);
  });
});

describe('ADR-0063 — absolute paths: the page works at any address', () => {
  it('vite base is "/", and main.ts fetches data and registers the worker from it', () => {
    const cfg = readFileSync(resolve(root, 'vite.config.ts'), 'utf8');
    expect(cfg).toMatch(/base: '\/'/);
    expect(cfg).toMatch(/appType: 'mpa'/); // no SPA fallback in dev/preview either
    const main = readFileSync(resolve(root, 'src/main.ts'), 'utf8');
    expect(main).toContain('.register(`${BASE}sw.js`)');
    expect(main).toMatch(/const BASE = import\.meta\.env\.BASE_URL/);
    const html = readFileSync(resolve(root, 'index.html'), 'utf8');
    expect(html.match(/(?:href|src)="\.\//g)).toBeNull();
  });
});
