// Device storage (ADR-0026: no login, everything stays on this device). Every read is validated and
// repaired; every access is try/catch'd, and when storage is missing or throws the app keeps working from
// memory for this visit (S27·S28·S29).
import { AREAS, LEGACY_REGION, areaByName, inJeju, nearestArea, type AreaName } from './areas';
import { isDay, type Day } from './dates';
import { DEFAULT_REACH, NEW_SUBS, REACHES, type Button, type Histories, type History, type HistoryKey, type NewSub, type Reach, type Sub } from './pick';
import { DEFAULT_MAP_APP, MAP_APPS, type MapApp } from './links';
import { parseSurvey, type SurveyRec } from './survey';
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
  /** 기록 끄기 (ADR-0061): false = no usage events from this device. Missing = on. */
  track: 'jeju.track',
  /** 지도 앱 (ADR-0071): 'naver' | 'kakao' | 'tmap'. Missing = 네이버지도. */
  mapApp: 'jeju.mapApp',
  /** ADR-0063: the in-app browser notice was closed (true). */
  inapp: 'jeju.inappSeen',
  /** ADR-0063: the home-screen nudge has been shown once (true). */
  install: 'jeju.installSeen',
  /** ADR-0081: the home's survey line `{ map?, shown?, tapped? }` (src/survey.ts), this device only. */
  survey: 'jeju.survey',
  session: 'jeju.session',
  /** sessionStorage, ADR-0065: 비 와요(실내만) is on (true). Off = missing. Rain is today's matter: never kept
   * on the device past the session. */
  indoor: 'jeju.indoor',
  /** sessionStorage, ADR-0076: the last 비 소식 answer `{ v: 1, area, at, rain }`, good for 30 minutes. */
  rain: 'jeju.rain',
  /** ADR-0087: 가 봤어요 — place ids left out of the picks on this device, oldest first. Not the data's `hide`. */
  visited: 'jeju.visited',
} as const;
export const MAX_SAVED = 500;
export const MAX_VISITED = 500;

const BUTTONS: readonly Button[] = ['rest', 'walk', 'new', 'food', 'any'];
const SUBS: readonly Sub[] = ['meal', 'cafe'];
const HISTORY_KEYS: readonly HistoryKey[] = ['rest', 'walk', 'any', 'food:meal', 'food:cafe', 'new:mix', 'new:sight', 'new:do'];
/** Records written before the 새로운 거 tabs (ADR-0064) kept that rotation under 'new': it is 섞어서. */
const LEGACY_KEYS: Partial<Record<HistoryKey, string>> = { 'new:mix': 'new' };

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

/** 뺀 곳 (ADR-0087): strings only, in the order they were added, duplicates removed (the first kept), at most
 * MAX_VISITED (the oldest dropped). Ids missing from the data are kept: the place may come back. */
export function parseVisited(v: unknown): string[] {
  return [...new Set(strings(v) ?? [])].slice(-MAX_VISITED);
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
    return { id: e.id, date: e.date, order: n++, ...(isDay(e.at) ? { at: e.at } : {}) };
  });
}

/** A backup brought onto this device (ADR-0063): what is here stays as it is; each place missing on its day
 * goes to the end of that day, in the backup's order. `added` = how many were new. */
export function mergeEntries(cur: readonly SavedEntry[], incoming: readonly SavedEntry[]): { entries: SavedEntry[]; added: number } {
  const have = new Set(cur.map((e) => `${e.id}|${e.date}`));
  const next = [...cur];
  let added = 0;
  for (const e of normalizeEntries(incoming)) {
    const k = `${e.id}|${e.date}`;
    if (have.has(k)) continue;
    have.add(k);
    next.push({ id: e.id, date: e.date, order: Number.MAX_SAFE_INTEGER - MAX_SAVED + added++ });
  }
  return { entries: normalizeEntries(next), added };
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

/** 네이버지도 · 카카오맵 · TMAP; anything else is 네이버지도 (ADR-0071). */
export function parseMapApp(v: unknown): MapApp {
  return MAP_APPS.includes(v as MapApp) ? (v as MapApp) : DEFAULT_MAP_APP;
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
  /** 새로운 거 tab (ADR-0064); missing in records written before it (= 섞어서). */
  newSub?: NewSub;
  /** the point `shown`/`histories` belong to; null = nothing shown yet. */
  origin: Origin | null;
  /** the range `shown`/`histories` belong to (ADR-0060); missing in records written before it. */
  reach?: Reach;
  /** whether `shown`/`histories` belong to the indoor pick (ADR-0065); missing = outdoor (written before it). */
  indoor?: boolean;
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
  const base = {
    v: 1 as const,
    mood: o.mood as Button,
    sub: o.sub as Sub,
    ...(NEW_SUBS.includes(o.newSub as NewSub) ? { newSub: o.newSub as NewSub } : {}),
    ...(typeof o.indoor === 'boolean' ? { indoor: o.indoor } : {}),
  };
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
    const old = LEGACY_KEYS[k];
    const ids = strings(rawShown[k]) ?? (old ? strings(rawShown[old]) : null);
    if (ids?.length) shown[k] = ids;
    const h = parseHistory(rawHist[k]) ?? (old ? parseHistory(rawHist[old]) : null);
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

// --- sessionStorage: the last 비 소식 answer (ADR-0076), so a reload or a return to the home within half an hour
// asks nothing again. ---
export interface RainRecord {
  v: 1;
  /** the area slug it was asked for */
  area: string;
  /** when it was asked (ms since epoch) */
  at: number;
  rain: boolean;
}
export const RAIN_TTL_MS = 30 * 60_000;

/** A record for one of the 15 areas, asked less than 30 minutes before `now` (not in the future); else null. */
export function parseRain(v: unknown, now: number): RainRecord | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (o.v !== 1 || !AREAS.some((a) => a.slug === o.area) || !isNum(o.at) || typeof o.rain !== 'boolean') return null;
  if (o.at > now || now - o.at >= RAIN_TTL_MS) return null;
  return { v: 1, area: o.area as string, at: o.at, rain: o.rain };
}

export interface Loaded {
  basis: Basis;
  reach: Reach;
  /** 비 와요(실내만), this session (ADR-0065). */
  indoor: boolean;
  when: When;
  region: AreaName | null;
  stay: Stay | null;
  saved: SavedEntry[];
  hintSeen: boolean;
  /** anonymous usage counts on (ADR-0061); anything but a stored false is on. */
  tracking: boolean;
  /** 지도 앱 (ADR-0071). */
  mapApp: MapApp;
  /** ADR-0063: the in-app browser notice was closed / the home-screen nudge was shown. */
  inappSeen: boolean;
  installSeen: boolean;
  /** 뺀 곳 (ADR-0087), oldest first. */
  visited: string[];
}

export interface Store {
  /** Read everything once at mount, writing back repaired values where the stored ones were bad. The v1
   * saved list is moved to `today` the first time (no v2 key yet), in its order. */
  load(today: Day): Loaded;
  setBasis(b: Basis): void;
  setReach(r: Reach): void;
  /** for this session only (sessionStorage); off removes it. */
  setIndoor(on: boolean): void;
  setWhen(w: When): void;
  setRegion(name: AreaName): void;
  setStay(stay: Stay): void;
  setHintSeen(): void;
  setTracking(on: boolean): void;
  setMapApp(app: MapApp): void;
  setInappSeen(): void;
  setInstallSeen(): void;
  /** 기록 as stored now (another tab may have switched it). */
  tracking(): boolean;
  /** 지도 앱 as stored now (another tab may have changed it). */
  mapApp(): MapApp;
  /** ADR-0081: the survey line's record, as stored now. */
  survey(): SurveyRec;
  /** read-modify-write of that record. */
  updateSurvey(fn: (rec: SurveyRec) => SurveyRec): void;
  // Every saved-list change below is read-modify-write, so two tabs never overwrite each other's hearts.
  /** Current saved entries, re-read from storage (another tab may have changed them). */
  saved(): SavedEntry[];
  /** Heart on `id` for `date`: added at the end of that day (or at `at`, putting back a row just taken out),
   * or taken out (`removed` says where it was). `on` = the day it is saved (SavedEntry.at). */
  toggleSaved(id: string, date: Day, at?: number, on?: Day): { entries: SavedEntry[]; added: boolean; removed: SavedEntry | null };
  /** One place up (-1) or down (+1) within its day. */
  moveSaved(id: string, date: Day, dir: -1 | 1): SavedEntry[];
  /** To another day, at its end (if it is already there, the two become one). */
  moveToDay(id: string, from: Day, to: Day): SavedEntry[];
  /** A backup link's places onto this device (mergeEntries). */
  mergeSaved(incoming: readonly SavedEntry[]): { entries: SavedEntry[]; added: number };
  /** 가 봤어요 (ADR-0087), read-modify-write like the hearts: `id` added at the end, or taken out again. */
  toggleVisited(id: string): { visited: string[]; added: boolean };
  /** 다시 넣기 for one place (gone already: nothing changes). */
  unvisit(id: string): string[];
  /** 모두 다시 넣기. */
  unvisitAll(): string[];
  readSession(): SessionRecord | null;
  writeSession(rec: SessionRecord): void;
  clearSession(): void;
  /** the last 비 소식 answer if still fresh at `now` (parseRain). */
  readRain(now: number): RainRecord | null;
  writeRain(rec: RainRecord): void;
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
  // 뺀 곳 (ADR-0087): the same rule as the hearts — once its read or write throws, memory for the visit.
  let visitedTrusted = !!local;
  let visitedMemory: string[] = [];
  function readVisited(): string[] {
    if (!visitedTrusted || !local) return visitedMemory;
    let raw: string | null;
    try {
      raw = local.getItem(KEYS.visited);
    } catch {
      visitedTrusted = false;
      return visitedMemory;
    }
    visitedMemory = parseVisited(parse(raw));
    return visitedMemory;
  }
  function updateVisited(change: (cur: string[]) => string[]): string[] {
    const next = parseVisited(change(readVisited()));
    visitedMemory = next;
    if (visitedTrusted && !set(local, KEYS.visited, next)) visitedTrusted = false;
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
      const rawVisited = get(local, KEYS.visited);
      const visited = parseVisited(rawVisited);
      visitedMemory = visited;
      if (rawVisited != null && !same(rawVisited, visited)) {
        if (visited.length) set(local, KEYS.visited, visited);
        else removeQuietly(local, KEYS.visited);
      }
      return {
        basis,
        reach,
        indoor: get(session, KEYS.indoor) === true,
        when,
        region,
        stay,
        saved,
        hintSeen: get(local, KEYS.hint) === true,
        tracking: get(local, KEYS.track) !== false,
        mapApp: parseMapApp(get(local, KEYS.mapApp)),
        inappSeen: get(local, KEYS.inapp) === true,
        installSeen: get(local, KEYS.install) === true,
        visited,
      };
    },
    setBasis: (b) => void set(local, KEYS.basis, b),
    setReach: (r) => void set(local, KEYS.reach, r),
    setIndoor: (on) => (on ? void set(session, KEYS.indoor, true) : removeQuietly(session, KEYS.indoor)),
    setWhen: (w) => void set(local, KEYS.when, w),
    setRegion: (name) => void set(local, KEYS.region, name),
    setStay: (stay) => void set(local, KEYS.stay, stay),
    setHintSeen: () => void set(local, KEYS.hint, true),
    setTracking: (on) => void set(local, KEYS.track, on),
    setMapApp: (app) => void set(local, KEYS.mapApp, app),
    setInappSeen: () => void set(local, KEYS.inapp, true),
    setInstallSeen: () => void set(local, KEYS.install, true),
    tracking: () => get(local, KEYS.track) !== false,
    mapApp: () => parseMapApp(get(local, KEYS.mapApp)),
    survey: () => parseSurvey(get(local, KEYS.survey)),
    updateSurvey: (fn) => void set(local, KEYS.survey, fn(parseSurvey(get(local, KEYS.survey)))),
    saved: readSaved,
    toggleSaved(id, date, at, on) {
      let removed: SavedEntry | null = null;
      const entries = update((cur) => {
        removed = cur.find((e) => e.id === id && e.date === date) ?? null;
        if (removed) return cur.filter((e) => e !== removed);
        // Put back where it was: everything of that day from `at` on moves one down.
        const order = at === undefined ? lastOrder(cur, date) : at - 0.5;
        return [...cur, { id, date, order, ...(on ? { at: on } : {}) }];
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
        return [...rest, { id, date: to, order: lastOrder(rest, to), ...(entry.at ? { at: entry.at } : {}) }];
      });
    },
    mergeSaved(incoming) {
      let added = 0;
      const entries = update((cur) => {
        const m = mergeEntries(cur, incoming);
        added = m.added;
        return m.entries;
      });
      return { entries, added };
    },
    toggleVisited(id) {
      let added = false;
      const visited = updateVisited((cur) => {
        added = !cur.includes(id);
        return added ? [...cur, id] : cur.filter((x) => x !== id);
      });
      return { visited, added };
    },
    unvisit: (id) => updateVisited((cur) => cur.filter((x) => x !== id)),
    unvisitAll: () => updateVisited(() => []),
    readSession: () => parseSession(get(session, KEYS.session)),
    writeSession: (rec) => void set(session, KEYS.session, rec),
    clearSession: () => removeQuietly(session, KEYS.session),
    readRain: (now) => parseRain(get(session, KEYS.rain), now),
    writeRain: (rec) => void set(session, KEYS.rain, rec),
  };
}

function removeQuietly(storage: Storage | null, key: string) {
  try {
    storage?.removeItem(key);
  } catch {
    /* ignore */
  }
}
