// S27–S29 + audit "storage validation" / "data loss (storage)": every stored value is validated and
// repaired, and hearts are read-modify-write so two tabs never erase each other's saves.
import { beforeEach, describe, expect, it } from 'vitest';
import { AREAS } from '../src/areas';
import { KEYS, MAX_SAVED, createStore, normalizeEntries, parseBasis, parseEntries, parseRegion, parseReach, parseSaved, parseSession, parseStay, parseWhen } from '../src/store';
import type { SavedEntry } from '../src/types';

/** In-memory Storage shared between "tabs". */
class MemStorage implements Storage {
  map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  getItem(k: string) {
    return this.map.has(k) ? this.map.get(k)! : null;
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null;
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
  setItem(k: string, v: string) {
    this.map.set(k, String(v));
  }
}
let mem: MemStorage;
beforeEach(() => {
  mem = new MemStorage();
});
const 애월 = AREAS.find((a) => a.name === '애월')!;
const TODAY = '2026-09-30';
const TOMORROW = '2026-10-01';
/** ids of one day, in their order */
const ids = (list: SavedEntry[], date = TODAY) => list.filter((e) => e.date === date).sort((a, b) => a.order - b.order).map((e) => e.id);
const stored = (): SavedEntry[] => JSON.parse(mem.getItem(KEYS.savedV2)!);

describe('S29 손상된 값 — 읽을 때 검증·복구', () => {
  it('saved: strings only, duplicates removed (newest kept first), capped', () => {
    expect(parseSaved(['a', 'b', 'a', 3, null, '', 'c'])).toEqual(['a', 'b', 'c']);
    expect(parseSaved('nope')).toEqual([]);
    expect(parseSaved(Array.from({ length: MAX_SAVED + 10 }, (_, i) => `id${i}`))).toHaveLength(MAX_SAVED);
  });

  it('region: one of the 15 areas; the 4 legacy names (af3f008) map to the nearest area', () => {
    expect(parseRegion('애월')).toBe('애월');
    expect(parseRegion('제주시')).toBe('구제주');
    expect(parseRegion('서귀포')).toBe('서귀포시내');
    expect(parseRegion('동쪽')).toBe('성산');
    expect(parseRegion('서쪽')).toBe('한림');
    expect(parseRegion('부산')).toBeNull();
    expect(parseRegion(42)).toBeNull();
  });

  it('stay: finite coordinates inside Jeju only; {lat:0,lng:0,label:""} is rejected', () => {
    expect(parseStay({ lat: 0, lng: 0, label: '' })).toBeNull();
    expect(parseStay({ lat: 37.5, lng: 127, label: '숙소' })).toBeNull(); // Seoul
    expect(parseStay({ lat: Number.NaN, lng: 126.5 })).toBeNull();
    expect(parseStay('33.4,126.5')).toBeNull();
  });

  it('stay: legacy {lat,lng,label:"숙소"} is upgraded with its 동네 and how it was set', () => {
    expect(parseStay({ lat: 애월.lat, lng: 애월.lng, label: '숙소' })).toEqual({ lat: 애월.lat, lng: 애월.lng, area: '애월', source: 'area' });
    expect(parseStay({ lat: 33.41, lng: 126.27, label: '숙소' })).toMatchObject({ area: '한림', source: 'gps' });
  });

  it('basis: only gps|stay|region, and only when its 숙소/지역 exists', () => {
    const stay = parseStay({ lat: 애월.lat, lng: 애월.lng })!;
    expect(parseBasis('stay', stay, null)).toBe('stay');
    expect(parseBasis('stay', null, null)).toBe('gps');
    expect(parseBasis('region', null, '애월')).toBe('region');
    expect(parseBasis('region', null, null)).toBe('gps');
    expect(parseBasis('bogus', stay, '애월')).toBe('gps');
  });

  it('load() repairs what it read: duplicates, legacy region, bad stay, unknown basis', () => {
    mem.setItem(KEYS.saved, JSON.stringify(['x', 'x', 'y']));
    mem.setItem(KEYS.region, JSON.stringify('동쪽'));
    mem.setItem(KEYS.basis, JSON.stringify('region'));
    mem.setItem(KEYS.stay, JSON.stringify({ lat: 0, lng: 0, label: '' }));
    const got = createStore(mem, null).load(TODAY);
    expect(got).toMatchObject({ basis: 'region', region: '성산', stay: null, saved: [{ id: 'x', date: TODAY, order: 0 }, { id: 'y', date: TODAY, order: 1 }] });
    expect(stored()).toEqual(got.saved);
    expect(JSON.parse(mem.getItem(KEYS.region)!)).toBe('성산');
    expect(mem.getItem(KEYS.stay)).toBeNull();

    mem.setItem(KEYS.basis, JSON.stringify('teleport'));
    expect(createStore(mem, null).load(TODAY).basis).toBe('gps');
    expect(JSON.parse(mem.getItem(KEYS.basis)!)).toBe('gps');
  });

  it('unparseable JSON reads as "nothing stored"', () => {
    mem.setItem(KEYS.saved, '{oops');
    mem.setItem(KEYS.basis, 'stay"');
    expect(createStore(mem, null).load(TODAY)).toMatchObject({ saved: [], basis: 'gps' });
  });
});

describe('저장 — 두 탭 (audit MAJOR: last-writer-wins)', () => {
  it('two tabs on one storage: A saves, B saves → both kept (read-modify-write)', () => {
    const a = createStore(mem, null);
    const b = createStore(mem, null);
    a.load(TODAY);
    b.load(TODAY);
    a.toggleSaved('rest-1', TODAY);
    b.toggleSaved('walk-1', TODAY);
    expect(ids(stored())).toEqual(['rest-1', 'walk-1']);
    expect(ids(a.saved())).toEqual(['rest-1', 'walk-1']);
  });

  it('unsaving in one tab does not resurrect or drop the other tab\'s save', () => {
    const a = createStore(mem, null);
    const b = createStore(mem, null);
    a.toggleSaved('1', TODAY);
    b.toggleSaved('2', TODAY);
    expect(a.toggleSaved('1', TODAY)).toEqual({ entries: [{ id: '2', date: TODAY, order: 0 }], added: false, removed: { id: '1', date: TODAY, order: 0 } });
    expect(ids(b.saved())).toEqual(['2']);
  });

  it('S42 ids unknown to the current data are never pruned from storage', () => {
    mem.setItem(KEYS.saved, JSON.stringify(['gone-from-data', 'kept']));
    const s = createStore(mem, null);
    s.load(TODAY);
    s.toggleSaved('new', TODAY);
    expect(ids(stored())).toEqual(['gone-from-data', 'kept', 'new']);
  });
});

describe('S27·S28 저장소 차단·가득 참', () => {
  it('S27 no storage at all: hearts work from memory for the visit', () => {
    const s = createStore(null, null);
    expect(s.load(TODAY).saved).toEqual([]);
    expect(s.toggleSaved('a', TODAY)).toEqual({ entries: [{ id: 'a', date: TODAY, order: 0 }], added: true, removed: null });
    expect(ids(s.toggleSaved('b', TODAY).entries)).toEqual(['a', 'b']);
    expect(ids(s.moveSaved('b', TODAY, -1))).toEqual(['b', 'a']);
    expect(ids(s.toggleSaved('a', TODAY).entries)).toEqual(['b']);
  });

  it('S28 quota exceeded: the first failed write switches to memory, later toggles stay right', () => {
    const full = new MemStorage();
    full.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    const s = createStore(full, null);
    s.load(TODAY);
    expect(ids(s.toggleSaved('a', TODAY).entries)).toEqual(['a']);
    expect(ids(s.toggleSaved('b', TODAY).entries)).toEqual(['a', 'b']);
    expect(ids(s.moveToDay('b', TODAY, TOMORROW), TOMORROW)).toEqual(['b']);
    expect(ids(s.toggleSaved('a', TODAY).entries)).toEqual([]);
    expect(s.saved()).toEqual([{ id: 'b', date: TOMORROW, order: 0 }]);
  });

  it('getItem throwing (blocked mid-visit) also falls back to memory', () => {
    const s = createStore(mem, null);
    s.load(TODAY);
    s.toggleSaved('a', TODAY);
    mem.getItem = () => {
      throw new Error('SecurityError');
    };
    expect(ids(s.toggleSaved('b', TODAY).entries)).toEqual(['a', 'b']);
  });
});

describe('S54 세션 기록 검증', () => {
  const origin = { key: 'region:애월', point: { lat: 애월.lat, lng: 애월.lng }, isPoint: false, from: '애월에서' };
  it('a valid record round-trips; junk inside it is dropped', () => {
    const rec = parseSession({
      v: 1,
      mood: 'walk',
      sub: 'meal',
      origin,
      shown: { walk: ['a', 'b', 'c'], bogus: ['x'], rest: 'no' },
      histories: { walk: { seen: ['a', 'b', 'c'], last: ['a', 'b', 'c'] }, any: { seen: 3 } },
    });
    expect(rec).toEqual({
      v: 1,
      mood: 'walk',
      sub: 'meal',
      origin,
      shown: { walk: ['a', 'b', 'c'] },
      histories: { walk: { seen: ['a', 'b', 'c'], last: ['a', 'b', 'c'] } },
    });
  });

  it('새로운 거 tab (ADR-0064): newSub round-trips, an unknown one is dropped, new:mix|sight|do histories kept; an older record\'s "new" rotation is 섞어서', () => {
    const h = { seen: ['a', 'b', 'c'], last: ['a', 'b', 'c'] };
    const rec = parseSession({
      v: 1, mood: 'new', sub: 'meal', newSub: 'sight', origin,
      shown: { 'new:sight': ['a', 'b', 'c'], 'new:do': ['d'], 'new:jump': ['x'] },
      histories: { 'new:sight': h, 'new:mix': h },
    });
    expect(rec).toEqual({
      v: 1, mood: 'new', sub: 'meal', newSub: 'sight', origin,
      shown: { 'new:sight': ['a', 'b', 'c'], 'new:do': ['d'] },
      histories: { 'new:sight': h, 'new:mix': h },
    });
    expect(parseSession({ v: 1, mood: 'new', sub: 'meal', newSub: 'jump', origin: null })).toEqual({ v: 1, mood: 'new', sub: 'meal', origin: null, shown: {}, histories: {} });
    expect(parseSession({ v: 1, mood: 'new', sub: 'meal', origin, shown: { new: ['a', 'b', 'c'] }, histories: { new: h } })).toEqual({
      v: 1, mood: 'new', sub: 'meal', origin, shown: { 'new:mix': ['a', 'b', 'c'] }, histories: { 'new:mix': h },
    });
  });

  it('wrong version, unknown mood or broken origin → no record', () => {
    expect(parseSession({ v: 2, mood: 'walk', sub: 'meal', origin })).toBeNull();
    expect(parseSession({ v: 1, mood: 'swim', sub: 'meal', origin })).toBeNull();
    expect(parseSession({ v: 1, mood: 'walk', sub: 'meal', origin: { key: 'gps' } })).toBeNull();
    expect(parseSession('x')).toBeNull();
  });
});

describe('QA 2026-09-30 — 세션 기록: 요청만 된 기분', () => {
  it('a record with origin null (asked, nothing shown yet) keeps just the mood; clearSession removes it', () => {
    expect(parseSession({ v: 1, mood: 'food', sub: 'cafe', origin: null, shown: { rest: ['x'] } })).toEqual({
      v: 1,
      mood: 'food',
      sub: 'cafe',
      origin: null,
      shown: {},
      histories: {},
    });
    expect(parseSession({ v: 1, mood: 'food', sub: 'cafe' })).toBeNull(); // origin missing ≠ null
    const session = new Map<string, string>();
    const fake = {
      getItem: (k: string) => session.get(k) ?? null,
      setItem: (k: string, v: string) => void session.set(k, v),
      removeItem: (k: string) => void session.delete(k),
    } as unknown as Storage;
    const s = createStore(null, fake);
    s.writeSession({ v: 1, mood: 'rest', sub: 'meal', origin: null, shown: {}, histories: {} });
    expect(s.readSession()?.mood).toBe('rest');
    s.clearSession();
    expect(s.readSession()).toBeNull();
  });
});

describe('날짜 모드 저장 (specs/date-mode.md D3·D4·D5)', () => {
  it('D4 the v1 list moves to today in its order; v2 written as {id,date,order}[]; the old key is kept as it was', () => {
    mem.setItem(KEYS.saved, JSON.stringify(['c', 'a', 'b']));
    const got = createStore(mem, null).load(TODAY);
    expect(got.saved).toEqual([
      { id: 'c', date: TODAY, order: 0 },
      { id: 'a', date: TODAY, order: 1 },
      { id: 'b', date: TODAY, order: 2 },
    ]);
    expect(stored()).toEqual(got.saved);
    expect(JSON.parse(mem.getItem(KEYS.saved)!)).toEqual(['c', 'a', 'b']);
  });

  it('D4 migration runs once: with a v2 list present (even empty) the v1 list is never read again', () => {
    mem.setItem(KEYS.saved, JSON.stringify(['a']));
    const s = createStore(mem, null);
    s.load(TODAY);
    s.toggleSaved('a', TODAY); // taken out
    expect(stored()).toEqual([]);
    expect(createStore(mem, null).load(TOMORROW).saved).toEqual([]);
    expect(JSON.parse(mem.getItem(KEYS.saved)!)).toEqual(['a']);
  });

  it('nothing stored: nothing written', () => {
    expect(createStore(mem, null).load(TODAY).saved).toEqual([]);
    expect(mem.getItem(KEYS.savedV2)).toBeNull();
  });

  it('v2 validation: bad entries dropped, one per place and day, orders renumbered per day, sorted by day', () => {
    expect(
      parseEntries([
        { id: 'b', date: TOMORROW, order: 5 },
        { id: 'a', date: TODAY, order: 9 },
        { id: 'a', date: TOMORROW, order: 1 },
        { id: 'a', date: TODAY, order: 2 },
        { id: '', date: TODAY, order: 0 },
        { id: 'x', date: '2026-02-30', order: 0 },
        { id: 'y', date: TODAY, order: 'first' },
        'z',
        null,
      ]),
    ).toEqual([
      { id: 'a', date: TODAY, order: 0 },
      { id: 'a', date: TOMORROW, order: 0 },
      { id: 'b', date: TOMORROW, order: 1 },
    ]);
    expect(parseEntries({ id: 'a' })).toEqual([]);
    expect(normalizeEntries(Array.from({ length: MAX_SAVED + 3 }, (_, i) => ({ id: `id${i}`, date: TODAY, order: i })))).toHaveLength(MAX_SAVED);
  });

  it('a repaired v2 list is written back', () => {
    mem.setItem(KEYS.savedV2, JSON.stringify([{ id: 'a', date: TODAY, order: 3 }, { id: 'a', date: TODAY, order: 4 }]));
    createStore(mem, null).load(TODAY);
    expect(stored()).toEqual([{ id: 'a', date: TODAY, order: 0 }]);
  });

  it('the same place on two days is two entries; a heart is about its own day', () => {
    const s = createStore(mem, null);
    s.load(TODAY);
    s.toggleSaved('a', TODAY);
    const r = s.toggleSaved('a', TOMORROW);
    expect(r.added).toBe(true);
    expect(r.entries).toEqual([
      { id: 'a', date: TODAY, order: 0 },
      { id: 'a', date: TOMORROW, order: 0 },
    ]);
    expect(s.toggleSaved('a', TODAY).entries).toEqual([{ id: 'a', date: TOMORROW, order: 0 }]);
  });

  it('위로·아래로 swap within the day only; the ends do nothing; kept across a new store (reload)', () => {
    const s = createStore(mem, null);
    s.load(TODAY);
    for (const id of ['a', 'b', 'c']) s.toggleSaved(id, TODAY);
    s.toggleSaved('z', TOMORROW);
    expect(ids(s.moveSaved('c', TODAY, -1))).toEqual(['a', 'c', 'b']);
    expect(ids(s.moveSaved('a', TODAY, -1))).toEqual(['a', 'c', 'b']);
    expect(ids(s.moveSaved('b', TODAY, 1))).toEqual(['a', 'c', 'b']);
    expect(ids(s.moveSaved('a', TODAY, 1))).toEqual(['c', 'a', 'b']);
    expect(ids(s.saved(), TOMORROW)).toEqual(['z']);
    expect(ids(createStore(mem, null).load(TODAY).saved)).toEqual(['c', 'a', 'b']);
  });

  it('다른 날로: to the end of that day; already there → one entry', () => {
    const s = createStore(mem, null);
    s.load(TODAY);
    for (const id of ['a', 'b']) s.toggleSaved(id, TODAY);
    s.toggleSaved('z', TOMORROW);
    const moved = s.moveToDay('a', TODAY, TOMORROW);
    expect(ids(moved)).toEqual(['b']);
    expect(ids(moved, TOMORROW)).toEqual(['z', 'a']);
    s.toggleSaved('z', TODAY);
    expect(ids(s.moveToDay('z', TODAY, TOMORROW), TOMORROW)).toEqual(['z', 'a']);
    expect(ids(s.saved())).toEqual(['b']);
  });

  it('put back where it was: toggling on with a position inserts there', () => {
    const s = createStore(mem, null);
    s.load(TODAY);
    for (const id of ['a', 'b', 'c']) s.toggleSaved(id, TODAY);
    const { removed } = s.toggleSaved('b', TODAY);
    expect(removed).toEqual({ id: 'b', date: TODAY, order: 1 });
    expect(ids(s.toggleSaved('b', TODAY, removed!.order).entries)).toEqual(['a', 'b', 'c']);
  });

  it('D5 the chosen day: "now" or a later day; today or earlier reads as "now" and is written back', () => {
    expect(parseWhen(TOMORROW, TODAY)).toBe(TOMORROW);
    expect(parseWhen(TODAY, TODAY)).toBe('now');
    expect(parseWhen('2026-09-01', TODAY)).toBe('now');
    expect(parseWhen('soon', TODAY)).toBe('now');
    const s = createStore(mem, null);
    s.setWhen(TOMORROW);
    expect(createStore(mem, null).load(TODAY).when).toBe(TOMORROW);
    expect(createStore(mem, null).load(TOMORROW).when).toBe('now');
    expect(JSON.parse(mem.getItem(KEYS.when)!)).toBe('now');
  });
});

describe('얼마나 (ADR-0060) — 범위 저장', () => {
  it('walk | drive30 | drive60; anything else (or nothing) reads as 차로 30분, and a bad value is written back', () => {
    expect(parseReach('walk')).toBe('walk');
    expect(parseReach('drive60')).toBe('drive60');
    expect(parseReach('drive30')).toBe('drive30');
    expect(parseReach('far')).toBe('drive30');
    expect(parseReach(null)).toBe('drive30');
    expect(createStore(mem, null).load(TODAY).reach).toBe('drive30');
    expect(mem.getItem(KEYS.reach)).toBeNull(); // nothing stored: nothing written
    mem.setItem(KEYS.reach, JSON.stringify('boat'));
    expect(createStore(mem, null).load(TODAY).reach).toBe('drive30');
    expect(JSON.parse(mem.getItem(KEYS.reach)!)).toBe('drive30');
  });

  it('setReach survives a new store (reload); with storage blocked it is simply not kept (the app holds it in memory)', () => {
    createStore(mem, null).setReach('walk');
    expect(JSON.parse(mem.getItem(KEYS.reach)!)).toBe('walk');
    expect(createStore(mem, null).load(TODAY).reach).toBe('walk');
    const blocked = createStore(null, null);
    expect(() => blocked.setReach('drive60')).not.toThrow();
    expect(blocked.load(TODAY).reach).toBe('drive30');
  });

  it('the session record keeps the range its rotation belongs to; an unknown one is dropped', () => {
    const origin = { key: 'region:애월', point: { lat: 애월.lat, lng: 애월.lng }, isPoint: false, from: '애월에서' };
    const rec = { v: 1, mood: 'walk', sub: 'meal', origin, shown: {}, histories: {} };
    expect(parseSession({ ...rec, reach: 'walk' })?.reach).toBe('walk');
    expect(parseSession({ ...rec, reach: 'boat' })).not.toHaveProperty('reach');
    expect(parseSession(rec)).not.toHaveProperty('reach');
  });
});
