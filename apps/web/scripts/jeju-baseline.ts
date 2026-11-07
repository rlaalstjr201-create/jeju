// 「제주가 그대로」 기준선 (plans/busan.md S0 「제주가 그대로임을 보이는 법」): what a Jeju visitor gets — the data,
// every deployed file but the hashed assets, the service worker's list, the server functions' answers, and the home
// in a real browser (first paint, DOM, computed styles, storage, requests) — measured from a production build and
// compared with review/busan/release-baseline.json.
//   $env:SITE_URL='https://yeochana.com'; npm run build; npm run check:jeju            (compare, exit 1 on a difference)
//   npm run check:jeju -- --write                                                     (record a new baseline)
// Run with tsx, not Vite: the server functions are imported here without Vite's defines, as wrangler bundles them.
import { spawn, execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { spotsVersion } from './sw-build';

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(APP, 'dist');
const OUT = join(APP, 'review/busan/release-baseline.json');
const DETAIL = join(APP, 'review/busan/release-baseline.detail.json');
const SITE = 'https://yeochana.com';
/** Vite's own kB (1000 bytes), as the budget has always been read (ADR-0093 Amendment 4). */
const BUDGET = 70_000; // ADR-0116 (was 60_000, ADR-0100; 50_000 before)
const PORT = Number(process.env.BASELINE_PORT ?? 4181);
const BASE = `http://localhost:${PORT}/`;
/** 2026-10-18 14:00 KST: the date line, sunset and 「지금」 are the same on every run. */
const CLOCK = Date.parse('2026-10-18T14:00:00+09:00');

/** index.html's `<!--busan-->…<!--/busan-->` contents (a switched-on build keeps them, the markers gone; vite.config.ts busanBlock) */
const BUSAN_BLOCKS = [...readFileSync(join(APP, 'index.html'), 'utf8').matchAll(/<!--busan-->([\s\S]*?)<!--\/busan-->/g)].map((m) => m[1]);
/** 출시 스위치를 켠 빌드(plans/busan.md S7): what it adds for Busan on purpose is taken out before the comparison, so the
 * rest is held to the switched-off baseline — the inline blocks, the 부산 파일 캐시 줄 of _headers, the 부산 몫 청크 in the
 * file and precache lists. The inline blocks' size is held to their own cap instead (plans/busan.md 위험: gzip +2KB). */
const SWITCHED = existsSync(join(DIST, 'spots-busan.json'));
const BUSAN_CHUNK = /^assets\/busan-part-\*\.js$/;
/** 자동 지역 빌드(plans/nationwide-app.md 10, U19): what it adds on purpose is taken out the same way — dist/nation/ (the
 * 시도 files and their index), the /nation/* 캐시 줄 of _headers, and two chunks in the file and precache lists: nation-part
 * and busan (src/region/busan.ts, Busan's boundary, split out of busan-part only because nation-part's regionOf needs it too). A
 * Jeju device asks for none of them: the browser run below still counts its requests. 강원's list (spots-gangwon.json and
 * its 캐시 줄, ADR-0102) goes out with that build and is taken out the same way. */
const NATION = existsSync(join(DIST, 'nation/index.json'));
// 오늘 근처에서 하는 것's view (culture-view, ADR-0112 8): its own chunk, for 서울's home only, taken out the same way
const NATION_CHUNK = /^assets\/(?:nation-part|busan|culture-view)-\*\.js$/;
const added = (n: string) => (SWITCHED && BUSAN_CHUNK.test(n)) || (NATION && NATION_CHUNK.test(n));
/** index.html's `<!--nation-->…<!--/nation-->` contents, kept by the 자동 지역 build only (vite.config.ts busanBlock) */
const NATION_BLOCKS = NATION ? [...readFileSync(join(APP, 'index.html'), 'utf8').matchAll(/<!--nation-->([\s\S]*?)<!--\/nation-->/g)].map((m) => m[1]) : [];
const withoutBlocks = (html: string) => (SWITCHED ? [...BUSAN_BLOCKS, ...NATION_BLOCKS].reduce((h, b) => h.replace(b, ''), html) : html);
const sha = (b: Uint8Array | string) => createHash('sha256').update(b).digest('hex');
const short = (b: Uint8Array | string) => sha(b).slice(0, 16);
/** Hashed asset names change with any code change (the build commit is in the JS): only the name is kept. */
const unhash = (s: string) => s.replace(/(assets\/[A-Za-z0-9_.-]+)-[A-Za-z0-9_-]{8}\.(js|css)\b/g, '$1-*.$2');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

/** The few build-time values a file carries that are not about Jeju: asset hashes, the worker's VERSION, and the
 * sitemap date of `/` and `/privacy` (the build day whenever lastmod.json is behind, as before), and so the index's
 * date for sitemap-core.xml, the newest of those. */
function normalized(rel: string, body: Buffer): Buffer | string {
  if (rel === 'sitemap.xml')
    return body
      .toString('utf8')
      .replace(new RegExp(`(<loc>${SITE}/sitemap-core\\.xml</loc><lastmod>)[^<]*`), '$1*')
      // ADR-0099: the line for Busan's own sitemap file (a switched-on build's, added on purpose)
      .replace(new RegExp(`\\n<sitemap><loc>${SITE}/sitemap-busan-core\\.xml</loc>(?:<lastmod>[^<]*</lastmod>)?</sitemap>`), '');
  if (rel === 'index.html') return withoutBlocks(unhash(body.toString('utf8')));
  // ADR-0099 Amendment 1: the hub's line to /busan/ (a switched-on build's, added on purpose)
  if (rel === 'jeju/index.html' && SWITCHED) return body.toString('utf8').replace('\n<p>다른 여행지: <a href="/busan/">여차나:부산</a></p>', '');
  if (rel === '_headers' && SWITCHED) {
    const h = body.toString('utf8').replace(/\/spots-busan\.json\r?\n {2}Cache-Control: public, max-age=31536000, immutable\r?\n/, '');
    return NATION ? h.replace(/\/nation\/\*\r?\n {2}Cache-Control: public, max-age=31536000, immutable\r?\n/, '').replace(/\/spots-gangwon\.json\r?\n {2}Cache-Control: public, max-age=31536000, immutable\r?\n/, '').replace(/\/spots-seoul\.json\r?\n {2}Cache-Control: public, max-age=31536000, immutable\r?\n/, '') : h;
  }
  // the precache list is sorted by hashed names (sw-build), so its order moves when only a hash does: compared as a set
  if (rel === 'sw.js')
    return unhash(body.toString('utf8'))
      .replace(/const VERSION = '[0-9a-f]+';/, "const VERSION = '*';")
      .replace(/const PRECACHE = \[([^\]]*)\]/, (_, items: string) => `const PRECACHE = [${items.split(',').sort().join(',')}]`);
  if (rel === 'sitemap-core.xml')
    return body.toString('utf8').replace(new RegExp(`(<loc>${SITE}/(?:privacy)?</loc><lastmod>)[^<]*`, 'g'), '$1*');
  return body;
}

function files() {
  const out: Record<string, string> = {};
  const groups = new Map<string, string[]>();
  for (const p of walk(DIST).sort()) {
    const rel = relative(DIST, p).replace(/\\/g, '/');
    if (rel.startsWith('assets/')) continue;
    // ADR-0099: Busan's static pages and their sitemap file, what a switched-on build adds for Busan on purpose
    if (SWITCHED && (rel.startsWith('busan/') || rel === 'sitemap-busan-core.xml')) continue;
    if (NATION && (rel.startsWith('nation/') || rel === 'spots-gangwon.json' || rel === 'spots-seoul.json')) continue;
    const h = short(normalized(rel, readFileSync(p)));
    const m = /^jeju\/([^/]+)\/./.exec(rel);
    if (m) groups.set(`jeju/${m[1]}/`, [...(groups.get(`jeju/${m[1]}/`) ?? []), `${rel}\0${h}`]);
    else out[rel] = h;
  }
  for (const [g, list] of groups) out[g] = `${list.length} files ${short(list.join('\n'))}`;
  return out;
}

function assets(indexHtml: string) {
  const names = readdirSync(join(DIST, 'assets')).sort();
  const entry = [...indexHtml.matchAll(/(?:src|href)="\/(assets\/index-[A-Za-z0-9_-]{8}\.(?:js|css))"/g)].map((m) => m[1]);
  const gz = Object.fromEntries(entry.map((f) => [unhash(f), gzipSync(readFileSync(join(DIST, f))).length]));
  const total = Object.values(gz).reduce((a, b) => a + b, 0);
  // sorted after the hash is gone: `ja-<hash>.js` and `ja-<hash>.css` would otherwise swap with the hashes
  return { names: names.map((n) => unhash(`assets/${n}`)).filter((n) => !added(n)).sort(), koreanEntryGzip: gz, koreanEntryGzipTotal: total };
}

function swList() {
  const src = readFileSync(join(DIST, 'sw.js'), 'utf8');
  const m = /const PRECACHE = (\[[^\]]*\]);/.exec(src);
  if (!m) return null;
  // The build lists the entry's CSS and JS in the order of their content hashes, so the order moves whenever either
  // changes (ADR-0101: no change to what is cached). The two are put in a fixed order — ./, the CSS, the JS, the rest
  // as listed — so only a file that is added or dropped shows.
  const rank = (n: string) => (n === './' ? 0 : n === 'assets/index-*.css' ? 1 : n === 'assets/index-*.js' ? 2 : 3);
  return (JSON.parse(m[1]) as string[])
    .map(unhash)
    .filter((n) => !added(n))
    .sort((a, b) => rank(a) - rank(b));
}

/** The two server functions as deployed (no Vite defines): /api/rain per area slug, /api/events per batch. */
async function functions() {
  const { onRequestGet } = await import('../functions/api/rain');
  const { handleEvents } = await import('../functions/_lib/events/handler');
  const { AREAS } = await import('../src/region/areas');
  const realFetch = globalThis.fetch;
  const rain: Record<string, string> = {};
  try {
    for (const slug of [...AREAS.map((a) => a.slug), 'haeundae', 'gwangalli', '', 'nowhere']) {
      let sent = '';
      globalThis.fetch = (async (url: string | URL | Request) => {
        const q = new URL(String(url)).searchParams;
        sent = `nx=${q.get('nx')} ny=${q.get('ny')}`;
        return new Response('{"response":{"header":{"resultCode":"03","resultMsg":"NO_DATA"}}}', { status: 200 });
      }) as typeof fetch;
      const res = await onRequestGet({ request: new Request(`https://x.test/api/rain?area=${slug}`), env: { KMA_SERVICE_KEY: 'k' } });
      rain[slug || '(empty)'] = `${res.status} ${res.headers.get('X-Rain-Reason') ?? ''} ${sent}`.trim();
    }
    const noKey = await onRequestGet({ request: new Request('https://x.test/api/rain?area=aewol'), env: {} });
    rain['aewol (no key)'] = `${noKey.status} ${noKey.headers.get('X-Rain-Reason')}`;
  } finally {
    globalThis.fetch = realFetch;
  }
  const d = '2026-10-18';
  const batches: Record<string, unknown[]> = {
    tap: [{ e: 'tap', mood: 'walk', d }],
    'shown by area': [{ e: 'shown', id: 'a1b2c3d4-0000-4000-8000-000000000001', mood: 'rest', range: '30', basis: 'area', area: '애월', d }],
    'stay link': [{ e: 'open', id: 'src:hotel-a', d }],
    'field dest': [{ e: 'tap', mood: 'walk', d, dest: 'jeju' }],
    'area 광안리': [{ e: 'shown', id: 'bs-126081', mood: 'walk', basis: 'area', area: '광안리', d }],
    'event start_view': [{ e: 'start_view', d }],
  };
  const events: Record<string, string> = {};
  for (const [name, body] of Object.entries(batches)) {
    const counted: string[] = [];
    const store = { increment: async (day: string, id: string, e: string, n = 1) => void counted.push(`${day} ${id} ${e} +${n}`), dump: async () => [] };
    const res = await handleEvents(new Request('https://x.test/api/events', { method: 'POST', body: JSON.stringify(body) }), store, () => new Date(CLOCK));
    events[name] = `${res.status} ${await res.text()} ${counted.join('; ')}`.trim();
  }
  return { rain, events };
}

// --- the home in a real browser ---
const GEO_STUB = `(() => {
  window.__geoCalls = 0;
  const geo = { getCurrentPosition(ok) { window.__geoCalls++; setTimeout(() => ok({ coords: { latitude: 33.5122, longitude: 126.5272 } }), 30); } };
  Object.defineProperty(navigator, 'geolocation', { value: geo, configurable: true });
  if (navigator.permissions) {
    const q = navigator.permissions.query.bind(navigator.permissions);
    navigator.permissions.query = (d) => d && d.name === 'geolocation' ? Promise.resolve({ state: 'prompt' }) : q(d);
  }
  document.addEventListener('DOMContentLoaded', () => { window.__dcl = document.documentElement.outerHTML; }, { once: true });
})();`;
const STYLE_PROPS = ['display', 'position', 'visibility', 'opacity', 'color', 'background-color', 'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'text-align', 'margin', 'padding', 'border-width', 'border-color', 'border-radius', 'box-shadow', 'transform', 'z-index', 'overflow', 'gap', 'flex-direction', 'grid-template-columns'];

interface Snap {
  body: string;
  htmlClass: string;
  styles: string[];
  local: Record<string, string>;
  session: Record<string, string>;
  geoCalls: number;
  cards: string[];
  /** the photos on screen (not display:none, nor in a hidden part such as the home under the results) */
  shownImgs: string[];
}
const SNAP = `(() => {
  const props = ${JSON.stringify(STYLE_PROPS)};
  const keep = (s) => Object.fromEntries(Object.keys(s).filter((k) => !k.startsWith('__')).sort().map((k) => [k, s.getItem(k)]));
  // 출시 스위치를 켠 빌드의 바디 인라인(시작 화면 문구 표, ADR-0096): 제주 기기에서는 아무것도 그리지 않는 스크립트라 빼고 잰다
  const busan = (el) => el.tagName === 'SCRIPT' && el.textContent.includes('__ycT');
  const styles = [...document.body.querySelectorAll('*')].filter((el) => !busan(el)).map((el) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const box = [r.x, r.y, r.width, r.height].map((v) => Math.round(v * 2) / 2).join(',');
    return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + ' ' + box + ' ' + props.map((p) => cs.getPropertyValue(p)).join('|');
  });
  return {
    body: (() => { const b = document.body.cloneNode(true); for (const s of b.querySelectorAll('script')) if (busan(s)) s.remove(); return b.outerHTML; })(),
    htmlClass: document.documentElement.className,
    styles,
    local: keep(localStorage),
    session: keep(sessionStorage),
    geoCalls: window.__geoCalls,
    cards: [...document.querySelectorAll('#cards .card:not(.ghost) .name')].map((e) => e.textContent),
    shownImgs: [...document.querySelectorAll('img')].filter((e) => e.checkVisibility()).map((e) => e.currentSrc || e.src),
  };
})()`;

async function loadPlaywright(): Promise<any> {
  for (const name of ['playwright-core', 'playwright']) {
    try {
      return await import(name);
    } catch {
      /* the global install below */
    }
  }
  const root = execSync('npm root -g').toString().trim();
  return createRequire(join(root, 'noop.js'))('playwright-core');
}

async function startPreview() {
  const vite = join(dirname(createRequire(join(APP, 'package.json')).resolve('vite/package.json')), 'bin', 'vite.js');
  const proc = spawn(process.execPath, [vite, 'preview', '--port', String(PORT), '--strictPort'], { cwd: APP, stdio: 'pipe' });
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(BASE)).ok) return proc;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  proc.kill();
  throw new Error('vite preview did not start');
}

/** Requests as a sorted count: the order photos and the two entry files go out in is the browser's. */
const tally = (list: string[]) => Object.fromEntries([...new Set(list)].sort().map((u) => [u, list.filter((x) => x === u).length]));

async function browserRun(firstId: string) {
  const pw = await loadPlaywright();
  const server = await startPreview();
  const browser = await pw.chromium.launch({ channel: process.env.E2E_CHANNEL ?? 'chrome', headless: true });
  const photo = readFileSync(join(APP, 'public/icons/icon-512.png'));
  // 출시 스위치를 켠 빌드(plans/busan.md S7): 저장소가 빈 첫 방문은 시작 화면이다. 제주 사용자는 거기서 제주를 고른 기기
  // (jeju.dest)로 잰다 — 시작 화면 자체는 이 기준선이 아니라 e2e(BS-*)·start.test.ts가 본다
  const switched = existsSync(join(DIST, 'spots-busan.json'));
  const devices: Record<string, Record<string, unknown>> = {
    empty: switched ? { 'jeju.dest': 'jeju' } : {},
    'saved.v2 only': { 'jeju.saved.v2': [{ id: firstId, date: '2026-10-17', order: 0 }] },
  };
  const summary: Record<string, unknown> = {};
  const detail: Record<string, unknown> = {};
  try {
    for (const [name, storage] of Object.entries(devices)) {
      const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, locale: 'ko-KR', serviceWorkers: 'block', colorScheme: 'light' });
      await ctx.clock.setFixedTime(CLOCK);
      await ctx.addInitScript(GEO_STUB);
      await ctx.addInitScript(
        `(() => { if (sessionStorage.getItem('__seeded')) return; localStorage.clear(); sessionStorage.clear(); const s = ${JSON.stringify(storage)}; for (const k in s) localStorage.setItem(k, JSON.stringify(s[k])); sessionStorage.setItem('__seeded', '1'); })();`,
      );
      await ctx.route('https://**/*', (r: any) => (/\.(png|jpe?g|webp|gif)(\?|$)/i.test(r.request().url()) ? r.fulfill({ status: 200, contentType: 'image/png', body: photo }) : r.fulfill({ status: 204 })));
      await ctx.route(`${BASE}api/**`, (r: any) => r.fulfill({ status: 204 }));
      const requests: string[] = [];
      const urls: string[] = [];
      const page = await ctx.newPage();
      page.on('request', (r: any) => {
        const u: string = r.url();
        if (u.startsWith('data:')) return;
        urls.push(u);
        requests.push(unhash(u.startsWith(BASE) ? `/${u.slice(BASE.length)}` : new URL(u).host + '/…'));
      });
      await page.goto(BASE, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1500);
      // a string, not a function: tsx would wrap a function's inner arrows in a helper the page does not have
      const snap = (): Promise<Snap> => page.evaluate(SNAP);
      // the switched-on build's two inline blocks (ADR-0096), as index.html has them: taken out before the hash
      const dcl = [...BUSAN_BLOCKS, ...NATION_BLOCKS].reduce((h, b) => h.replace(b, ''), unhash(await page.evaluate('window.__dcl')));
      const home = await snap();
      const homeRequests = [...requests];
      await page.locator('[data-mood="walk"]').first().click();
      await page.waitForSelector('#cards .card:not(.ghost) .name', { timeout: 8000 });
      await page.waitForTimeout(1000);
      const walk = await snap();
      // a photo from elsewhere counts once it is on screen: the home's mood rows re-render under the results with lazy
      // second photos that Chrome fetches or not before they are hidden (a race, 8 or 10 on the same build)
      const shown = new Set(walk.shownImgs);
      const walkRequests = requests.slice(homeRequests.length).filter((_, i) => {
        const u = urls[homeRequests.length + i];
        return u.startsWith(BASE) || !/\.(png|jpe?g|webp|gif)(\?|$)/i.test(u) || shown.has(u);
      });
      const after = (s: typeof home) => ({ ...s, body: unhash(s.body) });
      summary[name] = {
        firstPaint: { html: short(dcl) },
        home: { body: short(unhash(home.body)), styles: `${home.styles.length} elements ${short(home.styles.join('\n'))}`, htmlClass: home.htmlClass, local: home.local, session: home.session, geoCalls: home.geoCalls, requests: tally(homeRequests) },
        walk: { cards: walk.cards, body: short(unhash(walk.body)), styles: `${walk.styles.length} elements ${short(walk.styles.join('\n'))}`, local: walk.local, session: walk.session, geoCalls: walk.geoCalls, requests: tally(walkRequests) },
      };
      detail[name] = { firstPaint: dcl, home: after(home), walk: after(walk) };
      await ctx.close();
    }
  } finally {
    await browser.close();
    server.kill();
  }
  return { summary, detail };
}

async function measure() {
  const indexHtml = readFileSync(join(DIST, 'index.html'), 'utf8');
  if (!indexHtml.includes(`${SITE}/`)) throw new Error(`dist/index.html is not a production build: run  $env:SITE_URL='${SITE}'; npm run build  first`);
  const spots = readFileSync(join(APP, 'public/spots.json'));
  const places = ['en', 'zh-Hans', 'ja'].map((l) => {
    const f = join(APP, `public/i18n/places.${l}.json`);
    return [l, existsSync(f) ? readFileSync(f, 'utf8') : ''] as const;
  });
  const firstId = (JSON.parse(spots.toString('utf8')) as { id: string }[])[0].id;
  const full = unhash(indexHtml);
  const html = withoutBlocks(full);
  // the inline blocks' own cost, a switched-on build only
  const inlineGzip = gzipSync(full).length - gzipSync(html).length;
  const browser = await browserRun(firstId);
  return {
    summary: {
      data: {
        'public/spots.json': sha(spots),
        ...Object.fromEntries(places.map(([l, t]) => [`public/i18n/places.${l}.json`, sha(t)])),
        __SPOTS_V__: spotsVersion(spots),
        __PLACES_V__: spotsVersion(places.map(([, t]) => t).join('\0')),
      },
      indexHtml: { bytes: Buffer.byteLength(html), gzip: gzipSync(html).length },
      ...(SWITCHED ? { busanInlineGzip: inlineGzip } : {}),
      files: files(),
      precache: swList(),
      assets: assets(indexHtml),
      functions: await functions(),
      browser: browser.summary,
    },
    detail: browser.detail,
  };
}

/** Paths whose values differ, with both values (a leaf at a time). */
function diff(a: unknown, b: unknown, at = ''): string[] {
  if (JSON.stringify(a) === JSON.stringify(b)) return [];
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
    return keys.flatMap((k) => diff((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], at ? `${at}.${k}` : k));
  }
  return [`${at}\n    baseline: ${JSON.stringify(a)}\n    now:      ${JSON.stringify(b)}`];
}

const write = process.argv.includes('--write');
const now = await measure();
const commit = (() => {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: APP, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
})();
const total = now.summary.assets.koreanEntryGzipTotal;
if (write) {
  mkdirSync(dirname(OUT), { recursive: true });
  const { assets: a, ...rest } = now.summary;
  writeFileSync(OUT, `${JSON.stringify({ _why: 'plans/busan.md 「제주가 그대로임을 보이는 법」. scripts/jeju-baseline.ts writes and checks it.', measuredAt: commit, ...rest, assets: a }, null, 1)}\n`);
  writeFileSync(DETAIL, `${JSON.stringify(now.detail, null, 1)}\n`);
  console.log(`baseline written (${commit}): ${relative(APP, OUT)}; Korean entry JS+CSS gzip ${total} B`);
} else {
  const base = JSON.parse(readFileSync(OUT, 'utf8')) as Record<string, unknown> & { assets: { koreanEntryGzipTotal: number } };
  const allowed = new Set<string>((base.allowed as string[] | undefined) ?? []);
  // the entry's size may change (any code change does); it is held to the budget and reported instead
  const { koreanEntryGzip: _g, koreanEntryGzipTotal: _t, ...assetNames } = now.summary.assets;
  const { koreanEntryGzip: _bg, koreanEntryGzipTotal: _bt, ...baseNames } = base.assets as typeof now.summary.assets;
  const problems = diff(
    { ...Object.fromEntries(Object.entries(base).filter(([k]) => !['_why', 'measuredAt', 'allowed', 'assets'].includes(k))), assets: baseNames },
    { ...now.summary, assets: assetNames },
  ).filter((p) => ![...allowed].some((x) => p.startsWith(x)));
  const delta = total - base.assets.koreanEntryGzipTotal;
  console.log(`Korean entry JS+CSS gzip: ${total} B (baseline ${base.assets.koreanEntryGzipTotal} B, ${delta >= 0 ? '+' : ''}${delta} B; budget ${BUDGET} B)`);
  if (total > BUDGET) problems.push(`Korean entry JS+CSS gzip ${total} B > ${BUDGET} B`);
  const inline = (now.summary as { busanInlineGzip?: number }).busanInlineGzip;
  if (inline !== undefined) {
    console.log(`switched-on build: index.html inline blocks gzip +${inline} B (cap 2000 B)`);
    if (inline > 2000) problems.push(`inline blocks gzip +${inline} B > 2000 B`);
  }
  if (problems.length) {
    const f = join(tmpdir(), `jeju-baseline-now-${Date.now()}.json`);
    writeFileSync(f, JSON.stringify(now, null, 1));
    console.log(`JEJU CHANGED (${problems.length}) — baseline ${String(base.measuredAt)}, now ${commit}; full measurement: ${f}`);
    for (const p of problems) console.log(`  ${p}`);
    process.exit(1);
  }
  console.log(`Jeju unchanged vs baseline ${String(base.measuredAt)} (now ${commit}): data, ${Object.keys(now.summary.files).length} file entries, precache, functions, browser (2 devices)`);
}
