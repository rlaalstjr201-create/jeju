// Device storage (ADR-0026: no login, everything stays on this device). Every read is validated and
// repaired; every access is try/catch'd, and when storage is missing or throws the app keeps working from
// memory for this visit (S27·S28·S29).
import { LEGACY_REGION, areaByName, inJeju, nearestArea, type AreaName } from './areas';
import type { Button, Histories, History, HistoryKey, Sub } from './pick';
import type { Basis, Origin, Stay } from './types';

export const KEYS = {
  basis: 'jeju.basis',
  region: 'jeju.region',
  stay: 'jeju.stay',
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

/** Strings only, duplicates removed (first = newest kept), at most MAX_SAVED. */
export function parseSaved(v: unknown): string[] {
  return [...new Set(strings(v) ?? [])].slice(0, MAX_SAVED);
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
    shown,
    histories,
  };
}

export interface Loaded {
  basis: Basis;
  region: AreaName | null;
  stay: Stay | null;
  saved: string[];
  hintSeen: boolean;
}

export interface Store {
  /** Read everything once at mount, writing back repaired values where the stored ones were bad. */
  load(): Loaded;
  setBasis(b: Basis): void;
  setRegion(name: AreaName): void;
  setStay(stay: Stay): void;
  setHintSeen(): void;
  /** Current saved ids, re-read from storage (another tab may have changed them). */
  saved(): string[];
  /** Read-modify-write so two tabs never overwrite each other's hearts. Newest first. */
  toggleSaved(id: string): { ids: string[]; added: boolean };
  readSession(): SessionRecord | null;
  writeSession(rec: SessionRecord): void;
  clearSession(): void;
}

export function createStore(local: Storage | null, session: Storage | null): Store {
  // Once storage throws on a saved-list read or write, memory is the truth for the rest of the visit.
  let trusted = !!local;
  let memory: string[] = [];

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

  function readSaved(): string[] {
    if (!trusted || !local) return memory;
    let raw: string | null;
    try {
      raw = local.getItem(KEYS.saved);
    } catch {
      trusted = false;
      return memory;
    }
    memory = parseSaved(parse(raw));
    return memory;
  }
  function writeSaved(ids: string[]) {
    memory = ids;
    if (trusted && !set(local, KEYS.saved, ids)) trusted = false;
  }

  return {
    load() {
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
      const rawSaved = get(local, KEYS.saved);
      const saved = parseSaved(rawSaved);
      memory = saved;
      if (rawSaved != null && !same(rawSaved, saved)) writeSaved(saved);
      return { basis, region, stay, saved, hintSeen: get(local, KEYS.hint) === true };
    },
    setBasis: (b) => void set(local, KEYS.basis, b),
    setRegion: (name) => void set(local, KEYS.region, name),
    setStay: (stay) => void set(local, KEYS.stay, stay),
    setHintSeen: () => void set(local, KEYS.hint, true),
    saved: readSaved,
    toggleSaved(id) {
      const cur = readSaved();
      const added = !cur.includes(id);
      const ids = added ? [id, ...cur].slice(0, MAX_SAVED) : cur.filter((x) => x !== id);
      writeSaved(ids);
      return { ids, added };
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
