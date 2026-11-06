// 길찾기 links against the real Naver Map and Kakao Map (ADR-0067, ADR-0069, ADR-0071) — network, so not part
// of `npm test`.
//
//   npm run check:links            (apps/web; needs playwright(-core) and Chrome, or E2E_CHANNEL=chromium)
//
// For each phone browser's user agent it opens the three kinds of 길찾기 link the cards make (car, walking, a
// small island's pier) for each map app in a real browser, follows the redirects (302s and the maps' own JS
// hops) and checks where they land, never with a start:
// - 네이버지도: Naver's app-or-web page `m.map.naver.com/appLink.naver?…` with the end (elng/elat/eText) and
//   mode (pathType 0 car, 3 walk). That page then goes on to `app.map.naver.com/launchApp/?…` (the app when
//   installed, else Naver's mobile-web directions) — printed when seen. PC: the directions page itself.
// - 카카오맵: Kakao's app-or-web page `applink.map.kakao.com/route?…` with the right end and mode and no `sp`.
//   That page then calls the app (`kakaomap://route?…`), printed when seen. PC: Kakao's directions page.
// - TMAP: an app scheme (`tmap://route?…`) a browser cannot follow; its shape is checked (end only), and
//   its walks are the Naver walking link (TMAP's scheme has no walking mode).
// Chains recorded 2026-10-01 (ADR-0069, ADR-0071); a failure means a map changed something — look before
// changing the cards, then docs/device-check.md.
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { TERMINALS, directionsUrl, goLink, naverDirectionsUrl, walkDirectionsUrl } from '../src/pick/links';
import type { Spot } from '../src/pick/pick';

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

/** Naver's app-or-web page (or the app launch it goes on to) with this end, name and mode, and no start */
const naverBridge = (p: { name: string; lat: number; lng: number }, by: 'car' | 'foot'): Pin => (u) => {
  if (!u.startsWith('https://m.map.naver.com/appLink.naver?') && !u.startsWith('https://app.map.naver.com/launchApp/?')) return false;
  const s = q(u);
  return near(s.get('elat') ?? undefined, p.lat) && near(s.get('elng') ?? undefined, p.lng) && s.get('eText') === p.name && s.get('menu') === 'route' && s.get('pathType') === (by === 'car' ? '0' : '3') && !s.get('slat') && !s.get('slng') && !s.get('sText');
};
/** Naver's PC directions page: the link itself (start `-`) answered 200 with no redirect (`follow` marks it `=200 `) */
const naverPc = (p: { name: string; lat: number; lng: number }, by: 'car' | 'foot'): Pin => (u) =>
  u.startsWith('=200 ') && decodeURIComponent(u.slice(5)) === `https://map.naver.com/p/directions/-/${p.lng},${p.lat},${p.name},,/-/${by === 'foot' ? 'walk' : 'car'}`;

const LINKS = [
  { app: 'naver', kind: 'car', url: naverDirectionsUrl(place, 'car'), bridge: naverBridge(place, 'car'), pc: naverPc(place, 'car') },
  { app: 'naver', kind: 'walk', url: naverDirectionsUrl(place, 'foot'), bridge: naverBridge(place, 'foot'), pc: naverPc(place, 'foot') },
  { app: 'naver', kind: 'pier', url: naverDirectionsUrl(pier, 'car'), bridge: naverBridge(pier, 'car'), pc: naverPc(pier, 'car') },
  { app: 'kakao', kind: 'car', url: directionsUrl(place), bridge: bridge(place, 'car'), pc: pcCar(place) },
  { app: 'kakao', kind: 'walk', url: walkDirectionsUrl(place), bridge: bridge(place, 'foot'), pc: bridge(place, 'foot') },
  { app: 'kakao', kind: 'pier', url: directionsUrl(pier), bridge: bridge(pier, 'car'), pc: pcCar(pier) },
];

// TMAP: the links a card makes (goLink), checked by shape — a browser cannot follow `tmap://`
const tmapProblems: string[] = [];
{
  const from = { lat: place.lat + 0.004, lng: place.lng }; // ~450m: a walk
  const islandSpot = { ...place, name: '우도 하고수동해수욕장', lat: 33.5131, lng: 126.9535 };
  const shapes = [
    { kind: 'car', g: goLink(place, null, false, false, 'tmap'), want: `tmap://route?goalname=${encodeURIComponent(place.name)}&goalx=${place.lng}&goaly=${place.lat}` },
    { kind: 'walk', g: goLink(place, from, true, false, 'tmap'), want: naverDirectionsUrl(place, 'foot') },
    { kind: 'pier', g: goLink(islandSpot, null, false, false, 'tmap'), want: `tmap://route?goalname=${encodeURIComponent(t.name)}&goalx=${t.lng}&goaly=${t.lat}` },
  ];
  for (const { kind, g, want } of shapes) {
    const ok = g.href === want && !/[?&](start|rSt|sp=)/i.test(g.href);
    console.log(`${ok ? 'ok  ' : 'FAIL'} tmap  ${kind.padEnd(4)} shape             → ${g.href}`);
    if (!ok) tmapProblems.push(`changed — tmap ${kind}: ${g.href} (want ${want})`);
  }
}

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

/** the step after the app-or-web page: Kakao's app call, Naver's app launch (a universal / app link) */
const APP_CALL = /^(kakaomap:\/\/|https:\/\/app\.map\.naver\.com\/launchApp\/)/;
/** reached a map's end page (then a miss is a change, not the network) */
const END = /^(https:\/\/applink\.map\.kakao\.com\/|kakaomap:\/\/|https:\/\/m\.map\.naver\.com\/appLink\.naver|https:\/\/app\.map\.naver\.com\/launchApp\/)/;

async function follow(url: string, ua: string, mobile: boolean, pin: Pin): Promise<string[]> {
  const ctx = await browser.newContext({ userAgent: ua, isMobile: mobile, hasTouch: mobile, viewport: { width: 390, height: 844 }, ignoreHTTPSErrors: !!proxy });
  const page = await ctx.newPage();
  const chain: string[] = [];
  page.on('request', (r: { isNavigationRequest(): boolean; frame(): unknown; url(): string }) => {
    if (r.isNavigationRequest() && r.frame() === page.mainFrame()) chain.push(r.url());
  });
  // Naver's PC page is the link itself: that it answered is the step
  page.on('response', (r: { status(): number; url(): string; request(): { isNavigationRequest(): boolean } }) => {
    if (r.status() === 200 && r.request().isNavigationRequest() && r.url().startsWith('https://map.naver.com/p/')) chain.push(`=200 ${r.url()}`);
  });
  await page.goto(url, { waitUntil: 'commit', timeout: 45000 }).catch(() => {});
  // the maps' pages hop on by script: wait for the pinned step, then a little for the app call (phones)
  for (let i = 0; i < 90 && !chain.some((u) => pin(u)); i++) await page.waitForTimeout(500);
  for (let i = 0; i < 8 && mobile && chain.some((u) => pin(u)) && !chain.some((u) => APP_CALL.test(u)); i++) await page.waitForTimeout(500);
  await ctx.close();
  return chain;
}

type Case = { app: string; kind: string; who: string; url: string; mobile: boolean; pin: Pin };
const cases: Case[] = LINKS.flatMap((l) => [
  ...Object.keys(UA).map((who) => ({ app: l.app, kind: l.kind, who, url: l.url, mobile: true, pin: l.bridge })),
  { app: l.app, kind: l.kind, who: 'PC Chrome', url: l.url, mobile: false, pin: l.pc },
]);
const okOf = (k: Case, c: string[]) => c.some((u) => k.pin(u)) && !c.some((u) => /[?&](sp|slat|slng)=[^&]/.test(u));
const uaOf = (who: string) => (who === 'PC Chrome' ? PC : UA[who as keyof typeof UA]);

// one at a time (in parallel the network on the way drops pages), each tried up to three times
const problems: string[] = [];
for (let i = 0; i < cases.length; i += 1) {
  await Promise.all(cases.slice(i, i + 1).map(async (k) => {
    let chain = await follow(k.url, uaOf(k.who), k.mobile, k.pin);
    for (let n = 1; n < 3 && !okOf(k, chain); n++) chain = await follow(k.url, uaOf(k.who), k.mobile, k.pin);
    const ok = okOf(k, chain);
    // reached a map's end page yet failed = the map changed; stopped on the way = the network (run again)
    const changed = !ok && chain.some((u) => END.test(u) || (!k.mobile && (u.startsWith('https://map.kakao.com/?') || u.startsWith('=200 '))));
    const app = chain.find((u) => APP_CALL.test(u));
    console.log(`${ok ? 'ok  ' : changed ? 'FAIL' : 'STOP'} ${k.app.padEnd(5)} ${k.kind.padEnd(4)} ${k.who.padEnd(17)} ${chain.length} steps → ${chain.find((u) => k.pin(u)) ?? chain.at(-1)}${app ? `\n     app call: ${app}` : ''}`);
    if (!ok) problems.push(`${changed ? 'changed' : 'stopped on the way (network; run again)'} — ${k.app} ${k.kind} ${k.who}: ${chain.join(' → ')}`);
  }));
}
await browser.close();
problems.push(...tmapProblems);
if (problems.length) {
  console.error(`\n${problems.length} link(s) changed or did not load:\n${problems.join('\n')}`);
  process.exit(1);
}
console.log(`\nall ${cases.length} 길찾기 links land where the cards expect, and the 3 TMAP links have their shape`);
