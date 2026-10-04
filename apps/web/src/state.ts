// App state as data + a pure reducer. No DOM, no storage, no timers — the controller (app.ts) runs the
// effects and feeds their results back in as actions tagged with a request id; results for an old id are
// dropped here, so the last user intent always wins (S36–S38).
import { areaByName, nearestArea, type AreaName } from './areas';
import { type Day } from './dates';
import { DEFAULT_REACH, distanceKm, driveMinutes, historyKey, pickCards, tabOf, type Button, type Point, type Card, type Histories, type HistoryKey, type NewSub, type Reach, type Spot, type Sub, type Tab } from './pick';
import type { InApp, InstallHow } from './keep';
import { DEFAULT_MAP_APP, type MapApp } from './links';
import type { SessionRecord } from './store';
import type { Basis, GeoPermission, NoOrigin, Origin, Overlay, Route, SavedEntry, Stay, View, When } from './types';

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
  /** the range they were picked in (ADR-0060). */
  reach: Reach;
  /** picked with 비 와요(실내만) on (ADR-0065). */
  indoor: boolean;
  wrapped: boolean;
  how: 'new' | 'more' | 'restore';
  /** bumps on every result, so the renderer knows when to scroll/announce. */
  seq: number;
}

/** Keeping saves without a login (ADR-0063 2): what the quiet notices say. */
export interface Keep {
  /** a backup link opened here: asking 합치기 / 그만두기, then how many it added. */
  restore: { k: 'ask'; entries: SavedEntry[] } | { k: 'done'; added: number } | null;
  /** the in-app browser this page runs in (null: a real browser). */
  inapp: InApp | null;
  /** the in-app notice on the first screen: shown, or shown after 브라우저로 열기 copied the link (or could
   * not); null once closed. */
  inappNote: 'show' | 'copied' | 'failed' | null;
  /** how this browser adds the app to the home screen (null: it can't, or it is the home-screen app). */
  install: InstallHow | null;
  /** the home-screen nudge is on the saved list (once, ADR-0063 2d). */
  nudge: boolean;
  /** 링크로 백업 in the saved list: what happened to the copy. */
  backup: 'copied' | 'failed' | null;
}

export interface State {
  view: View;
  overlay: Overlay;
  /** where the saved list was opened from; null = unknown (restored after a reload). */
  savedFrom: 'home' | 'cards' | null;
  mood: Button | null;
  sub: Sub;
  /** 새로운 거 tab (ADR-0064): 섞어서 | 구경 | 체험, kept like `sub`. */
  newSub: NewSub;
  basis: Basis;
  /** 얼마나 (ADR-0060): the range cards are picked in. */
  reach: Reach;
  /** 비 와요(실내만) (ADR-0065): only indoor places; kept for the session. */
  indoor: boolean;
  /** the day hearts go to ('now' = today); reset to 'now' once that day comes (specs/date-mode.md). */
  when: When;
  /** today in Jeju (Asia/Seoul). */
  today: Day;
  region: AreaName | null;
  stay: Stay | null;
  /** last GPS failure; cleared by the next GPS success. Drives the "지역 고르기" label and sheet hint. */
  lastFail: NoOrigin | null;
  phase: Phase;
  /** the origin `histories`/`shown` belong to. */
  origin: Origin | null;
  /** the range `histories`/`shown` belong to (null: unknown, e.g. a session record from before ranges). */
  originReach: Reach | null;
  /** whether `histories`/`shown` belong to the indoor pick. */
  originIndoor: boolean;
  histories: Histories;
  /** last 3 ids shown per button (+food sub, +새로운 거 tab) — brought back when that button is chosen again (S43·S44). */
  shown: Partial<Record<HistoryKey, string[]>>;
  cards: Shown | null;
  /** the saved list is ready to draw: the point its trips are measured from (null = position unknown). */
  savedList: { origin: Origin | null; seq: number } | null;
  /** rows taken out in the saved list while it is open: they stay, heart empty, until it is reopened (undo). */
  unsaved: SavedEntry[];
  /** 지난 날 opened in the saved list. */
  pastOpen: boolean;
  /** the row the 다른 날로 sheet is for. */
  moveTarget: { id: string; date: Day } | null;
  /** every saved place per day — may include ids missing from the current data (kept, S42). */
  saved: SavedEntry[];
  spots: Spot[] | null;
  broken: string[];
  /** photos that failed while offline: tried again once the connection is back. */
  brokenOffline: string[];
  hintSeen: boolean;
  hintFor: string | null;
  /** anonymous usage counts on (기록 끄기 / 기록 켜기, ADR-0061). */
  tracking: boolean;
  /** the map app the cards open (ADR-0071). */
  mapApp: MapApp;
  stayForm: { pending: boolean; error: NoOrigin | null };
  offline: boolean;
  keep: Keep;
  /** what the screen reader is told about new cards (render.ts words it); `seq` bumps per announcement. */
  announce: { n: number; more: boolean; seq: number };
  /** 비 소식 (ADR-0076): the last answer, for the area (slug) it was asked for; shown only while that is still
   * `rainArea`. */
  rain: { area: string; rain: boolean } | null;
  /** ADR-0081: the home's survey line may show this visit (src/survey.ts surveyDue; drawn only while 기록 is on). */
  surveyLine: boolean;
  /** the 의견 보내기 sheet was sent: it says 고마워요 until closed. */
  feedbackSent: boolean;
  seq: number;
}

export type Action =
  | { type: 'mood'; button: Button }
  | { type: 'sub'; sub: Tab }
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
  | { type: 'reach'; reach: Reach }
  | { type: 'indoor'; on: boolean }
  | { type: 'stayForm'; pending: boolean; error: NoOrigin | null }
  /** the saved list as stored now; `removed`: a row taken out in the saved list (kept on screen). */
  | { type: 'saved'; entries: SavedEntry[]; removed?: SavedEntry | null }
  | { type: 'when'; when: When }
  | { type: 'today'; today: Day }
  | { type: 'pastOpen'; open: boolean }
  | { type: 'moveTarget'; id: string; date: Day }
  | { type: 'hint'; id: string }
  | { type: 'hintSeen' }
  | { type: 'tracking'; on: boolean }
  | { type: 'mapApp'; app: MapApp }
  | { type: 'keep'; keep: Partial<Keep> }
  | { type: 'imgError'; id: string }
  | { type: 'offline'; offline: boolean }
  | { type: 'permission'; permission: GeoPermission }
  /** a position read on the home without asking: permission was already granted (ADR-0075 Amendment 1) */
  | { type: 'homeFix'; point: Point }
  | { type: 'restore'; rec: SessionRecord }
  /** 비 소식 answered for `area` (slug); dropped unless that is still the home's area. */
  | { type: 'rain'; area: string; rain: boolean }
  /** ADR-0081: the survey line was tapped (gone for good). */
  | { type: 'surveyTapped' }
  | { type: 'feedbackSent' };

export const GPS_KEY = 'gps';
export const gpsOrigin = (point: Point): Origin => ({ key: GPS_KEY, point, isPoint: true, from: '여기서' });

export function initialState(init: {
  basis: Basis;
  reach?: Reach;
  indoor?: boolean;
  when?: When;
  today: Day;
  region: AreaName | null;
  stay: Stay | null;
  saved: SavedEntry[];
  hintSeen: boolean;
  tracking?: boolean;
  mapApp?: MapApp;
  offline: boolean;
  keep?: Partial<Keep>;
  surveyLine?: boolean;
}): State {
  return {
    view: 'home',
    overlay: null,
    savedFrom: null,
    mood: null,
    sub: 'meal',
    newSub: 'mix',
    basis: init.basis,
    reach: init.reach ?? DEFAULT_REACH,
    indoor: init.indoor ?? false,
    when: init.when && init.when !== 'now' && init.when > init.today ? init.when : 'now',
    today: init.today,
    region: init.region,
    stay: init.stay,
    lastFail: null,
    phase: { k: 'idle' },
    origin: null,
    originReach: null,
    originIndoor: false,
    histories: {},
    shown: {},
    cards: null,
    savedList: null,
    unsaved: [],
    pastOpen: false,
    moveTarget: null,
    saved: init.saved,
    spots: null,
    broken: [],
    brokenOffline: [],
    hintSeen: init.hintSeen,
    hintFor: null,
    tracking: init.tracking ?? true,
    mapApp: init.mapApp ?? DEFAULT_MAP_APP,
    stayForm: { pending: false, error: null },
    offline: init.offline,
    keep: { restore: null, inapp: null, inappNote: null, install: null, nudge: false, backup: null, ...init.keep },
    announce: { n: 0, more: false, seq: 0 },
    rain: null,
    surveyLine: init.surveyLine ?? false,
    feedbackSent: false,
    seq: 0,
  };
}

// --- selectors ---

/** The tab the current button's cards are picked under (food sub, 새로운 거 tab, or none). */
export const tabNow = (s: Pick<State, 'mood' | 'sub' | 'newSub'>): Tab | undefined => tabOf(s.mood, s.sub, s.newSub);

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

/** The basis the home speaks for: 지역·숙소 centre, else this session's GPS fix (never a region origin read as GPS,
 * and not a fix the label no longer stands for: after a failed ask it reads 지역 고르기). */
export const homeOrigin = (s: State): Origin | null =>
  staticOrigin(s.basis, s.region, s.stay) ?? (s.origin?.key === GPS_KEY && !(s.basis === 'gps' && s.lastFail) ? s.origin : null);

/** 비 소식 (ADR-0076): the one area (slug) the forecast is asked for — the region, the area nearest the 숙소, or
 * nearest this session's GPS fix; none without a basis, or in date mode (the forecast is about the next 3 hours). */
export function rainArea(s: State): string | null {
  if (s.when !== 'now') return null;
  const o = homeOrigin(s);
  return o ? nearestArea(o.point).slug : null;
}

/** Same basis/place, and for GPS within ~1km (jitter keeps the rotation, plan OQ4). */
export function sameOrigin(a: Origin | null, b: Origin | null): boolean {
  if (!a || !b || a.key !== b.key) return false;
  return a.key !== GPS_KEY || distanceKm(a.point, b.point) <= 1;
}

/** The shown cards still match the current button, tab, basis and range. */
export function cardsValid(s: State): boolean {
  if (!s.cards || !s.mood || s.cards.key !== historyKey(s.mood, tabNow(s)) || s.cards.reach !== s.reach || s.cards.indoor !== s.indoor) return false;
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

/** The day a heart goes to now. */
export const whenDay = (s: State): Day => (s.when === 'now' ? s.today : s.when);

/** Saved on `day` (the current day by default): what a card's heart shows. */
export function isSaved(s: State, id: string, day: Day = whenDay(s)): boolean {
  return s.saved.some((e) => e.id === id && e.date === day);
}

/** Once data is loaded, only ids that still exist count (S42). */
function known(s: State): SavedEntry[] {
  if (!s.spots) return s.saved;
  const idx = spotIndex(s.spots);
  return s.saved.filter((e) => idx.has(e.id));
}
/** ♥ N: today and later — the days gone by are not counted. */
export function savedCount(s: State): number {
  return known(s).filter((e) => e.date >= s.today).length;
}
/** ♥ N is shown: something saved, even if only on days gone by (지난 날 stays reachable). */
export const hasSaved = (s: State): boolean => known(s).length > 0;

export interface SavedRow {
  entry: SavedEntry;
  /** false: taken out while the list is open (heart empty, kept for undo). */
  live: boolean;
}
export interface SavedDay {
  day: Day;
  rows: SavedRow[];
}
/** The saved list by day (§6.12): today and later in date order, then the days gone by. Each day in the
 * order the user set; rows taken out in this visit stay where they were. Ids missing from the data are
 * left out. */
export function savedDays(s: State): { upcoming: SavedDay[]; past: SavedDay[] } {
  const idx = s.spots ? spotIndex(s.spots) : null;
  const byDay = new Map<Day, SavedRow[]>();
  const add = (day: Day) => {
    let rows = byDay.get(day);
    if (!rows) byDay.set(day, (rows = []));
    return rows;
  };
  for (const e of s.saved) if (!idx || idx.has(e.id)) add(e.date).push({ entry: e, live: true });
  const ghosts = [...s.unsaved].sort((a, b) => a.order - b.order);
  for (const e of ghosts) {
    if ((idx && !idx.has(e.id)) || s.saved.some((x) => x.id === e.id && x.date === e.date)) continue;
    const rows = add(e.date);
    rows.splice(Math.min(e.order, rows.length), 0, { entry: e, live: false });
  }
  const days = [...byDay.keys()].sort().map((day) => ({ day, rows: byDay.get(day)! }));
  return { upcoming: days.filter((d) => d.day >= s.today), past: days.filter((d) => d.day < s.today) };
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
  const key = historyKey(mood, tabNow(s));
  let { histories, shown } = s;
  let base = s.origin;
  // Another place, range or 비 와요: the rotation so far no longer applies (plan OQ4, ADR-0060, ADR-0065).
  if (!sameOrigin(base, origin) || s.originReach !== s.reach || s.originIndoor !== s.indoor) {
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
      c.reach === s.reach &&
      c.indoor === s.indoor &&
      c.origin.key === origin.key &&
      c.origin.point.lat === origin.point.lat &&
      c.origin.point.lng === origin.point.lng &&
      c.list.map((x) => x.spot.id).join() === restored.map((x) => x.spot.id).join();
    return {
      ...s,
      spots,
      origin: base,
      originReach: s.reach,
      originIndoor: s.indoor,
      histories,
      shown,
      phase: { k: 'ready' },
      cards: same ? c : { key, list: restored, origin, reach: s.reach, indoor: s.indoor, wrapped: false, how: 'restore', seq },
      seq: same ? s.seq : seq,
    };
  }
  // 오일장 (ADR-0066): the day being viewed (지금 = today) decides which markets open and which are closed.
  const r = pickCards(spots, origin.point, mood, histories, tabNow(s), s.reach, s.indoor, whenDay(s));
  if (!r.cards.length) return { ...s, spots, origin: base, originReach: s.reach, originIndoor: s.indoor, histories, shown, phase: { k: 'empty' }, cards: null, seq };
  const how = intent === 'more' ? 'more' : 'new';
  const n = r.cards.length;
  return {
    ...s,
    spots,
    origin: base,
    originReach: s.reach,
    originIndoor: s.indoor,
    histories: r.histories,
    shown: { ...shown, [key]: r.cards.map((c) => c.spot.id) },
    phase: { k: 'ready' },
    cards: { key, list: r.cards, origin, reach: s.reach, indoor: s.indoor, wrapped: r.wrapped, how, seq },
    announce: { n, more: how === 'more', seq },
    seq,
  };
}

function resolveSaved(s: State, origin: Origin | null, spots: Spot[]): State {
  const seq = s.seq + 1;
  return { ...s, spots, phase: { k: 'ready' }, savedList: { origin, seq }, seq };
}

const isReq = (s: State, req: number) => s.phase.k === 'pending' && s.phase.req === req;

function enterView(s: State, view: View): State {
  if (view === s.view) return s;
  const next: State = { ...s, view };
  if (view === 'saved') {
    const keep = s.keep.backup ? { ...s.keep, backup: null } : s.keep; // a new visit to the list, a fresh 링크로 백업
    return { ...next, keep, unsaved: [], pastOpen: false, savedList: null, savedFrom: s.view === 'saved' ? s.savedFrom : s.view, phase: { k: 'idle' } };
  }
  const left = { ...next, unsaved: [], savedList: null };
  if (view === 'cards') return { ...left, phase: cardsValid(left) ? { k: 'ready' } : { k: 'idle' } };
  return { ...left, phase: { k: 'idle' } };
}

/** Every user intent but a heart clears the first-save hint (§6.13, §11.2): it goes with the next draw. */
const CLEARS_HINT: ReadonlySet<Action['type']> = new Set(['mood', 'sub', 'request', 'openSaved', 'closeSaved', 'route', 'overlay', 'basis', 'reach', 'indoor', 'when', 'restore']);

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
      return a.sub === 'meal' || a.sub === 'cafe' ? { ...s, sub: a.sub } : { ...s, newSub: a.sub };
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
    case 'overlay': {
      // 다른 날로 belongs to a row of the saved list: without one (a forward after a reload) there is none.
      const overlay = a.overlay === 'move' && (!s.moveTarget || s.view !== 'saved') ? null : a.overlay;
      if (overlay === s.overlay) return s;
      return { ...s, overlay, stayForm: { pending: false, error: null }, feedbackSent: false };
    }
    case 'basis':
      return {
        ...s,
        basis: a.basis,
        region: a.region ?? s.region,
        stay: a.stay ?? s.stay,
        // a 숙소 saved from GPS means GPS works (the "위치 권한이 꺼져 있어요" hint no longer holds)
        lastFail: a.stay?.source === 'gps' ? null : s.lastFail,
      };
    case 'reach':
      return a.reach === s.reach ? s : { ...s, reach: a.reach };
    case 'indoor':
      return a.on === s.indoor ? s : { ...s, indoor: a.on };
    case 'stayForm':
      // the 숙소 GPS failing is as much news about GPS as a failed pick: 내 주변 → 지역 고르기
      return { ...s, stayForm: { pending: a.pending, error: a.error }, lastFail: a.error ?? s.lastFail };
    case 'saved': {
      const unsaved = a.removed && s.view === 'saved' ? [...s.unsaved, a.removed] : s.unsaved;
      // a row put back (here or in another tab) is live again
      const stillOut = unsaved.filter((g) => !a.entries.some((e) => e.id === g.id && e.date === g.date));
      return { ...s, saved: a.entries, unsaved: stillOut.length === s.unsaved.length && stillOut.every((g, i) => g === s.unsaved[i]) ? s.unsaved : stillOut };
    }
    case 'when':
      return a.when === s.when ? s : { ...s, when: a.when };
    case 'today': {
      if (a.today === s.today) return s;
      // the chosen day has come (or gone): back to 지금 (D5)
      const when = s.when !== 'now' && s.when <= a.today ? 'now' : s.when;
      return { ...s, today: a.today, when };
    }
    case 'pastOpen':
      return a.open === s.pastOpen ? s : { ...s, pastOpen: a.open };
    case 'moveTarget':
      return { ...s, moveTarget: { id: a.id, date: a.date } };
    case 'hint':
      return { ...s, hintSeen: true, hintFor: a.id };
    case 'hintSeen':
      return s.hintSeen ? s : { ...s, hintSeen: true };
    case 'tracking':
      return a.on === s.tracking ? s : { ...s, tracking: a.on };
    case 'mapApp':
      return a.app === s.mapApp ? s : { ...s, mapApp: a.app };
    case 'keep':
      return { ...s, keep: { ...s.keep, ...a.keep } };
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
    case 'homeFix': {
      if (s.basis !== 'gps' || homeOrigin(s)) return s;
      const fix = gpsOrigin(a.point);
      if (sameOrigin(s.origin, fix)) return { ...s, lastFail: null };
      // the rotation so far belongs to another point (as resolveCards would decide)
      return { ...s, lastFail: null, origin: fix, originReach: s.reach, originIndoor: s.indoor, histories: {}, shown: {} };
    }
    case 'rain':
      return a.area === rainArea(s) ? { ...s, rain: { area: a.area, rain: a.rain } } : s;
    case 'surveyTapped':
      return s.surveyLine ? { ...s, surveyLine: false } : s;
    case 'feedbackSent':
      return s.overlay === 'feedback' ? { ...s, feedbackSent: true } : s;
    case 'restore':
      return {
        ...enterView(s, 'cards'),
        mood: a.rec.mood,
        sub: a.rec.sub,
        newSub: a.rec.newSub ?? s.newSub,
        origin: a.rec.origin,
        originReach: a.rec.reach ?? null,
        // a record from before the toggle belongs to the outdoor rotation
        originIndoor: a.rec.indoor ?? false,
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
  const rec: SessionRecord = { v: 1, mood: s.mood, sub: s.sub, newSub: s.newSub, origin: s.origin, indoor: s.originIndoor, shown: s.shown, histories: s.histories };
  return s.originReach ? { ...rec, reach: s.originReach } : rec;
}
