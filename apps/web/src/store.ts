// Device storage (ADR-0026: no login, everything stays on this device). Every read is validated and
// repaired; every access is try/catch'd, and when storage is missing or throws the app keeps working from
// memory for this visit (S27·S28·S29).
import { LEGACY_REGION, areaByName, inJeju, nearestArea, type AreaName } from './areas';
import { isDay, type Day } from './dates';
import { DEFAULT_REACH, REACHES, type Button, type Histories, type History, type HistoryKey, type Reach, type Sub } from './pick';
import type { Basis, Origin, SavedEntry, Stay, When } from './types';

export const KEYS = {
  basis: 'jeju.basis',
  /** the day hearts go to, next to the basis (specs/date-mode.md): 'now' | 'YYYY-MM-DD'. */
  when: 'jeju.when',
  region: 'jeju.region',
  /** 얼마나 (ADR-0060): 'walk' | 'drive30' | 'drive60'. */
  reach: 'jeju.reach',
  stay: 'jeju.stay',
  /** v2: `{ id, date, order }[]`, saved per day. */
  savedV2: 'jeju.saved.v2',
  /** v1: ids, newest first. Read once into v2 (today) and never written or removed again, so a rollback
   * still finds it. */
  saved: 'jeju.saved',
  hint: 'jeju.hintSeen',
  session: 'jeju.session',
} as const;
export const MAX_SAVED = 500;

const BUTTONS: readonly Button[] = ['rest', 'walk', 'new', 'food', 'any'];
const SUBS: readonly Sub[] = ['meal', 'cafe'];
const HISTORY_KEYS: readonly HistoryKey[] = ['rest', 'walk', 'new', 'any', 'food:meal', 'food:cafe'];

function parse(raw: string | null): unknown {
  if (raw == null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
const isStr = (x: unknown): x is string => typeof x === 'string' && x.length > 0;
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const strings = (v: unknown): string[] | null => (Array.isArray(v) ? v.filter(isStr) : null);

/** v1 list: strings only, duplicates removed (first = newest kept), at most MAX_SAVED. */
export function parseSaved(v: unknown): string[] {
  return [...new Set(strings(v) ?? [])].slice(0, MAX_SAVED);
}

/** Canonical form: sorted by day, then order; one entry per place and day (the first kept); each day's
 * orders renumbered 0, 1, 2, …; at most MAX_SAVED (the latest days kept). */
export function normalizeEntries(list: readonly SavedEntry[]): SavedEntry[] {
  const seen = new Set<string>();
  const kept = list.filter((e) => {
    const k = `${e.id}|${e.date}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const sorted = kept
    .map((e, i) => ({ e, i }))
    .sort((a, b) => (a.e.date < b.e.date ? -1 : a.e.date > b.e.date ? 1 : a.e.order - b.e.order || a.i - b.i))
    .map(({ e }) => e)
    .slice(-MAX_SAVED);
  let day = '';
  let n = 0;
  return sorted.map((e) => {
    if (e.date !== day) {
      day = e.date;
      n = 0;
    }
    return { id: e.id, date: e.date, order: n++ };
  });
}

/** v2 list: entries with a non-empty id, a real day and a finite order only, then normalized. */
export function parseEntries(v: unknown): SavedEntry[] {
  if (!Array.isArray(v)) return [];
  const ok = v.filter((x): x is SavedEntry => {
    if (!x || typeof x !== 'object') return false;
    const o = x as Record<string, unknown>;
    return isStr(o.id) && isDay(o.date) && isNum(o.order);
  });
  return normalizeEntries(ok);
}

/** 'now', or a day after today. Today or earlier is 'now' again (the day has come or gone). */
export function parseWhen(v: unknown, today: Day): When {
  return isDay(v) && v > today ? v : 'now';
}

/** 걸어서 · 차로 30분 · 차로 1시간; anything else is the default 차로 30분. */
export function parseReach(v: unknown): Reach {
  return REACHES.includes(v as Reach) ? (v as Reach) : DEFAULT_REACH;
}

/** One of the 15 areas; the 4 legacy names map to their nearest area. */
export function parseRegion(v: unknown): AreaName | null {
  if (typeof v !== 'string') return null;
  return areaByName(v)?.name ?? LEGACY_REGION[v] ?? null;
}

/** Finite coordinates inside Jeju. Legacy `{lat, lng, label:'숙소'}` is accepted and upgraded. */
export function parseStay(v: unknown): Stay | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (!isNum(o.lat) || !isNum(o.lng)) return null;
  const p = { lat: o.lat, lng: o.lng };
  if (!inJeju(p)) return null;
  const near = nearestArea(p);
  const area = areaByName(o.area)?.name ?? near.name;
  const atCentre = Math.abs(near.lat - p.lat) < 1e-6 && Math.abs(near.lng - p.lng) < 1e-6;
  const source = o.source === 'gps' || o.source === 'area' ? o.source : atCentre ? 'area' : 'gps';
  return { ...p, area, source };
}

export function parseBasis(v: unknown, stay: Stay | null, region: AreaName | null): Basis {
  if (v === 'stay' && stay) return 'stay';
  if (v === 'region' && region) return 'region';
  return 'gps';
}

// --- sessionStorage: the results entry (which mood, and the cards seen so far), for a reload / discarded
// tab (S54). Written when the results are asked for and again when they land; cleared by 바꾸기. ---
export interface SessionRecord {
  v: 1;
  mood: Button;
  sub: Sub;
  /** the point `shown`/`histories` belong to; null = nothing shown yet. */
  origin: Origin | null;
  /** the range `shown`/`histories` belong to (ADR-0060); missing in records written before it. */
  reach?: Reach;
  shown: Partial<Record<HistoryKey, string[]>>;
  histories: Histories;
}

function parseHistory(v: unknown): History | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const seen = strings(o.seen);
  const last = strings(o.last);
  if (!seen || !last) return null;
  return o.restarted === true ? { seen, last, restarted: true } : { seen, last };
}

export function parseSession(v: unknown): SessionRecord | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (o.v !== 1 || !BUTTONS.includes(o.mood as Button) || !SUBS.includes(o.sub as Sub)) return null;
  const base = { v: 1 as const, mood: o.mood as Button, sub: o.sub as Sub };
  // Asked for, nothing shown yet: the mood alone.
  if (o.origin === null) return { ...base, origin: null, shown: {}, histories: {} };
  const og = o.origin as Record<string, unknown> | undefined;
  const pt = og?.point as Record<string, unknown> | undefined;
  if (!og || !isStr(og.key) || !isStr(og.from) || typeof og.isPoint !== 'boolean' || !pt || !isNum(pt.lat) || !isNum(pt.lng)) {
    return null;
  }
  const shown: SessionRecord['shown'] = {};
  const histories: Histories = {};
  const rawShown = (o.shown ?? {}) as Record<string, unknown>;
  const rawHist = (o.histories ?? {}) as Record<string, unknown>;
  for (const k of HISTORY_KEYS) {
    const ids = strings(rawShown[k]);
    if (ids?.length) shown[k] = ids;
    const h = parseHistory(rawHist[k]);
    if (h) histories[k] = h;
  }
  return {
    ...base,
    origin: { key: og.key, from: og.from, isPoint: og.isPoint, point: { lat: pt.lat, lng: pt.lng } },
    ...(REACHES.includes(o.reach as Reach) ? { reach: o.reach as Reach } : {}),
    shown,
    histories,
  };
}

export interface Loaded {
  basis: Basis;
  reach: Reach;
  when: When;
  region: AreaName | null;
  stay: Stay | null;
  saved: SavedEntry[];
  hintSeen: boolean;
}

export interface Store {
  /** Read everything once at mount, writing back repaired values where the stored ones were bad. The v1
   * saved list is moved to `today` the first time (no v2 key yet), in its order. */
  load(today: Day): Loaded;
  setBasis(b: Basis): void;
  setReach(r: Reach): void;
  setWhen(w: When): void;
  setRegion(name: AreaName): void;
  setStay(stay: Stay): void;
  setHintSeen(): void;
  // Every saved-list change below is read-modify-write, so two tabs never overwrite each other's hearts.
  /** Current saved entries, re-read from storage (another tab may have changed them). */
  saved(): SavedEntry[];
  /** Heart on `id` for `date`: added at the end of that day (or at `at`, putting back a row just taken out),
   * or taken out (`removed` says where it was). */
  toggleSaved(id: string, date: Day, at?: number): { entries: SavedEntry[]; added: boolean; removed: SavedEntry | null };
  /** One place up (-1) or down (+1) within its day. */
  moveSaved(id: string, date: Day, dir: -1 | 1): SavedEntry[];
  /** To another day, at its end (if it is already there, the two become one). */
  moveToDay(id: string, from: Day, to: Day): SavedEntry[];
  readSession(): SessionRecord | null;
  writeSession(rec: SessionRecord): void;
  clearSession(): void;
}

export function createStore(local: Storage | null, session: Storage | null): Store {
  // Once storage throws on a saved-list read or write, memory is the truth for the rest of the visit.
  let trusted = !!local;
  let memory: SavedEntry[] = [];

  function get(storage: Storage | null, key: string): unknown {
    try {
      return parse(storage?.getItem(key) ?? null);
    } catch {
      return null;
    }
  }
  function set(storage: Storage | null, key: string, value: unknown): boolean {
    try {
      if (!storage) return false;
      storage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false; // private mode, quota — still works for this visit
    }
  }
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

  function readSaved(): SavedEntry[] {
    if (!trusted || !local) return memory;
    let raw: string | null;
    try {
      raw = local.getItem(KEYS.savedV2);
    } catch {
      trusted = false;
      return memory;
    }
    memory = parseEntries(parse(raw));
    return memory;
  }
  function writeSaved(entries: SavedEntry[]) {
    memory = entries;
    if (trusted && !set(local, KEYS.savedV2, entries)) trusted = false;
  }
  function update(change: (cur: SavedEntry[]) => SavedEntry[]): SavedEntry[] {
    const next = normalizeEntries(change(readSaved()));
    writeSaved(next);
    return next;
  }
  const ofDay = (list: SavedEntry[], day: Day) => list.filter((e) => e.date === day);
  const lastOrder = (list: SavedEntry[], day: Day) => ofDay(list, day).length;

  return {
    load(today) {
      const rawRegion = get(local, KEYS.region);
      const region = parseRegion(rawRegion);
      if (rawRegion != null && !same(rawRegion, region)) {
        if (region) set(local, KEYS.region, region);
        else removeQuietly(local, KEYS.region);
      }
      const rawStay = get(local, KEYS.stay);
      const stay = parseStay(rawStay);
      if (rawStay != null && !same(rawStay, stay)) {
        if (stay) set(local, KEYS.stay, stay);
        else removeQuietly(local, KEYS.stay);
      }
      const rawBasis = get(local, KEYS.basis);
      const basis = parseBasis(rawBasis, stay, region);
      if (rawBasis != null && rawBasis !== basis) set(local, KEYS.basis, basis);
      const rawReach = get(local, KEYS.reach);
      const reach = parseReach(rawReach);
      if (rawReach != null && rawReach !== reach) set(local, KEYS.reach, reach);
      const rawWhen = get(local, KEYS.when);
      const when = parseWhen(rawWhen, today);
      if (rawWhen != null && rawWhen !== when) set(local, KEYS.when, when);
      const rawSaved = get(local, KEYS.savedV2);
      let saved: SavedEntry[];
      if (rawSaved == null) {
        // First run with day-by-day saving: the old list becomes today's, in its order (D4).
        saved = parseSaved(get(local, KEYS.saved)).map((id, order) => ({ id, date: today, order }));
        memory = saved;
        if (saved.length) writeSaved(saved);
      } else {
        saved = parseEntries(rawSaved);
        memory = saved;
        if (!same(rawSaved, saved)) writeSaved(saved);
      }
      return { basis, reach, when, region, stay, saved, hintSeen: get(local, KEYS.hint) === true };
    },
    setBasis: (b) => void set(local, KEYS.basis, b),
    setReach: (r) => void set(local, KEYS.reach, r),
    setWhen: (w) => void set(local, KEYS.when, w),
    setRegion: (name) => void set(local, KEYS.region, name),
    setStay: (stay) => void set(local, KEYS.stay, stay),
    setHintSeen: () => void set(local, KEYS.hint, true),
    saved: readSaved,
    toggleSaved(id, date, at) {
      let removed: SavedEntry | null = null;
      const entries = update((cur) => {
        removed = cur.find((e) => e.id === id && e.date === date) ?? null;
        if (removed) return cur.filter((e) => e !== removed);
        // Put back where it was: everything of that day from `at` on moves one down.
        const order = at === undefined ? lastOrder(cur, date) : at - 0.5;
        return [...cur, { id, date, order }];
      });
      return { entries, added: !removed, removed };
    },
    moveSaved(id, date, dir) {
      return update((cur) => {
        const day = ofDay(cur, date);
        const i = day.findIndex((e) => e.id === id);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= day.length) return cur;
        const swap = new Map([
          [day[i], day[j].order],
          [day[j], day[i].order],
        ]);
        return cur.map((e) => (swap.has(e) ? { ...e, order: swap.get(e)! } : e));
      });
    },
    moveToDay(id, from, to) {
      return update((cur) => {
        const entry = cur.find((e) => e.id === id && e.date === from);
        if (!entry || from === to) return cur;
        const rest = cur.filter((e) => e !== entry);
        if (rest.some((e) => e.id === id && e.date === to)) return rest;
        return [...rest, { id, date: to, order: lastOrder(rest, to) }];
      });
    },
    readSession: () => parseSession(get(session, KEYS.session)),
    writeSession: (rec) => void set(session, KEYS.session, rec),
    clearSession: () => removeQuietly(session, KEYS.session),
  };
}

function removeQuietly(storage: Storage | null, key: string) {
  try {
    storage?.removeItem(key);
  } catch {
    /* ignore */
  }
}
