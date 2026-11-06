// @vitest-environment jsdom
// 밤에는 야외 산길을 뒤로 (ADR-0091, specs/night-trails.md §2·S2·S3), 배로 가는 섬도 (Amendment 1), in the app: the time
// comes from the app's own clock (deps.today, the one the 노을 timer reads), 지금 only, at the cards' own point; the
// status line names what moved, only when the order changed; the home's 「예:」 follow the same order and turn at the
// sunrise by themselves.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { areaByName, type AreaName } from '../src/region/areas';
import { addDays } from '../src/dates';
import { islandOf, pickCards, type Spot } from '../src/pick/pick';
import { COPY, statusOf } from '../src/copy';
import { initialState, type State } from '../src/state';
import { sunriseMinutes, sunsetMinutes } from '../src/pick/sun';
import { fileSpots } from './fixtures';
import { $, cardIds, flush, render, reset, tap } from './harness';

const DAY = '2026-10-16';
/** the three lines (Amendment 1): what moved — 산길, 배로 가는 섬, both */
const LINE = { trail: '밤이라 산길은 뒤로 미뤘어요.', island: '밤이라 배로 가는 섬은 뒤로 미뤘어요.', both: '밤이라 산길과 배로 가는 섬은 뒤로 미뤘어요.' };
const kst = (day: string, min: number) => new Date(Date.parse(`${day}T00:00:00+09:00`) + min * 60_000);
const hm = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
const region = (name: AreaName) => {
  window.localStorage.setItem('jeju.basis', JSON.stringify('region'));
  window.localStorage.setItem('jeju.region', JSON.stringify(name));
};
/** the data as it was before ADR-0091 */
const plain = fileSpots.map(({ trail: _t, ...s }) => s as Spot);
const trails = new Set(fileSpots.filter((s) => s.trail).map((s) => s.id));
const islandIds = new Set(fileSpots.filter((s) => islandOf(s)).map((s) => s.id));
const status = () => $('#status > span')?.textContent ?? '';
/** `min`: the time of the tap (지금) — what is shut then is not picked (specs/open-now.md); none, another day */
const expected = (name: AreaName, night: boolean, day = DAY, min: number | null = null) =>
  pickCards(fileSpots, areaByName(name)!, 'walk', {}, undefined, 'drive30', false, day, night, undefined, min === null ? null : Math.floor(min)).cards.map((c) => c.spot.id);

async function walkAt(name: AreaName, min: number, spots: Spot[] = fileSpots, day = DAY) {
  region(name);
  render({ today: () => kst(day, min), loadSpots: () => Promise.resolve(spots) });
  await flush();
  await tap('[data-mood="walk"]');
}

beforeEach(reset);
afterEach(() => {
  vi.useRealTimers();
});

describe('S2 결과 카드: 22:00 · 00:25 · 05:00 vs 12:00', () => {
  it.each(['22:00', '00:25', '05:00'])('%s at 애월: the others first (no trail, no 비양도 on screen), and the status line says both', async (t) => {
    await walkAt('애월', hm(t));
    expect(cardIds()).toEqual(expected('애월', true, DAY, hm(t)));
    expect(cardIds().some((id) => trails.has(id!) || islandIds.has(id!))).toBe(false);
    expect(expected('애월', false).some((id) => trails.has(id))).toBe(true); // by day two of the three are trails
    expect(status()).toBe(LINE.both);
  });

  it.each([['성산', '22:00', 'both'], ['서귀포시내', '00:25', 'trail']] as [AreaName, string, keyof typeof LINE][])('%s at %s: what pickCards gives at night, the line for %s', async (name, t, kind) => {
    await walkAt(name, hm(t));
    expect(cardIds()).toEqual(expected(name, true, DAY, hm(t)));
    expect(cardIds().some((id) => islandIds.has(id!))).toBe(false); // 성산: no 우도 place
    expect(status()).toBe(LINE[kind]);
  });

  it('우도 at 23:00: a person on the island keeps its places — the 우도 card first as by day; only 산길 moved', async () => {
    await walkAt('우도', hm('23:00'));
    expect(cardIds()).toEqual(expected('우도', true, DAY, hm('23:00')));
    expect(cardIds()[0]).toBe(expected('우도', false)[0]);
    expect(islandIds.has(cardIds()[0]!)).toBe(true);
    expect(status()).toBe(LINE.trail);
  });

  it('12:00: the results and the home are byte for byte what they are with no trail in the data', async () => {
    region('애월');
    render({ today: () => kst(DAY, hm('12:00')), loadSpots: () => Promise.resolve(fileSpots) });
    await flush();
    await flush();
    const home = $('#home').innerHTML;
    await tap('[data-mood="walk"]');
    const results = $('#results').innerHTML;
    expect(cardIds()).toEqual(expected('애월', false, DAY, hm('12:00')));
    expect(status()).toBe('');
    reset();
    region('애월');
    render({ today: () => kst(DAY, hm('12:00')), loadSpots: () => Promise.resolve(plain) });
    await flush();
    await flush();
    expect($('#home').innerHTML).toBe(home);
    await tap('[data-mood="walk"]');
    expect($('#results').innerHTML).toBe(results);
  });

  it('the edges at the point: a moment before the sunset is day, a moment after is night; before the sunrise night, after it day', async () => {
    const p = areaByName('애월')!;
    const set = sunsetMinutes(p, DAY);
    const rise = sunriseMinutes(p, DAY);
    for (const [min, night] of [[set - 0.5, false], [set + 0.5, true], [rise - 0.5, true], [rise + 0.5, false]] as [number, boolean][]) {
      reset();
      await walkAt('애월', min);
      expect(cardIds(), `${min}`).toEqual(expected('애월', night, DAY, min));
      expect(status(), `${min}`).toBe(night ? LINE.both : '');
    }
  });

  it('date mode never: a chosen day at 23:00 picks as by day, and says nothing', async () => {
    const tomorrow = addDays(DAY, 1);
    window.localStorage.setItem('jeju.when', JSON.stringify(tomorrow));
    await walkAt('애월', hm('23:00'));
    expect(cardIds()).toEqual(expected('애월', false, tomorrow));
    expect(status()).toBe('');
  });

  it('다른 3곳 보기 at night: still the others first, still the line for what moved', async () => {
    await walkAt('애월', hm('23:00'));
    const first = cardIds();
    await tap('#cards .more');
    const aewol = areaByName('애월')!;
    const at = hm('23:00');
    const want = pickCards(fileSpots, aewol, 'walk', pickCards(fileSpots, aewol, 'walk', {}, undefined, 'drive30', false, DAY, true, undefined, at).histories, undefined, 'drive30', false, DAY, true, undefined, at);
    expect(cardIds()).toEqual(want.cards.map((c) => c.spot.id));
    expect(cardIds().some((id) => first.includes(id))).toBe(false);
    expect(cardIds().some((id) => trails.has(id!) || islandIds.has(id!))).toBe(false);
    expect(want.nightShifted).not.toBeNull();
    expect(status()).toBe(LINE[want.nightShifted!]);
  });

  it('nothing moved, nothing said: 푹 쉬고 싶어 has no trail; the same 3 brought back are not a new pick', async () => {
    region('애월');
    render({ today: () => kst(DAY, hm('23:00')) });
    await flush();
    await tap('[data-mood="rest"]');
    expect(cardIds()).toHaveLength(3);
    expect(status()).toBe('');
    await tap('#back');
    await tap('[data-mood="walk"]');
    expect(status()).toBe(LINE.both);
    await tap('#back');
    await tap('[data-mood="rest"]');
    await tap('#back');
    await tap('[data-mood="walk"]'); // 보던 3곳 (S43): brought back, not picked
    expect(cardIds()).toEqual(expected('애월', true, DAY, hm('23:00')));
    expect(status()).toBe('');
  });

  it('night is the cards\' own point\'s, at the time of the tap: GPS in 한경 after 제주시청\'s sunset but before 한경\'s', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const hangyeong = areaByName('한경')!;
    const cityHall = { lat: 33.4996, lng: 126.5312 }; // the home's sun with no basis known yet
    const cityHallSet = sunsetMinutes(cityHall, DAY);
    const hangyeongSet = sunsetMinutes(hangyeong, DAY);
    expect(hangyeongSet - cityHallSet).toBeGreaterThan(1);
    let now = kst(DAY, hm('17:00'));
    render({ today: () => now, locate: () => Promise.resolve({ lat: hangyeong.lat, lng: hangyeong.lng }) });
    await vi.advanceTimersByTimeAsync(0);
    // the home's timer fires at 제주시청's sunset and reads a time still before 한경's
    now = kst(DAY, (cityHallSet + hangyeongSet) / 2);
    await vi.advanceTimersByTimeAsync((cityHallSet - hm('17:00') + 1) * 60_000);
    // hours later nothing else has read the clock; the tap does
    now = kst(DAY, hm('21:00'));
    $('[data-mood="walk"]').click();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);
    const want = pickCards(fileSpots, hangyeong, 'walk', {}, undefined, 'drive30', false, DAY, true, undefined, hm('21:00'));
    expect(cardIds()).toEqual(want.cards.map((c) => c.spot.id));
    expect(want.nightShifted).not.toBeNull();
    expect(status()).toBe(LINE[want.nightShifted!]);
  });
});

describe('S3 상태 줄', () => {
  const at = (cards: Partial<NonNullable<State['cards']>>, over: Partial<State> = {}) =>
    statusOf({
      ...initialState({ basis: 'gps', today: DAY, region: null, stay: null, saved: [], hintSeen: true, offline: false }),
      view: 'cards',
      phase: { k: 'ready' },
      cards: { key: 'walk', list: [], origin: { key: 'gps', point: { lat: 33.5, lng: 126.5 }, isPoint: true, from: '여기서' }, reach: 'drive30', indoor: false, wrapped: false, nightShifted: null, how: 'new', seq: 1, ...cards },
      ...over,
    }).text;
  it('the words: exactly one line, for what moved — 산길, 배로 가는 섬, or both; nothing when nothing moved', () => {
    expect(COPY.nightShifted).toEqual(LINE);
    expect(at({ nightShifted: 'trail' })).toBe(LINE.trail);
    expect(at({ nightShifted: 'island' })).toBe(LINE.island);
    expect(at({ nightShifted: 'both' })).toBe(LINE.both);
    expect(at({ nightShifted: null })).toBe('');
  });
  it('joined with the other sentences: 한 바퀴, then 밤, then 오프라인, then 가 봤어요 (its 되돌리기 right after it)', () => {
    expect(at({ wrapped: true, nightShifted: 'both' }, { offline: true, visitNote: { k: 'out', name: '새별오름', id: 'x' }, visited: ['x'] })).toBe(
      `${COPY.wrapped} ${LINE.both} ${COPY.offline} 새별오름은 다음부터 빼고 골라요.`,
    );
  });
});

describe('홈 「예:」 (the same order)', () => {
  const walkEx = () => $('[data-mood="walk"] .ex')?.textContent ?? '';

  it('23:00 at 애월: the walk row\'s 「예:」 has no trail and no 비양도 (next in line once the trails go back); 12:00 has 물메 (a trail, the nearest)', async () => {
    region('애월');
    render({ today: () => kst(DAY, hm('12:00')) });
    await flush();
    await flush();
    expect(walkEx()).toContain('물메');
    reset();
    region('애월');
    render({ today: () => kst(DAY, hm('23:00')) });
    await flush();
    await flush();
    expect(walkEx()).toMatch(/^예: /);
    expect(walkEx()).not.toContain('물메');
    expect(walkEx()).not.toContain('비양도');
  });

  it('turns at the sunrise and at the sunset by itself (the one 노을 timer, no ticking)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const p = areaByName('애월')!;
    const rise = sunriseMinutes(p, DAY);
    const set = sunsetMinutes(p, DAY);
    let now = kst(DAY, rise - 2);
    region('애월');
    render({ today: () => now });
    await vi.advanceTimersByTimeAsync(0);
    const night = walkEx();
    expect(night).not.toContain('물메');
    now = kst(DAY, rise + 0.1);
    await vi.advanceTimersByTimeAsync(2.1 * 60_000);
    expect(walkEx()).toContain('물메');
    // the day's next moments are 노을 볼 곳 opening and the sunset: after the sunset the night order again
    now = kst(DAY, set - 150 + 0.1);
    await vi.advanceTimersByTimeAsync((set - 150 - rise) * 60_000);
    expect(walkEx()).toContain('물메');
    now = kst(DAY, set + 0.1);
    await vi.advanceTimersByTimeAsync(150 * 60_000);
    expect(walkEx()).toBe(night);
  });

  it('no basis yet: 제주 인기 follows the night too (제주시청\'s sun)', async () => {
    render({ today: () => kst(DAY, hm('12:00')) });
    await flush();
    await flush();
    const day = walkEx();
    reset();
    render({ today: () => kst(DAY, hm('23:00')) });
    await flush();
    await flush();
    expect(walkEx()).toMatch(/^제주 인기: /);
    expect(walkEx()).not.toBe(day);
    expect(day).toContain('비자림');
    expect(walkEx()).not.toContain('비자림');
  });
});

describe('기록 (ADR-0091 6): nothing new', () => {
  it('a night pick sends the same fields as a day pick', async () => {
    const sent: Record<string, unknown>[] = [];
    const beacon = (_: string, body: string) => (sent.push(...(JSON.parse(body) as Record<string, unknown>[])), true);
    const keysAt = async (min: number) => {
      reset();
      sent.length = 0;
      region('애월');
      render({ eventsUrl: 'https://events.test/e', beacon, today: () => kst(DAY, min) });
      await flush();
      await tap('[data-mood="walk"]');
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
      delete (document as unknown as Record<string, unknown>).visibilityState;
      return [...new Set(sent.flatMap((e) => Object.keys(e)))].sort();
    };
    const day = await keysAt(hm('12:00'));
    expect(day.length).toBeGreaterThan(0);
    expect(await keysAt(hm('23:00'))).toEqual(day);
  });
});
