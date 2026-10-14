// 가 봤어요 (ADR-0087, specs/hide-visited.md S2): `jeju.visited` is read, repaired and written like the hearts;
// with storage missing or throwing it keeps working from memory for the visit.
import { beforeEach, describe, expect, it } from 'vitest';
import { KEYS, MAX_VISITED, createStore, parseVisited } from '../src/store';
import { initialState, reduce } from '../src/state';

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
const TODAY = '2026-10-14';
const stored = () => JSON.parse(mem.getItem(KEYS.visited)!) as unknown;

describe('S2 jeju.visited — 읽기 검증', () => {
  it('strings only, duplicates removed (first kept), in the order added', () => {
    expect(parseVisited(['a', 3, null, '', 'b', 'a', { id: 'c' }, 'c'])).toEqual(['a', 'b', 'c']);
    expect(parseVisited('a')).toEqual([]);
    expect(parseVisited(null)).toEqual([]);
  });

  it('at most 500: the oldest go first', () => {
    const many = Array.from({ length: MAX_VISITED + 3 }, (_, i) => `id${i}`);
    const got = parseVisited(many);
    expect(MAX_VISITED).toBe(500);
    expect(got).toHaveLength(MAX_VISITED);
    expect(got[0]).toBe('id3');
    expect(got[got.length - 1]).toBe(`id${MAX_VISITED + 2}`);
  });

  it('load() repairs what it read and writes the repaired list back; junk JSON reads as none', () => {
    mem.setItem(KEYS.visited, JSON.stringify(['x', 'x', 7, 'y']));
    expect(createStore(mem, null).load(TODAY).visited).toEqual(['x', 'y']);
    expect(stored()).toEqual(['x', 'y']);
    mem.setItem(KEYS.visited, '{oops');
    expect(createStore(mem, null).load(TODAY).visited).toEqual([]);
    mem.setItem(KEYS.visited, JSON.stringify({ a: 1 }));
    expect(createStore(mem, null).load(TODAY).visited).toEqual([]);
    expect(mem.getItem(KEYS.visited)).toBeNull();
  });

  it('nothing stored: none, and nothing written', () => {
    expect(createStore(mem, null).load(TODAY).visited).toEqual([]);
    expect(mem.getItem(KEYS.visited)).toBeNull();
  });

  it('ids missing from the data are kept (the place may come back)', () => {
    mem.setItem(KEYS.visited, JSON.stringify(['gone-from-data']));
    const s = createStore(mem, null);
    s.load(TODAY);
    s.toggleVisited('new');
    expect(stored()).toEqual(['gone-from-data', 'new']);
  });
});

describe('S2 빼기·되돌리기 왕복', () => {
  it('toggle adds at the end, toggles back out; unvisit and unvisitAll; read again on a new load', () => {
    const s = createStore(mem, null);
    s.load(TODAY);
    expect(s.toggleVisited('a')).toEqual({ visited: ['a'], added: true });
    expect(s.toggleVisited('b')).toEqual({ visited: ['a', 'b'], added: true });
    expect(createStore(mem, null).load(TODAY).visited).toEqual(['a', 'b']); // reopened: still there
    expect(s.toggleVisited('a')).toEqual({ visited: ['b'], added: false });
    expect(s.unvisit('zz')).toEqual(['b']);
    expect(s.toggleVisited('c').visited).toEqual(['b', 'c']);
    expect(s.unvisit('b')).toEqual(['c']);
    expect(s.unvisitAll()).toEqual([]);
    expect(createStore(mem, null).load(TODAY).visited).toEqual([]);
  });

  it('read-modify-write: two tabs never drop each other\'s', () => {
    const a = createStore(mem, null);
    const b = createStore(mem, null);
    a.load(TODAY);
    b.load(TODAY);
    a.toggleVisited('1');
    b.toggleVisited('2');
    expect(stored()).toEqual(['1', '2']);
  });

  it('the 501st drops the oldest', () => {
    mem.setItem(KEYS.visited, JSON.stringify(Array.from({ length: MAX_VISITED }, (_, i) => `id${i}`)));
    const s = createStore(mem, null);
    s.load(TODAY);
    const { visited } = s.toggleVisited('new');
    expect(visited).toHaveLength(MAX_VISITED);
    expect(visited[0]).toBe('id1');
    expect(visited[visited.length - 1]).toBe('new');
  });
});

describe('S2 저장소 없음·던짐', () => {
  it('no storage at all: works from memory for the visit', () => {
    const s = createStore(null, null);
    expect(s.load(TODAY).visited).toEqual([]);
    expect(s.toggleVisited('a').visited).toEqual(['a']);
    expect(s.toggleVisited('b').visited).toEqual(['a', 'b']);
    expect(s.toggleVisited('a').visited).toEqual(['b']);
    expect(s.unvisitAll()).toEqual([]);
  });

  it('setItem throwing (private mode, quota): no throw, and the state still changes', () => {
    const full = new MemStorage();
    full.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    const s = createStore(full, null);
    expect(() => s.load(TODAY)).not.toThrow();
    expect(() => s.toggleVisited('a')).not.toThrow();
    expect(s.toggleVisited('b').visited).toEqual(['a', 'b']);
    expect(s.unvisit('a')).toEqual(['b']);
    expect(s.unvisitAll()).toEqual([]);
  });

  it('getItem throwing mid-visit: memory from then on', () => {
    const s = createStore(mem, null);
    s.load(TODAY);
    s.toggleVisited('a');
    mem.getItem = () => {
      throw new Error('SecurityError');
    };
    expect(s.toggleVisited('b').visited).toEqual(['a', 'b']);
  });

  it('getItem throwing from the start: load() gives none', () => {
    mem.getItem = () => {
      throw new Error('SecurityError');
    };
    const s = createStore(mem, null);
    expect(s.load(TODAY).visited).toEqual([]);
    expect(s.toggleVisited('a').visited).toEqual(['a']);
  });
});

describe('state: visited', () => {
  const base = () => initialState({ basis: 'gps', today: TODAY, region: null, stay: null, saved: [], hintSeen: false, offline: false });
  it('starts empty, or with what was loaded', () => {
    expect(base().visited).toEqual([]);
    expect(initialState({ basis: 'gps', today: TODAY, region: null, stay: null, saved: [], visited: ['a'], hintSeen: false, offline: false }).visited).toEqual(['a']);
  });
  it('the same list again keeps the state as it is', () => {
    const s = reduce(base(), { type: 'visited', ids: ['a'] });
    expect(s.visited).toEqual(['a']);
    expect(reduce(s, { type: 'visited', ids: ['a'] })).toBe(s);
    expect(reduce(s, { type: 'visited', ids: [] }).visited).toEqual([]);
  });
});
