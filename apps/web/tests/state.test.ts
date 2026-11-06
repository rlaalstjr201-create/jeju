// Pure reducer: last intent wins, restore vs next-3, basis idempotency — no DOM.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { AREAS } from '../src/region/areas';
import { pickCards } from '../src/pick/pick';
import { NATION, loadNation } from '../src/region/release';
import { basisIsCurrent, cardsValid, hasSaved, homeOrigin, initialState, isSaved, knownOrigin, moodIntent, rainArea, reduce, savedCount, savedDays, sessionOf, staticOrigin, whenDay, type Action, type State } from '../src/state';
import type { Point } from '../src/pick/pick';
import type { Origin, SavedEntry } from '../src/types';
import { ORIGINS, realSpots } from './fixtures';

const 애월 = AREAS.find((a) => a.name === '애월')!;
const gps = (p: Point = ORIGINS.제주시): Origin => ({ key: 'gps', point: p, isPoint: true, from: '여기서' });
const TODAY = '2026-09-30';
const TOMORROW = '2026-10-01';
/** entries of one day, in the order given */
const on = (date: string, ...ids: string[]): SavedEntry[] => ids.map((id, order) => ({ id, date, order }));
const s0 = (over: Partial<State> = {}): State => ({
  ...initialState({ basis: 'gps', today: TODAY, region: null, stay: null, saved: [], hintSeen: false, offline: false }),
  ...over,
});
const run = (s: State, ...actions: Action[]) => actions.reduce(reduce, s);
/** tap a mood and resolve it with `origin` */
const pick = (s: State, button: 'rest' | 'walk' | 'new' | 'food' | 'any', req: number, origin = gps(), intent: 'show' | 'more' = 'show') =>
  run(s, { type: 'mood', button }, { type: 'request', req, intent, step: 'loading' }, { type: 'resolved', req, origin, spots: realSpots });
const ids = (s: State) => s.cards?.list.map((c) => c.spot.id);

describe('S36·S38 요청 id — 마지막 의도만 반영', () => {
  it('a result for an older request is dropped', () => {
    let s = run(s0(), { type: 'mood', button: 'rest' }, { type: 'request', req: 1, intent: 'show', step: 'locating' });
    s = run(s, { type: 'mood', button: 'walk' }, { type: 'request', req: 2, intent: 'show', step: 'locating' });
    const late = run(s, { type: 'noOrigin', req: 1, why: 'denied' }, { type: 'resolved', req: 1, origin: gps(), spots: realSpots });
    expect(late).toBe(s); // nothing changed
    const done = run(s, { type: 'resolved', req: 2, origin: gps(), spots: realSpots });
    expect(done.cards?.key).toBe('walk');
  });

  it('slow / long flags only for the pending request', () => {
    const s = run(s0(), { type: 'mood', button: 'rest' }, { type: 'request', req: 5, intent: 'show', step: 'locating' });
    expect(run(s, { type: 'slow', req: 4 })).toBe(s);
    expect(run(s, { type: 'slow', req: 5 }, { type: 'long', req: 5 }).phase).toMatchObject({ k: 'pending', slow: true, long: true });
  });
});

describe('S43·S44 다시 고르면 보던 3장, 다음 3장은 "다른 3곳 보기"', () => {
  // Changed on purpose (design/SPEC.md D2): the mood on screen again is a no-op (it is already showing);
  // the next 3 come from the 'more' intent only.
  it('A → B → A restores A; the active A again is a no-op; more moves on', () => {
    let s = pick(s0(), 'rest', 1);
    const rest1 = ids(s);
    expect(rest1).toEqual(pickCards(realSpots, ORIGINS.제주시, 'rest').cards.map((c) => c.spot.id));
    s = pick(s, 'walk', 2);
    s = pick(s, 'rest', 3);
    expect(ids(s)).toEqual(rest1);
    expect(s.cards?.how).toBe('restore');
    expect(moodIntent(s, 'rest')).toBeNull();
    expect(moodIntent(run(s, { type: 'route', route: { view: 'home', overlay: null } }), 'rest')).toBe('show');
    s = run(s, { type: 'request', req: 4, intent: 'more', step: 'loading' }, { type: 'resolved', req: 4, origin: gps(), spots: realSpots });
    expect(ids(s)!.filter((id) => rest1!.includes(id))).toEqual([]);
    expect(s.cards?.how).toBe('more');
  });

  it('a new origin (another basis, or GPS moved > 1km) starts fresh', () => {
    let s = pick(s0(), 'rest', 1);
    const rest1 = ids(s);
    const far = gps({ lat: ORIGINS.제주시.lat + 0.05, lng: ORIGINS.제주시.lng });
    s = run(s, { type: 'mood', button: 'walk' });
    s = pick(s, 'rest', 2, far);
    expect(ids(s)).not.toEqual(rest1);
    expect(s.cards?.how).toBe('new');
    expect(Object.keys(s.shown)).toEqual(['rest']);
  });

  it('moodIntent: pending same mood → ignore; failed → retry', () => {
    const pending = run(s0(), { type: 'mood', button: 'rest' }, { type: 'request', req: 1, intent: 'show', step: 'locating' });
    expect(moodIntent(pending, 'rest')).toBeNull();
    expect(moodIntent(pending, 'walk')).toBe('show');
    const failed = run(pending, { type: 'noOrigin', req: 1, why: 'denied' });
    expect(moodIntent(failed, 'rest')).toBe('show');
  });
});

describe('기준 — 멱등성·유효성 (audit MAJOR idempotency)', () => {
  it('basisIsCurrent: the same basis/area is a no-op unless the last attempt failed', () => {
    const s = s0({ basis: 'region', region: '애월', phase: { k: 'ready' } });
    expect(basisIsCurrent(s, 'region', '애월')).toBe(true);
    expect(basisIsCurrent(s, 'region', '성산')).toBe(false);
    expect(basisIsCurrent(s, 'gps')).toBe(false);
    expect(basisIsCurrent({ ...s, basis: 'gps', phase: { k: 'noOrigin', why: 'denied' } }, 'gps')).toBe(false);
    expect(basisIsCurrent({ ...s, phase: { k: 'loadError', offline: false } }, 'region', '애월')).toBe(false);
  });

  it('cardsValid turns false as soon as the basis changes (돌아가기 then recomputes)', () => {
    let s = pick(s0({ basis: 'region', region: '애월' }), 'walk', 1, staticOrigin('region', '애월', null)!);
    expect(cardsValid(s)).toBe(true);
    s = run(s, { type: 'basis', basis: 'region', region: '성산' });
    expect(cardsValid(s)).toBe(false);
  });

  it('staticOrigin: 숙소 from GPS is a real point (may "walk"), an area centre is not', () => {
    expect(staticOrigin('stay', null, { lat: 33.4, lng: 126.3, area: '한림', source: 'gps' })).toMatchObject({ isPoint: true, from: '숙소에서' });
    expect(staticOrigin('region', '애월', null)).toEqual({ key: 'region:애월', point: { lat: 애월.lat, lng: 애월.lng }, isPoint: false, from: '애월에서' });
    expect(staticOrigin('gps', '애월', null)).toBeNull();
  });
});

describe('GPS 실패 기억 (S07)', () => {
  it('noOrigin records why; the next GPS success clears it', () => {
    let s = run(s0(), { type: 'mood', button: 'rest' }, { type: 'request', req: 1, intent: 'show', step: 'locating' }, { type: 'noOrigin', req: 1, why: 'denied' });
    expect(s.lastFail).toBe('denied');
    expect(s.phase).toEqual({ k: 'noOrigin', why: 'denied' });
    s = run(s, { type: 'request', req: 2, intent: 'show', step: 'locating' }, { type: 'located', req: 2 }, { type: 'resolved', req: 2, origin: gps(), spots: realSpots });
    expect(s.lastFail).toBeNull();
  });
});

describe('저장 목록 상태', () => {
  it('opening remembers where it came from; a row taken out there stays (undo) until the list is reopened', () => {
    let s = pick(s0({ saved: on(TODAY, 'b', 'a') }), 'rest', 1);
    s = run(s, { type: 'openSaved' });
    expect(s).toMatchObject({ view: 'saved', unsaved: [], savedFrom: 'cards' });
    s = run(s, { type: 'saved', entries: on(TODAY, 'a'), removed: { id: 'b', date: TODAY, order: 0 } });
    expect(s.unsaved).toEqual([{ id: 'b', date: TODAY, order: 0 }]);
    s = run(s, { type: 'spots', spots: realSpots });
    s = run(s, { type: 'closeSaved' });
    expect(s).toMatchObject({ view: 'cards', unsaved: [], phase: { k: 'ready' } });
  });

  it('S42 ♥ N counts only ids still in the data once it is loaded; storage list untouched', () => {
    const s = s0({ saved: on(TODAY, 'gone', realSpots[0].id) });
    expect(savedCount(s)).toBe(2);
    const loaded = run(s, { type: 'spots', spots: realSpots });
    expect(savedCount(loaded)).toBe(1);
    expect(loaded.saved).toEqual(on(TODAY, 'gone', realSpots[0].id));
  });

  it('saved list without a position is still shown (origin null)', () => {
    const [a, b] = realSpots;
    let s = run(s0({ saved: on(TODAY, a.id, b.id) }), { type: 'openSaved' }, { type: 'request', req: 1, intent: 'show', step: 'locating' });
    s = run(s, { type: 'located', req: 1, why: 'denied' }, { type: 'resolved', req: 1, origin: null, spots: realSpots });
    expect(savedDays(s).upcoming[0].rows.map((r) => r.entry.id)).toEqual([a.id, b.id]);
    expect(s.savedList?.origin).toBeNull();
    expect(s.lastFail).toBe('denied');
  });
});

describe('날짜 모드 (specs/date-mode.md)', () => {
  const [a, b, c] = realSpots.map((x) => x.id);

  it('D2 a heart goes to the chosen day: 지금 = today; filled only for that day', () => {
    const s = s0({ saved: [...on(TODAY, a), ...on(TOMORROW, b)] });
    expect(whenDay(s)).toBe(TODAY);
    expect(isSaved(s, a)).toBe(true);
    expect(isSaved(s, b)).toBe(false);
    const t = run(s, { type: 'when', when: TOMORROW });
    expect(whenDay(t)).toBe(TOMORROW);
    expect(isSaved(t, a)).toBe(false);
    expect(isSaved(t, b)).toBe(true);
    expect(isSaved(t, a, TODAY)).toBe(true);
  });

  it('the chosen day is kept only while it is still ahead (mount)', () => {
    const at = (when: string) => initialState({ basis: 'gps', when, today: TODAY, region: null, stay: null, saved: [], hintSeen: false, offline: false }).when;
    expect(at(TOMORROW)).toBe(TOMORROW);
    expect(at(TODAY)).toBe('now');
    expect(at('2026-09-29')).toBe('now');
  });

  it('D5 midnight: a chosen day that has come goes back to 지금; a later one stays', () => {
    let s = run(s0(), { type: 'when', when: TOMORROW });
    s = run(s, { type: 'today', today: TOMORROW });
    expect(s).toMatchObject({ today: TOMORROW, when: 'now' });
    s = run(s0(), { type: 'when', when: '2026-10-05' }, { type: 'today', today: TOMORROW });
    expect(s.when).toBe('2026-10-05');
    s = run(s0(), { type: 'when', when: TOMORROW }, { type: 'today', today: '2026-10-03' });
    expect(s.when).toBe('now');
  });

  it('D5 ♥ N counts today and later; the days gone by are not counted but keep ♥ N reachable', () => {
    const s = s0({ saved: [...on('2026-09-29', a, b), ...on(TODAY, c), ...on(TOMORROW, a)] });
    expect(savedCount(s)).toBe(2);
    const later = run(s, { type: 'today', today: '2026-10-02' });
    expect(savedCount(later)).toBe(0);
    expect(hasSaved(later)).toBe(true);
    expect(hasSaved(s0())).toBe(false);
  });

  it('D3 the saved list by day: today, later days in date order, then the days gone by; each day in its order', () => {
    const s = run(s0({ saved: [...on('2026-10-05', c), ...on('2026-09-28', a), ...on(TOMORROW, b, a), ...on(TODAY, c, a)] }), { type: 'spots', spots: realSpots });
    const { upcoming, past } = savedDays(s);
    expect(upcoming.map((d) => [d.day, d.rows.map((r) => r.entry.id)])).toEqual([
      [TODAY, [c, a]],
      [TOMORROW, [b, a]],
      ['2026-10-05', [c]],
    ]);
    expect(past.map((d) => d.day)).toEqual(['2026-09-28']);
  });

  it('D3 a row taken out stays where it was (heart empty) while the list is open; put back, it is live again', () => {
    let s = run(s0({ saved: on(TODAY, a, b, c) }), { type: 'spots', spots: realSpots }, { type: 'openSaved' });
    s = run(s, { type: 'saved', entries: on(TODAY, a, c), removed: { id: b, date: TODAY, order: 1 } });
    expect(savedDays(s).upcoming[0].rows.map((r) => [r.entry.id, r.live])).toEqual([
      [a, true],
      [b, false],
      [c, true],
    ]);
    s = run(s, { type: 'saved', entries: on(TODAY, a, b, c) });
    expect(s.unsaved).toEqual([]);
  });

  it('다른 날로 is a sheet of a saved row: without one (a forward after a reload) it does not open', () => {
    const s = run(s0({ saved: on(TODAY, a) }), { type: 'openSaved' });
    expect(run(s, { type: 'overlay', overlay: 'move' }).overlay).toBeNull();
    const t = run(s, { type: 'moveTarget', id: a, date: TODAY }, { type: 'overlay', overlay: 'move' });
    expect(t.overlay).toBe('move');
  });

  it('choosing a day is an intent: it clears the first-save hint', () => {
    const s = run(pick(s0(), 'rest', 1), { type: 'hint', id: a });
    expect(run(s, { type: 'when', when: TOMORROW }).hintFor).toBeNull();
  });
});

describe('S54 세션 기록', () => {
  it('only a ready cards view is worth keeping', () => {
    expect(sessionOf(s0())).toBeNull();
    const s = pick(s0(), 'walk', 1);
    expect(sessionOf(s)).toMatchObject({ v: 1, mood: 'walk', sub: 'meal', shown: { walk: ids(s) } });
    const back = run(s0(), { type: 'restore', rec: sessionOf(s)! });
    expect(back).toMatchObject({ view: 'cards', mood: 'walk', shown: { walk: ids(s) } });
  });

  it('the 새로운 거 tab goes into the record and comes back with it; the sub action sets food or new by value', () => {
    const tabbed = run(s0(), { type: 'sub', sub: 'do' });
    expect(tabbed).toMatchObject({ sub: 'meal', newSub: 'do' });
    expect(run(tabbed, { type: 'sub', sub: 'cafe' })).toMatchObject({ sub: 'cafe', newSub: 'do' });
    const s = pick(tabbed, 'new', 1);
    expect(s.cards?.key).toBe('new:do');
    expect(sessionOf(s)).toMatchObject({ mood: 'new', sub: 'meal', newSub: 'do', shown: { 'new:do': ids(s) } });
    expect(run(s0(), { type: 'restore', rec: sessionOf(s)! })).toMatchObject({ mood: 'new', newSub: 'do' });
    // a record from before the tabs keeps whatever tab is current (섞어서 at mount)
    const { newSub: _, ...old } = sessionOf(s)!;
    expect(run(s0(), { type: 'restore', rec: old }).newSub).toBe('mix');
  });
});

describe('QA 2026-09-30 — 세션 기록·위치 대기', () => {
  it('the record names the mood as soon as it is asked for (loading or failed), with the rotation so far', () => {
    const shown = pick(s0(), 'rest', 1);
    const asked = run(shown, { type: 'mood', button: 'walk' }, { type: 'request', req: 2, intent: 'show', step: 'locating' });
    expect(sessionOf(asked)).toMatchObject({ mood: 'walk', origin: shown.origin, shown: { rest: ids(shown) } });
    const failed = run(asked, { type: 'noOrigin', req: 2, why: 'unavailable' });
    expect(sessionOf(failed)?.mood).toBe('walk');
    expect(sessionOf(run(s0(), { type: 'mood', button: 'any' }))).toMatchObject({ mood: 'any', origin: null, shown: {} });
    expect(sessionOf(run(failed, { type: 'route', route: { view: 'home', overlay: null } }))).toBeNull();
  });

  it("a 숙소 for this visit only (Kakao's point, ADR-0103 Amendment 2): its point never goes into the record — a reload picks from the saved basis", () => {
    const stay = { lat: 33.4139, lng: 126.2672, area: '한림' as const, source: 'addr' as const, once: true as const };
    const at = staticOrigin('stay', null, stay)!;
    const s = pick(run(s0(), { type: 'basis', basis: 'stay', stay }), 'rest', 1, at);
    expect(s.origin?.key).toBe(at.key);
    const rec = sessionOf(s)!;
    expect(rec).toMatchObject({ mood: 'rest', origin: null, shown: {}, histories: {} });
    expect(JSON.stringify(rec)).not.toContain('33.4139');
    expect(JSON.stringify(sessionOf(pick(s, 'rest', 2, at, 'more')))).not.toContain('33.4139');
    // a kept 숙소 (the public point) is written as before
    const kept = { ...stay, once: undefined };
    expect(sessionOf(pick(run(s0(), { type: 'basis', basis: 'stay', stay: kept }), 'rest', 1, staticOrigin('stay', null, kept)!))?.origin?.key).toBe(at.key);
  });

  it('giving up on an unanswered GPS wait learns nothing: a known failure stays, none is invented', () => {
    const base = run(s0(), { type: 'openSaved' }, { type: 'request', req: 1, intent: 'show', step: 'locating' });
    expect(run(base, { type: 'located', req: 1, unknown: true }).lastFail).toBeNull();
    expect(run({ ...base, lastFail: 'denied' }, { type: 'located', req: 1, unknown: true }).lastFail).toBe('denied');
  });

  it('photo failures: those that happened offline are forgotten when back online, the others kept', () => {
    let s = run(s0(), { type: 'imgError', id: 'a' });
    s = run(s, { type: 'offline', offline: true }, { type: 'imgError', id: 'b' });
    expect(s.broken).toEqual(['a', 'b']);
    s = run(s, { type: 'offline', offline: false });
    expect(s.broken).toEqual(['a']);
    expect(s.brokenOffline).toEqual([]);
  });

  it('announcements carry the count and kind; the words live in render.ts COPY', () => {
    const s = pick(s0(), 'rest', 1);
    expect(s.announce).toMatchObject({ n: 3, more: false });
    const more = run(s, { type: 'request', req: 2, intent: 'more', step: 'loading' }, { type: 'resolved', req: 2, origin: gps(), spots: realSpots });
    expect(more.announce).toMatchObject({ n: 3, more: true });
    expect(more.announce.seq).toBeGreaterThan(s.announce.seq);
  });
});

describe('얼마나 (ADR-0060) — 범위 변경은 기준 변경과 같은 규칙', () => {
  it('starts at 차로 30분 unless given; the cards are picked in the current range', () => {
    expect(s0().reach).toBe('drive30');
    const s = pick(s0({ reach: 'walk' }), 'rest', 1);
    expect(ids(s)).toEqual(pickCards(realSpots, ORIGINS.제주시, 'rest', {}, undefined, 'walk').cards.map((c) => c.spot.id));
    expect(s.cards?.reach).toBe('walk');
  });

  it('another range: the cards on hand no longer count, and the next result starts the rotation fresh', () => {
    let s = pick(s0(), 'rest', 1);
    s = run(s, { type: 'request', req: 2, intent: 'more', step: 'loading' }, { type: 'resolved', req: 2, origin: gps(), spots: realSpots });
    expect(cardsValid(s)).toBe(true);
    s = run(s, { type: 'reach', reach: 'drive60' });
    expect(s.reach).toBe('drive60');
    expect(cardsValid(s)).toBe(false);
    s = run(s, { type: 'request', req: 3, intent: 'show', step: 'loading' }, { type: 'resolved', req: 3, origin: gps(), spots: realSpots });
    expect(ids(s)).toEqual(pickCards(realSpots, ORIGINS.제주시, 'rest', {}, undefined, 'drive60').cards.map((c) => c.spot.id));
    expect(s.cards?.how).toBe('new');
    expect(Object.keys(s.histories)).toEqual(['rest']);
    expect(s.histories.rest?.seen).toEqual(ids(s));
    // back to the first range: the rotation there was dropped too (like a basis change), a fresh pick again
    s = run(s, { type: 'reach', reach: 'drive30' }, { type: 'request', req: 4, intent: 'show', step: 'loading' }, { type: 'resolved', req: 4, origin: gps(), spots: realSpots });
    expect(ids(s)).toEqual(pickCards(realSpots, ORIGINS.제주시, 'rest').cards.map((c) => c.spot.id));
    expect(s.cards?.how).toBe('new');
  });

  it('the same range again changes nothing; choosing one is an intent (clears the first-save hint)', () => {
    const s = pick(s0(), 'rest', 1);
    expect(run(s, { type: 'reach', reach: 'drive30' })).toBe(s);
    const hinted = run(s, { type: 'hint', id: ids(s)![0] });
    expect(run(hinted, { type: 'reach', reach: 'walk' }).hintFor).toBeNull();
  });

  it('the session record carries the range of its rotation; restored in another range, it is picked fresh', () => {
    const s = pick(s0({ reach: 'walk' }), 'walk', 1);
    const rec = sessionOf(s)!;
    expect(rec.reach).toBe('walk');
    const same = run(s0({ reach: 'walk' }), { type: 'restore', rec }, { type: 'request', req: 1, intent: 'show', step: 'loading' }, { type: 'resolved', req: 1, origin: gps(), spots: realSpots });
    expect(ids(same)).toEqual(ids(s));
    expect(same.cards?.how).toBe('restore');
    const other = run(s0({ reach: 'drive60' }), { type: 'restore', rec }, { type: 'request', req: 1, intent: 'show', step: 'loading' }, { type: 'resolved', req: 1, origin: gps(), spots: realSpots });
    expect(ids(other)).toEqual(pickCards(realSpots, ORIGINS.제주시, 'walk', {}, undefined, 'drive60').cards.map((c) => c.spot.id));
    expect(other.cards?.how).toBe('new');
  });
});

describe('비 와요(실내만) (ADR-0065) — 토글은 범위 변경과 같은 규칙', () => {
  it('starts off unless given; on, the cards are the indoor pick', () => {
    expect(s0().indoor).toBe(false);
    const s = pick(s0({ indoor: true }), 'rest', 1);
    expect(ids(s)).toEqual(pickCards(realSpots, ORIGINS.제주시, 'rest', {}, undefined, 'drive30', true).cards.map((c) => c.spot.id));
    expect(s.cards?.indoor).toBe(true);
    expect(s.cards?.list.every((c) => c.spot.indoor)).toBe(true);
  });

  it('switching it: the cards on hand no longer count, and the next result starts the rotation fresh', () => {
    let s = pick(s0(), 'walk', 1);
    s = run(s, { type: 'request', req: 2, intent: 'more', step: 'loading' }, { type: 'resolved', req: 2, origin: gps(), spots: realSpots });
    expect(cardsValid(s)).toBe(true);
    s = run(s, { type: 'indoor', on: true });
    expect(s.indoor).toBe(true);
    expect(cardsValid(s)).toBe(false);
    s = run(s, { type: 'request', req: 3, intent: 'show', step: 'loading' }, { type: 'resolved', req: 3, origin: gps(), spots: realSpots });
    expect(ids(s)).toEqual(pickCards(realSpots, ORIGINS.제주시, 'walk', {}, undefined, 'drive30', true).cards.map((c) => c.spot.id));
    expect(s.cards?.how).toBe('new');
    expect(s.histories.walk?.seen).toEqual(ids(s));
    // off again: the outdoor rotation was dropped, a fresh pick
    s = run(s, { type: 'indoor', on: false }, { type: 'request', req: 4, intent: 'show', step: 'loading' }, { type: 'resolved', req: 4, origin: gps(), spots: realSpots });
    expect(ids(s)).toEqual(pickCards(realSpots, ORIGINS.제주시, 'walk').cards.map((c) => c.spot.id));
    expect(s.cards?.how).toBe('new');
  });

  it('the same value again changes nothing; switching it is an intent (clears the first-save hint)', () => {
    const s = pick(s0(), 'rest', 1);
    expect(run(s, { type: 'indoor', on: false })).toBe(s);
    const hinted = run(s, { type: 'hint', id: ids(s)![0] });
    expect(run(hinted, { type: 'indoor', on: true }).hintFor).toBeNull();
  });

  it('the session record carries indoor of its rotation; restored with the other value, it is picked fresh', () => {
    const s = pick(s0({ indoor: true }), 'food', 1);
    const rec = sessionOf(s)!;
    expect(rec.indoor).toBe(true);
    const same = run(s0({ indoor: true }), { type: 'restore', rec }, { type: 'request', req: 1, intent: 'show', step: 'loading' }, { type: 'resolved', req: 1, origin: gps(), spots: realSpots });
    expect(ids(same)).toEqual(ids(s));
    expect(same.cards?.how).toBe('restore');
    const other = run(s0(), { type: 'restore', rec }, { type: 'request', req: 1, intent: 'show', step: 'loading' }, { type: 'resolved', req: 1, origin: gps(), spots: realSpots });
    expect(ids(other)).toEqual(pickCards(realSpots, ORIGINS.제주시, 'food', {}, 'meal').cards.map((c) => c.spot.id));
    expect(other.cards?.how).toBe('new');
    // a record written before the toggle (no indoor) belongs to the outdoor rotation
    const { indoor: _drop, ...old } = sessionOf(pick(s0(), 'food', 1))!;
    const oldOn = run(s0({ indoor: true }), { type: 'restore', rec: old }, { type: 'request', req: 1, intent: 'show', step: 'loading' }, { type: 'resolved', req: 1, origin: gps(), spots: realSpots });
    expect(oldOn.cards?.how).toBe('new');
  });
});

// 자동 지역 (plans/nationwide-app.md 3, U8): its moods, its 시군구, its 비 소식 area and its weak start.
describe('자동 지역 상태', () => {
  const toNation = (sgg: '51150' | '51210' = '51150'): Action => ({ type: 'dest', dest: 'nation', basis: 'gps', region: null, stay: null, sgg });

  it('switching there: 유명한 데 becomes 아무거나; a mood it has (쉬기 since rules v2, ADR-0105) stays; the 시군구 is kept', () => {
    expect(run(s0({ mood: 'rest' }), toNation())).toMatchObject({ dest: 'nation', mood: 'rest', sgg: '51150' });
    expect(run(s0({ mood: 'famous' }), toNation()).mood).toBe('any');
    expect(run(s0({ mood: 'walk' }), toNation()).mood).toBe('walk');
    expect(run(s0({ mood: null }), toNation()).mood).toBeNull();
    // back to a 검수한 곳: every mood again, the 시군구 remembered
    const back = run(s0({ mood: 'food' }), toNation(), { type: 'dest', dest: 'jeju', basis: 'gps', region: null, stay: null });
    expect(back).toMatchObject({ dest: 'jeju', mood: 'food', sgg: '51150' });
    expect(run(back, { type: 'mood', button: 'rest' }).mood).toBe('rest');
  });

  it('a mood it does not offer, tapped or restored, is 아무거나', () => {
    const s = run(s0(), toNation());
    expect(run(s, { type: 'mood', button: 'rest' }).mood).toBe('rest');
    expect(run(s, { type: 'mood', button: 'famous' }).mood).toBe('any');
    expect(run(s, { type: 'mood', button: 'food' }).mood).toBe('food');
    const rec = { v: 1 as const, mood: 'famous' as const, sub: 'meal' as const, origin: null, shown: {}, histories: {} };
    expect(run(s, { type: 'restore', rec }).mood).toBe('any');
    expect(run(s0(), { type: 'restore', rec }).mood).toBe('famous');
  });

  it('another 시군구: what was picked and shown so far goes', () => {
    const a = pick(run(s0(), toNation()), 'walk', 1);
    expect(Object.keys(a.histories)).not.toEqual([]);
    const b = run(a, toNation('51210'));
    expect(b).toMatchObject({ sgg: '51210', histories: {}, shown: {}, cards: null, spots: null, origin: null });
  });

  it('비 소식 is asked for its 시군구; a 검수한 곳 asks for its area as before', () => {
    const fixed = run(s0(), toNation(), { type: 'homeFix', point: { lat: 37.7643, lng: 128.8996 } });
    expect(rainArea(fixed)).toBe('51150');
    expect(rainArea({ ...fixed, when: TOMORROW })).toBeNull();
    expect(rainArea(run(s0(), { type: 'homeFix', point: ORIGINS.제주시 }))).toBe('gujeju');
  });

  // the 시군구's centre comes from the index (the part, switch on)
  it.runIf(NATION)('내 위치 not read yet: the last 시군구\'s centre is a weak start — the home uses it, a position read still lands', async () => {
    vi.stubGlobal('fetch', (url: string) => {
      const m = /^\/nation\/(\w+)\.json\?v=\w+$/.exec(url);
      return Promise.resolve(m ? new Response(readFileSync(resolve(__dirname, `../data/nation/${m[1]}.json`), 'utf8')) : new Response('', { status: 404 }));
    });
    expect(await loadNation()).toBe(true);
    vi.unstubAllGlobals();
    const s = run(s0(), toNation());
    expect(knownOrigin(s)).toBeNull();
    expect(homeOrigin(s)).toMatchObject({ key: 'near:51150', isPoint: false, from: '강릉시에서' });
    expect(rainArea(s)).toBe('51150');
    const p = { lat: 37.7643, lng: 128.8996 };
    expect(homeOrigin(run(s, { type: 'homeFix', point: p }))).toMatchObject({ key: 'gps', point: p });
    // not on a 검수한 곳, not on another basis
    expect(homeOrigin(run(s, { type: 'dest', dest: 'jeju', basis: 'gps', region: null, stay: null }))).toBeNull();
  });
});

describe("오늘 서울 둘러보기's card sheet (ADR-0114 4, review m7)", () => {
  const day = initialState({ dest: 'seoul', basis: 'gps', today: TODAY, region: null, stay: null, saved: [], hintSeen: false, offline: false }).today;
  const item = { id: 'sc-a', title: 't', kind: '전시', place: 'p', gu: '', lat: 37.57, lng: 126.98, start: day, end: day, time: '', free: true, forAll: true, link: '', image: '' };
  const on = (): State => ({ ...initialState({ dest: 'seoul', basis: 'gps', today: TODAY, region: null, stay: null, saved: [], hintSeen: false, offline: false }), culture: { day, items: [item], minute: 600 }, overlay: 'browse' });
  it('opens only for an item in today\'s list (a forward into a card of an older list is not taken)', () => {
    expect(reduce(on(), { type: 'browseCard', id: 'sc-a' })).toMatchObject({ overlay: 'browse-card', browseId: 'sc-a' });
    expect(reduce(on(), { type: 'browseCard', id: 'sc-gone' }).overlay).toBe('browse');
    expect(reduce({ ...on(), browseId: 'sc-gone' }, { type: 'overlay', overlay: 'browse-card' }).overlay).not.toBe('browse-card');
  });
});
