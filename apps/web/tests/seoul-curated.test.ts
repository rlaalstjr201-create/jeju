// 서울 큐레이팅 in 놀러 가고 싶어 (ADR-0128 2, specs/seoul-curated-picks.md): the curated places and the week's things as cards —
// 지금 only, 섞어서·놀거리 only, two of them first, open now, never a 카페·디저트, a 동네, a booked room or a club.
import { describe, expect, it } from 'vitest';
import FILE from '../data/seoul/fun-seoul.json';
import { curatedAll, curatedSpots } from '../src/seoul/fun';
import { initialState, reduce, savedCount, savedIndex, viewingShut, type Action, type State } from '../src/state';
import type { Spot } from '../src/pick/pick';
import type { Origin } from '../src/types';

const DAY = '2026-11-04'; // a Wednesday
const 망원: Origin = { key: 'gps', point: { lat: 37.5563, lng: 126.9056 }, isPoint: true, from: '여기서' };
const cur = curatedSpots(DAY);
/** the destination's own places near 망원, open all day */
const tour: Spot[] = Array.from({ length: 8 }, (_, i) => ({
  id: `nt-9${i}`, name: `구경 ${i}`, lat: 37.556 + i * 0.001, lng: 126.906, mood: 'new', sub: 'sight', reason: '', image: '', kakaoPlaceId: null, bookable: false, score: 3, opening: 'always',
}));
const run = (s: State, ...actions: Action[]) => actions.reduce(reduce, s);
const s0 = (over: Partial<Parameters<typeof initialState>[0]> = {}, clock = 21 * 60): State =>
  initialState({ dest: 'seoul', basis: 'gps', today: DAY, region: null, stay: null, saved: [], hintSeen: true, offline: false, clock, ...over });
const pick = (s: State, req = 1, intent: 'show' | 'more' = 'show') =>
  run(s, { type: 'mood', button: 'new' }, { type: 'request', req, intent, step: 'loading' }, { type: 'resolved', req, origin: 망원, spots: tour });
const withCur = (s: State) => run(s, { type: 'curated', curated: { day: DAY, spots: cur, all: curatedAll() } });
const curatedOf = (s: State) => s.cards!.list.map((c) => !!c.spot.curated);

describe('curatedSpots', () => {
  it('are 놀러 cards with 서울 ids, walked into, with their hours', () => {
    expect(cur.length).toBeGreaterThan(100);
    for (const x of cur) {
      expect(x.id.startsWith('nt-'), x.id).toBe(true);
      expect([x.curated, x.mood, x.sub, x.walkin]).toEqual([true, 'new', 'do', true]);
      expect(x.opening, x.name).toBeTruthy();
      expect(x.reason, x.name).toMatch(/ · /);
      // our kind, not the map's: an LP bar the map calls a 카페 is an LP바 here
      expect(x.reason, x.name).not.toMatch(/^(카페|테마카페|북카페) · /);
    }
  });
  it('leave out 카페·디저트, the 동네, the booked and ticketed, and the clubs', () => {
    const ids = new Set(cur.map((x) => x.id));
    for (const p of FILE.places) {
      if (p.g === 'G8' || !p.walkin || p.word === '클럽') expect(ids.has(`nt-${p.id}`), p.name).toBe(false);
    }
    for (const h of FILE.hoods) expect(ids.has(`nt-hood:${h.name}`)).toBe(false);
  });
  it('a 직관 only in its season', () => {
    const ball = (day: string) => curatedSpots(day).filter((x) => /야구장/.test(x.reason));
    expect(ball('2026-12-02')).toEqual([]);
  });
});

describe('놀러 가고 싶어 with the curated places (서울, 지금)', () => {
  it('two curated places first, then one of the destination\'s, all open now', () => {
    const s = pick(withCur(s0()));
    expect(curatedOf(s)).toEqual([true, true, false]);
    for (const c of s.cards!.list) expect(viewingShut(c.spot, 21 * 60), c.spot.name).toBe(false);
  });
  it('다른 3곳: two other curated places', () => {
    const a = pick(withCur(s0()));
    const b = pick(a, 2, 'more');
    expect(curatedOf(b)).toEqual([true, true, false]);
    const first = a.cards!.list.slice(0, 2).map((c) => c.spot.id);
    for (const c of b.cards!.list.slice(0, 2)) expect(first).not.toContain(c.spot.id);
  });
  it('not on a chosen day, not under 구경, not before they are in, not outside 서울', () => {
    expect(curatedOf(pick(withCur(s0({ when: '2026-11-05' }))))).toEqual([false, false, false]);
    expect(curatedOf(pick(run(withCur(s0()), { type: 'sub', sub: 'sight' })))).toEqual([false, false, false]);
    expect(curatedOf(pick(s0()))).toEqual([false, false, false]);
    expect(curatedOf(pick(run(s0(), { type: 'curated', curated: { day: '2026-11-03', spots: cur, all: curatedAll() } })))).toEqual([false, false, false]);
  });
  it('a heart on one stays: found on another day too, and counted before they are in', () => {
    const s = pick(withCur(s0()));
    const id = s.cards!.list[0].spot.id;
    expect(savedIndex(s)!.has(id)).toBe(true);
    // a later day whose picks leave it out (a week's thing ended, a 직관 out of season): still a saved place
    const later = run(s, { type: 'curated', curated: { day: '2026-12-02', spots: [], all: curatedAll() } });
    expect(savedIndex(later)!.has(id)).toBe(true);
    // reloaded, before the curated places are in: ♥ N counts it all the same
    expect(savedCount(run(s0({ saved: [{ id, date: DAY, order: 0 }] }), { type: 'spots', spots: tour }))).toBe(1);
    const all = new Set(curatedAll().map((x) => x.id));
    for (const x of cur) expect(all.has(x.id), x.id).toBe(true);
  });
  it('few curated near: none comes back ahead of a place not yet seen (review MAJOR 1)', () => {
    const few = cur.slice(0, 3);
    const near: Spot[] = Array.from({ length: 12 }, (_, i) => ({ ...tour[0], id: `nt-8${i}`, name: `구경 ${i}`, lat: few[0].lat + i * 0.0005, lng: few[0].lng }));
    const at: Origin = { ...망원, point: { lat: few[0].lat, lng: few[0].lng } };
    let s = run(s0(), { type: 'curated', curated: { day: DAY, spots: few, all: few } });
    const tap = (req: number, intent: 'show' | 'more') =>
      (s = run(s, { type: 'mood', button: 'new' }, { type: 'request', req, intent, step: 'loading' }, { type: 'resolved', req, origin: at, spots: near }));
    const seen = new Set<string>();
    // four taps: twelve of the pool, never all of it (the round would start over)
    for (let i = 1; i <= 4; i++) {
      tap(i, i === 1 ? 'show' : 'more');
      const ids = s.cards!.list.map((c) => c.spot.id);
      for (const id of ids) expect(seen.has(id), `tap ${i}: ${id}`).toBe(false);
      expect(s.cards!.wrapped, `tap ${i}`).toBe(false);
      for (const id of ids) seen.add(id);
    }
  });
  it('two and one even when the curated places are the nearer ones', () => {
    // at a curated place, with the destination's places a kilometre off
    const at: Origin = { ...망원, point: { lat: cur[0].lat, lng: cur[0].lng } };
    const far: Spot[] = tour.map((x, i) => ({ ...x, lat: cur[0].lat + 0.01 + i * 0.001, lng: cur[0].lng }));
    let s = withCur(s0());
    for (let i = 1; i <= 3; i++) {
      s = run(s, { type: 'mood', button: 'new' }, { type: 'request', req: i, intent: i === 1 ? 'show' : 'more', step: 'loading' }, { type: 'resolved', req: i, origin: at, spots: far });
      expect(curatedOf(s), `tap ${i}`).toEqual([true, true, false]);
    }
  });
  it('they come in after 놀러 was picked: the next 놀러 has them', () => {
    const before = pick(s0());
    expect(curatedOf(before)).toEqual([false, false, false]);
    expect(curatedOf(pick(withCur(before), 2))).toEqual([true, true, false]);
  });
});
