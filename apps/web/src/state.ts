// App state as data + a pure reducer. No DOM, no storage, no timers — the controller (app.ts) runs the
// effects and feeds their results back in as actions tagged with a request id; results for an old id are
// dropped here, so the last user intent always wins (S36–S38).
import { areaByName, type AreaName } from './areas';
import { distanceKm, driveMinutes, historyKey, pickCards, type Button, type Card, type Histories, type HistoryKey, type Spot, type Sub } from './pick';
import type { SessionRecord } from './store';
import type { Basis, GeoPermission, NoOrigin, Origin, Overlay, Route, Stay, View } from './types';

export type Intent = 'show' | 'more';
export type Phase =
  | { k: 'idle' }
  | { k: 'pending'; req: number; intent: Intent; step: 'locating' | 'loading'; slow: boolean; long: boolean }
  | { k: 'ready' }
  | { k: 'noOrigin'; why: NoOrigin }
  | { k: 'loadError'; offline: boolean }
  | { k: 'empty' };

/** What the results view shows. `how`: fresh pick, next 3, or the last 3 brought back (no rotation). */
export interface Shown {
  key: HistoryKey;
  list: Card[];
  origin: Origin;
  wrapped: boolean;
  how: 'new' | 'more' | 'restore';
  /** bumps on every result, so the renderer knows when to scroll/announce. */
  seq: number;
}

export interface State {
  view: View;
  overlay: Overlay;
  /** where the saved list was opened from; null = unknown (restored after a reload). */
  savedFrom: 'home' | 'cards' | null;
  mood: Button | null;
  sub: Sub;
  basis: Basis;
  region: AreaName | null;
  stay: Stay | null;
  /** last GPS failure; cleared by the next GPS success. Drives the "지역 고르기" label and sheet hint. */
  lastFail: NoOrigin | null;
  phase: Phase;
  /** the origin `histories`/`shown` belong to. */
  origin: Origin | null;
  histories: Histories;
  /** last 3 ids shown per button (+food sub) — brought back when that button is chosen again (S43·S44). */
  shown: Partial<Record<HistoryKey, string[]>>;
  cards: Shown | null;
  savedList: { list: Card[]; origin: Origin | null; seq: number } | null;
  /** saved ids at the moment the saved list opened (unsaving there keeps the row: undo path). */
  snapshot: string[] | null;
  /** every saved id, newest first — may include ids missing from the current data (kept, S42). */
  saved: string[];
  spots: Spot[] | null;
  broken: string[];
  /** photos that failed while offline: tried again once the connection is back. */
  brokenOffline: string[];
  hintSeen: boolean;
  hintFor: string | null;
  stayForm: { pending: boolean; error: NoOrigin | null };
  offline: boolean;
  /** what the screen reader is told about new cards (render.ts words it); `seq` bumps per announcement. */
  announce: { n: number; more: boolean; seq: number };
  seq: number;
}

export type Action =
  | { type: 'mood'; button: Button }
  | { type: 'sub'; sub: Sub }
  | { type: 'request'; req: number; intent: Intent; step: 'locating' | 'loading' }
  | { type: 'slow'; req: number }
  | { type: 'long'; req: number }
  /** GPS answered (`why` = it failed), or the wait was given up without learning anything (`unknown`). */
  | { type: 'located'; req: number; why?: NoOrigin; unknown?: boolean }
  | { type: 'noOrigin'; req: number; why: NoOrigin }
  | { type: 'resolved'; req: number; origin: Origin | null; spots: Spot[] }
  | { type: 'loadError'; req: number; offline: boolean }
  | { type: 'abort' }
  | { type: 'spots'; spots: Spot[] }
  | { type: 'openSaved'; restored?: boolean }
  | { type: 'closeSaved' }
  | { type: 'route'; route: Route }
  | { type: 'overlay'; overlay: Overlay }
  | { type: 'basis'; basis: Basis; region?: AreaName; stay?: Stay }
  | { type: 'stayForm'; pending: boolean; error: NoOrigin | null }
  | { type: 'saved'; ids: string[] }
  | { type: 'hint'; id: string }
  | { type: 'hintSeen' }
  | { type: 'imgError'; id: string }
  | { type: 'offline'; offline: boolean }
  | { type: 'permission'; permission: GeoPermission }
  | { type: 'restore'; rec: SessionRecord };

export const GPS_KEY = 'gps';

export function initialState(init: {
  basis: Basis;
  region: AreaName | null;
  stay: Stay | null;
  saved: string[];
  hintSeen: boolean;
  offline: boolean;
}): State {
  return {
    view: 'home',
    overlay: null,
    savedFrom: null,
    mood: null,
    sub: 'meal',
    basis: init.basis,
    region: init.region,
    stay: init.stay,
    lastFail: null,
    phase: { k: 'idle' },
    origin: null,
    histories: {},
    shown: {},
    cards: null,
    savedList: null,
    snapshot: null,
    saved: init.saved,
    spots: null,
    broken: [],
    brokenOffline: [],
    hintSeen: init.hintSeen,
    hintFor: null,
    stayForm: { pending: false, error: null },
    offline: init.offline,
    announce: { n: 0, more: false, seq: 0 },
    seq: 0,
  };
}

// --- selectors ---

/** The fixed origin for 숙소 / 지역 basis, or null when GPS has to be asked. */
export function staticOrigin(basis: Basis, region: AreaName | null, stay: Stay | null): Origin | null {
  if (basis === 'stay' && stay) {
    return {
      key: `stay:${stay.lat.toFixed(6)},${stay.lng.toFixed(6)}`,
      point: { lat: stay.lat, lng: stay.lng },
      isPoint: stay.source === 'gps',
      from: '숙소에서',
    };
  }
  const area = basis === 'region' ? areaByName(region) : null;
  if (area) return { key: `region:${area.name}`, point: { lat: area.lat, lng: area.lng }, isPoint: false, from: `${area.label}에서` };
  return null;
}

/** Same basis/place, and for GPS within ~1km (jitter keeps the rotation, plan OQ4). */
export function sameOrigin(a: Origin | null, b: Origin | null): boolean {
  if (!a || !b || a.key !== b.key) return false;
  return a.key !== GPS_KEY || distanceKm(a.point, b.point) <= 1;
}

/** The shown cards still match the current button, sub and basis. */
export function cardsValid(s: State): boolean {
  if (!s.cards || !s.mood || s.cards.key !== historyKey(s.mood, s.sub)) return false;
  const fixed = staticOrigin(s.basis, s.region, s.stay);
  return fixed ? fixed.key === s.cards.origin.key : s.cards.origin.key === GPS_KEY;
}

/** Tapping a mood shows its cards — the last 3 seen for it come back (S43·S44, SPEC D2); the next 3 are
 * "다른 3곳 보기" only. The mood already on screen (or on its way) again is a no-op. */
export function moodIntent(s: State, b: Button): Intent | null {
  if (s.view === 'cards' && s.mood === b && (s.phase.k === 'ready' || s.phase.k === 'pending')) return null;
  return 'show';
}

/** Choosing the basis that is already in use is a no-op — unless the last attempt with it failed. */
export function basisIsCurrent(s: State, basis: Basis, region?: AreaName | null): boolean {
  if (s.basis !== basis) return false;
  if (basis === 'region' && s.region !== region) return false;
  return s.phase.k !== 'noOrigin' && s.phase.k !== 'loadError';
}

const indexCache = new WeakMap<Spot[], Map<string, Spot>>();
export function spotIndex(spots: Spot[]): Map<string, Spot> {
  let m = indexCache.get(spots);
  if (!m) {
    m = new Map(spots.map((s) => [s.id, s] as const));
    indexCache.set(spots, m);
  }
  return m;
}

/** ♥ N: once data is loaded, only ids that still exist count (S42). */
export function savedCount(s: State): number {
  if (!s.spots) return s.saved.length;
  const idx = spotIndex(s.spots);
  return s.saved.filter((id) => idx.has(id)).length;
}

// --- reducer ---

const cardsFor = (spots: Spot[], ids: string[], point: Origin['point']): Card[] | null => {
  const idx = spotIndex(spots);
  const found = ids.map((id) => idx.get(id));
  if (!found.length || found.some((x) => !x)) return null;
  return (found as Spot[]).map((spot) => ({ spot, minutes: driveMinutes(distanceKm(point, spot)) }));
};

function resolveCards(s: State, origin: Origin, spots: Spot[], intent: Intent): State {
  const mood = s.mood!;
  const key = historyKey(mood, s.sub);
  let { histories, shown } = s;
  let base = s.origin;
  if (!sameOrigin(base, origin)) {
    histories = {};
    shown = {};
    base = origin;
  }
  const seq = s.seq + 1;
  const ids = shown[key];
  const restored = intent === 'show' && ids ? cardsFor(spots, ids, origin.point) : null;
  if (restored) {
    // Exactly what is already on screen (same 3, same point): keep it as is, so nothing is rebuilt.
    const c = s.cards;
    const same =
      !!c &&
      c.key === key &&
      c.origin.key === origin.key &&
      c.origin.point.lat === origin.point.lat &&
      c.origin.point.lng === origin.point.lng &&
      c.list.map((x) => x.spot.id).join() === restored.map((x) => x.spot.id).join();
    return {
      ...s,
      spots,
      origin: base,
      histories,
      shown,
      phase: { k: 'ready' },
      cards: same ? c : { key, list: restored, origin, wrapped: false, how: 'restore', seq },
      seq: same ? s.seq : seq,
    };
  }
  const r = pickCards(spots, origin.point, mood, histories, s.sub);
  if (!r.cards.length) return { ...s, spots, origin: base, histories, shown, phase: { k: 'empty' }, cards: null, seq };
  const how = intent === 'more' ? 'more' : 'new';
  const n = r.cards.length;
  return {
    ...s,
    spots,
    origin: base,
    histories: r.histories,
    shown: { ...shown, [key]: r.cards.map((c) => c.spot.id) },
    phase: { k: 'ready' },
    cards: { key, list: r.cards, origin, wrapped: r.wrapped, how, seq },
    announce: { n, more: how === 'more', seq },
    seq,
  };
}

function resolveSaved(s: State, origin: Origin | null, spots: Spot[]): State {
  const idx = spotIndex(spots);
  const found = (s.snapshot ?? []).map((id) => idx.get(id)).filter((x): x is Spot => !!x);
  const list: Card[] = origin
    ? found
        .map((spot) => ({ spot, minutes: driveMinutes(distanceKm(origin.point, spot)), km: distanceKm(origin.point, spot) }))
        .sort((a, b) => a.km - b.km) // stable: ties keep newest-saved first
        .map(({ spot, minutes }) => ({ spot, minutes }))
    : found.map((spot) => ({ spot, minutes: 0 }));
  const seq = s.seq + 1;
  return { ...s, spots, phase: { k: 'ready' }, savedList: { list, origin, seq }, seq };
}

const isReq = (s: State, req: number) => s.phase.k === 'pending' && s.phase.req === req;

function enterView(s: State, view: View): State {
  if (view === s.view) return s;
  const next: State = { ...s, view };
  if (view === 'saved') {
    return { ...next, snapshot: s.saved, savedList: null, savedFrom: s.view === 'saved' ? s.savedFrom : s.view, phase: { k: 'idle' } };
  }
  const left = { ...next, snapshot: null, savedList: null };
  if (view === 'cards') return { ...left, phase: cardsValid(left) ? { k: 'ready' } : { k: 'idle' } };
  return { ...left, phase: { k: 'idle' } };
}

/** Every user intent but a heart clears the first-save hint (§6.13, §11.2): it goes with the next draw. */
const CLEARS_HINT: ReadonlySet<Action['type']> = new Set(['mood', 'sub', 'request', 'openSaved', 'closeSaved', 'route', 'overlay', 'basis', 'restore']);

export function reduce(s: State, a: Action): State {
  const next = step(s, a);
  return next.hintFor && CLEARS_HINT.has(a.type) ? { ...next, hintFor: null } : next;
}

function step(s: State, a: Action): State {
  switch (a.type) {
    case 'mood':
      // Set the mood first: whether the cards on hand still apply depends on it.
      return enterView({ ...s, mood: a.button }, 'cards');
    case 'sub':
      return { ...s, sub: a.sub };
    case 'request':
      return { ...s, phase: { k: 'pending', req: a.req, intent: a.intent, step: a.step, slow: false, long: false } };
    case 'slow':
    case 'long':
      if (!isReq(s, a.req) || s.phase.k !== 'pending') return s;
      return { ...s, phase: { ...s.phase, [a.type]: true } };
    case 'located':
      if (!isReq(s, a.req) || s.phase.k !== 'pending') return s;
      return {
        ...s,
        phase: { ...s.phase, step: 'loading' },
        lastFail: a.unknown ? s.lastFail : a.why ?? null,
      };
    case 'noOrigin':
      if (!isReq(s, a.req)) return s;
      return { ...s, phase: { k: 'noOrigin', why: a.why }, lastFail: a.why, cards: null };
    case 'resolved': {
      if (!isReq(s, a.req) || s.phase.k !== 'pending') return s;
      const intent = s.phase.intent;
      const withGeo = a.origin?.key === GPS_KEY ? { ...s, lastFail: null } : s;
      if (s.view === 'saved') return resolveSaved(withGeo, a.origin, a.spots);
      if (s.view === 'cards' && s.mood && a.origin) return resolveCards(withGeo, a.origin, a.spots, intent);
      return { ...withGeo, spots: a.spots, phase: { k: 'idle' } };
    }
    case 'loadError':
      if (!isReq(s, a.req)) return s;
      return { ...s, phase: { k: 'loadError', offline: a.offline }, cards: s.view === 'cards' ? null : s.cards };
    case 'abort':
      return s.phase.k === 'pending' ? { ...s, phase: { k: 'idle' } } : s;
    case 'spots':
      return s.spots === a.spots ? s : { ...s, spots: a.spots };
    case 'openSaved': {
      const opened = enterView(s, 'saved');
      return a.restored ? { ...opened, savedFrom: null } : opened;
    }
    case 'closeSaved':
      return enterView(s, s.savedFrom ?? 'home');
    case 'route': {
      const moved = enterView(s, a.route.view === 'cards' && !s.mood ? 'home' : a.route.view);
      return a.route.overlay === s.overlay ? moved : reduce(moved, { type: 'overlay', overlay: a.route.overlay });
    }
    case 'overlay':
      if (a.overlay === s.overlay) return s;
      return { ...s, overlay: a.overlay, stayForm: { pending: false, error: null } };
    case 'basis':
      return {
        ...s,
        basis: a.basis,
        region: a.region ?? s.region,
        stay: a.stay ?? s.stay,
        // a 숙소 saved from GPS means GPS works (the "위치 권한이 꺼져 있어요" hint no longer holds)
        lastFail: a.stay?.source === 'gps' ? null : s.lastFail,
      };
    case 'stayForm':
      // the 숙소 GPS failing is as much news about GPS as a failed pick: 내 주변 → 지역 고르기
      return { ...s, stayForm: { pending: a.pending, error: a.error }, lastFail: a.error ?? s.lastFail };
    case 'saved':
      return { ...s, saved: a.ids };
    case 'hint':
      return { ...s, hintSeen: true, hintFor: a.id };
    case 'hintSeen':
      return s.hintSeen ? s : { ...s, hintSeen: true };
    case 'imgError':
      if (s.broken.includes(a.id)) return s;
      return { ...s, broken: [...s.broken, a.id], brokenOffline: s.offline ? [...s.brokenOffline, a.id] : s.brokenOffline };
    case 'offline': {
      if (s.offline === a.offline) return s;
      // Back online: photos that only failed for want of a connection get another go.
      if (a.offline || !s.brokenOffline.length) return { ...s, offline: a.offline };
      const retry = new Set(s.brokenOffline);
      return { ...s, offline: false, broken: s.broken.filter((id) => !retry.has(id)), brokenOffline: [] };
    }
    case 'permission':
      // A known "denied" says so before any tap (label 지역 고르기); turned back on in settings → 내 주변.
      if (a.permission === 'denied') return s.lastFail ? s : { ...s, lastFail: 'denied' };
      if ((a.permission === 'granted' || a.permission === 'prompt') && s.lastFail === 'denied') return { ...s, lastFail: null };
      return s;
    case 'restore':
      return {
        ...enterView(s, 'cards'),
        mood: a.rec.mood,
        sub: a.rec.sub,
        origin: a.rec.origin,
        shown: a.rec.shown,
        histories: a.rec.histories,
      };
  }
}

/** The session record for the results entry (S54): which mood it is for — written as soon as it is asked
 * for, so a reload while it loads or after it failed comes back to that mood, not an older one — and the
 * rotation so far (`origin` = the point `shown`/`histories` belong to; null before the first result).
 * Null when the results are not on screen. */
export function sessionOf(s: State): SessionRecord | null {
  if (s.view !== 'cards' || !s.mood) return null;
  return { v: 1, mood: s.mood, sub: s.sub, origin: s.origin, shown: s.shown, histories: s.histories };
}
