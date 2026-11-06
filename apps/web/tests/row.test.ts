// @vitest-environment jsdom
// 오늘 판's row held from the first paint (jeju.row): home.ts rowTimes, the store's setRow, index.html's first script
// (yc-row), when render.ts lets it go, and listFailed (the list that did not come).
import { runInNewContext } from 'node:vm';
import { beforeEach, describe, expect, it } from 'vitest';
import { ROW_DAYS, rowTimes } from '../src/pick/home';
import { BUSAN } from '../src/region/release';
import { GPS_KEY, homeOrigin, initialState, reduce, type State } from '../src/state';
import { KEYS, RAIN_TTL_MS, createStore } from '../src/store';
import { areaByName, type AreaName } from '../src/region/areas';
import { fileSpots } from './fixtures';
import { $, deferred, flush, html, render, reset, wait } from './harness';

const DAY = 86_400_000;
const kst = (day: string, hm = '00:00') => Date.parse(`${day}T${hm}:00+09:00`);
/** 10월 3일 10:00: 중문's market day (3·8일) */
const T0 = kst('2026-10-03', '10:00');
const regionState = (name: AreaName, more: Partial<State> = {}): State => ({
  ...initialState({ basis: 'region', region: name, stay: null, saved: [], hintSeen: true, offline: false, today: '2026-10-03' }),
  ...more,
});
const pairs = (t: number[]) => Array.from({ length: t.length / 2 }, (_, i) => [t[2 * i], t[2 * i + 1]]);

beforeEach(reset);

describe('rowTimes', () => {
  it('merged [from, to) pairs in order, from now through the days it looks at; a market day whole', () => {
    const s = regionState('중문');
    const t = rowTimes(s, fileSpots, homeOrigin(s), T0);
    expect(t.length % 2).toBe(0);
    expect(t[0]).toBe(T0); // cut at now
    for (let i = 1; i < t.length; i++) expect(t[i], `${i}`).toBeGreaterThan(t[i - 1]);
    expect(t[t.length - 1]).toBeLessThanOrEqual(kst('2026-10-03') + ROW_DAYS * DAY);
    // 중문 market (3·8·13일): those days whole, today's from now
    for (const [from, to] of [[T0, kst('2026-10-04')], [kst('2026-10-08'), kst('2026-10-09')], [kst('2026-10-13'), kst('2026-10-14')]])
      expect(pairs(t).some(([a, b]) => a <= from && b >= to), new Date(from).toISOString()).toBe(true);
  });

  it('the day viewed: before it, each day shows that day (중문 on the 8th: the whole stretch to the 9th)', () => {
    const s = regionState('중문', { when: '2026-10-08' });
    const t = rowTimes(s, fileSpots, homeOrigin(s), T0);
    expect(t[0]).toBe(T0);
    expect(t[1]).toBeGreaterThanOrEqual(kst('2026-10-09'));
  });

  it('뺀 곳 count: every place left out, no row ahead', () => {
    const s = regionState('중문', { visited: fileSpots.map((x) => x.id) });
    expect(rowTimes(s, fileSpots, homeOrigin(s), T0)).toEqual([]);
  });

  it('비 소식 for the half hour its answer is kept, even with no basis to measure from', () => {
    const s = regionState('애월', { rain: { area: 'aewol', rain: true } });
    expect(rowTimes(s, fileSpots, null, T0)).toEqual([T0, T0 + RAIN_TTL_MS]);
    expect(rowTimes({ ...s, rain: { area: 'aewol', rain: false } }, fileSpots, null, T0)).toEqual([]);
  });

  it('none with no basis', () => {
    const s = initialState({ basis: 'gps', region: null, stay: null, saved: [], hintSeen: true, offline: false, today: '2026-10-03' });
    expect(rowTimes(s, fileSpots, homeOrigin(s), T0)).toEqual([]);
  });

  it('none with 내 위치, even with a fix this session (read anew each visit: a held place would go and come back)', () => {
    const s0 = initialState({ basis: 'gps', region: null, stay: null, saved: [], hintSeen: true, offline: false, today: '2026-10-03' });
    const jungmun = regionState('중문');
    const fix = { key: GPS_KEY, point: homeOrigin(jungmun)!.point, isPoint: true, from: '여기서' };
    const s = { ...s0, origin: fix };
    expect(homeOrigin(s)).toBe(fix);
    expect(rowTimes(jungmun, fileSpots, fix, T0).length).toBeGreaterThan(0);
    expect(rowTimes(s, fileSpots, fix, T0)).toEqual([]);
  });
});

describe('listFailed (reducer)', () => {
  const s0 = regionState('애월');
  it('set when the list did not come; once only; never over a list that is in', () => {
    const failed = reduce(s0, { type: 'listFailed' });
    expect(failed.listFailed).toBe(true);
    expect(reduce(failed, { type: 'listFailed' })).toBe(failed);
    const loaded = reduce(s0, { type: 'spots', spots: fileSpots });
    expect(reduce(loaded, { type: 'listFailed' })).toBe(loaded);
  });
  it('cleared when the list comes after all, and by another destination', () => {
    const failed = reduce(s0, { type: 'listFailed' });
    const loaded = reduce(failed, { type: 'spots', spots: fileSpots });
    expect([loaded.listFailed, loaded.spots]).toEqual([false, fileSpots]);
    const moved = reduce(failed, { type: 'dest', dest: 'busan', basis: 'gps', region: null, stay: null });
    expect([moved.listFailed, moved.spots]).toEqual([false, null]);
  });
});

/** In-memory Storage; `fail` makes every write throw. */
function memStorage(fail = false): Storage & { map: Map<string, string>; writes: number } {
  const map = new Map<string, string>();
  return {
    map,
    writes: 0,
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem(k) {
      if (fail) throw new Error('blocked');
      map.delete(k);
    },
    setItem(k, v) {
      if (fail) throw new Error('QuotaExceededError');
      this.writes++;
      map.set(k, String(v));
    },
  };
}

describe('setRow (jeju.row)', () => {
  it('[dest, from, to, …] in one key; written again only when it changes; an empty row removes it', () => {
    const mem = memStorage();
    const st = createStore(mem, null);
    st.setRow('busan', [1, 2, 5, 9]);
    expect(KEYS.row).toBe('jeju.row');
    expect(JSON.parse(mem.map.get('jeju.row')!)).toEqual(['busan', 1, 2, 5, 9]);
    st.setRow('busan', [1, 2, 5, 9]);
    expect(mem.writes).toBe(1);
    st.setRow('jeju', [1, 2, 5, 9]);
    expect(JSON.parse(mem.map.get('jeju.row')!)).toEqual(['jeju', 1, 2, 5, 9]);
    st.setRow('jeju', []);
    expect(mem.map.has('jeju.row')).toBe(false);
  });
  it('blocked or full storage: nothing thrown', () => {
    const st = createStore(memStorage(true), null);
    expect(() => st.setRow('jeju', [1, 2])).not.toThrow();
    expect(() => st.setRow('jeju', [])).not.toThrow();
  });
});

describe('index.html first script: yc-row', () => {
  const script = [...html.matchAll(/<!--busan--><script>([\s\S]*?)<\/script>/g)][0][1];
  /** The script run with `kept` jeju.dest and the raw jeju.row text; the classes it leaves on <html>. */
  function first(row: string | null, opts: { dest?: string; search?: string; getThrows?: boolean; storageThrows?: boolean } = {}) {
    const store = new Map<string, string>([['jeju.dest', JSON.stringify(opts.dest ?? 'jeju')]]);
    if (row !== null) store.set('jeju.row', row);
    const localStorage = {
      get length() {
        return store.size;
      },
      key: (i: number) => [...store.keys()][i] ?? null,
      getItem: (k: string) => {
        if (opts.getThrows && k === 'jeju.row') throw new Error('blocked');
        return store.get(k) ?? null;
      },
    };
    const window: Record<string, unknown> = {};
    Object.defineProperty(window, 'localStorage', {
      get() {
        if (opts.storageThrows) throw new Error('SecurityError');
        return localStorage;
      },
    });
    const h = { className: '' };
    runInNewContext(script, { window, document: { documentElement: h, referrer: '' }, location: { search: opts.search ?? '' } });
    return { classes: h.className.trim().split(/\s+/).filter(Boolean), dest: window.__dest ?? null, by: window.__destBy ?? null };
  }
  const now = () => Date.now();
  const around = (dest = 'jeju') => JSON.stringify([dest, now() - 60_000, now() + 3_600_000]);

  it('kept destination, now inside one of its pairs: held', () => {
    expect(first(around())).toEqual({ classes: ['yc-row'], dest: 'jeju', by: 'kept' });
    expect(first(JSON.stringify(['jeju', 1, 2, now() - 1000, now() + 1000])).classes).toEqual(['yc-row']);
  });
  it('past, not yet, or another destination: not held', () => {
    expect(first(JSON.stringify(['jeju', now() - 7_200_000, now() - 3_600_000])).classes).toEqual([]);
    expect(first(JSON.stringify(['jeju', now() + 3_600_000, now() + 7_200_000])).classes).toEqual([]);
    expect(first(around('busan')).classes).toEqual([]);
    expect(first(around('jeju'), { dest: 'busan' }).classes).toEqual([]);
  });
  it('not the kept destination (a link) or the start screen: the key is not read', () => {
    expect(first(around(), { search: '?dest=jeju' })).toEqual({ classes: [], dest: 'jeju', by: 'link' });
  });
  it('malformed values never throw and never hold; the destination is decided as ever', () => {
    const bad = ['{', 'null', '7', '"jeju"', '{"0":"jeju","1":0,"2":9e15,"length":3}', '{"0":"jeju","length":1e15}', '["jeju"]', '[]'];
    for (const row of bad) expect(first(row), row).toEqual({ classes: [], dest: 'jeju', by: 'kept' });
  });
  it('an absurd length is not walked: the loop stops after a few pairs', () => {
    const long = ['jeju', ...Array.from({ length: 200 }, () => [0, 1]).flat(), now() - 1000, now() + 1000];
    expect(first(JSON.stringify(long)).classes).toEqual([]);
  });
  it('storage that throws: no hold, and the destination decision is as without it', () => {
    expect(first(around(), { getThrows: true })).toEqual({ classes: [], dest: 'jeju', by: 'kept' });
    expect(first(around(), { storageThrows: true })).toEqual({ classes: ['yc-start'], dest: null, by: null });
  });
});

describe('render lets yc-row go once the row is decided', () => {
  const held = () => document.documentElement.classList.contains('yc-row');
  const hold = () => document.documentElement.classList.add('yc-row');
  const region = (name: AreaName) => {
    window.localStorage.setItem('jeju.basis', JSON.stringify('region'));
    window.localStorage.setItem('jeju.region', JSON.stringify(name));
  };
  const today = () => new Date(T0);
  const answer = { ok: true, status: 200, json: async () => ({ area: 'x', pop: 10, rain: false }) };
  beforeEach(() => document.documentElement.classList.remove('yc-row'));

  it('a basis: kept until both the list and 비 소식\'s answer are in', async () => {
    region('애월');
    hold();
    const list = deferred<typeof fileSpots>();
    const rain = deferred<typeof answer>();
    render({ today, loadSpots: () => list.promise, fetch: () => rain.promise });
    await flush();
    expect(held()).toBe(true);
    list.resolve(fileSpots);
    await flush();
    await flush();
    expect(held()).toBe(true); // 비 소식 still on its way
    rain.resolve(answer);
    await flush();
    await flush();
    expect(held()).toBe(false);
  });

  it('nothing to ask 비 소식 for (no basis, or a day viewed): the list alone lets it go', async () => {
    hold();
    render({ today, locate: () => new Promise(() => undefined) });
    await flush();
    await flush();
    expect(held()).toBe(false);

    reset();
    region('애월');
    window.localStorage.setItem('jeju.when', JSON.stringify('2026-10-05'));
    hold();
    render({ today, fetch: () => new Promise(() => undefined) });
    await flush();
    await flush();
    expect(held()).toBe(false);
  });

  it('the list failed, or did not come within the wait: let go, and the empty 「지금 여기서」 box goes with it', async () => {
    region('애월');
    hold();
    render({ today, loadSpots: () => Promise.reject(new Error('offline')), fetch: () => new Promise(() => undefined) });
    await flush();
    await flush();
    expect(held()).toBe(false);
    expect($('#now').hidden).toBe(true);

    reset();
    region('애월');
    hold();
    render({ today, loadSpots: () => new Promise(() => undefined), fetch: () => new Promise(() => undefined), delays: { slow: 0, long: 10_000, settle: 300, dataTimeout: 20 } });
    await flush();
    expect(held()).toBe(true);
    await wait(40);
    await flush();
    expect(held()).toBe(false);
    expect($('#now').hidden).toBe(true);
  });
});

describe.runIf(BUSAN)('keepRow writes jeju.row (switched-on build)', () => {
  const region = (name: AreaName) => {
    window.localStorage.setItem('jeju.basis', JSON.stringify('region'));
    window.localStorage.setItem('jeju.region', JSON.stringify(name));
  };
  const row = () => JSON.parse(window.localStorage.getItem(KEYS.row) ?? 'null') as unknown[] | null;
  const settle = async () => {
    for (let i = 0; i < 4; i++) await flush();
  };

  it('a region: the row ahead, with the destination first', async () => {
    region('중문');
    render({ today: () => new Date(T0), fetch: async () => ({ ok: true, status: 200, json: async () => ({ area: 'x', pop: 10, rain: false }) }) });
    await settle();
    expect(row()?.[0]).toBe('jeju');
    expect(row()?.[1]).toBe(T0);
  });

  it('내 위치 (f-1): nothing kept even with the position read, and a row kept before is cleared', async () => {
    window.localStorage.setItem(KEYS.row, JSON.stringify(['jeju', T0, T0 + DAY]));
    window.localStorage.setItem('jeju.basis', JSON.stringify('gps'));
    const jungmun = areaByName('중문')!;
    render({
      today: () => new Date(T0),
      locate: () => Promise.resolve({ lat: jungmun.lat, lng: jungmun.lng }),
      geoPermission: async () => 'granted',
      fetch: async () => ({ ok: true, status: 200, json: async () => ({ area: 'x', pop: 10, rain: false }) }),
    });
    await settle();
    expect($('#basis').textContent).toBe('내 위치 근처');
    expect(row()).toBeNull();
  });
});
