// @vitest-environment jsdom
// 노을 볼 곳 (ADR-0083, specs/sunset-view.md V4): the window, the 3-place and 45-minute edges, the row's place in
// 비 → 노을 → 장날, date mode, no basis, and a home exactly as before when there is no row.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { areaByName, type AreaName } from '../src/areas';
import { normalizeSpots } from '../src/data';
import { DUSK_LEAD_MIN, duskNow, sunsetSpots, todayActs } from '../src/home';
import type { Spot } from '../src/pick';
import { KEYS } from '../src/store';
import { sunsetBucket, sunsetMinutes } from '../src/sun';
import { fileSpots } from './fixtures';
import { $, $$, flush, render, reset, tap } from './harness';

const DAY = '2026-10-03'; // 중문 market day only — none within 30 minutes of 한림·애월
const kst = (day: string, min: number) => new Date(Date.parse(`${day}T00:00:00+09:00`) + min * 60_000);
const region = (name: AreaName) => {
  window.localStorage.setItem('jeju.basis', JSON.stringify('region'));
  window.localStorage.setItem('jeju.region', JSON.stringify(name));
};
const setAt = (name: AreaName, day = DAY) => sunsetMinutes(areaByName(name)!, day);
const plain = fileSpots.map(({ sunsetView: _v, ...s }) => s as Spot);
const homeHtml = () => $('#home').innerHTML;

async function home(name: AreaName, min: number, spots: Spot[] = fileSpots, day = DAY) {
  region(name);
  render({ today: () => kst(day, min), loadSpots: () => Promise.resolve(spots) });
  await flush();
  await flush();
}

beforeEach(reset);
afterEach(() => {
  vi.useRealTimers();
});

describe('duskNow / sunsetSpots / todayActs', () => {
  const p = areaByName('한림')!;
  const set = sunsetMinutes(p, DAY);
  it('the window: from 2시간 30분 before the sunset, until it', () => {
    expect(duskNow(set - DUSK_LEAD_MIN, p, DAY)).toBe(true);
    expect(duskNow(set - DUSK_LEAD_MIN - 0.5, p, DAY)).toBe(false);
    expect(duskNow(set - 0.01, p, DAY)).toBe(true);
    expect(duskNow(set, p, DAY)).toBe(false);
    expect(duskNow(null, p, DAY)).toBe(false);
  });
  it('the day picks the nearest azimuth: 10월 264, 6월 298, 12월 242', () => {
    expect(sunsetBucket(p, '2026-10-03')).toBe(264);
    expect(sunsetBucket(p, '2026-06-21')).toBe(298);
    expect(sunsetBucket(p, '2026-12-21')).toBe(242);
  });
  it('45 minutes is in, 50 is out; the day\'s azimuth only; nearest first', () => {
    const origin = { key: 'region:한림', point: p, isPoint: false, from: '한림에서' } as never;
    // driveMinutes = km·1.3/40·60 rounded to 5: 23 km → 45분, 25 km → 50분 (going east along the latitude)
    const east = (km: number) => p.lng + km / (111.32 * Math.cos((p.lat * Math.PI) / 180));
    const s = (id: string, km: number, view: number[]) => ({ ...plain[0], id, hide: undefined, mood: 'walk', lat: p.lat, lng: east(km), sunsetView: view }) as Spot;
    const rows = sunsetSpots([s('far', 25, [264]), s('edge', 23, [264]), s('near', 2, [264]), s('june', 1, [298])], origin, DAY);
    expect(rows.map((r) => r.spot.id)).toEqual(['near', 'edge']);
    expect(rows[1].where).toBe('차로 약 45분');
  });
  it('Amendment 1: a place seen setting over the sea comes before a nearer inland 오름; then nearest first', () => {
    const origin = { key: 'region:한림', point: p, isPoint: false, from: '한림에서' } as never;
    const east = (km: number) => p.lng + km / (111.32 * Math.cos((p.lat * Math.PI) / 180));
    const s = (id: string, km: number, over: Partial<Spot>) =>
      ({ ...plain[0], id, hide: undefined, mood: 'walk', lat: p.lat, lng: east(km), sunsetSea: undefined, ...over }) as Spot;
    const rows = sunsetSpots(
      [
        s('oreum', 2, { sunsetView: [242, 264, 298], sunsetSea: [] }),
        s('coast', 15, { sunsetView: [264] }),
        s('oreumSea', 10, { sunsetView: [242, 264, 298], sunsetSea: [264] }),
        s('text', 3, { sunsetView: [242, 264, 298], sunsetSea: [298] }),
      ],
      origin,
      DAY,
    );
    expect(rows.map((r) => r.spot.id)).toEqual(['oreumSea', 'coast', 'oreum', 'text']);
  });
  it('a sunsetSea the app cannot read is dropped, the place stays on its sunsetView', () => {
    const bad = normalizeSpots([{ ...plain[0], sunsetView: [264], sunsetSea: [270] }, { ...plain[1], sunsetView: [264], sunsetSea: [] }]);
    expect(bad.map((s) => [s.sunsetView, s.sunsetSea ?? null])).toEqual([[[264], null], [[264], []]]);
  });
  it('a sunsetView the app cannot read is dropped, the place stays', () => {
    const bad = normalizeSpots([{ ...plain[0], sunsetView: [270] }, { ...plain[1], sunsetView: [] }, { ...plain[2], sunsetView: [242, 298] }]);
    expect(bad.map((s) => s.sunsetView ?? null)).toEqual([null, null, [242, 298]]);
  });
  it('priority 비 → 노을 → 장날; 노을 needs 3 places and never shows under rain', () => {
    const row = { spot: plain[0], where: '' };
    expect(todayActs([row], false, [row, row, row]).map((a) => a.k)).toEqual(['sunset', 'market']);
    expect(todayActs([row], false, [row, row]).map((a) => a.k)).toEqual(['market']);
    expect(todayActs([row], true, [row, row, row]).map((a) => a.k)).toEqual(['rain', 'market']);
    expect(todayActs([], false).map((a) => a.k)).toEqual([]);
  });
});

describe('오늘 판 노을 줄 (real spots.json)', () => {
  it('한림, 1 hour before the sunset: 「노을 볼 곳 N곳 · 차로 45분 안」, the section lists the nearest 5, the credit names OSM', async () => {
    await home('한림', setAt('한림') - 60);
    const act = $('#today .act');
    expect(act?.getAttribute('data-action')).toBe('to-sunset');
    expect(act?.textContent).toMatch(/^노을 볼 곳 \d+곳\u00a0· 차로 45분 안$/);
    expect($('#today .facts').textContent).toMatch(/^\u00a0· 해 지는 시각 \d\d:\d\d$/);
    expect($$('#sunset .mk')).toHaveLength(5);
    expect($('#sunset .mk .meta').textContent).toMatch(/^차로 약 \d+분$/);
    expect($('#homeMore > .credit').textContent).toBe('정보·사진: 비짓제주(제주관광공사) · 해안선 © OpenStreetMap contributors');
    const osm = $<HTMLAnchorElement>('#homeMore > .credit a');
    expect([osm.getAttribute('href'), osm.getAttribute('target'), osm.getAttribute('rel')]).toEqual(['https://www.openstreetmap.org/copyright', '_blank', 'noopener']);
  });

  it('3 hours before: the time only — the home is byte for byte what it is with no sunsetView at all', async () => {
    await home('한림', setAt('한림') - 180);
    const withData = homeHtml();
    expect($('#today .act')).toBeNull();
    expect($('#sunset')).toBeNull();
    reset();
    await home('한림', setAt('한림') - 180, plain);
    expect(homeHtml()).toBe(withData);
    reset();
    // and in the window, without the data, the same as before too
    await home('한림', setAt('한림') - 60, plain);
    expect(homeHtml()).toBe(withData);
  });

  it('the edges: at 2시간 30분 before it shows, a minute earlier not, at the sunset gone', async () => {
    const set = setAt('한림');
    await home('한림', Math.ceil(set - DUSK_LEAD_MIN));
    expect($('#today .act')?.getAttribute('data-action')).toBe('to-sunset');
    reset();
    await home('한림', set - DUSK_LEAD_MIN - 1);
    expect($('#today .act')).toBeNull();
    reset();
    await home('한림', set + 0.5);
    expect($('#today .act')).toBeNull();
  });

  it('fewer than 3 confirmed places within 45 minutes: no row', async () => {
    const p = areaByName('한림')!;
    const near = sunsetSpots(fileSpots, { key: 'region:한림', point: p, isPoint: false, from: '' } as never, DAY).map((r) => r.spot.id);
    expect(near.length).toBeGreaterThanOrEqual(3);
    const keep = new Set(near.slice(0, 2));
    await home('한림', setAt('한림') - 60, fileSpots.map((s) => (keep.has(s.id) || !s.sunsetView ? s : (({ sunsetView: _v, ...r }) => r as Spot)(s))));
    expect($('#today .act')).toBeNull();
    reset();
    const three = new Set(near.slice(0, 3));
    await home('한림', setAt('한림') - 60, fileSpots.map((s) => (three.has(s.id) || !s.sunsetView ? s : (({ sunsetView: _v, ...r }) => r as Spot)(s))));
    expect($('#today .act')?.textContent).toMatch(/^노을 볼 곳 3곳/);
  });

  it('rain first: 비 소식 is the row and 노을 볼 곳 is nowhere', async () => {
    const set = setAt('애월');
    const now = kst(DAY, set - 60);
    window.sessionStorage.setItem(KEYS.rain, JSON.stringify({ v: 1, area: 'aewol', at: now.getTime(), rain: true }));
    region('애월');
    const fetch = (() => new Promise(() => undefined)) as never; // the kept answer is used; nothing is asked
    render({ today: () => now, loadSpots: () => Promise.resolve(fileSpots), fetch });
    await flush();
    await flush();
    expect($('#today .act')?.classList.contains('rain')).toBe(true);
    expect($('#sunset')).toBeNull();
    expect($('#homeMore > .credit').textContent).toBe('정보·사진: 비짓제주(제주관광공사)');
  });

  it('노을 before 장날: on 10월 2일 near 제주시, the market folds into the grey line', async () => {
    await home('구제주', setAt('구제주', '2026-10-02') - 60, fileSpots, '2026-10-02');
    expect($('#today .act')?.getAttribute('data-action')).toBe('to-sunset');
    expect($('#today .facts').textContent).toMatch(/· 오늘 .+ 장날/);
    expect($('#market')).not.toBeNull();
  });

  it('date mode and no basis: no row', async () => {
    window.localStorage.setItem('jeju.when', JSON.stringify('2026-10-05'));
    await home('한림', setAt('한림') - 60);
    expect($('#today .act')).toBeNull();
    reset();
    render({ today: () => kst(DAY, setAt('구제주') - 60) }); // GPS basis, no fix this session
    await flush();
    await flush();
    expect($('#today .act')).toBeNull();
  });

  it('the row comes by itself when the window opens (one timer, no ticking), and goes at the sunset', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const set = setAt('한림');
    let now = kst(DAY, set - DUSK_LEAD_MIN - 2);
    region('한림');
    render({ today: () => now, loadSpots: () => Promise.resolve(fileSpots) });
    await vi.advanceTimersByTimeAsync(0);
    expect($('#today .act')).toBeNull();
    now = kst(DAY, set - DUSK_LEAD_MIN + 0.1);
    await vi.advanceTimersByTimeAsync(2.1 * 60_000);
    expect($('#today .act')?.getAttribute('data-action')).toBe('to-sunset');
    now = kst(DAY, set + 0.1);
    await vi.advanceTimersByTimeAsync(DUSK_LEAD_MIN * 60_000);
    expect($('#today .act')).toBeNull();
  });

  it('a new basis inside its window (but not the old one\'s) brings the row at once, not at the old point\'s edge', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    // GPS, permission granted: the home reads the fix itself (ADR-0075 Amendment 1). Until then the sun is 제주시청's.
    const gujwa = areaByName('구좌')!;
    const open = sunsetMinutes(gujwa, DAY) - DUSK_LEAD_MIN; // about a minute before 제주시청's window opens
    let now = kst(DAY, open - 5);
    let fix: (p: { lat: number; lng: number }) => void = () => undefined;
    render({
      today: () => now,
      loadSpots: () => Promise.resolve(fileSpots),
      geoPermission: () => Promise.resolve('granted'),
      locate: () => new Promise((r) => (fix = r)),
    } as never);
    await vi.advanceTimersByTimeAsync(0);
    expect($('#today .act')).toBeNull();
    now = kst(DAY, open + 0.3); // inside 구좌's window, still before 제주시청's: no timer has fired
    await vi.advanceTimersByTimeAsync(5.3 * 60_000);
    expect($('#today .act')).toBeNull();
    fix({ lat: gujwa.lat, lng: gujwa.lng });
    await vi.advanceTimersByTimeAsync(0);
    expect($('#today .act')?.getAttribute('data-action')).toBe('to-sunset');
  });

  it('tapping the row goes down to the section and leaves the address and history alone', async () => {
    await home('한림', setAt('한림') - 60);
    const before = [location.href, history.length];
    await tap('#today .act');
    expect(document.activeElement?.id).toBe('sunset-h');
    expect([location.href, history.length]).toEqual(before);
  });
});
