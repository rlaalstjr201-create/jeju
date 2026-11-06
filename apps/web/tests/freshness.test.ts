// 서울 홈 선반 최신화 (ADR-0124, specs/seoul-freshness.md): 새로 들어옴, the record on this device, the exploring places, the day's
// shuffle and the shelves' turn — always among what is open and in reach now, never a far one ahead of a near one.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cultureItems, type SeoulRow } from '../functions/_lib/culture-filter';
import { FULL, HOME_ROWS, MOOD_SHELVES, PER_SHELF, browseCard, buildShelves, homeShelves, homeShown, rotateShelves, type ShelfKey } from '../src/browse';
import { CARDS_KEY, KEEP_DAYS, MAX_CARDS, PULL_KM, arrange, bump, cardsStore, isNewly, parseBook, priorOf, type Arrangeable, type Fresh, type Prior } from '../src/freshness';
import { funItems } from '../src/fun';
import { weeklyItems } from '../src/weekly';
import { normalizeSpots } from '../src/data';
import { moodShelf } from '../src/home';
import { initialState, viewingShut } from '../src/state';
import { distanceKm } from '../src/pick';
import { sunsetMinutes } from '../src/sun';
import type { Now } from '../src/culture';
import rows from './fixtures/seoul-culture-20261104.json';

const DAY = '2026-11-04';
const at = (h: number): Now => ({ day: DAY, weekday: 3, minute: h * 60 });
const items = [...cultureItems(rows as SeoulRow[], DAY), ...funItems(DAY)];
const 용산 = { lat: 37.5299, lng: 126.9648 };
const 망원 = { lat: 37.5563, lng: 126.9056 };
const none = (day = DAY): Fresh => ({ day, prior: () => ({ n: 0, t: 0 }) });
const withPrior = (day: string, m: Record<string, Prior>): Fresh => ({ day, prior: (id) => m[id] ?? { n: 0, t: 0 } });
const card = (id: string, km: number, isNew = false, tier = km < 1 ? 0 : 1): Arrangeable => ({ id, km, tier, isNew });
const ids = (out: { card: Arrangeable }[]) => out.map((o) => o.card.id);

describe('arrange (ADR-0124 2–5)', () => {
  const shelf = Array.from({ length: 16 }, (_, i) => card(`c${i}`, 0.1 + i * 0.05));

  it('the same day and record: the same order, however often it is drawn', () => {
    expect(ids(arrange(shelf, none()))).toEqual(ids(arrange([...shelf].reverse(), none())));
    expect(ids(arrange(shelf, none()))).toEqual(ids(arrange(shelf, none())));
  });

  it('another day: another order (the same cards)', () => {
    const a = ids(arrange(shelf, none('2026-11-04')));
    const b = ids(arrange(shelf, none('2026-11-05')));
    expect(b).not.toEqual(a);
    expect([...b].sort()).toEqual([...a].sort());
  });

  it('within a distance band only: a 3 km card never ahead of a 300 m one by the shuffle', () => {
    const mixed = [card('far', 3, false, 2), card('near1', 0.3, false, 0), card('near2', 0.4, false, 0)];
    for (const d of ['2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07']) expect(ids(arrange(mixed, none(d))).at(-1)).toBe('far');
  });

  it('seen more than 3 times and never pressed: a band back; pressed once, it stays', () => {
    const list = [card('a', 0.2, false, 0), card('b', 1.5, false, 1)];
    expect(ids(arrange(list, withPrior(DAY, { a: { n: 4, t: 0 } })))).toEqual(['b', 'a']);
    expect(ids(arrange(list, withPrior(DAY, { a: { n: 3, t: 0 } })))).toEqual(['a', 'b']);
    expect(ids(arrange(list, withPrior(DAY, { a: { n: 9, t: 1 } })))).toEqual(['a', 'b']);
  });

  it('an unseen card comes forward to the exploring place (4th), labelled pull; the first day (nothing seen) none is pulled', () => {
    const seenAll = Object.fromEntries(shelf.map((c) => [c.id, { n: 2, t: 1 }]));
    const base = ids(arrange(shelf, withPrior(DAY, seenAll)));
    const last = base.at(-1)!;
    const out = arrange(shelf, withPrior(DAY, { ...seenAll, [last]: { n: 0, t: 0 } }));
    expect(out[3]).toEqual({ card: shelf.find((c) => c.id === last), slot: 'pull' });
    expect(arrange(shelf, none()).every((o) => o.slot === 'base')).toBe(true);
    // roughly one place in four: 4th, 8th, 12th
    const fewer = Object.fromEntries(shelf.map((c, i) => [c.id, { n: i, t: 1 }]));
    const slots = arrange(shelf, withPrior(DAY, fewer)).map((o) => o.slot);
    expect(slots.filter((s) => s === 'pull').length).toBeLessThanOrEqual(4);
    slots.forEach((s, i) => s === 'pull' && expect((i + 1) % 4).toBe(0));
  });

  it('새로 들어옴: up to three lead the shelf, each labelled new', () => {
    const list = [...shelf, card('n1', 0.5, true), card('n2', 0.6, true), card('n3', 0.7, true), card('n4', 0.8, true)];
    const out = arrange(list, none());
    expect(out.slice(0, 3).map((o) => o.slot)).toEqual(['new', 'new', 'new']);
    expect(out.filter((o) => o.slot === 'new').map((o) => o.card.id).sort()).toEqual(['n1', 'n2', 'n3', 'n4']);
  });

  it('the distance cap: a new or pulled card is never more than PULL_KM farther than the card it goes ahead of', () => {
    const far = arrange([card('near', 0.2, false, 0), card('far-new', 0.2 + PULL_KM + 0.5, true, 2)], none());
    expect(ids(far)).toEqual(['near', 'far-new']);
    const list = [card('a', 0.1, false, 0), card('b', 0.2, false, 0), card('c', 0.3, false, 0), card('d', 0.4, false, 0), card('x', 6, false, 3)];
    const seen = withPrior(DAY, { a: { n: 2, t: 1 }, b: { n: 2, t: 1 }, c: { n: 2, t: 1 }, d: { n: 2, t: 1 } });
    expect(ids(arrange(list, seen))).toEqual([...ids(arrange(list.slice(0, 4), seen)), 'x']);
  });
});

describe('the shelves with today (buildShelves, homeShelves)', () => {
  const sunset = sunsetMinutes(용산, DAY);

  it.each([
    [용산, 14],
    [용산, 22],
    [망원, 19],
  ] as const)('at %o %i:00: nothing shut, each place once, ≤ 12 a shelf, every card with a slot', (p, h) => {
    const sh = buildShelves(items, at(h), p, sunsetMinutes(p, DAY), none());
    for (const s of sh) {
      expect(s.cards.length).toBeLessThanOrEqual(PER_SHELF);
      for (const c of s.cards) {
        expect(browseCard(c.item, at(h), p)).not.toBeNull();
        expect(['new', 'pull', 'base']).toContain(c.slot);
      }
    }
    const all = sh.flatMap((s) => s.cards.map((c) => c.item.id));
    expect(new Set(all).size).toBe(all.length);
    // the same shelves as without (the order inside them changed only)
    expect(sh.map((s) => [s.key, s.cards.length]).sort()).toEqual(buildShelves(items, at(h), p, sunsetMinutes(p, DAY)).map((s) => [s.key, s.cards.length]).sort());
  });

  it('the same day: the same; the next day: another order', () => {
    const a = buildShelves(items, at(14), 용산, sunset, none(DAY));
    expect(buildShelves(items, at(14), 용산, sunset, none(DAY))).toEqual(a);
    const b = buildShelves(items, at(14), 용산, sunset, none('2026-11-05'));
    expect(b.map((s) => s.cards.map((c) => c.item.id))).not.toEqual(a.map((s) => s.cards.map((c) => c.item.id)));
  });

  it('a near card never behind one more than a band and PULL_KM farther (내 위치 먼저)', () => {
    for (const s of buildShelves(items, at(14), 용산, sunset, withPrior(DAY, {}))) {
      const km = s.cards.map((c) => distanceKm(용산, c.item));
      if (s.key === 'stage' || s.key === 'today' || s.key === 'exhibit') continue; // big stages first (ADR-0114)
      for (let i = 1; i < km.length; i++) expect(km[i] + 2.5 + PULL_KM, `${s.key} ${i}`).toBeGreaterThan(Math.min(...km.slice(0, i)));
      // the first card is within the nearest band of the shelf's nearest
      expect(km[0]).toBeLessThan(Math.max(1, Math.min(...km) + 2.5));
    }
  });

  it("새로 들어옴: 이번 주 서울's round (its file day) is new for 7 days, its cards lead and say so", () => {
    expect([isNewly('2026-11-05', '2026-11-05'), isNewly('2026-11-05', '2026-11-11'), isNewly('2026-11-05', '2026-11-12'), isNewly('2026-11-05', '2026-11-04'), isNewly(undefined, '2026-11-05')]).toEqual([true, true, false, false, false]);
    const day = '2026-11-06';
    const week = weeklyItems(day);
    expect(week.length).toBeGreaterThan(0);
    for (const w of week) expect(w.week.added).toBe('2026-11-05');
    const now = { day, weekday: 5, minute: 14 * 60 };
    const shelf = buildShelves([...funItems(day), ...week], now, 용산, sunset, none(day)).find((s) => s.key === 'week');
    expect(shelf?.cards[0].slot).toBe('new');
    // the base list (즐길 거리 without a day) is never new
    for (const s of buildShelves(funItems(day), now, 용산, sunset, none(day))) for (const c of s.cards) expect(c.slot).not.toBe('new');
  });

  it("the shelves' turn: the hour's first two stay, 전시·박물관 last, the rest turn a place a day", () => {
    const keys: ShelfKey[] = ['g1', 'hood', 'week', 'g8', 'fresh', 'stage', 'exhibit'];
    const a = rotateShelves(keys, '2026-11-04');
    const b = rotateShelves(keys, '2026-11-05');
    for (const r of [a, b]) {
      expect(r.slice(0, 2)).toEqual(['g1', 'hood']);
      expect(r.at(-1)).toBe('exhibit');
      expect([...r].sort()).toEqual([...keys].sort());
    }
    expect(b).not.toEqual(a);
    expect(rotateShelves(keys, '2026-11-08')).toEqual(a); // four in the middle: back in four days
  });

  it('서울 홈 with today: the five moods always shown, at most 9 rows before 선반 더 보기, ≥ 4 of ≥ 6, mood places open', () => {
    const seoul = normalizeSpots(JSON.parse(readFileSync(resolve(__dirname, '../data/seoul/spots-seoul.json'), 'utf8')));
    for (const [p, h] of [[용산, 14], [용산, 22], [망원, 19]] as const) {
      const s = initialState({ dest: 'seoul', basis: 'gps', today: DAY, region: null, stay: null, saved: [], hintSeen: true, offline: false, clock: h * 60 });
      const origin = { key: 'gps', point: p, isPoint: true, from: '' };
      const ss = sunsetMinutes(p, DAY);
      const moods = Object.fromEntries(MOOD_SHELVES.map((m) => [m, arrange(moodShelf(s, seoul, origin, m).map((x) => ({ x, id: x.id, km: distanceKm(p, x), tier: 0, isNew: false })), none()).map((o) => o.card.x)]));
      for (const day of [DAY, '2026-11-05']) {
        const list = homeShelves(buildShelves(items, at(h), p, ss, none(day)), moods, h * 60, ss, null, day);
        const shown = homeShown(list);
        const seen = list.filter((_, i) => shown[i]);
        expect(seen.length).toBeLessThanOrEqual(HOME_ROWS);
        for (const m of MOOD_SHELVES) expect(seen.map((sh) => sh.key)).toContain(m);
        const size = (sh: (typeof list)[number]) => ('spots' in sh ? sh.spots : sh.cards).length;
        expect(seen.filter((sh) => size(sh) >= FULL).length).toBeGreaterThanOrEqual(4);
        for (const sh of list) if ('spots' in sh) for (const x of sh.spots) expect(viewingShut(x, h * 60)).toBe(false);
      }
    }
  });
});

describe('the record on this device (ADR-0124 2)', () => {
  it("yesterday's only: what is seen today moves nothing today, and counts tomorrow", () => {
    const book = {};
    for (let i = 0; i < 5; i++) bump(book, 'a', DAY, 0);
    expect(priorOf(book, 'a', DAY)).toEqual({ n: 0, t: 0 });
    expect(priorOf(book, 'a', '2026-11-05')).toEqual({ n: 5, t: 0 });
    bump(book, 'a', '2026-11-05', 1);
    expect(priorOf(book, 'a', '2026-11-05')).toEqual({ n: 5, t: 0 });
    expect(priorOf(book, 'a', '2026-11-06')).toEqual({ n: 5, t: 1 });
  });

  it('read and repaired: bad entries dropped, 30 days and over gone, at most MAX_CARDS (the latest kept)', () => {
    const c: Record<string, unknown> = {
      ok: [3, 1, '2026-11-01', 2, 1],
      old: [3, 0, '2026-10-05', 3, 0],
      edge: [1, 0, '2026-10-06', 1, 0],
      neg: [-1, 0, DAY, 0, 0],
      text: ['3', 0, DAY, 0, 0],
      day: [1, 0, 'yesterday', 0, 0],
      more: [1, 0, DAY, 2, 0],
      short: [1, 0, DAY],
    };
    expect(Object.keys(parseBook({ v: 1, c }, DAY)).sort()).toEqual(['edge', 'ok']);
    expect(KEEP_DAYS).toBe(30);
    expect(parseBook({ v: 2, c }, DAY)).toEqual({});
    expect(parseBook('x', DAY)).toEqual({});
    expect(parseBook(null, DAY)).toEqual({});
    const many = Object.fromEntries(Array.from({ length: MAX_CARDS + 50 }, (_, i) => [`p${i}`, [1, 0, i < 50 ? '2026-10-20' : '2026-11-01', 1, 0]]));
    const kept = parseBook({ v: 1, c: many }, DAY);
    expect(Object.keys(kept)).toHaveLength(MAX_CARDS);
    expect(kept.p0).toBeUndefined();
  });

  it('kept in localStorage under jeju.cards, written later; a storage that throws or holds junk: this visit in memory', () => {
    const mem = new Map<string, string>();
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    const jobs: (() => void)[] = [];
    const st = cardsStore(storage, DAY, (f) => void jobs.push(f));
    st.seen('a', DAY);
    st.pressed('a', DAY);
    expect(mem.size).toBe(0);
    expect(jobs).toHaveLength(1);
    jobs[0]();
    expect(JSON.parse(mem.get(CARDS_KEY)!)).toEqual({ v: 1, c: { a: [1, 1, DAY, 0, 0] } });
    expect(cardsStore(storage, '2026-11-05').fresh('2026-11-05').prior('a')).toEqual({ n: 1, t: 1 });

    const bad = { getItem: () => { throw new Error('no'); }, setItem: () => { throw new Error('full'); } };
    const st2 = cardsStore(bad, DAY, (f) => f());
    expect(() => st2.seen('a', DAY)).not.toThrow();
    expect(st2.fresh('2026-11-05').prior('a')).toEqual({ n: 1, t: 0 });
    mem.set(CARDS_KEY, '{not json');
    expect(cardsStore(storage, DAY).fresh(DAY).prior('a')).toEqual({ n: 0, t: 0 });
    expect(cardsStore(null, DAY).fresh(DAY).prior('a')).toEqual({ n: 0, t: 0 });
  });
});
