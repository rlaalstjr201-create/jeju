// @vitest-environment jsdom
// 부산 in the app (plans/busan.md S5, specs/busan.md 1.3·1.4·3.5·5·6, B3·B5·B10·B11): with the switch on only
// (npm run test:busan); the Jeju side of every one of these is the rest of the suite, unchanged.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocateError, mountApp, type App } from '../src/app';
import { kakaoUrl, naverDirectionsUrl, placeUrl } from '../src/pick/links';
import type { Point, Spot } from '../src/pick/pick';
import { BUSAN, loadBusan } from '../src/region/release';
import { sunsetText } from '../src/pick/sun';
import { openMarkets } from '../src/pick/home';
import { KEYS, createStore, destKey, parseRegion, parseStay } from '../src/store';
import type { UsageEvent } from '../src/usage/track';
import { fileSpots } from './fixtures';
import { $, $$, cardIds, flush, html, render, reset, settle, tap, destSide } from './harness';

const busanRaw = JSON.parse(readFileSync(resolve(__dirname, '../public/spots-busan.json'), 'utf8')) as Spot[];
const 해운대 = { lat: 35.1587, lng: 129.1604 };
const 동문시장 = { lat: 33.5122, lng: 126.5272 };
const wait = async () => {
  for (let i = 0; i < 4; i++) await flush();
  await settle();
};
function mount(o: { dest?: 'jeju' | 'busan'; at?: Point | 'outside'; storage?: Record<string, unknown>; busan?: Spot[] } = {}) {
  if (o.dest) localStorage.setItem(KEYS.dest, JSON.stringify(o.dest));
  for (const [k, v] of Object.entries(o.storage ?? {})) localStorage.setItem(k, JSON.stringify(v));
  const asked: string[] = [];
  const app = render({
    loadSpots: (d) => (asked.push(d), Promise.resolve(d === 'busan' ? (o.busan ?? busanRaw) : fileSpots)),
    locate: () => (o.at === 'outside' ? Promise.reject(new LocateError('outside')) : Promise.resolve(o.at ?? 동문시장)),
  });
  return { app, asked };
}
const busanIds = () => cardIds().every((id) => id?.startsWith('bs-'));

describe.runIf(BUSAN)('부산 (switch on)', () => {
  // as main.ts does where Busan is in play from the start (a device that chose it, a position read outside Jeju);
  // the part's own arrival is tests/busan-part.test.ts
  beforeAll(async () => void (await loadBusan()));
  beforeEach(() => {
    reset();
    Element.prototype.scrollIntoView ??= () => undefined; // jsdom has no layout
  });
  afterEach(reset);

  it('B3 부산 홈: 여차나:부산, the title, 부산 인기 without a position, 한국관광공사 credit, no 다른 동네 tiles, only the Busan file asked for', async () => {
    const { asked } = mount({ dest: 'busan' });
    await wait();
    expect($('.logo .rg').textContent).toBe(':부산');
    expect(document.title).toBe('여차나:부산 · P를 위한 여행동반자');
    expect($('[data-mood="rest"] .ex').textContent).toMatch(/^부산 인기: /);
    expect($('#homeMore .credit').textContent).toBe('정보·사진: 한국관광공사');
    expect($$('#homeMore a[href^="/jeju/"]')).toEqual([]);
    expect($('#results > .credit').textContent).toBe('정보·사진: 한국관광공사');
    expect(($('#results > .landing') as HTMLElement).hidden).toBe(true);
    expect(asked).toEqual(['busan']);
  });

  it('B3 GPS 해운대: 내 위치 근처, Busan cards; B11 coordinate directions, searches scoped to 부산', async () => {
    mount({ dest: 'busan', at: 해운대 });
    await wait();
    await tap('[data-mood="walk"]');
    await wait();
    expect($('#basis > span').textContent).toBe('내 위치 근처');
    expect(cardIds()).toHaveLength(3);
    expect(busanIds()).toBe(true);
    const spot = busanRaw.find((s) => s.id === cardIds()[0])!;
    expect($('#cards .card .go').getAttribute('href')).toContain(`${spot.lng},${spot.lat}`);
    const noKakao = busanRaw.find((s) => !s.kakaoPlaceId && !/부산/.test(s.name))!;
    for (const url of [placeUrl(noKakao, 'naver'), kakaoUrl(noKakao)]) {
      expect(decodeURIComponent(url)).toContain('부산');
      expect(decodeURIComponent(url)).not.toContain('제주');
    }
    expect(naverDirectionsUrl(noKakao, 'car')).toContain('/directions/');
  });

  it('B5 자동 전환: 제주·내 위치 + a fix in 해운대 → 부산 and the status line; 제주·애월 + 해운대 → stays 제주', async () => {
    const { asked } = mount({ dest: 'jeju', at: 해운대 });
    await wait();
    await tap('[data-mood="walk"]');
    await wait();
    expect($('.logo .rg').textContent).toBe(':부산');
    expect($('#status').textContent).toContain('지금 계신 부산으로 바꿨어요.');
    expect(busanIds()).toBe(true);
    expect(asked).toEqual(['jeju', 'busan']);
    expect(localStorage.getItem(KEYS.dest)).toBe('"busan"');
    reset();
    mount({ dest: 'jeju', at: 해운대, storage: { 'jeju.basis': 'region', 'jeju.region': '애월' } });
    await wait();
    await tap('[data-mood="walk"]');
    await wait();
    expect($('.logo .rg').textContent).toBe(':제주');
    expect(cardIds().some((id) => id?.startsWith('bs-'))).toBe(false);
  });

  it('B5 기준 시트에서 부산을 고르면 지역 고르기와 부산 동네 칸; a GPS read in Jeju does not bring Jeju back', async () => {
    mount({ dest: 'jeju', at: 동문시장 });
    await wait();
    await tap('#basis');
    await destSide();
    expect($$('#sheet [data-dest]:not([data-dest="nation"]):not([data-dest="gangwon"]):not([data-dest="seoul"])').map((b) => [b.textContent, b.getAttribute('aria-pressed')])).toEqual([
      ['제주', 'true'],
      ['부산', 'false'],
    ]);
    await tap('#sheet [data-dest="busan"]');
    await wait();
    expect($('#basis > span').textContent).toBe('지역 고르기');
    expect($$('#sheet [data-area]').map((b) => b.dataset.area)).toEqual(['다대포', '송도·감천', '원도심', '영도', '부산역·초량', '서면', '동래·금정', '오륙도·용호', '광안리', '센텀', '해운대', '송정·기장']);
    await tap('#sheet [data-action="close"].sheet-close');
    await tap('[data-mood="walk"]');
    await wait();
    expect($('.logo .rg').textContent).toBe(':부산');
    expect($('#cards .notice-t').textContent).toBe('지금은 부산 밖이에요.');
    await tap('#cards [data-area="광안리"]');
    await wait();
    expect($('#basis > span').textContent).toBe('광안리 근처');
    expect(busanIds()).toBe(true);
    // each destination keeps its own 동네 (ADR-0097)
    expect([localStorage.getItem('jeju.region.busan'), localStorage.getItem('jeju.basis.busan'), localStorage.getItem('jeju.region')]).toEqual(['"광안리"', '"region"', null]);
  });

  // owner report 2026-10-24: back on a destination whose list was already in, the home stayed without 「예:」 or photos
  it('제주 → 부산 → 제주: the Jeju list already in comes back with it — 「제주 인기:」 and photos, not asked for again', async () => {
    const { asked } = mount({ dest: 'jeju', at: 'outside' });
    await wait();
    expect($('[data-mood="rest"] .ex').textContent).toMatch(/^제주 인기: /);
    await tap('#basis');
    await destSide();
    await tap('#sheet [data-dest="busan"]');
    await wait();
    expect($('[data-mood="rest"] .ex').textContent).toMatch(/^부산 인기: /);
    await tap('#sheet [data-dest="jeju"]');
    await wait();
    expect($('.logo .rg').textContent).toBe(':제주');
    expect($('[data-mood="rest"] .ex')?.textContent).toMatch(/^제주 인기: /);
    expect($$('.mood img').length).toBeGreaterThan(0);
    expect(asked).toEqual(['jeju', 'busan']);
  });

  it('ADR-0094 Amendment 3: the name line 「여차나:제주 ▾」 is a button that opens the 기준 시트 on its 여행지 row; its name follows the 여행지', async () => {
    mount({ dest: 'jeju', at: 동문시장 });
    await wait();
    const logo = $('#logo') as HTMLButtonElement;
    expect([logo.tagName, logo.getAttribute('aria-haspopup'), logo.getAttribute('aria-label')]).toEqual(['BUTTON', 'dialog', '여차나:제주, 여행지 바꾸기']);
    logo.focus();
    await tap('#logo');
    expect($('#sheet [role="dialog"], #sheet .sheet')).toBeTruthy();
    expect(document.activeElement).toBe($('#sheet [data-dest="jeju"]'));
    await tap('#sheet [data-dest="busan"]');
    await wait();
    expect(logo.getAttribute('aria-label')).toBe('여차나:부산, 여행지 바꾸기');
  });

  it('B10 부산에 저장한 곳: kept when Jeju is in use, one line under the saved list, which opens Busan’s', async () => {
    mount({ dest: 'busan', at: 해운대 });
    await wait();
    await tap('[data-mood="walk"]');
    await wait();
    const id = cardIds()[0]!;
    await tap($$('#cards .heart')[0]);
    await tap('#basis');
    await destSide();
    await tap('#sheet [data-dest="jeju"]');
    await wait();
    expect(localStorage.getItem(KEYS.savedV2)).toContain(id);
    await tap('#sheet .sheet-close');
    await tap('#results .settings');
    await wait();
    const line = $('#savedView [data-action="other-dest"]');
    expect(line.textContent).toBe('부산에 저장한 곳 1곳');
    await tap(line);
    await wait();
    expect($('.logo .rg').textContent).toBe(':부산');
    expect(cardIds()).toEqual([id]);
  });

  it('photo-less Busan places: no photo box from the start (no <img src="">)', async () => {
    mount({ dest: 'busan', at: 해운대, busan: busanRaw.map((s) => ({ ...s, image: '' })) });
    await wait();
    await tap('[data-mood="walk"]');
    await wait();
    expect(cardIds()).toHaveLength(3);
    expect($$('#cards .card img')).toEqual([]);
    expect($$('#cards .card.noimg')).toHaveLength(3);
  });

  it('탭 숨김: a destination with fewer than 3 places for 체험 hides that tab (spec 5절); 3 or more shows it', async () => {
    const few = busanRaw.filter((s) => !(s.mood === 'new' && s.sub === 'do')).concat(busanRaw.filter((s) => s.mood === 'new' && s.sub === 'do' && s.book).slice(0, 2));
    mount({ dest: 'busan', at: 해운대, busan: few });
    await wait();
    await tap('[data-mood="new"]');
    await wait();
    expect(($('[data-sub="do"]') as HTMLElement).hidden).toBe(true);
    expect(($('[data-sub="sight"]') as HTMLElement).hidden).toBe(false);
    reset();
    mount({ dest: 'busan', at: 해운대 });
    await wait();
    await tap('[data-mood="new"]');
    await wait();
    expect(($('[data-sub="do"]') as HTMLElement).hidden).toBe(false);
  });
});

describe('저장소 키 (ADR-0097)', () => {
  beforeEach(reset);
  it('basis, region and 숙소 are kept per destination: Jeju’s keys as before, Busan’s with .busan', () => {
    expect(destKey(KEYS.region, 'jeju')).toBe('jeju.region');
    expect(destKey(KEYS.stay, 'busan')).toBe('jeju.stay.busan');
    const store = createStore(localStorage, sessionStorage);
    store.setRegion('애월');
    store.useDest('busan');
    store.setRegion('해운대');
    store.setBasis('region');
    expect([localStorage.getItem('jeju.region'), localStorage.getItem('jeju.region.busan'), localStorage.getItem('jeju.basis')]).toEqual(['"애월"', '"해운대"', null]);
    store.useDest('jeju');
    expect(store.place()).toEqual({ basis: 'gps', region: '애월', stay: null });
    store.setDest('busan');
    expect(store.dest()).toBe('busan');
  });
  it('a region or 숙소 is its destination’s own (another destination’s reads as none)', () => {
    expect(parseRegion('서귀포', 'jeju')).toBe('서귀포시내');
    expect(parseStay({ ...동문시장, area: '구제주', source: 'gps' }, 'busan')).toBeNull();
    expect(parseStay({ ...해운대, source: 'link' }, 'jeju')).toBeNull();
    if (BUSAN) {
      expect(parseRegion('애월', 'busan')).toBeNull();
      expect(parseRegion('해운대', 'busan')).toBe('해운대');
      expect(parseStay({ ...해운대, source: 'link' }, 'busan')).toEqual({ ...해운대, area: '해운대', source: 'link' });
    }
  });
});

describe.runIf(BUSAN)('부산 오늘 판 (plans/busan.md S6)', () => {
  beforeEach(reset);
  afterEach(reset);
  const day = () => new Date('2026-10-20T10:00:00+09:00');
  const rainFetch = () => vi.fn(async (_u: string) => ({ ok: true, status: 200, json: async () => ({ area: 'haeundae', pop: 70, rain: true }) }));

  it('without a position the sunset is 부산시청\'s (not 제주시청\'s)', async () => {
    localStorage.setItem(KEYS.dest, JSON.stringify('busan'));
    render({ today: day, loadSpots: (d) => Promise.resolve(d === 'busan' ? busanRaw : fileSpots) });
    for (let i = 0; i < 4; i++) await flush();
    const busanSet = sunsetText({ lat: 35.1797, lng: 129.0751 }, '2026-10-20');
    expect(busanSet).not.toBe(sunsetText({ lat: 33.4996, lng: 126.5312 }, '2026-10-20'));
    expect($('#today .facts').textContent).toContain(`해 지는 시각 ${busanSet}`);
  });
  it('장날: on the 23rd 구포시장 opens, listed without a position under its Busan 동네 (서면, not a Jeju area)', () => {
    const rows = openMarkets(busanRaw, null, '2026-10-23');
    expect(rows.map((r) => [r.spot.name, r.where])).toEqual([['구포시장', '서면']]);
    expect(openMarkets(busanRaw, null, '2026-10-24')).toEqual([]);
  });
  it('비 소식 is asked for the Busan area (지역 해운대 → haeundae), and its row shows', async () => {
    localStorage.setItem(KEYS.dest, JSON.stringify('busan'));
    localStorage.setItem(destKey(KEYS.basis, 'busan'), JSON.stringify('region'));
    localStorage.setItem(destKey(KEYS.region, 'busan'), JSON.stringify('해운대'));
    const f = rainFetch();
    render({ today: day, fetch: f, loadSpots: (d) => Promise.resolve(d === 'busan' ? busanRaw : fileSpots) });
    for (let i = 0; i < 6; i++) await flush();
    expect(f.mock.calls.map((c) => c[0])).toEqual(['/api/rain?area=haeundae']);
    expect($('#today > .act').textContent).toContain('비');
  });
});

// 시작 화면 기록 (specs/busan.md 7, plans/busan.md 결과 생성 표): start_view once the cover was up a second, start_done when it
// is left (only after a start_view), never under a webdriver; no position in either
describe.runIf(BUSAN)('시작 화면 기록 (switch on)', () => {
  beforeAll(async () => void (await loadBusan()));
  afterEach(() => {
    current?.destroy();
    current = null;
    vi.restoreAllMocks();
    delete (navigator as { webdriver?: boolean }).webdriver;
    reset();
  });
  const cover = [...html.matchAll(/<!--busan--><script>([\s\S]*?)<\/script>/g)][1][1];
  const page = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>')).replace(/<script[\s\S]*?<\/script>/g, '');
  let current: App | null = null;
  /** a fresh device: index.html's cover drawn `upMs` ago, then the app */
  function open(upMs: number) {
    // what an earlier page's cover left on this window (one page per visit in a browser)
    delete (window as { __startPick?: unknown }).__startPick;
    delete (window as { __startTap?: unknown }).__startTap;
    document.documentElement.classList.add('yc-start');
    document.body.innerHTML = page;
    new Function(cover)();
    // the first paint, upMs ago (jsdom has no paint timing)
    const painted = performance.now() - upMs;
    vi.spyOn(performance, 'getEntriesByName').mockImplementation((n: string) => (n === 'first-paint' ? [{ startTime: painted } as PerformanceEntry] : []));
    const sent: UsageEvent[] = [];
    current = mountApp(document, {
      loadSpots: (d) => Promise.resolve(d === 'busan' ? busanRaw : fileSpots),
      locate: () => Promise.resolve(동문시장),
      storage: localStorage,
      session: sessionStorage,
      today: () => new Date('2026-10-20T12:00:00+09:00'),
      eventsUrl: 'https://events.test/e',
      beacon: (_u, body) => (sent.push(...(JSON.parse(body) as UsageEvent[])), true),
    });
    return { sent, send: () => window.dispatchEvent(new Event('pagehide')) };
  }
  const start = (sent: UsageEvent[]) => sent.filter((e) => e.e.startsWith('start_'));

  it('up a second, then 부산 chosen: start_view and start_done (pick, none, busan) — the day only, no position', async () => {
    const t = open(1500);
    await wait();
    (document.querySelector('#ycStart [data-dest="busan"]') as HTMLElement).click();
    await wait();
    t.send();
    expect(start(t.sent)).toEqual([
      { e: 'start_view', d: '2026-10-20' },
      { e: 'start_done', how: 'pick', why: 'none', dest: 'busan', d: '2026-10-20' },
    ]);
    // the other events now say the destination in use
    expect(t.sent.filter((e) => !e.e.startsWith('start_')).every((e) => e.dest === 'busan' || e.id?.startsWith('src:'))).toBe(true);
  });

  it('left before a second: neither (done ÷ view stays one population); under a webdriver: neither', async () => {
    const quick = open(0);
    (document.querySelector('#ycStart [data-dest="jeju"]') as HTMLElement).click();
    await wait();
    quick.send();
    expect(start(quick.sent)).toEqual([]);
    current?.destroy();
    reset();
    Object.defineProperty(navigator, 'webdriver', { value: true, configurable: true });
    const bot = open(5000);
    await wait();
    (document.querySelector('#ycStart [data-dest="jeju"]') as HTMLElement).click();
    await wait();
    bot.send();
    expect(start(bot.sent)).toEqual([]);
  });

  it('the cover up past a second while the app runs: start_view comes by itself, once', async () => {
    const t = open(900);
    await new Promise((r) => setTimeout(r, 300));
    await wait();
    t.send();
    expect(start(t.sent)).toEqual([{ e: 'start_view', d: '2026-10-20' }]);
  });
});
describe.runIf(BUSAN)('브라우저로 열기 carries the 여행지 (codex_review.md 2026-10-20 n4)', () => {
  const KAKAO = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36 KAKAOTALK 10.8.0';
  const early = window as { __dest?: string; __destBy?: string };
  const load = (d: string) => Promise.resolve(d === 'busan' ? busanRaw : fileSpots);
  beforeAll(async () => void (await loadBusan()));
  beforeEach(reset);
  afterEach(() => {
    reset();
    delete early.__dest;
    delete early.__destBy;
    window.history.replaceState(null, '', '/');
  });

  it('KakaoTalk on Busan: dest=busan in the address handed over; opened there (index.html: a link), Busan, kept', async () => {
    localStorage.setItem(KEYS.dest, '"busan"');
    render({ loadSpots: load, userAgent: KAKAO });
    await wait();
    const url = new URL($('#homeNote a[data-action="inapp-open"]').getAttribute('href')!).searchParams.get('url')!;
    expect(new URL(url).search).toBe('?dest=busan');
    reset();
    window.history.replaceState(null, '', '/?dest=busan');
    early.__dest = 'busan';
    early.__destBy = 'link';
    render({ loadSpots: load });
    await wait();
    expect($('.logo .rg').textContent).toBe(':부산');
    expect(localStorage.getItem(KEYS.dest)).toBe('"busan"');
    expect(window.location.search).toBe('');
  });
});