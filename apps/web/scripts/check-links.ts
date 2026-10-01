// 길찾기 links against the real Kakao Map (ADR-0067, ADR-0069) — network, so not part of `npm test`.
//
//   npm run check:links            (apps/web; needs playwright(-core) and Chrome, or E2E_CHANNEL=chromium)
//
// For each phone browser's user agent it opens the three kinds of 길찾기 link the cards make (car, walking, a
// small island's pier) in a real browser, follows Kakao's redirects (302s and Kakao's own JS hop) and checks
// where they land: Kakao's app-or-web page `applink.map.kakao.com/route?…` with the right end and mode, and
// never a start (`sp` with a value). That page then calls the app (`kakaomap://route?…`, the same query); a
// headless browser without the app sees that call only sometimes, so it is printed when seen, not required.
// On a PC: Kakao's directions page. Chains recorded 2026-10-01 (ADR-0069); a failure means Kakao changed
// something — look before changing the cards, then docs/device-check.md.
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { TERMINALS, directionsUrl, walkDirectionsUrl } from '../src/links';
import type { Spot } from '../src/pick';

const UA = {
  'iOS Safari': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  'Android Chrome': 'Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36',
  'Samsung Internet': 'Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
  'KakaoTalk iOS': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 25.8.0',
  'KakaoTalk Android': 'Mozilla/5.0 (Linux; Android 14; SM-S921N; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/128.0.0.0 Mobile Safari/537.36 KAKAOTALK 25.8.0',
} as const;
const PC = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

const place = { id: 'x', name: '성산일출봉', lat: 33.4588, lng: 126.9425 } as Spot;
const t = TERMINALS.우도;
const pier = { ...place, name: t.name, lat: t.lat, lng: t.lng };
// A step of the chain is checked by its query, not its spelling: Kakao re-encodes the name (`+`) and
// re-projects the point (126.9425 → 126.94249974…).
type Pin = (u: string) => boolean;
const near = (a: string | undefined, b: number) => !!a && Math.abs(Number(a) - b) < 1e-4;
const q = (u: string) => new URL(u).searchParams;
/** Kakao's app-or-web page with this end, name and mode, and no start */
const bridge = (p: { name: string; lat: number; lng: number }, by: 'car' | 'foot'): Pin => (u) => {
  if (!u.startsWith('https://applink.map.kakao.com/route?')) return false;
  const s = q(u);
  const [lat, lng] = (s.get('ep') ?? '').split(',');
  return near(lat, p.lat) && near(lng, p.lng) && s.get('en') === p.name && s.get('by') === by && !s.get('sp');
};
/** Kakao's PC directions page, 자동차 tab, this end's name, no start */
const pcCar = (p: { name: string }): Pin => (u) => {
  if (!u.startsWith('https://map.kakao.com/?')) return false;
  const s = q(u);
  return s.get('target') === 'car' && (s.get('rt') ?? '').startsWith(',,') && s.get('rt2') === p.name && !s.get('rt1');
};

const LINKS = [
  { kind: 'car', url: directionsUrl(place), bridge: bridge(place, 'car'), pc: pcCar(place) },
  { kind: 'walk', url: walkDirectionsUrl(place), bridge: bridge(place, 'foot'), pc: bridge(place, 'foot') },
  { kind: 'pier', url: directionsUrl(pier), bridge: bridge(pier, 'car'), pc: pcCar(pier) },
];

async function loadPlaywright() {
  for (const name of ['playwright-core', 'playwright']) {
    try {
      return await import(name);
    } catch {
      /* next */
    }
  }
  const root = execSync('npm root -g').toString().trim();
  for (const name of ['playwright-core', 'playwright']) {
    try {
      return createRequire(join(root, 'noop.js'))(name);
    } catch {
      /* next */
    }
  }
  throw new Error('playwright(-core) not found');
}

const pw = await loadPlaywright();
// A sandbox whose outbound HTTPS goes through a proxy with its own CA: the browser goes through it too.
const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
const browser = await pw.chromium.launch({ channel: process.env.E2E_CHANNEL ?? 'chrome', headless: true, ...(proxy ? { proxy: { server: proxy } } : {}) });

async function follow(url: string, ua: string, mobile: boolean, pin: Pin): Promise<string[]> {
  const ctx = await browser.newContext({ userAgent: ua, isMobile: mobile, hasTouch: mobile, viewport: { width: 390, height: 844 }, ignoreHTTPSErrors: !!proxy });
  const page = await ctx.newPage();
  const chain: string[] = [];
  page.on('request', (r: { isNavigationRequest(): boolean; frame(): unknown; url(): string }) => {
    if (r.isNavigationRequest() && r.frame() === page.mainFrame()) chain.push(r.url());
  });
  await page.goto(url, { waitUntil: 'commit', timeout: 45000 }).catch(() => {});
  // Kakao's pages hop on by script: wait for the pinned step, then a little for the app call (phones)
  for (let i = 0; i < 90 && !chain.some((u) => pin(u)); i++) await page.waitForTimeout(500);
  for (let i = 0; i < 8 && mobile && chain.some((u) => pin(u)) && !chain.some((u) => u.startsWith('kakaomap://')); i++) await page.waitForTimeout(500);
  await ctx.close();
  return chain;
}

type Case = { kind: string; who: string; url: string; mobile: boolean; pin: Pin };
const cases: Case[] = LINKS.flatMap((l) => [
  ...Object.keys(UA).map((who) => ({ kind: l.kind, who, url: l.url, mobile: true, pin: l.bridge })),
  { kind: l.kind, who: 'PC Chrome', url: l.url, mobile: false, pin: l.pc },
]);
const okOf = (k: Case, c: string[]) => c.some((u) => k.pin(u)) && !c.some((u) => /[?&]sp=[^&]/.test(u));
const uaOf = (who: string) => (who === 'PC Chrome' ? PC : UA[who as keyof typeof UA]);

// one at a time (in parallel the network on the way drops pages), each tried up to three times
const problems: string[] = [];
for (let i = 0; i < cases.length; i += 1) {
  await Promise.all(cases.slice(i, i + 1).map(async (k) => {
    let chain = await follow(k.url, uaOf(k.who), k.mobile, k.pin);
    for (let n = 1; n < 3 && !okOf(k, chain); n++) chain = await follow(k.url, uaOf(k.who), k.mobile, k.pin);
    const ok = okOf(k, chain);
    // reached a Kakao end page yet failed = Kakao changed; stopped on the way = the network (run again)
    const changed = !ok && chain.some((u) => u.startsWith('https://applink.map.kakao.com/') || u.startsWith('kakaomap://') || (!k.mobile && u.startsWith('https://map.kakao.com/?')));
    const app = chain.find((u) => u.startsWith('kakaomap://'));
    console.log(`${ok ? 'ok  ' : changed ? 'FAIL' : 'STOP'} ${k.kind.padEnd(4)} ${k.who.padEnd(17)} ${chain.length} steps → ${chain.find((u) => k.pin(u)) ?? chain.at(-1)}${app ? `\n     app call: ${app}` : ''}`);
    if (!ok) problems.push(`${changed ? 'changed' : 'stopped on the way (network; run again)'} — ${k.kind} ${k.who}: ${chain.join(' → ')}`);
  }));
}
await browser.close();
if (problems.length) {
  console.error(`\n${problems.length} link(s) changed or did not load:\n${problems.join('\n')}`);
  process.exit(1);
}
console.log(`\nall ${cases.length} 길찾기 links land where the cards expect`);
