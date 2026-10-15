// @vitest-environment jsdom
// 숙소 링크 (ADR-0089, specs/partner-stay-link.md S1–S3): `/?stay=<lat>,<lng>&src=<tag>` opens on that 숙소, and
// while the tag is in the session tap / map (and the arrival's open) are counted once more under `src:<tag>`.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { aggregate } from '../events/aggregate';
import { handleEvents } from '../events/handler';
import { memoryStore } from '../events/store';
import { parseBatch } from '../events/validate';
import { renderReport } from '../scripts/analytics-report.mjs';
import { readDeepLink } from '../src/deeplink';
import { parseStay } from '../src/store';
import { $, $$, current, flush, render, reset, tap, today } from './harness';

const TODAY = today();

describe('S1 readDeepLink — stay and src', () => {
  it('a point in Jeju and a tag; with the other keys too', () => {
    expect(readDeepLink('?stay=33.4631,126.3105&src=aewol-gh1', TODAY)).toEqual({ stay: { lat: 33.4631, lng: 126.3105 }, src: 'aewol-gh1' });
    expect(readDeepLink('?mood=walk&stay=33.4631,126.3105', TODAY)).toEqual({ mood: 'walk', stay: { lat: 33.4631, lng: 126.3105 } });
    expect(readDeepLink('?stay=33.46312345,126.31059999', TODAY)!.stay).toEqual({ lat: 33.463123, lng: 126.3106 });
  });

  it('a bad stay (outside Jeju, not two numbers) or a bad src drops only that key', () => {
    for (const bad of ['37.5665,126.978', '33.46', '33.46,126.31,1', 'a,b', '33.46;126.31', '33.46, 126.31', '']) {
      expect(readDeepLink(`?stay=${encodeURIComponent(bad)}&src=ok-1`, TODAY), bad).toEqual({ src: 'ok-1' });
    }
    for (const bad of ['A', 'a', 'Aewol', 'aewol_gh', 'a'.repeat(25), '한림', 'x y']) {
      expect(readDeepLink(`?stay=33.4631,126.3105&src=${encodeURIComponent(bad)}`, TODAY), bad).toEqual({ stay: { lat: 33.4631, lng: 126.3105 } });
    }
    expect(readDeepLink(`?src=${'a'.repeat(24)}`, TODAY)).toEqual({ src: 'a'.repeat(24) });
  });

  it('a stored 숙소 from a link reads back as such; old values still read', () => {
    expect(parseStay({ lat: 33.4631, lng: 126.3105, area: '애월', source: 'link' })).toEqual({ lat: 33.4631, lng: 126.3105, area: '애월', source: 'link' });
    expect(parseStay({ lat: 33.41, lng: 126.27, area: '한림', source: 'gps' })?.source).toBe('gps');
    expect(parseStay({ lat: 33.41, lng: 126.27, source: 'other' })?.source).toBe('gps');
  });
});

// --- in the app ---
const URL_ = 'https://events.test/e';
const sent: Record<string, unknown>[] = [];
const beacon = vi.fn((_u: string, body: string) => (sent.push(...(JSON.parse(body) as Record<string, unknown>[])), true));
function hide() {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
  document.dispatchEvent(new Event('visibilitychange'));
  delete (document as unknown as Record<string, unknown>).visibilityState;
}
const noNav = (e: Event) => e.preventDefault();
const open = (q: string, deps: Parameters<typeof render>[0] = {}) => {
  window.history.replaceState(null, '', `/${q}`);
  return render(deps);
};
const srcEvents = () => sent.filter((e) => typeof e.id === 'string' && e.id.startsWith('src:'));

beforeEach(() => {
  reset();
  sent.length = 0;
  beacon.mockClear();
  document.addEventListener('click', noNav);
});
afterEach(() => {
  document.removeEventListener('click', noNav);
  window.history.replaceState(null, '', '/');
});

describe('S1 opening a 숙소 링크', () => {
  it('the point is the 숙소 (link, nearest area), basis 숙소 근처, query gone, no position asked', async () => {
    localStorage.setItem('jeju.basis', '"region"');
    localStorage.setItem('jeju.region', '"성산"');
    localStorage.setItem('jeju.stay', JSON.stringify({ lat: 33.2481, lng: 126.4123, area: '중문', source: 'gps' }));
    const locate = vi.fn(() => Promise.resolve({ lat: 33.5, lng: 126.5 }));
    open('?stay=33.4631,126.3105&src=aewol-gh1', { locate });
    await flush();
    const stay = { lat: 33.4631, lng: 126.3105, area: '애월', source: 'link' };
    expect(current().state()).toMatchObject({ view: 'home', basis: 'stay', stay });
    expect($('#basis').textContent).toContain('숙소 근처');
    expect(location.search).toBe('');
    expect(localStorage.getItem('jeju.basis')).toBe('"stay"');
    expect(JSON.parse(localStorage.getItem('jeju.stay')!)).toEqual(stay);
    expect(sessionStorage.getItem('jeju.src')).toBe('"aewol-gh1"');
    await tap('[data-mood="rest"]');
    expect($$('#cards .card:not(.ghost)')).toHaveLength(3);
    expect(locate).not.toHaveBeenCalled();
  });

  it('a stay outside Jeju changes nothing about the basis; a bad src is not kept', async () => {
    open('?stay=37.5665,126.978&src=Bad_Tag');
    await flush();
    expect(current().state()).toMatchObject({ basis: 'gps', stay: null });
    expect(sessionStorage.getItem('jeju.src')).toBeNull();
    expect(location.search).toBe('');
  });
});

describe('S2 src counts', () => {
  it('open once on arrival, tap and map under src:<tag> to our collector only; a reload in the same visit keeps the tag, no 2nd open', async () => {
    const analytics = { setEnabled: vi.fn(), event: vi.fn() };
    open('?stay=33.4631,126.3105&src=aewol-gh1', { eventsUrl: URL_, beacon, analytics });
    await flush();
    await tap('[data-mood="rest"]');
    $('#cards .card-link').click();
    await flush();
    hide();
    const d = current().state().today;
    expect(srcEvents()).toEqual([
      { e: 'open', id: 'src:aewol-gh1', d },
      { e: 'tap', id: 'src:aewol-gh1', d },
      { e: 'map', id: 'src:aewol-gh1', d },
    ]);
    // the usual events are still there, once each
    expect(sent.filter((e) => e.e === 'tap' && !e.id)).toHaveLength(1);
    expect(sent.filter((e) => e.e === 'map' && !String(e.id).startsWith('src:'))).toHaveLength(1);
    // GA4·네이버 never hear of it
    expect(JSON.stringify(analytics.event.mock.calls)).not.toContain('src:');
    // every batch is one the collector takes
    expect(parseBatch(JSON.stringify(sent)).ok).toBe(true);

    sent.length = 0;
    render({ eventsUrl: URL_, beacon }); // reload: same session
    await flush();
    await tap('[data-mood="walk"]');
    hide();
    expect(srcEvents()).toEqual([{ e: 'tap', id: 'src:aewol-gh1', d }]);
  });

  it('the saved-list open is not doubled', async () => {
    open('?src=aewol-gh1', { eventsUrl: URL_, beacon });
    await flush();
    await tap('[data-mood="rest"]');
    await tap($$('#cards .heart')[0]);
    await tap('#saved');
    hide();
    expect(srcEvents().map((e) => e.e)).toEqual(['open', 'tap']);
  });

  it('a new session without the link: none', async () => {
    open('?src=aewol-gh1', { eventsUrl: URL_, beacon });
    await flush();
    reset(); // a new tab / next visit: sessionStorage is empty
    sent.length = 0;
    render({ eventsUrl: URL_, beacon });
    await tap('[data-mood="rest"]');
    hide();
    expect(sent.length).toBeGreaterThan(0);
    expect(srcEvents()).toEqual([]);
  });

  it('기록 끄기: nothing at all', async () => {
    localStorage.setItem('jeju.track', 'false');
    open('?stay=33.4631,126.3105&src=aewol-gh1', { eventsUrl: URL_, beacon });
    await flush();
    await tap('[data-mood="rest"]');
    $('#cards .card-link').click();
    hide();
    expect(beacon).not.toHaveBeenCalled();
  });
});

// 출시 전 점검 F1 (bugs.md B1): KakaoTalk is the 숙소 링크's main road, and its in-app notice sends people on to the
// phone's browser — with the 숙소 and the tag, or there it opens on 내 위치 근처 and the visit counts for no 숙소.
describe('F1 (B1) 브라우저로 열기 carries the 숙소 링크 on', () => {
  const KAKAO = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36 KAKAOTALK 10.8.0';
  const INSTA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 340.0';
  const LINK = '?stay=33.4631%2C126.3105&src=aewol-gh1&relay=1';
  /** the address KakaoTalk's 브라우저로 열기 hands over */
  const handed = () => new URL($('#homeNote a[data-action="inapp-open"]').getAttribute('href')!).searchParams.get('url')!;

  it('KakaoTalk: the 숙소 (%2C), the tag and relay=1; what is saved still goes after #s=', async () => {
    open('?stay=33.4631,126.3105&src=aewol-gh1', { userAgent: KAKAO });
    await flush();
    expect(handed()).toBe(`${location.origin}/${LINK}`);
    await tap('[data-mood="rest"]');
    await tap($$('#cards .heart')[0]);
    await tap('#back');
    expect(handed().startsWith(`${location.origin}/${LINK}#s=`)).toBe(true);
  });

  it('elsewhere (Instagram): the address copied is the same', async () => {
    const copy = vi.fn(async (_t: string) => true);
    open('?stay=33.4631,126.3105&src=aewol-gh1', { userAgent: INSTA, copy });
    await flush();
    await tap('#homeNote [data-action="inapp-copy"]');
    expect(copy).toHaveBeenCalledWith(`${location.origin}/${LINK}`);
  });

  it('a tag alone goes with relay=1; a 숙소 set by GPS or an area is not a 숙소 링크 (nothing added)', async () => {
    open('?src=aewol-gh1', { userAgent: KAKAO });
    await flush();
    expect(handed()).toBe(`${location.origin}/?src=aewol-gh1&relay=1`);
    reset();
    localStorage.setItem('jeju.basis', '"stay"');
    localStorage.setItem('jeju.stay', JSON.stringify({ lat: 33.2481, lng: 126.4123, area: '중문', source: 'gps' }));
    open('', { userAgent: KAKAO });
    await flush();
    expect(handed()).toBe(`${location.origin}/`);
  });

  it('opened with relay=1 (the phone browser): 숙소 근처 and the tag kept for tap / map, but no second open', async () => {
    const locate = vi.fn(() => Promise.resolve({ lat: 33.5, lng: 126.5 }));
    open(LINK, { eventsUrl: URL_, beacon, locate });
    await flush();
    expect(current().state()).toMatchObject({ basis: 'stay', stay: { lat: 33.4631, lng: 126.3105, source: 'link' } });
    expect($('#basis').textContent).toContain('숙소 근처');
    expect(sessionStorage.getItem('jeju.src')).toBe('"aewol-gh1"');
    await tap('[data-mood="rest"]');
    $('#cards .card-link').click();
    await flush();
    hide();
    const d = current().state().today;
    expect(srcEvents()).toEqual([
      { e: 'tap', id: 'src:aewol-gh1', d },
      { e: 'map', id: 'src:aewol-gh1', d },
    ]);
    expect(locate).not.toHaveBeenCalled();
  });
});

// 출시 전 점검 F15 (bugs.md S2): a messenger may end a link at a bare comma, so the card tool writes it as %2C
describe('F15 (S2) the 숙소 링크 comma as %2C', () => {
  it('the link generator writes %2C between the two numbers', () => {
    const card = readFileSync(resolve(__dirname, '../../../docs/partner/qr-card.html'), 'utf8');
    const line = card.split('\n').find((l) => l.includes('const link ='))!;
    expect(line).toMatch(/\?stay=\$\{[^}]+\}%2C\$\{[^}]+\}&src=\$\{src\}/);
  });

  it('the app reads it: the deep link, and opened in the app', async () => {
    expect(readDeepLink('?stay=33.4631%2C126.3105&src=aewol-gh1', TODAY)).toEqual({ stay: { lat: 33.4631, lng: 126.3105 }, src: 'aewol-gh1' });
    open('?stay=33.4631%2C126.3105&src=aewol-gh1');
    await flush();
    expect(current().state()).toMatchObject({ basis: 'stay', stay: { lat: 33.4631, lng: 126.3105, source: 'link' } });
  });
});

describe('S3 the collector, the aggregate and the report', () => {
  // the collector's own day (an event's day is within one of it) and the length a beacon says
  const d = TODAY;
  const post = (body: unknown) => {
    const text = JSON.stringify(body);
    return new Request('https://events.test/e', { method: 'POST', body: text, headers: { 'content-length': String(new TextEncoder().encode(text).length) } });
  };

  it('takes src:<tag> on open / tap / map with nothing but the day; refuses a bad tag, another event, more fields', () => {
    for (const e of ['open', 'tap', 'map']) expect(parseBatch(JSON.stringify([{ e, id: 'src:aewol-gh1', d }])).ok, e).toBe(true);
    for (const bad of [
      { e: 'tap', id: 'src:A', d },
      { e: 'tap', id: 'src:a', d },
      { e: 'tap', id: `src:${'a'.repeat(25)}`, d },
      { e: 'tap', id: 'src:ae_wol', d },
      { e: 'save', id: 'src:aewol-gh1', d },
      { e: 'shown', id: 'src:aewol-gh1', d },
      { e: 'tap', id: 'src:aewol-gh1', mood: 'rest', d },
      { e: 'map', id: 'src:aewol-gh1', range: '30', d },
      { e: 'open', id: 'src:aewol-gh1' },
    ]) expect(parseBatch(JSON.stringify([bad])).ok, JSON.stringify(bad)).toBe(false);
  });

  it('counted under src:<tag> and its event; left out of the place popularity', async () => {
    const store = memoryStore();
    const res = await handleEvents(post([{ e: 'open', id: 'src:aewol-gh1', d }, { e: 'tap', id: 'src:aewol-gh1', d }, { e: 'map', id: 'src:aewol-gh1', d }, { e: 'map', id: 'p1', d }]), store);
    expect(res.status).toBe(204);
    const counters = await store.dump();
    expect(counters).toEqual(
      expect.arrayContaining([
        { d, id: 'src:aewol-gh1', e: 'open', n: 1 },
        { d, id: 'src:aewol-gh1', e: 'tap', n: 1 },
        { d, id: 'src:aewol-gh1', e: 'map', n: 1 },
      ]),
    );
    expect(aggregate(counters)).toEqual([{ id: 'p1', shown: 0, save: 0, map: 1, book: 0 }]);
  });

  it('the report: one line per 숙소 with the two ratios; not in the overall taps and maps', () => {
    const rows = [
      { event: 'tap', id: 'mood:rest', n7: 2, n28: 2 },
      { event: 'shown', id: 'p1', n7: 3, n28: 3 },
      { event: 'map', id: 'p1', n7: 1, n28: 1 },
      { event: 'open', id: 'src:aewol-gh1', n7: 20, n28: 20 },
      { event: 'tap', id: 'src:aewol-gh1', n7: 15, n28: 15 },
      { event: 'map', id: 'src:aewol-gh1', n7: 5, n28: 5 },
      { event: 'open', id: 'src:hallim-2', n7: 0, n28: 4 },
    ];
    const md = renderReport(rows, new Map([['p1', '사려니숲길']]), '2026-10-15');
    expect(md).toContain('- 기분 탭 2회');
    expect(md).toContain('- 카드 노출 3장 → 지도 열기 1회 (33.3%)');
    expect(md).toContain('## 숙소 링크');
    expect(md).toContain('- aewol-gh1: 들어옴 20, 기분 누름 15, 길찾기 5 — 기분÷들어옴 75.0%, 길찾기÷기분 33.3% (기분 누름 100 미만이라 판단 보류)');
    expect(md).toContain('- hallim-2: 들어옴 4, 기분 누름 0, 길찾기 0 — 기분÷들어옴 0.0%, 길찾기÷기분 - (들어옴 10 미만, 기분 누름 100 미만이라 판단 보류)');
    expect(md.split('### 지난 7일').pop()!.split('### 지난 28일')[0]).not.toContain('hallim-2');
  });
});
