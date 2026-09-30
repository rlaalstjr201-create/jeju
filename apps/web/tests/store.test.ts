// S27–S29 + audit "storage validation" / "data loss (storage)": every stored value is validated and
// repaired, and hearts are read-modify-write so two tabs never erase each other's saves.
import { beforeEach, describe, expect, it } from 'vitest';
import { AREAS } from '../src/areas';
import { KEYS, MAX_SAVED, createStore, parseBasis, parseRegion, parseSaved, parseSession, parseStay } from '../src/store';

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
    const got = createStore(mem, null).load();
    expect(got).toMatchObject({ basis: 'region', region: '성산', stay: null, saved: ['x', 'y'] });
    expect(JSON.parse(mem.getItem(KEYS.saved)!)).toEqual(['x', 'y']);
    expect(JSON.parse(mem.getItem(KEYS.region)!)).toBe('성산');
    expect(mem.getItem(KEYS.stay)).toBeNull();

    mem.setItem(KEYS.basis, JSON.stringify('teleport'));
    expect(createStore(mem, null).load().basis).toBe('gps');
    expect(JSON.parse(mem.getItem(KEYS.basis)!)).toBe('gps');
  });

  it('unparseable JSON reads as "nothing stored"', () => {
    mem.setItem(KEYS.saved, '{oops');
    mem.setItem(KEYS.basis, 'stay"');
    expect(createStore(mem, null).load()).toMatchObject({ saved: [], basis: 'gps' });
  });
});

describe('저장 — 두 탭 (audit MAJOR: last-writer-wins)', () => {
  it('two tabs on one storage: A saves, B saves → both kept (read-modify-write)', () => {
    const a = createStore(mem, null);
    const b = createStore(mem, null);
    a.load();
    b.load();
    a.toggleSaved('rest-1');
    b.toggleSaved('walk-1');
    expect(JSON.parse(mem.getItem(KEYS.saved)!)).toEqual(['walk-1', 'rest-1']);
    expect(a.saved()).toEqual(['walk-1', 'rest-1']);
  });

  it('unsaving in one tab does not resurrect or drop the other tab\'s save', () => {
    const a = createStore(mem, null);
    const b = createStore(mem, null);
    a.toggleSaved('1');
    b.toggleSaved('2');
    expect(a.toggleSaved('1')).toEqual({ ids: ['2'], added: false });
    expect(b.saved()).toEqual(['2']);
  });

  it('S42 ids unknown to the current data are never pruned from storage', () => {
    mem.setItem(KEYS.saved, JSON.stringify(['gone-from-data', 'kept']));
    const s = createStore(mem, null);
    s.load();
    s.toggleSaved('new');
    expect(JSON.parse(mem.getItem(KEYS.saved)!)).toEqual(['new', 'gone-from-data', 'kept']);
  });
});

describe('S27·S28 저장소 차단·가득 참', () => {
  it('S27 no storage at all: hearts work from memory for the visit', () => {
    const s = createStore(null, null);
    expect(s.load().saved).toEqual([]);
    expect(s.toggleSaved('a')).toEqual({ ids: ['a'], added: true });
    expect(s.toggleSaved('b').ids).toEqual(['b', 'a']);
    expect(s.toggleSaved('a')).toEqual({ ids: ['b'], added: false });
  });

  it('S28 quota exceeded: the first failed write switches to memory, later toggles stay right', () => {
    const full = new MemStorage();
    full.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    const s = createStore(full, null);
    s.load();
    expect(s.toggleSaved('a').ids).toEqual(['a']);
    expect(s.toggleSaved('b').ids).toEqual(['b', 'a']);
    expect(s.toggleSaved('a').ids).toEqual(['b']);
  });

  it('getItem throwing (blocked mid-visit) also falls back to memory', () => {
    const s = createStore(mem, null);
    s.load();
    s.toggleSaved('a');
    mem.getItem = () => {
      throw new Error('SecurityError');
    };
    expect(s.toggleSaved('b').ids).toEqual(['b', 'a']);
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
