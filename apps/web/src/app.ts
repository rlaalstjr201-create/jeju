// One screen: 5 mood buttons (static HTML, ADR-0028) + basis toggle → 3 cards (spec, plan OQ3·5; design/SPEC.md).
// Controller only: user intents → reduce(state) → render(state); effects (GPS, data, storage, history)
// report back with a request id and stale results are dropped. See design/qa/scenarios.md for the cases.
import { showPhotos } from './later';
import { AREAS, areaByName, destOfArea, inJeju, type Area, type RegionName, type SggCode } from './areas';
import { createSpotSource, normalizeSpots, type SpotSource } from './data';
import { DAYS_AHEAD, addDays, dayOf, isDay, minuteOf, msToNextDay, type Day } from './dates';
import { readDeepLink, type DeepLink } from './deeplink';
import { DEST, destOfId, isDest, isSggDest, type Dest } from './dest';
import { LocateError, fetchAddr, fetchGeo, fetchRain, locateGps, resolveOrigin, type Fetch, type GeoDeps, type OriginResult } from './effects';
import { BACKUP_HASH, appHome, backupUrl, copyText, handoffUrl, inAppOf, installHow, readBackup } from './keep';
import { MAP_APPS, kakaoUrl, type MapApp } from './links';
import { BUSAN, NATION, OPEN_AREAS, areaOfPoint, culturePart, loadBusan, loadCulture, loadNation, outsideAt, released, releasedDestOf, sggOf, sggShort, startScreen } from './release';
import { HOME, createNav } from './nav';
import { REACHES, distanceKm, type Button, type Reach, type Spot, type Tab } from './pick';
import { seasonOn, type SeasonKind } from './season';
import { DUSK_LEAD_MIN, rainNow, rowTimes, sunPoint } from './home';
import { sunriseMinutes, sunsetMinutes } from './sun';
import { PLACE, createRenderer, dateLabel, findEls } from './render';
import { GPS_KEY, OPEN_STEP, basisIsCurrent, cardsValid, hasSaved, homeOrigin, initialState, knownOrigin, moodIntent, openPhase, rainArea, reduce, savedCount, savedDays, sessionOf, spotIndex, staticOrigin, visitedSpots, whenDay, type Action, type Intent, type Keep, type State } from './state';
import { KEYS, RAIN_TTL_MS, createStore } from './store';
import type { Analytics } from './analytics';
import { feedbackBody, surveyDue } from './survey';
import { ageOf, contextOf, createTracker, dwellBucket, type ArrangeOp, type EventName, type UsageEvent } from './track';
import type { Basis, Route, Stay, When } from './types';

export { AREAS, LocateError, inJeju, kakaoUrl };
export type { NoOrigin as LocateFailure } from './types';

export interface Delays {
  /** show the placeholder / "위치 확인 중…" only when a request takes longer than this (S02·S25). */
  slow: number;
  /** offer "지역으로 고르기" while GPS is still pending after this long (S04·S05). */
  long: number;
  /** same control tapped again within this window is ignored (S35). */
  guard: number;
  /** give up waiting for a self-caused popstate after this long. */
  settle: number;
  /** after a tap changes the screen, the 2nd tap of a double tap is swallowed (it would land on a card link). */
  quiet: number;
  dataTimeout: number;
  /** a position read asked for on the home (ADR-0110 Amendment 2): no answer by then is 「위치를 확인하지 못했어요」. */
  locate: number;
}
export const DELAYS: Delays = { slow: 300, long: 3000, guard: 400, settle: 1000, quiet: 300, dataTimeout: 10000, locate: 15000 };

export interface Deps extends GeoDeps {
  /** a destination's place list (plans/busan.md); the app asks for Jeju's only until Busan opens (S5). The 자동 지역's is
   * a 시군구's (`sgg`: its file and its neighbours', plans/nationwide-app.md 2). */
  loadSpots(dest: Dest, sgg?: string): Promise<unknown>;
  storage: Storage | null;
  /** sessionStorage — the cards being looked at survive a reload / discarded tab (S54). */
  session?: Storage | null;
  online?(): boolean;
  now?(): number;
  /** wall clock for the date line and the saved days (defaults to the device clock; read as Asia/Seoul). */
  today?(): Date;
  delays?: Partial<Delays>;
  /** where anonymous usage counts go (VITE_EVENTS_URL, ADR-0061); missing = nothing is kept or sent. */
  eventsUrl?: string;
  /** GA4 · 네이버 애널리틱스 (ADR-0078); missing = neither is loaded. */
  analytics?: Analytics | null;
  /** navigator.sendBeacon (the default when missing). */
  beacon?(url: string, body: string): boolean;
  /** ADR-0063 2a: ask the browser to keep this site's storage (navigator.storage.persist); once a visit, at
   * the first save. Missing = not asked. */
  persist?(): Promise<unknown>;
  /** the browser's user agent (in-app browser, iOS); navigator.userAgent when missing. */
  userAgent?: string;
  /** text onto the clipboard, false when it could not (copyText when missing). */
  copy?(text: string): Promise<boolean>;
  /** fetch for 비 소식 (/api/rain, ADR-0076); missing = never asked. */
  fetch?: Fetch;
  /** 의견 보내기 (ADR-0081): POST this JSON to /api/feedback, not waited for; missing = nothing is sent. */
  postFeedback?(body: string): void;
  /** the app's version, sent with 의견 보내기 ('dev' when missing). */
  appVersion?: string;
  /** a turn for the browser (yield.ts): the first load's work is then cut into tasks short of a long one — the
   * list tidied a slice at a time, the home's lower sections drawn after its first frame. Missing = straight
   * through (the tests). */
  yieldToMain?(): Promise<void>;
}

/** The browser's install prompt (Chrome, Edge, Samsung Internet): not in the DOM typings. */
interface InstallPrompt extends Event {
  prompt(): Promise<unknown>;
}

export interface App {
  destroy(): void;
  state(): State;
  /** what a reload now would lose, so a service-worker update waits (update.ts): words typed in 의견 보내기, or a
   * backup link's 합칠까요? not yet answered (its #s= has already left the address). */
  unsaved(): boolean;
}

const CARDS: Route = { view: 'cards', overlay: null };
const SAVED: Route = { view: 'saved', overlay: null };
/** Stopped waiting for GPS (saved list only): nothing is known about the position, nothing failed. */
const GAVE_UP = { ok: false, why: 'unavailable', gaveUp: true } as const;
type GaveUp = typeof GAVE_UP;
const BUTTONS: readonly Button[] = ['rest', 'walk', 'new', 'famous', 'food', 'any'];

/** index.html's inline script: the mood tapped before this module ran (a slow first visit). */
interface EarlyTap {
  __early?: EventListener;
  __tap?: string;
}

/** A backup link that reads (`#s=…`, ADR-0063). */
type Backup = Extract<ReturnType<typeof readBackup>, { found: true }>;
/** The address the page was opened at: a deep link's query (ADR-0067) and a backup link's #s= are read once and
 * leave the address at once (`address`, written by nav.ts with the mount's own entry), so a reload, back or forward
 * follows the usual rules. */
function readArrival(win: Window | null): { search: string; backup: Backup | null; address?: string } {
  const loc = win?.location;
  if (!loc) return { search: '', backup: null };
  const search = loc.search;
  const b = readBackup(loc.hash);
  const backup = b.found ? b : null;
  return { search, backup, ...(search || backup ? { address: loc.pathname + (backup ? '' : loc.hash) } : {}) };
}

export function mountApp(doc: Document, deps: Deps): App {
  const win = doc.defaultView;
  const ac = new AbortController();
  const { signal } = ac;
  const on = (target: EventTarget | null | undefined, type: string, fn: (e: Event) => void, capture = false) =>
    target?.addEventListener(type, fn, { signal, capture });

  const delays: Delays = { ...DELAYS, ...deps.delays };
  // Monotonic: a device clock stepped back (NTP, manual change) must not stretch the double-tap windows.
  const now = deps.now ?? (() => performance.now());
  /** When a tap happened, not when it was handled: on a slow phone the 2nd tap of a double tap waits behind the
   * render the 1st one caused, and by then the window has passed. Event time shares only the app's own clock. */
  const tapTime = (e: Event) => (!deps.now && e.timeStamp > 0 ? Math.min(e.timeStamp, now()) : now());
  const online = () => deps.online?.() ?? win?.navigator.onLine ?? true;
  const els = findEls(doc);
  const store = createStore(deps.storage, deps.session ?? null);
  // ♥ N drops ids missing from the data once it lands (S42); a failure notice gives way to the list if a
  // download that outlived its timeout lands after all.
  // One list per destination (plans/busan.md m3), each asked for only once that destination is in use; the 자동 지역's
  // per 시군구 (plans/nationwide-app.md 2: the same array while the 시군구 is the same).
  const loadSpots = deps.loadSpots;
  const sources: Record<string, SpotSource> = {};
  // 강원 (ADR-0102 Amendment 2) is named by 시군구 too: one 시군구's places at a time, out of its one file
  const keyOf = (d: Dest, sgg: SggCode | null) => (d === 'nation' || DEST[d].sgg ? `${d}:${sgg}` : d);
  /** The 검수한 곳 that covers a 시군구 (강릉·속초·춘천·양양·평창 → 강원, ADR-0102), or null (a 자동 지역 one, or the part not in). */
  function coveredBy(sgg: string | null): Dest | null {
    const a = areaByName(sgg, OPEN_AREAS);
    return a && isSggDest(a.group) ? destOfArea(a) : null;
  }
  /** 강원's 시군구 in use (ADR-0102 Amendment 2): the first of `want` that is one of its own, else the one its basis
   * stands on (the region, the 숙소's), else either, else its first. Null for a destination not named by 시군구. */
  function sggFor(d: Dest, p: { basis: Basis; region: RegionName | null; stay: Stay | null }, ...want: (string | null | undefined)[]): SggCode | null {
    const own = DEST[d].sgg;
    if (!own) return null;
    return [...want, p.basis === 'stay' ? p.stay?.area : p.basis === 'region' ? p.region : null, p.region, p.stay?.area, own[0]].find((c): c is SggCode => !!c && own.includes(c))!;
  }
  /** one 시군구's places of a list that has several (their `area`, its short name); 서울's all of them (DEST allSgg) */
  function ofSgg(raw: unknown, d: Dest, sgg: SggCode | null): unknown {
    if (DEST[d].allSgg) return raw;
    const word = sggShort(sgg ?? '');
    return Array.isArray(raw) ? raw.filter((r) => (r as { area?: unknown } | null)?.area === word) : raw;
  }
  /** a file of several 시군구 as it came (강원's), and each 시군구's list with the file's other places (savedPool) */
  const files: Partial<Record<Dest, unknown[]>> = {};
  const pools = new WeakMap<Spot[], Spot[]>();
  function poolOf(d: Dest, sgg: SggCode | null, spots: Spot[]): Spot[] | undefined {
    const raw = files[d];
    if (!raw) return undefined;
    if (DEST[d].allSgg) return spots;
    let pool = pools.get(spots);
    if (!pool) pools.set(spots, (pool = [...spots, ...normalizeSpots(raw.filter((r) => (r as { area?: unknown } | null)?.area !== sggShort(sgg ?? '')))]));
    return pool;
  }
  const sourceOf = (d: Dest, sgg: SggCode | null): SpotSource => {
    const key = keyOf(d, sgg);
    return (sources[key] ??= createSpotSource(
      () =>
        d === 'nation'
          ? loadSpots(d, sgg ?? '')
          : DEST[d].sgg
            ? loadSpots(d, sgg ?? '').then((raw) => {
                if (Array.isArray(raw)) files[d] = raw;
                return ofSgg(raw, d, sgg);
              })
            : loadSpots(d),
      delays.dataTimeout,
      (spots) => {
        if (keyOf(state.dest, state.sgg) !== key) return;
        dispatch({ type: 'spots', spots, savedPool: poolOf(d, sgg, spots) });
        retryFailedLoad();
      },
      deps.yieldToMain,
    ));
  };
  /** the list of the destination (and 시군구) in use */
  const data = {
    get: () => sourceOf(state.dest, state.sgg).get(),
    peek: () => sourceOf(state.dest, state.sgg).peek(),
    dispose: () => Object.values(sources).forEach((x) => x?.dispose()),
  };
  /** The list in use asked for ahead of a tap. If it does not come (failed, or not within the wait) while it is still the
   * one in use, the home stops holding places for it (listFailed); a copy that lands later is drawn as ever (onLoad). */
  function warm() {
    const key = keyOf(state.dest, state.sgg);
    data.get().catch(() => {
      if (keyOf(state.dest, state.sgg) === key && !data.peek()) dispatch({ type: 'listFailed' });
    });
  }
  const renderer = createRenderer(doc, els, { stageHome: !!deps.yieldToMain });
  const clockNow = () => deps.today?.() ?? new Date();
  const today0 = dayOf(clockNow());
  // 여행지 (ADR-0094, ADR-0096): with the switch on, what index.html's first script decided (a link, the one kept, an
  // older device's Jeju), or none — the 시작 화면 is then up and Jeju is drawn under it until a choice. A link is read
  // again here: only the app knows whether a ?stay= point is in Busan (src/dest.ts). Off: Jeju, nothing read or kept.
  const early = win as (Window & { __dest?: unknown; __destBy?: unknown }) | null;
  // (Busan's part, with the 시작 화면's module, was asked for before the mount, main.ts; without it the cover goes and this is Jeju)
  const covered = BUSAN && doc.documentElement.classList.contains('yc-start') && !!doc.getElementById('ycStart');
  const starting = covered && !!startScreen();
  // the cover was up but its module never came (ADR-0098 1): Jeju for this visit only — no choice is kept for the device
  // (the 시작 화면 comes again next time), and a press made on it is not lost (below, after the mount)
  const fellBack = covered && !starting;
  const pressed = fellBack ? (win as { __startTap?: unknown; __startPick?: unknown } | null) : null;
  const pressedGps = !!pressed?.__startTap;
  const pressedDest = pressed?.__startPick === 'busan' ? ('busan' as const) : null;
  if (pressed) {
    delete pressed.__startTap;
    delete pressed.__startPick;
  }
  if (BUSAN && !starting) {
    doc.documentElement.classList.remove('yc-start');
    doc.getElementById('ycStart')?.remove();
    showPhotos(doc);
  }
  let dest0: Dest = 'jeju';
  // 자동 지역 (plans/nationwide-app.md 1.2): its 시군구 — a link's (`dest=nation&area=<code>`), else the one kept
  let sgg0: SggCode | null = store.sgg();
  // 강원 (ADR-0102 Amendment 2): the 시군구 a link names (its `area=`, its 숙소's), and the one an older device had as the
  // 자동 지역's — ahead of the one kept for it
  const sggWant: (string | null)[] = [];
  if (BUSAN) {
    const search = win?.location.search ?? '';
    const link = early?.__destBy === 'link' && win ? readDeepLink(search, today0) : null;
    const area = link?.area && link.area !== 'here' ? areaByName(link.area, OPEN_AREAS) : null;
    // `dest=`: 브라우저로 열기 from an in-app browser (keep.ts handoffUrl) carries the 여행지 in use
    const named = /[?&]dest=([a-z]{2,10})(?:[&#]|$)/.exec(search)?.[1];
    const handed = isDest(named) ? named : undefined;
    const sggLink = handed === 'nation' || isSggDest(handed) ? /[?&]area=(\d{4,8})(?:[&#]|$)/.exec(search)?.[1] : undefined;
    if (sggLink && areaByName(sggLink, OPEN_AREAS)) {
      if (handed === 'nation') sgg0 = sggLink as SggCode;
      else sggWant.push(sggLink);
    }
    const linked = area ? destOfArea(area) : link?.stay ? releasedDestOf(link.stay) : (handed ?? null);
    const said = isDest(early?.__dest) ? early.__dest : null;
    let want = early?.__destBy === 'link' ? (linked ?? 'jeju') : (said ?? store.dest() ?? 'jeju');
    if (want === 'nation' && link?.stay) sgg0 = sggOf(link.stay) ?? sgg0;
    if (want !== 'nation' && DEST[want].sgg && link?.stay && released(want)) sggWant.push(areaOfPoint(link.stay, want).name);
    // a 시군구 a 검수한 곳 has taken over (강릉·속초·춘천·양양·평창, chosen as 자동 지역 before ADR-0102, or an older 브라우저로 열기
    // link): that destination, at that 시군구
    const taken = want === 'nation' ? coveredBy(sgg0) : null;
    if (taken) {
      want = taken;
      sggWant.push(sgg0);
      // and its basis, region and 숙소 (ADR-0102 Amendment 1, m-1)
      store.carry();
    }
    // Busan's (the 자동 지역's) part not in (it could not be loaded), or no 시군구 to show: Jeju for this visit, the choice
    // kept on the device as it was
    dest0 = released(want) && (want !== 'nation' || !!sgg0) ? want : 'jeju';
    if (!starting && !fellBack && dest0 === want) store.setDest(dest0);
    if (dest0 === 'nation' && sgg0) store.setSgg(sgg0);
  }
  store.useDest(dest0);
  const loaded = store.load(today0);
  if (DEST[dest0].sgg) {
    sgg0 = sggFor(dest0, loaded, ...sggWant, store.sgg(dest0));
    store.setSgg(sgg0!, dest0);
    // the basis stands in that 시군구 (predeploy review 2 m-1: the 시군구 wanted last wins): a region or 숙소 in another of
    // 강원's becomes that 시군구's region — the 숙소 is kept, and picked again moves to its own 시군구
    if ((loaded.basis === 'region' && loaded.region !== sgg0) || (loaded.basis === 'stay' && loaded.stay?.area !== sgg0)) {
      Object.assign(loaded, { basis: 'region', region: sgg0 });
      store.setBasis('region');
      store.setRegion(sgg0!);
    }
  }
  // ADR-0063 2: an in-app browser keeps its own storage (say so, once); the home-screen nudge, once.
  const nav0 = win?.navigator;
  const ua = deps.userAgent ?? nav0?.userAgent ?? '';
  const inapp = inAppOf(ua);
  let standalone = false;
  try {
    standalone = !!win?.matchMedia?.('(display-mode: standalone)').matches || (nav0 as { standalone?: boolean } | undefined)?.standalone === true;
  } catch {
    /* no matchMedia */
  }
  const keep0: Partial<Keep> = {
    inapp,
    inappNote: inapp && !loaded.inappSeen ? 'show' : null,
    install: installHow({ ua, touch: nav0?.maxTouchPoints ?? 0, standalone, prompt: false }),
  };
  // ADR-0081: read once at mount, so a map opened in this visit brings the survey line only next time
  const survey0 = store.survey();
  // src: this session's 숙소 링크 tag (ADR-0089); with sessionStorage blocked the state alone keeps it
  let state = initialState({ ...loaded, dest: dest0, sgg: sgg0, src: store.src(), today: today0, offline: !online(), keep: keep0, surveyLine: surveyDue(survey0), clock: minuteOf(clockNow()) });
  const tracker = createTracker({
    url: deps.eventsUrl,
    send: deps.beacon ?? (typeof nav0?.sendBeacon === 'function' ? (u, b) => nav0.sendBeacon(u, b) : undefined),
    enabled: () => state.tracking,
    online,
    doc,
    signal,
  });
  deps.analytics?.setEnabled(state.tracking);
  // The note and 기록 끄기 only where something is collected: without an address they would say what isn't so.
  const trackBox = els.track.parentElement;
  if (trackBox) trackBox.hidden = !deps.eventsUrl && !deps.analytics;

  const timers = new Set<ReturnType<typeof setTimeout>>();
  function later(ms: number, fn: () => void) {
    const t = setTimeout(() => {
      timers.delete(t);
      if (!signal.aborted) fn();
    }, ms);
    timers.add(t);
    return t;
  }
  signal.addEventListener('abort', () => {
    for (const t of timers) clearTimeout(t);
    timers.clear();
    data.dispose();
    renderer.dispose();
  });

  function dispatch(a: Action) {
    if (signal.aborted) return;
    state = reduce(state, a);
    if (batching || held) {
      unrendered = true;
      return;
    }
    drawn();
  }
  function drawn() {
    renderer.render(state);
    countSurvey();
    countShown();
    askRain();
    askCulture();
    if (browsing && state.overlay !== 'browse' && state.overlay !== 'browse-card') endBrowse();
    duskTimer();
    keepRow();
  }

  /** 오늘 판's row ahead (home.ts rowTimes, KEYS.row), for index.html's first script: worked out in a task of its own
   * once the list is in, and again only when what it depends on changes. */
  let rowSig = '';
  let rowSpots: Spot[] | null = null;
  let rowVisited: readonly string[] = [];
  function keepRow() {
    const s = state;
    if (!BUSAN || !s.spots) return;
    const origin = homeOrigin(s);
    const sig = [s.dest, s.sgg, origin?.key, origin?.point.lat, origin?.point.lng, s.today, s.when, rainNow(s)].join('|');
    if (sig === rowSig && s.spots === rowSpots && s.visited === rowVisited) return;
    rowSig = sig;
    rowSpots = s.spots;
    rowVisited = s.visited;
    later(0, () => {
      if (state.spots) store.setRow(state.dest, rowTimes(state, state.spots, homeOrigin(state), clockNow().getTime()));
    });
  }
  /** One tap, one draw: the actions `fn` dispatches are reduced at once and drawn together when it ends (render is
   * idempotent, so the screen is the one the last of them would draw). Only for steps that never read the DOM
   * an earlier action of theirs would have drawn. */
  let batching = 0;
  let unrendered = false;
  /** nothing is drawn before the mount's first draw (firstDraw, below) */
  let held = true;
  function batch(fn: () => void) {
    batching++;
    try {
      fn();
    } finally {
      batching--;
      if (!batching && !held && unrendered) {
        unrendered = false;
        if (!signal.aborted) drawn();
      }
    }
  }

  /** 노을 줄 (ADR-0083): one timer to the next moment 노을 볼 곳 opens (2시간 30분 before the sunset at the home's
   * point) or closes (the sunset), set again when that point or the day changes. No minute-by-minute ticking.
   * 밤 (ADR-0091) runs from that sunset to the sunrise, so the sunrise is a moment too. */
  let duskKey = '';
  let duskAt: ReturnType<typeof setTimeout> | null = null;
  /** before the sunrise (0), then before (1), in (2) or after (3) the 노을 window at the home's point today; -1 unknown */
  function duskPhase(clock: number | null): number {
    if (clock == null) return -1;
    const p = sunPoint(homeOrigin(state), state.dest, state.sgg);
    const set = sunsetMinutes(p, state.today);
    return clock < sunriseMinutes(p, state.today) ? 0 : clock < set - DUSK_LEAD_MIN ? 1 : clock < set ? 2 : 3;
  }
  function duskTimer() {
    const p = sunPoint(homeOrigin(state), state.dest, state.sgg);
    const key = `${p.lat},${p.lng}|${state.today}`;
    if (key === duskKey) return;
    duskKey = key;
    if (duskAt) {
      clearTimeout(duskAt);
      timers.delete(duskAt);
      duskAt = null;
    }
    const now = minuteOf(clockNow());
    // a new point can put now on the other side of an edge (another basis, another sunset): redraw, like tick()
    if (duskPhase(now) !== duskPhase(state.clock)) {
      duskKey = '';
      return dispatch({ type: 'clock', clock: now }); // its own duskTimer() call sets the timer
    }
    const set = sunsetMinutes(p, state.today);
    const rise = sunriseMinutes(p, state.today);
    const next = now < rise ? rise : now < set - DUSK_LEAD_MIN ? set - DUSK_LEAD_MIN : now < set ? set : null;
    if (next == null) return; // after the sunset: the midnight tick reads the clock again
    duskAt = later((next - now) * 60_000 + 500, () => {
      duskAt = null;
      duskKey = '';
      dispatch({ type: 'clock', clock: minuteOf(clockNow()) });
    });
  }

  // --- 비 소식 (ADR-0076): asked for the area the home speaks for, again once an answer is 30 minutes old (or 5
  // minutes after a failed ask); the session keeps an answer 30 minutes. One ask in flight at a time. ---
  const RAIN_RETRY_MS = 5 * 60_000;
  let rainAsked: { area: string; at: number; ok: boolean } | null = null;
  let rainBusy = false;
  function askRain() {
    const area = rainArea(state);
    if (!area || !deps.fetch || rainBusy) return;
    const now = clockNow().getTime();
    if (rainAsked?.area === area && now - rainAsked.at < (rainAsked.ok ? RAIN_TTL_MS : RAIN_RETRY_MS)) return;
    const kept = store.readRain(now);
    if (kept?.area === area) {
      rainAsked = { area, at: kept.at, ok: true };
      return dispatch({ type: 'rain', area, rain: kept.rain });
    }
    rainBusy = true;
    fetchRain(area, deps.fetch).then((rain) => {
      rainBusy = false;
      if (signal.aborted) return;
      const at = clockNow().getTime();
      rainAsked = { area, at, ok: rain !== null };
      // a failed ask after an expired answer must not leave the old rain row up for hours; a first one settles the row
      // as none (render.ts stops holding its place)
      if (rain === null) return void (!(state.rain?.area === area && !state.rain.rain) && dispatch({ type: 'rain', area, rain: false }));
      store.writeRain({ v: 1, area, at, rain });
      dispatch({ type: 'rain', area, rain });
    });
  }

  // --- 오늘 근처에서 하는 것 (ADR-0112): 서울's home, 지금, with a basis — the list asked for once a KST day (no position goes
  // with it), with its view (a chunk of its own, release.ts loadCulture); nothing is shown after a failure or for another
  // day, and a failed ask is tried again 5 minutes on (as 비 소식). The minute its picks are read at moves on with the draws
  // and, while the home is up, a 5-minute timer. ---
  let cultureAsked: { day: string; at: number } | null = null;
  /** an ask unanswered this long timed out (fetchCulture waits 15 s); asked again this soon after (Amendment 6) */
  const CULTURE_SLOW_MS = 14_000;
  const CULTURE_QUICK_MS = 30_000;
  let cultureBusy = false;
  let cultureTimer: ReturnType<typeof setTimeout> | null = null;
  function askCulture() {
    const s = state;
    if (cultureTimer) {
      clearTimeout(cultureTimer);
      timers.delete(cultureTimer);
      cultureTimer = null;
    }
    if (!NATION || !deps.fetch || s.dest !== 'seoul' || s.view !== 'home' || s.when !== 'now' || !homeOrigin(s)) return;
    // a second over the retry wait: the timer's ask is not turned away by the wait it was set for
    cultureTimer = later(RAIN_RETRY_MS + 1000, askCulture);
    const minute = minuteOf(clockNow());
    if (s.culture?.day === s.today) return void (Math.abs(minute - s.culture.minute) >= 5 && dispatch({ type: 'culture', culture: { ...s.culture, minute } }));
    const at = clockNow().getTime();
    if (cultureBusy || (cultureAsked?.day === s.today && at - cultureAsked.at < RAIN_RETRY_MS)) return;
    const day = s.today;
    cultureAsked = { day, at };
    cultureBusy = true;
    const get = deps.fetch;
    let sent = at;
    void loadCulture()
      .then((ok) => {
        // 서울 홈의 기분 선반 at once (ADR-0117); the day's own when the list comes
        if (ok && !signal.aborted) void (batching || held ? (unrendered = true) : renderer.render(state));
        sent = clockNow().getTime();
        return ok ? culturePart()!.fetchCulture(get) : null;
      })
      .then((c) => {
        cultureBusy = false;
        if (!signal.aborted && c?.day === day && state.today === day) {
          dispatch({ type: 'culture', culture: { day, items: c.items, minute: minuteOf(clockNow()) } });
          // a card's sheet whose item is not in the new list: closed
          if (state.overlay === 'browse-card' && !c.items.some((i) => i.id === state.browseId)) closeOverlay();
        } else if (!signal.aborted && !c && clockNow().getTime() - sent >= CULTURE_SLOW_MS) {
          // no answer in time (the day's first ask at an edge builds the list for longer than fetchCulture waits): the edge
          // goes on and keeps it (waitUntil), so it is asked again in half a minute, not in five (ADR-0117 Amendment 6)
          cultureAsked = { day, at: clockNow().getTime() - RAIN_RETRY_MS + CULTURE_QUICK_MS };
          if (cultureTimer) {
            clearTimeout(cultureTimer);
            timers.delete(cultureTimer);
          }
          cultureTimer = later(CULTURE_QUICK_MS + 1000, askCulture);
        }
      });
  }

  // --- anonymous usage counts (ADR-0061): place-level events, never a position ---
  /** `day`: the day a heart is about (dated = not today). `season`: the kind whose 철 words the card showed (ADR-0080).
   * `flow`: the saved-list fields (ADR-0085). */
  function count(e: EventName, id?: string, day?: Day, season?: SeasonKind | null, flow?: Pick<UsageEvent, 'live0' | 'past' | 'from' | 'age' | 'op'>) {
    const ev: UsageEvent = { e, ...(id ? { id } : {}), ...contextOf(state), ...(day ? { dated: day !== state.today } : {}), ...(season ? { season } : {}), ...flow };
    tracker.track(ev);
    if (state.tracking) deps.analytics?.event(ev);
    if (state.src && (e === 'tap' || e === 'map')) countSrc(e);
  }
  /** 숙소 링크 (ADR-0089): while this visit came in by one, tap / map (and the arrival's open) once more under
   * `src:<tag>`, to our own collector only (never GA4·네이버). */
  function countSrc(e: 'open' | 'tap' | 'map') {
    tracker.track({ e, id: `src:${state.src}`, d: state.today });
  }
  /** Each new set of 3 on screen, once: a re-render, the same 3 brought back or restored after a reload are
   * not shown again. */
  let shownSeq = 0;
  function countShown() {
    const c = state.cards;
    if (!c || c.seq === shownSeq || state.view !== 'cards' || state.phase.k !== 'ready') return;
    shownSeq = c.seq;
    if (c.how === 'restore') return;
    for (const card of c.list) count('shown', card.spot.id, undefined, seasonOn(card.spot.season, whenDay(state)));
  }
  /** The 철 a results card shows (ADR-0080); none on the saved list. */
  function seasonShown(id: string): SeasonKind | null {
    const card = state.view === 'cards' ? state.cards?.list.find((c) => c.spot.id === id) : undefined;
    return card ? seasonOn(card.spot.season, whenDay(state)) : null;
  }
  /** 길찾기 from a saved-list row (ADR-0085): days since that row was saved (never the day itself) and whether
   * it is under 지난 날. */
  function savedFlow(id: string, date: Day | undefined): Pick<UsageEvent, 'from' | 'age' | 'past'> | undefined {
    if (state.view !== 'saved' || !date) return undefined;
    const entry = state.saved.find((x) => x.id === id && x.date === date) ?? state.unsaved.find((x) => x.id === id && x.date === date);
    const age = ageOf(entry?.at, state.today);
    return { from: 'saved', ...(age !== undefined ? { age } : {}), ...(date < state.today ? { past: true as const } : {}) };
  }
  /** A link tapped twice (a 2nd tab opening) counts once. */
  const lastLink = new Map<string, number>();
  function countLink(e: 'map' | 'book', id: string, date?: Day) {
    if (e === 'map') markMap();
    const key = `${e}:${id}`;
    const t = now();
    const prev = lastLink.get(key);
    lastLink.set(key, t);
    if (prev !== undefined && t - prev < delays.guard) return;
    count(e, id, undefined, e === 'map' ? seasonShown(id) : null, e === 'map' ? savedFlow(id, date) : undefined);
    // sent now: the map app may take the page away before it goes hidden (an in-app WebView); the queue empties first
    tracker.flush();
  }
  // --- the survey (ADR-0081, specs/survey.md): all on this device; only 보내기 sends anything ---
  let mapMarked = !!survey0.map;
  /** a map opened on this device (local only): the survey line may show from the next visit */
  function markMap() {
    if (mapMarked) return;
    mapMarked = true;
    store.updateSurvey((r) => ({ ...r, map: true }));
  }
  let surveyCounted = false;
  /** a visit in which the line was drawn on the home counts once (3 such visits, then it stops) */
  function countSurvey() {
    if (surveyCounted || !state.surveyLine || !state.tracking || state.view !== 'home') return;
    surveyCounted = true;
    store.updateSurvey((r) => ({ ...r, shown: (r.shown ?? 0) + 1 }));
  }
  function openSurvey() {
    if (guarded('survey')) return;
    store.updateSurvey((r) => ({ ...r, tapped: true }));
    dispatch({ type: 'surveyTapped' });
    openOverlay('feedback');
  }
  /** 보내기: nothing chosen or written closes; otherwise one POST, not waited for, and 고마워요 whatever happens */
  function sendFeedback() {
    if (state.overlay !== 'feedback' || state.feedbackSent || guarded('feedback-send')) return;
    const checked = (name: string) => [...els.sheet.querySelectorAll<HTMLInputElement>(`input[name="${name}"]:checked`)].map((i) => i.value);
    const text = (id: string) => els.sheet.querySelector<HTMLTextAreaElement>(`#${id}`)?.value ?? '';
    const body = feedbackBody({ went: checked('fb-went')[0] ?? null, pains: checked('fb-pain'), pain: text('fb-pain-text'), wish: text('fb-wish') }, deps.appVersion ?? 'dev');
    if (!body) return closeOverlay();
    try {
      deps.postFeedback?.(JSON.stringify(body));
    } catch {
      /* the app never depends on it */
    }
    dispatch({ type: 'feedbackSent' });
  }

  function setTracking(on: boolean) {
    if (!on) tracker.drop();
    deps.analytics?.setEnabled(on);
    dispatch({ type: 'tracking', on });
    store.setTracking(on);
  }
  /** 지도 앱 (ADR-0071): the cards' links follow at once; kept on this device. */
  function setMapApp(app: MapApp) {
    dispatch({ type: 'mapApp', app });
    store.setMapApp(app);
  }

  /** Same control again within `delays.guard` → ignored (double tap = one tap, S35). Hearts are toggles and not guarded. */
  const lastTap = new Map<string, number>();
  function guarded(key: string): boolean {
    const t = now();
    const prev = lastTap.get(key);
    if (prev !== undefined && t - prev < delays.guard) return true;
    lastTap.set(key, t);
    return false;
  }

  // --- requests: origin + data for the current view. Newest request id wins. ---
  let reqSeq = 0;
  let reqTimers: ReturnType<typeof setTimeout>[] = [];
  function clearReqTimers() {
    for (const t of reqTimers) {
      clearTimeout(t);
      timers.delete(t);
    }
    reqTimers = [];
  }
  /** The results entry's session record follows what it is for (S54): written when asked, and again when
   * the cards land, so a reload always comes back to the mood last chosen — loading, failed or shown. */
  function remember() {
    const rec = sessionOf(state);
    if (rec) store.writeSession(rec);
  }
  function request(intent: Intent) {
    const req = ++reqSeq;
    clearReqTimers();
    // "다른 3곳 보기" measures from where these 3 were measured: no new GPS fix, which could fail (and take the
    // cards being compared away), keep the thumb waiting, or have moved and repeat places just seen.
    const kept = intent === 'more' && state.view === 'cards' && state.cards ? state.cards.origin : null;
    const fixed = kept ?? staticOrigin(state.basis, state.region, state.stay);
    const forSaved = state.view === 'saved';
    // specs/busan.md 1.4: another destination chosen in the sheet, no 동네 yet — the area index, never a GPS read
    const bare = !fixed && state.basis === 'region';
    if (bare && !forSaved) {
      dispatch({ type: 'request', req, intent, step: 'loading' });
      dispatch({ type: 'noOrigin', req, why: 'outside' });
      return;
    }
    dispatch({ type: 'request', req, intent, step: fixed ? 'loading' : 'locating' });
    remember();
    // A fixed origin (지역, 숙소, 다른 3곳) and the list already in: the answer is known now, so it lands in this same
    // step (and, in a batch, the same draw) instead of a microtask later — the same actions as the path below.
    // The time of day goes with the answer: the picks' night is read then, at the cards' own point (ADR-0091).
    const loaded = fixed ? data.peek() : null;
    if (fixed && loaded) {
      dispatch({ type: 'resolved', req, origin: fixed, spots: loaded, clock: minuteOf(clockNow()) });
      remember();
      return;
    }
    reqTimers.push(later(delays.slow, () => dispatch({ type: 'slow', req })));
    if (!fixed) reqTimers.push(later(delays.long, () => dispatch({ type: 'long', req })));
    // GPS and data start together; the data promise is shared and memoized only on success (S24).
    const spotsP = data.get();
    spotsP.catch(() => undefined);
    let originP: Promise<OriginResult | GaveUp> = kept ? Promise.resolve({ ok: true, origin: kept }) : bare ? Promise.resolve(GAVE_UP) : resolveOrigin(state.basis, state.region, state.stay, deps);
    if (forSaved && !fixed) {
      // The saved list never waits on an unanswered permission prompt (its timeout only starts once
      // answered): after a moment it is shown in saved order, and a late position is not used (no re-sort
      // under the thumb).
      const gaveUp = new Promise<GaveUp>((resolve) => reqTimers.push(later(delays.long, () => resolve(GAVE_UP))));
      originP = Promise.race([originP, gaveUp]);
    }
    void (async () => {
      const o = await originP;
      if (req !== reqSeq || signal.aborted) return;
      if (!o.ok && !forSaved) {
        clearReqTimers();
        dispatch({ type: 'noOrigin', req, why: o.why, ...('at' in o && o.at ? { at: o.at } : {}) });
        return;
      }
      // Saved list without a position is still shown, in saved order — never a dead end.
      if (!fixed) dispatch({ type: 'located', req, why: o.ok || o === GAVE_UP ? undefined : o.why, unknown: o === GAVE_UP });
      // specs/busan.md 1.3: a GPS read in the other destination moves there (the basis is 내 위치), and its list is used
      let list = spotsP;
      if (o.ok && o.origin.key === GPS_KEY && followGps(o.origin.point)) {
        list = data.get();
        list.catch(() => undefined);
      }
      let spots;
      try {
        spots = await list;
      } catch {
        if (req !== reqSeq) return;
        clearReqTimers();
        dispatch({ type: 'loadError', req, offline: !online() });
        return;
      }
      if (req !== reqSeq) return;
      clearReqTimers();
      dispatch({ type: 'resolved', req, origin: o.ok ? o.origin : null, spots, clock: minuteOf(clockNow()) });
      remember();
    })();
  }
  function abortRequest() {
    reqSeq++;
    clearReqTimers();
    dispatch({ type: 'abort' });
  }
  /** The list failed to load and now can: ask again by itself instead of waiting for 다시 불러오기. */
  function retryFailedLoad() {
    if (signal.aborted || state.phase.k !== 'loadError') return;
    if (state.view === 'cards' || state.view === 'saved') request('show');
  }
  /** After the view changed: fetch what it needs, or keep what is already on screen. */
  function enteredView() {
    if (state.view === 'saved' || (state.view === 'cards' && !cardsValid(state))) request('show');
    else abortRequest();
  }

  // --- history ---
  const arrival = readArrival(win);
  const nav = createNav(win, { signal, settleMs: delays.settle, onRoute: applyRoute, address: arrival.address });
  /** Back/forward the app did not cause: the history entry says what should be on screen. */
  function applyRoute(r: Route) {
    const prev = state;
    if (prev.overlay && r.overlay !== prev.overlay) stayToken++;
    if (r.view === 'cards' && !prev.mood) {
      // Forward onto a results entry after a reload on the first screen: its record says which mood.
      const rec = store.readSession();
      if (rec) {
        dispatch({ type: 'restore', rec });
        dispatch({ type: 'route', route: r });
        request('show');
        return;
      }
      // Nothing to show for it: step back off it, so it never becomes an entry that back presses swallow.
      nav.back(HOME);
      r = { view: 'home', overlay: null };
    }
    dispatch({ type: 'route', route: r });
    // Forward onto a 다른 날로 entry whose row is gone (a reload): step back off it, like a stale results entry.
    // 오늘 서울 둘러보기's the same, without the day's list or the card
    if ((r.overlay === 'move' || r.overlay === 'browse' || r.overlay === 'browse-card') && state.overlay !== r.overlay) nav.back({ view: state.view, overlay: null });
    if (state.view !== prev.view) enteredView();
    // Forward onto the results after 바꾸기 (which cleared the record): a reload here must come back to them.
    remember();
  }

  // --- keeping saves without a login (ADR-0063 2) ---
  let installSeen = loaded.installSeen;
  let persistAsked = false;
  /** At the first save of a visit: the browser may then keep this site's storage from being cleared. */
  function askPersist() {
    if (persistAsked || !deps.persist) return;
    persistAsked = true;
    try {
      void Promise.resolve(deps.persist()).catch(() => undefined);
    } catch {
      /* not offered */
    }
  }
  const copy = (text: string) => (deps.copy ? deps.copy(text) : copyText(doc, text)).catch(() => false);
  const home = () => appHome(win?.location.href ?? 'https://localhost/');
  /** A backup link opened here (`#s=…`): ask whether to merge it; the fragment goes from the address at once
   * (a reload or a shared address does not carry it on). One that does not read is dropped quietly. */
  function takeBackup() {
    const loc = win?.location;
    const b = loc ? readBackup(loc.hash) : null;
    if (!loc || !b?.found) return;
    try {
      win!.history.replaceState(win!.history.state, '', loc.pathname + loc.search);
    } catch {
      /* sandboxed */
    }
    useBackup(b);
  }
  function useBackup(b: Backup) {
    if (b.entries) dispatch({ type: 'keep', keep: { restore: { k: 'ask', entries: b.entries } } });
    // 비 와요 rode along (ADR-0065): this session starts with it on
    if (b.indoor) setIndoor(true);
    // so did a map app other than 네이버지도 (ADR-0071)
    if (b.mapApp) setMapApp(b.mapApp);
  }
  /** As if chosen in the basis sheet: 얼마나, 비 와요, 언제 and 기준 kept as there; the mood is tapped after. */
  function applyDeepLink(link: DeepLink) {
    if (link.reach && link.reach !== state.reach) {
      dispatch({ type: 'reach', reach: link.reach });
      store.setReach(link.reach);
    }
    if (link.indoor !== undefined) setIndoor(link.indoor);
    if (link.when) setWhen(link.when);
    if (link.area === 'here') {
      dispatch({ type: 'basis', basis: 'gps' });
      store.setBasis('gps');
    } else if (link.area) {
      dispatch({ type: 'basis', basis: 'region', region: link.area });
      store.setBasis('region');
      store.setRegion(link.area);
    }
    // 숙소 링크 (ADR-0089): that point is the 숙소, nothing asked; the tag stays for the session
    if (link.stay) {
      const stay: Stay = { ...link.stay, area: areaOfPoint(link.stay).name, source: 'link' };
      dispatch({ type: 'basis', basis: 'stay', stay });
      store.setBasis('stay');
      store.setStay(stay);
    }
    if (link.src) {
      // relay=1: handed on by an in-app browser's 브라우저로 열기, where this arrival was counted already (SPEC 6.14)
      const arrived = state.src !== link.src && !link.relay;
      dispatch({ type: 'src', src: link.src });
      store.setSrc(link.src);
      if (arrived) countSrc('open');
    }
  }
  function mergeBackup() {
    const r = state.keep.restore;
    if (r?.k !== 'ask') return;
    // places this data no longer has are left behind (once the data is in)
    const idx = state.spots ? spotIndex(state.spots) : null;
    // the other destination's places are kept as they are (specs/busan.md 6), whatever this list has
    const { entries, added, left } = store.mergeSaved(idx ? r.entries.filter((e) => idx.has(e.id) || destOfId(e.id) !== state.dest) : r.entries);
    dispatch({ type: 'saved', entries });
    dispatch({ type: 'keep', keep: { restore: { k: 'done', added, left } } });
    if (added) askPersist();
  }
  async function backup() {
    const entries = store.saved();
    if (!entries.length) return;
    const ok = await copy(backupUrl(home(), entries, state.indoor, state.mapApp));
    if (!signal.aborted && state.view === 'saved') dispatch({ type: 'keep', keep: { backup: ok ? 'copied' : 'failed' } });
  }
  /** Outside KakaoTalk (its own link does it): the address, with what is saved here (and a 숙소 링크), onto the clipboard. */
  async function inappCopy() {
    const ok = await copy(handoffUrl(home(), state, doc.documentElement.lang));
    if (!signal.aborted && state.keep.inappNote) dispatch({ type: 'keep', keep: { inappNote: ok ? 'copied' : 'failed' } });
  }
  let installPrompt: InstallPrompt | null = null;
  async function install() {
    const p = installPrompt;
    installPrompt = null;
    dispatch({ type: 'keep', keep: { nudge: false, install: null } });
    try {
      await p?.prompt();
    } catch {
      /* already used or refused */
    }
  }
  const KEEP_ACTIONS: Record<string, () => void> = {
    'restore-merge': mergeBackup,
    'restore-cancel': () => dispatch({ type: 'keep', keep: { restore: null } }),
    'inapp-copy': () => void inappCopy(),
    'inapp-close': () => {
      store.setInappSeen();
      dispatch({ type: 'keep', keep: { inappNote: null } });
    },
    'nudge-close': () => dispatch({ type: 'keep', keep: { nudge: false } }),
    install: () => void install(),
    backup: () => void backup(),
  };

  // --- intents ---
  /** `pin`: a 서울 홈 shelf card's place (ADR-0117 Amendment 1), the first of the cards. */
  function onMood(b: Button, pin?: string) {
    // The mood buttons live on the first screen; from the results they are reached only programmatically
    // (tests), from the saved list not at all (hidden, and 뒤로 comes first).
    if (state.overlay || state.view === 'saved' || guarded(`mood:${b}`)) return;
    const intent = moodIntent(state, b);
    if (!intent) return;
    const from = state.view;
    if (from === 'home') hush();
    // the results screen and its cards in one draw (the tap's frame lays the page out once)
    batch(() => {
      // a merge already answered has said its piece
      if (state.keep.restore?.k === 'done') dispatch({ type: 'keep', keep: { restore: null } });
      dispatch({ type: 'mood', button: b, ...(pin ? { pin } : {}) });
      count('tap');
      if (from === 'home') nav.push(CARDS);
      request(intent);
    });
  }

  function onMore() {
    if (guarded('more') || state.view !== 'cards' || state.phase.k !== 'ready') return;
    hush();
    batch(() => request('more'));
  }

  /** 뒤로 on the results (ADR-0090, was 바꾸기): back to the moods (the results entry is popped, so phone back never
   * lands on it again). */
  function onChange() {
    if (guarded('change') || state.view !== 'cards') return;
    reqSeq++; // whatever was still on its way is void
    clearReqTimers();
    hush();
    dispatch({ type: 'route', route: HOME });
    store.clearSession(); // a reload now is a reload of the first screen, not of the mood just left
    nav.back(HOME);
  }

  /** 식사 | 카페·디저트 on 먹기, 섞어서 | 구경 | 체험 on 새로운 거 (ADR-0064): the same rules. */
  function onSub(sub: Tab) {
    const forMood = sub === 'meal' || sub === 'cafe' ? 'food' : 'new';
    const current = forMood === 'food' ? state.sub : state.newSub;
    if (guarded(`sub:${sub}`) || state.view !== 'cards' || state.mood !== forMood || current === sub) return;
    batch(() => {
      dispatch({ type: 'sub', sub });
      request('show');
    });
  }

  /** `counted`: false for the home's 설정 · 지도 앱 · 의견, which comes to this screen for its settings, not the list. */
  function openSaved(counted = true) {
    hush();
    dispatch({ type: 'openSaved' });
    // once per opening, here and not on a draw (ADR-0085): ♥ N at 0, a folded 지난 날 line
    if (counted) count('open', undefined, undefined, null, { ...(savedCount(state) === 0 ? { live0: true } : {}), ...(savedDays(state).past.length ? { past: true } : {}) });
    nav.push(SAVED);
    request('show');
    // The home-screen nudge (ADR-0063 2d): once, the first time the saved list opens after a save, where it
    // is about what was saved. Never in an in-app browser (its notice says where to go) or the installed app.
    if (!installSeen && state.keep.install && hasSaved(state)) {
      installSeen = true;
      store.setInstallSeen();
      dispatch({ type: 'keep', keep: { nudge: true } });
    }
  }
  function closeSaved() {
    hush();
    const from = state.savedFrom;
    if (!from) {
      // Restored after a reload: what is underneath is unknown — go back and show whatever it is.
      nav.back('adopt');
      return;
    }
    dispatch({ type: 'closeSaved' });
    nav.back({ view: from, overlay: null });
    enteredView();
  }

  let stayToken = 0;
  let quietUntil = 0;
  /** The screen under the finger just changed (new view, sheet opened/closed, next 3): for a moment, a pointer
   * tap is the 2nd half of a double tap and is swallowed — it would land on whatever appeared there. */
  function hush() {
    quietUntil = Math.max(quietUntil, now() + delays.quiet);
  }
  function openOverlay(kind: 'basis' | 'stay' | 'move' | 'feedback' | 'culture' | 'browse') {
    if (state.overlay === kind) return;
    const was = state.overlay;
    stayToken++;
    hush(); // a double tap on 기준 must not land on the scrim (closing it again) or on a sheet option
    dispatch({ type: 'overlay', overlay: kind });
    const r: Route = { view: state.view, overlay: kind };
    if (was) nav.replace(r);
    else nav.push(r);
  }
  function closeOverlay() {
    if (!state.overlay) return;
    stayToken++; // a 숙소 GPS request still in flight is now void (S10)
    hush(); // the 2nd tap of a double tap must not land on the page under the sheet
    dispatch({ type: 'overlay', overlay: null });
    nav.back();
  }

  // --- 오늘 서울 둘러보기 (ADR-0114 7): our own collector only (never GA4·네이버), no item, no position ---
  let browsing: { at: number; cards: number } | null = null;
  /** never under a webdriver, like the first screen's (QA runs must not move the verdict) */
  const countBrowse = (ev: UsageEvent) => void (nav0?.webdriver || tracker.track(ev));
  function openBrowse() {
    if (state.overlay || state.view !== 'home' || guarded('browse')) return;
    openOverlay('browse');
    if (state.overlay !== 'browse') return;
    browsing = { at: now(), cards: 0 };
    countBrowse({ e: 'browse_open', d: state.today });
  }
  /** Left (closed, or the page hidden: a map app opened from it may never bring it back), once per opening. */
  function endBrowse() {
    const b = browsing;
    if (!b) return;
    browsing = null;
    countBrowse({ e: 'browse_done', secs: dwellBucket(now() - b.at), rows: Math.min(10, culturePart()?.scrolledRows() ?? 0), cards: Math.min(2, b.cards) as 0 | 1 | 2, d: state.today });
    tracker.flush();
  }
  /** A card's sheet over 서울 홈 (ADR-0117 5): an entry of its own (back closes it). `slot` (ADR-0124 6): what the card was
   * on its shelf, its data-slot. */
  function openBrowseCard(id: string | undefined, slot?: string) {
    if (state.overlay || state.view !== 'home' || !id || guarded('browse-card')) return;
    hush();
    dispatch({ type: 'browseCard', id });
    if (!state.overlay) return; // not taken (no list for today)
    nav.push({ view: state.view, overlay: 'browse-card' });
    if (browsing) browsing.cards++;
    countBrowse({ e: 'browse_card', d: state.today, ...(slot === 'new' || slot === 'pull' || slot === 'base' ? { slot } : {}) });
  }

  /** `keep` false (주소·숙소 with no public address, ADR-0103 Amendment 2): for this visit only — nothing saved, the sheet
   * stays open to say so. */
  function changeBasis(next: { basis: Basis; region?: RegionName; stay?: Stay }, keep = true) {
    dispatch({ type: 'basis', ...next });
    if (keep) {
      store.setBasis(next.basis);
      if (next.region) store.setRegion(next.region);
      if (next.stay) store.setStay(next.stay);
      closeOverlay();
    }
    // A new request also abandons any GPS request still in flight (S37·S38).
    if (state.view === 'home') {
      abortRequest();
      // 내 위치 picked on the home (ADR-0110): its position read now, the prompt (if any) answering this tap
      if (keep && next.basis === 'gps') locateHome(true);
    } else request('show');
  }

  /** 얼마나 (ADR-0060): like another basis — saved, the sheet closes, the results are picked again (new request
   * id, rotation from the start). The saved list does not depend on it. The range in use again just closes. */
  function changeReach(reach: Reach) {
    if (reach === state.reach) return closeOverlay();
    dispatch({ type: 'reach', reach });
    store.setReach(reach);
    closeOverlay();
    if (state.view === 'cards') request('show');
  }

  function setIndoor(on: boolean) {
    dispatch({ type: 'indoor', on });
    store.setIndoor(on);
  }
  /** 비 와요(실내만) (ADR-0065): like 얼마나 — kept for the session, the sheet closes, the results are picked
   * again (new request id, rotation from the start). The saved list does not depend on it. */
  function toggleIndoor() {
    setIndoor(!state.indoor);
    closeOverlay();
    if (state.view === 'cards') request('show');
  }

  function stayHere() {
    if (state.overlay !== 'stay' || state.stayForm.pending) return;
    const token = ++stayToken;
    dispatch({ type: 'stayForm', pending: true, error: null });
    void locateGps(deps).then((r) => {
      if (token !== stayToken || signal.aborted || state.overlay !== 'stay') return; // sheet closed or replaced
      if (!r.ok) dispatch({ type: 'stayForm', pending: false, error: r.why, ...(r.at ? { at: r.at } : {}) });
      // a 숙소 is the destination's own (ADR-0097): a position in the other one is outside this one (and where it is)
      else if (releasedDestOf(r.point) !== state.dest) dispatch({ type: 'stayForm', pending: false, error: 'outside', at: outsideAt(r.point) });
      else {
        const area = areaOfPoint(r.point, state.dest);
        // the 자동 지역: its 시군구 goes with it, as one picked in the 동네 index (predeploy review m-3)
        toSgg(area);
        changeBasis({ basis: 'stay', stay: { ...r.point, area: area.name, source: 'gps' } });
      }
    });
  }

  /** 「여행지 | 내 위치」 (ADR-0103). 여행지 shows its chips (nothing else changes until one is picked); 내 위치 is 지금 있는 곳
   * (the destination follows the position), or, already on it, hides the chips again. */
  function onSeg(seg: string) {
    if (seg === 'pick') {
      if (state.basis !== 'gps' || state.destPick) return;
      dispatch({ type: 'destPick', on: true });
      return els.sheet.querySelector<HTMLElement>('.chips [aria-pressed="true"]')?.focus({ preventScroll: true });
    }
    if (state.basis !== 'gps') return changeBasis({ basis: 'gps' });
    if (!state.destPick || state.view === 'home') {
      // 「여행지」's chips open first and then 내 위치: on the home that is 내 위치 picked again too (ADR-0110 Amendment 2)
      if (state.destPick) dispatch({ type: 'destPick', on: false });
      closeOverlay();
      // 내 위치 picked again on the home (ADR-0110): read it now, asking if need be
      return locateHome(true);
    }
    dispatch({ type: 'destPick', on: false });
    els.sheet.querySelector<HTMLElement>('[data-seg="gps"]')?.focus({ preventScroll: true });
  }

  /** 주소·숙소 검색 (ADR-0103): on 검색 or Enter only (never a keystroke at a time), the words to /api/geo. An answer for a
   * sheet since closed or replaced is dropped (stayToken, as the 숙소 GPS read). */
  function searchAddr() {
    if (state.overlay !== 'basis' || state.geo.pending) return;
    const input = els.sheet.querySelector<HTMLInputElement>('.addr-q');
    // 40 characters counted as the server does (code points: an emoji is one, never cut in half)
    const q = [...(input?.value ?? '').replace(/\s+/g, ' ').trim()].slice(0, 40).join('');
    if (!q) return input?.focus();
    if (!deps.fetch) return dispatch({ type: 'geo', pending: false, hits: null, error: 'off' });
    const token = ++stayToken;
    dispatch({ type: 'geo', pending: true, hits: null });
    void fetchGeo(q, deps.fetch).then((r) => {
      if (token !== stayToken || signal.aborted || state.overlay !== 'basis') return;
      if (!r.ok) dispatch({ type: 'geo', pending: false, hits: null, error: r.why });
      else dispatch({ type: 'geo', pending: false, hits: r.hits, error: r.hits.length ? null : 'none' });
    });
  }
  /** An answer picked: found again in the 도로명주소 API (/api/addr), whose address and point the device may keep — Kakao's
   * may be used only as they come (ADR-0103 Amendment 2). That point is the 숙소 (`addr`) and the basis, in the destination
   * (and 시군구) it is in — another one is moved to, as a 시군구 picked in the 동네 index. Not found there (or more than 1 km
   * from Kakao's): Kakao's point for this visit only, never saved, and the sheet says so. Outside every open one:
   * 「이 근처는 아직 장소 자료가 없어요.」 */
  function pickHit(i: number) {
    const hit = state.geo.hits?.[i];
    if (state.overlay !== 'basis' || !hit || state.geo.pending) return;
    const token = ++stayToken;
    const live = () => token === stayToken && !signal.aborted && state.overlay === 'basis';
    dispatch({ type: 'geo', pending: true });
    void (deps.fetch ? fetchAddr(hit.addr || hit.name, deps.fetch) : Promise.resolve(null)).then((pub) => {
      if (!live()) return;
      const keep = !!pub && distanceKm(pub, hit) <= 1;
      const p = pub && keep ? { lat: pub.lat, lng: pub.lng } : { lat: hit.lat, lng: hit.lng };
      // `ok` false: the 자동 지역's part did not come (no connection) — that, not 「장소 자료가 없어요」
      const go = (ok = true) => {
        if (!live()) return;
        if (!ok) return dispatch({ type: 'geo', pending: false, error: 'fail' });
        const d = releasedDestOf(p);
        if (!d) return dispatch({ type: 'geo', pending: false, error: 'nodata' });
        const area = areaOfPoint(p, d);
        if (d !== state.dest && !DEST[d].sgg && d !== 'nation') switchDest(d);
        toSgg(area);
        changeBasis({ basis: 'stay', stay: { ...p, area: area.name, source: 'addr', ...(keep ? {} : { once: true as const }) } }, keep);
        if (!keep) dispatch({ type: 'geo', pending: false, hits: null, error: 'once' });
      };
      // where the point is (Busan's boundary, the 시군구) needs the 자동 지역's part, Busan's with it
      if (inJeju(p)) go();
      else void loadNation().then(go);
    });
  }

  /** `day`: a saved-list row's heart (that day); a card's heart is about the day chosen now (지금 = today). */
  function onHeart(id: string, day?: Day) {
    tick(); // past midnight with the timer asleep: the heart goes to the real today
    const date = day ?? whenDay(state);
    // putting back a row taken out in this visit: where it was
    const out = day ? state.unsaved.find((e) => e.id === id && e.date === day) : undefined;
    // the day it is saved stays on this device (ADR-0085); put back, it keeps the one it had
    const { entries, added, removed } = store.toggleSaved(id, date, out?.order, out ? out.at : state.today);
    dispatch({ type: 'saved', entries, removed: day ? removed : null });
    if (added) askPersist();
    count(added ? 'save' : 'unsave', id, date);
    // The first save on the results screen says once where saved places go; it stays until the next
    // intent (no timer, §6.13).
    if (added && !state.hintSeen && state.view === 'cards') {
      store.setHintSeen();
      dispatch({ type: 'hint', id });
    }
  }

  /** 가 봤어요 (ADR-0087): left out of the picks from the next one on, or put back. Only that button and the status
   * line change; the cards on screen stay as they are. A toggle like the heart: not guarded. */
  function onVisited(id: string) {
    const { visited, added } = store.toggleVisited(id);
    const spot = state.cards?.list.find((c) => c.spot.id === id)?.spot ?? (state.spots ? spotIndex(state.spots).get(id) : undefined);
    // left out: the status line offers 되돌리기 for it (ADR-0090 5)
    dispatch({ type: 'visited', ids: visited, note: spot ? { k: added ? 'out' : 'in', name: PLACE.name(spot), ...(added ? { id } : {}) } : null });
    countVisit(added ? 'visited' : 'unvisited', id);
    if (added) askPersist(); // 뺀 곳 is kept on this device too (ADR-0063 2a)
  }
  /** visited / unvisited (ADR-0087): the place and the usual context, to our own collector only (never GA4·네이버). */
  function countVisit(e: 'visited' | 'unvisited', id: string) {
    tracker.track({ e, id, ...contextOf(state) });
  }

  /** 다시 넣기 in 뺀 곳 N곳: that place is picked again from the next pick on (its rotation as it was). */
  function putBack(id: string) {
    if (state.view !== 'saved' || !state.visited.includes(id)) return;
    hush(); // the next name moves up under the finger
    const spot = state.spots ? spotIndex(state.spots).get(id) : undefined;
    const name = spot && PLACE.name(spot);
    dispatch({ type: 'visited', ids: store.unvisit(id), note: name ? { k: 'in', name } : null });
    countVisit('unvisited', id);
  }
  function putBackAll() {
    if (state.view !== 'saved') return;
    const back = visitedSpots(state);
    if (!back.length) return;
    hush();
    dispatch({ type: 'visited', ids: store.unvisitAll(), note: { k: 'all', n: back.length } });
    for (const x of back) countVisit('unvisited', x.id);
  }

  /** 언제 in the basis sheet: applied at once (label, hearts), the sheet stays open for 어디. No request:
   * the cards do not depend on the day (ADR-0027). */
  function setWhen(w: When) {
    const when: When = w === 'now' || !isDay(w) || w <= state.today ? 'now' : w;
    if (when === state.when) return;
    dispatch({ type: 'when', when });
    store.setWhen(when);
    // back to 지금: the clock read again, and the half-hour timer set (ADR-0111 7)
    if (when === 'now') tick();
  }

  /** 날짜 고르기: the browser's own picker; where it cannot be opened, the date field itself is shown with
   * 이 날로 beside it. Typed a digit at a time it is a real date long before it is the one meant (the day's
   * first digit), so there it applies only on 이 날로 or Enter, never on `change`. */
  function pickDay(b: HTMLElement) {
    const input = b.parentElement?.querySelector<HTMLInputElement>('input[type="date"]');
    if (!input) return;
    try {
      if (typeof input.showPicker !== 'function') throw new Error('no picker');
      input.showPicker();
    } catch {
      input.classList.remove('sr');
      input.classList.add('date-in');
      input.removeAttribute('tabindex');
      input.removeAttribute('aria-hidden');
      input.parentElement?.classList.add('open');
      const ok = input.parentElement?.querySelector<HTMLElement>('[data-action="day-ok"]');
      if (ok) ok.hidden = false;
      input.focus();
    }
  }
  /** A day from today to a year on; anything else (typed past the field's min/max) is ignored. */
  function onDayPicked(value: string) {
    if (!isDay(value) || value < state.today || value > addDays(state.today, DAYS_AHEAD)) return;
    if (state.overlay === 'basis') setWhen(value);
    else if (state.overlay === 'move') moveTo(value);
  }

  // --- saved list rows: 위로 / 아래로 / 다른 날로 / 지난 날 ---
  function moveRow(id: string, day: Day, dir: -1 | 1) {
    if (guarded(`${dir}:${id}|${day}`)) return;
    hush(); // the row moves under the finger: a 2nd tap must not land on the one that took its place
    dispatch({ type: 'saved', entries: store.moveSaved(id, day, dir) });
    arranged(dir < 0 ? 'up' : 'down');
  }
  /** 저장 목록 정리 (ADR-0085): no place */
  const arranged = (op: ArrangeOp) => count('arrange', undefined, undefined, null, { op });
  function openMove(id: string, day: Day) {
    if (guarded('move-day')) return;
    dispatch({ type: 'moveTarget', id, date: day });
    openOverlay('move');
  }
  function moveTo(day: Day) {
    const t = state.moveTarget;
    if (state.overlay !== 'move' || !t) return;
    if (day !== t.date && day >= state.today) {
      dispatch({ type: 'saved', entries: store.moveToDay(t.id, t.date, day) });
      dispatch({ type: 'moveTarget', id: t.id, date: day }); // focus goes back to the row in its new day
      arranged('move');
    }
    closeOverlay();
  }

  /** 다른 동네 고르기 in the basis sheet (ADR-0090 6): down to the 동네 index inside the sheet, its first cell focused. */
  function toAreas() {
    const first = els.sheet.querySelector<HTMLElement>('.areas .opt');
    const head = first?.closest('.areas')?.previousElementSibling as HTMLElement | null | undefined;
    if (head && typeof head.scrollIntoView === 'function') head.scrollIntoView({ block: 'start' });
    first?.focus({ preventScroll: true });
  }

  function onSheetButton(b: HTMLElement) {
    const action = b.dataset.action;
    if (action === 'close') return closeOverlay();
    if (action === 'pick-day') return guarded('pick-day') ? undefined : pickDay(b);
    if (action === 'day-ok') {
      const input = b.parentElement?.querySelector<HTMLInputElement>('input[type="date"]');
      return input ? onDayPicked(input.value) : undefined;
    }
    if (b.dataset.when) return guarded(`when:${b.dataset.when}`) ? undefined : setWhen(b.dataset.when);
    if (b.dataset.day) return moveTo(b.dataset.day);
    const reach = b.dataset.reach as Reach | undefined;
    if (reach && REACHES.includes(reach)) return guarded(`reach:${reach}`) ? undefined : changeReach(reach);
    if (b.dataset.indoor !== undefined) return guarded('indoor') ? undefined : toggleIndoor();
    if (action === 'restay') return openOverlay('stay');
    if (action === 'other-area') return guarded('other-area') ? undefined : toAreas();
    if (action === 'stay-here') return stayHere();
    if (action === 'browse-card') return openBrowseCard(b.dataset.id, b.dataset.slot);
    if (action === 'feedback-send') return sendFeedback();
    if (action === 'addr-go') return searchAddr();
    if (b.dataset.hit) return guarded('hit') ? undefined : pickHit(Number(b.dataset.hit));
    if (b.dataset.seg) return guarded(`seg:${b.dataset.seg}`) ? undefined : onSeg(b.dataset.seg);
    const dest = b.dataset.dest;
    // 「여행지」's chip in use (ADR-0103): down to its 동네, as 다른 동네 고르기
    if (isDest(dest)) return guarded(`dest:${dest}`) ? undefined : NATION && dest === state.dest ? toAreas() : pickDest(dest);
    const basis = b.dataset.basis;
    if (basis === 'gps') {
      if (!basisIsCurrent(state, 'gps')) return changeBasis({ basis: 'gps' });
      closeOverlay();
      // 내 위치 picked again on the home with no position yet (ADR-0110): read it now, asking if need be
      return locateHome(true);
    }
    if (basis === 'stay') {
      if (!state.stay) return openOverlay('stay');
      if (basisIsCurrent(state, 'stay')) return closeOverlay();
      // a 숙소 in another 시군구 than the one in use (강원's, the 자동 지역's): its list (ADR-0102 Amendment 2)
      const at = areaByName(state.stay.area, OPEN_AREAS);
      if (at) toSgg(at);
      return changeBasis({ basis: 'stay' });
    }
    const area = areaByName(b.dataset.area, OPEN_AREAS);
    if (!area) return;
    toSgg(area);
    if (b.dataset.where === 'stay') return changeBasis({ basis: 'stay', stay: { lat: area.lat, lng: area.lng, area: area.name, source: 'area' } });
    return basisIsCurrent(state, 'region', area.name) ? closeOverlay() : changeBasis({ basis: 'region', region: area.name });
  }

  function onMainButton(b: HTMLButtonElement) {
    const keepAct = b.dataset.action ? KEEP_ACTIONS[b.dataset.action] : undefined;
    if (keepAct) return guarded(`keep:${b.dataset.action}`) ? undefined : keepAct();
    if (b.dataset.mood) return onMood(b.dataset.mood as Button, b.dataset.pin);
    // 서울 홈의 선반 (ADR-0117): a card's sheet over the home
    if (b.dataset.action === 'browse-card') return openBrowseCard(b.dataset.id, b.dataset.slot);
    if (b.dataset.sub) return onSub(b.dataset.sub as Tab);
    if (b.classList.contains('heart') && b.dataset.id) return onHeart(b.dataset.id, b.dataset.date);
    if (b.classList.contains('visited') && b.dataset.id) return onVisited(b.dataset.id);
    const action = b.dataset.action;
    // 되돌리기 on the status line (ADR-0090 5): the same as 가 봤어요 pressed again, while that place is still out
    if (action === 'visited-undo' && b.dataset.id) return state.visited.includes(b.dataset.id) ? onVisited(b.dataset.id) : undefined;
    if (state.view === 'saved' && b.dataset.id && b.dataset.date) {
      if (action === 'up' || action === 'down') return moveRow(b.dataset.id, b.dataset.date, action === 'up' ? -1 : 1);
      if (action === 'move-day') return openMove(b.dataset.id, b.dataset.date);
    }
    // 뺀 곳 N곳 (ADR-0087): open/close, 다시 넣기 one, 모두 다시 넣기 (no confirm)
    if (action === 'visited-list') {
      if (!guarded('visited-list') && state.view === 'saved') {
        hush(); // the names open under the finger
        dispatch({ type: 'visitedOpen', open: !state.visitedOpen });
      }
      return;
    }
    if (action === 'put-back' && b.dataset.id) return putBack(b.dataset.id);
    if (action === 'put-back-all') return guarded('put-back-all') ? undefined : putBackAll();
    if (action === 'past') {
      if (!guarded('past') && state.view === 'saved') {
        hush(); // the days gone by open under the finger
        dispatch({ type: 'pastOpen', open: !state.pastOpen });
        arranged('past');
      }
      return;
    }
    // 비 소식 on 오늘 판: 실내만 on (실내만 볼까요?) or off again (모두 보기) — the same switch as the sheet's (ADR-0065)
    if (action === 'rain-indoor' || action === 'rain-all') {
      if (!guarded('indoor')) setIndoor(action === 'rain-indoor');
      return;
    }
    if (action === 'more') return onMore();
    if (action === 'choose-area') return openOverlay('basis');
    if (action === 'retry') {
      if (!guarded('retry')) {
        hush(); // the cards replace the notice under the finger
        request('show');
      }
      return;
    }
    // 설정 · 지도 앱 · 의견 at the foot of the first screen and of the results (ADR-0090 4)
    if (action === 'settings') {
      if (!guarded('settings') && (state.view === 'home' || state.view === 'cards')) {
        openSaved(false);
        doc.getElementById('settingsH')?.scrollIntoView({ block: 'start' });
        doc.getElementById('settingsH')?.focus({ preventScroll: true });
      }
      return;
    }
    if (action === 'track') {
      if (!guarded('track')) setTracking(!state.tracking);
      return;
    }
    if (action === 'survey') return openSurvey();
    // 저장한 곳: 「부산에 저장한 곳 N곳」 (specs/busan.md 6) — that destination's saved list
    if (action === 'other-dest') {
      const d = b.dataset.dest;
      if (isDest(d) && !guarded('other-dest') && state.view === 'saved') {
        // Busan's (the 자동 지역's) part first (src/release.ts): a Jeju visit has not downloaded it
        if (BUSAN && !released(d)) void partOf(d).then((ok) => ok && !signal.aborted && state.view === 'saved' && (switchDest(d), request('show')));
        else {
          switchDest(d);
          request('show');
        }
      }
      return;
    }
    if (action === 'feedback') return guarded('feedback') ? undefined : openOverlay('feedback');
    if (action === 'culture-more') return guarded('culture-more') ? undefined : openOverlay('culture');
    if (action === 'browse') return openBrowse();
    if (action === 'map-app') {
      const app = b.dataset.app as MapApp;
      if (MAP_APPS.includes(app) && !guarded(`map-app:${app}`)) setMapApp(app);
      return;
    }
    const area = areaByName(b.dataset.area, OPEN_AREAS);
    if (area && !guarded(`area:${area.name}`)) {
      hush();
      toSgg(area);
      changeBasis({ basis: 'region', region: area.name });
    }
  }

  // --- listeners (all removed by destroy()) ---
  const buttonIn = (e: Event, box: HTMLElement) => {
    const b = (e.target as Element | null)?.closest?.('button');
    return b && box.contains(b) ? (b as HTMLButtonElement) : null;
  };
  on(els.main, 'click', (e) => {
    const b = buttonIn(e, els.main);
    if (b && !state.overlay) onMainButton(b);
  });
  // the map app's place link (the card's name), 길찾기 and 예약 links: counted, then the browser opens them as usual.
  on(els.main, 'click', (e) => {
    const a = (e.target as Element | null)?.closest?.('a');
    const card = a && els.main.contains(a) ? a.closest<HTMLElement>('.card[data-id]') : null;
    const id = card?.dataset.id;
    if (!a || !id) return;
    // 길찾기 (ADR-0067) leaves for the map app too: the same event; a saved-list row says its day (ADR-0085)
    if (a.classList.contains('card-link') || a.classList.contains('go')) countLink('map', id, card.dataset.date);
    else if (a.classList.contains('book')) countLink('book', id);
  });
  // 오늘 판's market row (ADR-0075): down to 오늘 장 서는 곳 without touching the address or history (home stays depth 0)
  on(els.main, 'click', (e) => {
    // 노을 볼 곳's row (ADR-0083) the same way, down to its section
    const a = (e.target as Element | null)?.closest?.('a[data-action="to-market"], a[data-action="to-sunset"]');
    if (!a) return;
    e.preventDefault(); // never the #market jump: it would push a history entry (home stays depth 0)
    if (state.overlay) return;
    const head = doc.getElementById(a.getAttribute('data-action') === 'to-sunset' ? 'sunset-h' : 'market-h');
    if (!head) return;
    if (typeof head.scrollIntoView === 'function') head.scrollIntoView({ block: 'start' });
    head.focus({ preventScroll: true });
  });
  on(els.basis, 'click', () => {
    if (!state.overlay && !guarded('basis')) openOverlay('basis');
  });
  // the name line 「여차나:제주 ▾」 (ADR-0094 Amendment 3): the same sheet, its 여행지 row first (render.ts focusSheet)
  // (「여행지 | 내 위치」, ADR-0103: on 여행지, its chips shown)
  on(doc.getElementById('logo'), 'click', () => {
    if (state.overlay || guarded('basis')) return;
    batch(() => {
      openOverlay('basis');
      if (NATION) dispatch({ type: 'destPick', on: true });
    });
  });
  on(els.saved, 'click', () => {
    if (state.overlay || guarded('saved')) return;
    if (state.view === 'saved') closeSaved();
    else openSaved();
  });
  // 뒤로 (ADR-0090) at the top bar's left: what 바꾸기 did on the results and 돌아가기 on the saved list
  on(els.back, 'click', () => {
    if (state.overlay) return;
    if (state.view === 'cards') onChange();
    else if (state.view === 'saved' && !guarded('close-saved')) closeSaved();
  });
  // 오늘 서울 둘러보기: 길찾기 or 자세히 on a card (sent now: the map app may take the page away)
  on(els.sheet, 'click', (e) => {
    const link = (e.target as Element | null)?.closest?.<HTMLElement>('a[data-blink]')?.dataset.blink;
    if (link !== 'go' && link !== 'more' && link !== 'post') return;
    countBrowse({ e: 'browse_link', link, d: state.today });
    tracker.flush();
  });
  on(els.sheet, 'click', (e) => {
    const t = e.target as HTMLElement;
    if (t.dataset?.action === 'close') return closeOverlay(); // scrim
    const b = buttonIn(e, els.sheet);
    if (b && !b.disabled) onSheetButton(b);
  });
  // The browser's picker reports the day once, on `change`; the shown field (no picker) waits for 이 날로 / Enter.
  on(els.sheet, 'change', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.type === 'date' && !t.classList.contains('date-in')) onDayPicked(t.value);
  });
  on(els.sheet, 'keydown', (e) => {
    const t = e.target as HTMLInputElement;
    // 주소·숙소 검색 (ADR-0103): Enter searches — not the Enter that ends an IME's composing
    if ((e as KeyboardEvent).key === 'Enter' && t.classList?.contains('addr-q')) {
      if ((e as KeyboardEvent).isComposing) return;
      e.preventDefault();
      return searchAddr();
    }
    if ((e as KeyboardEvent).key !== 'Enter' || t.type !== 'date' || !t.classList.contains('date-in')) return;
    e.preventDefault();
    onDayPicked(t.value);
  });
  on(
    doc,
    'click',
    (e) => {
      // Only pointer taps (detail ≥ 1); a keyboard Enter/Space (detail 0) is always deliberate.
      if (tapTime(e) >= quietUntil || (e as MouseEvent).detail === 0) return;
      e.preventDefault();
      e.stopImmediatePropagation();
    },
    true,
  );
  // Image errors don't bubble; capture them to drop the photo box (S30) and remember it for re-renders.
  on(
    els.main,
    'error',
    (e) => {
      const img = e.target as HTMLElement;
      if (img.tagName !== 'IMG') return;
      // a card's photo, or one of the home's (ADR-0075), which carries the id itself
      const id = img.closest<HTMLElement>('.card[data-id], #home img[data-id]')?.dataset.id;
      if (id) dispatch({ type: 'imgError', id });
    },
    true,
  );
  on(doc, 'keydown', (e) => {
    const k = e as KeyboardEvent;
    if (!state.overlay) return;
    if (k.key === 'Escape') {
      // 의견 보내기: Esc never throws away what is being typed (an IME composing, or words in a box)
      if (k.isComposing || [...els.sheet.querySelectorAll('textarea')].some((t) => t.value.trim())) return;
      k.preventDefault();
      // 주소·숙소 검색 with words in it: Esc empties the box (as a search box does), the sheet stays
      const t = k.target as HTMLInputElement;
      if (t.classList?.contains('addr-q') && t.value) {
        t.value = '';
        return;
      }
      closeOverlay();
    } else if (k.key === 'Tab') {
      // Focus stays inside the sheet (inert covers modern browsers; this covers the rest, S58).
      const f = [...els.sheet.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([tabindex="-1"]), textarea, a[href]')].filter((x) => !x.closest('[inert]'));
      if (!f.length) return;
      const i = f.indexOf(doc.activeElement as HTMLElement);
      if (k.shiftKey && i <= 0) {
        k.preventDefault();
        f[f.length - 1].focus();
      } else if (!k.shiftKey && (i === -1 || i === f.length - 1)) {
        k.preventDefault();
        f[0].focus();
      }
    }
  });
  // Hearts saved in another tab show up here too, and are never overwritten (read-modify-write); so do 뺀 곳 and 기록.
  on(win, 'storage', (e) => {
    const s = e as StorageEvent;
    if (s.storageArea && deps.storage && s.storageArea !== deps.storage) return;
    if (s.key === KEYS.savedV2 || s.key === null) dispatch({ type: 'saved', entries: store.saved() });
    if (s.key === KEYS.hint && s.newValue === 'true') dispatch({ type: 'hintSeen' });
    if (s.key === KEYS.mapApp || s.key === null) dispatch({ type: 'mapApp', app: store.mapApp() });
    // 뺀 곳 too: a 가 봤어요 here toggles what is stored, so the button must show it (no status line for it here)
    if (s.key === KEYS.visited || s.key === null) dispatch({ type: 'visited', ids: store.visited() });
    // 기록 끄기 in another tab stops this one too: what it queued goes, nothing more is sent (ADR-0061).
    if (deps.storage && (s.key === KEYS.track || s.key === null)) {
      const on = store.tracking();
      if (on !== state.tracking) {
        if (!on) tracker.drop();
        deps.analytics?.setEnabled(on);
        dispatch({ type: 'tracking', on });
      }
    }
  });
  // A backup link pasted into the address bar of an open tab only changes the fragment.
  on(win, 'hashchange', () => {
    if (win?.location.hash.startsWith(BACKUP_HASH)) takeBackup();
  });
  // Chrome's own install prompt, kept for the nudge's 홈 화면에 추가 (its mini-infobar stays away).
  on(win, 'beforeinstallprompt', (e) => {
    if (inapp || standalone) return;
    e.preventDefault();
    installPrompt = e as InstallPrompt;
    if (!state.keep.install) dispatch({ type: 'keep', keep: { install: 'prompt' } });
  });
  on(win, 'appinstalled', () => {
    installPrompt = null;
    dispatch({ type: 'keep', keep: { install: null, nudge: false } });
  });
  on(win, 'online', () => {
    dispatch({ type: 'offline', offline: false });
    retryFailedLoad(); // "오프라인이라 목록을 불러오지 못했어요" would be wrong now
  });
  on(win, 'offline', () => dispatch({ type: 'offline', offline: true }));
  // Back in the foreground (maybe the next morning, maybe from the settings app): refresh the date line and
  // what the browser says about location permission.
  // an in-app WebView may close with pagehide only (track.ts): the dwell is still sent
  on(win, 'pagehide', endBrowse);
  on(doc, 'visibilitychange', () => {
    if (doc.visibilityState !== 'visible') return endBrowse();
    tick();
    checkPermission();
    askRain(); // an answer may have grown old while the app was in the background
    askCulture();
  });

  /** A new day in Jeju (the midnight timer, or back in the foreground): the date line, and a chosen day
   * that has now come or gone goes back to 지금 (D5); saves of days gone by move to 지난 날. */
  let midnight: ReturnType<typeof setTimeout> | null = null;
  /** 지금 닫힌 곳 (ADR-0111): the home's 「예:」 and 지금 여기서 read the clock again every half hour, so a place that
   * opened or shut since is not left up there (the results read it at each pick) */
  let halfHour: ReturnType<typeof setTimeout> | null = null;
  function tick() {
    const now = clockNow();
    const day = dayOf(now);
    if (day !== state.today) {
      const was = state.when;
      dispatch({ type: 'today', today: day });
      if (state.when !== was) store.setWhen(state.when);
    }
    renderer.setDate(dateLabel(now));
    // the time of day for 노을 볼 곳 (ADR-0083), and its timer from this moment
    // (a dispatch only when that moves it across an edge of the window — nothing else redraws)
    duskKey = '';
    if (duskPhase(minuteOf(now)) !== duskPhase(state.clock) || openPhase(state, minuteOf(now)) !== openPhase(state, state.clock)) dispatch({ type: 'clock', clock: minuteOf(now) });
    else duskTimer();
    if (midnight) {
      clearTimeout(midnight);
      timers.delete(midnight);
    }
    midnight = later(msToNextDay(now) + 1000, tick);
    if (halfHour) {
      clearTimeout(halfHour);
      timers.delete(halfHour);
      halfHour = null;
    }
    if (openPhase(state, minuteOf(now)) !== null) halfHour = later((OPEN_STEP - (minuteOf(now) % OPEN_STEP)) * 60_000 + 1000, tick);
  }
  function checkPermission() {
    if (!deps.geoPermission || state.basis !== 'gps') return;
    deps.geoPermission().then(
      (permission) => {
        if (signal.aborted) return;
        dispatch({ type: 'permission', permission });
        // under the 시작 화면 that read is its own (start.ts)
        if (permission === 'granted' && !startOpen) locateHome();
        // Location turned back on in settings while the results say it is off: the label says 내 위치 근처 again,
        // so the cards come too, instead of a notice that now contradicts it.
        const p = state.phase;
        const on = permission === 'granted' || permission === 'prompt';
        if (on && state.view === 'cards' && state.basis === 'gps' && p.k === 'noOrigin' && p.why === 'denied') request('show');
      },
      () => undefined,
    );
  }

  /** ADR-0075 Amendment 1: location already allowed, so the home reads it without a prompt — its examples, market
   * row and 비 소식 are then about where the user is. Never asked here: the first prompt stays at a mood tap. A
   * failure says nothing (the label is not changed by a read nobody asked for) — unless `asked`: 지금 있는 곳 / 내 위치
   * tapped, it says why on the home (ADR-0110 Amendment 1), and it is read even with a position known: one kept from
   * earlier in this visit may be somewhere else now (owner report 2026-11-04, ADR-0110 Amendment 2). */
  let homeLocating = false;
  /** a tap is waiting on the read under way: it is told how it went */
  let homeAsked = false;
  /** the read under way was asked for: what it brings replaces a position already known */
  let homeFresh = false;
  let homeTimer: ReturnType<typeof setTimeout> | undefined;
  const stopHomeTimer = () => {
    if (homeTimer === undefined) return;
    clearTimeout(homeTimer);
    timers.delete(homeTimer);
    homeTimer = undefined;
  };
  /** a tapped read with no answer by `delays.locate` (a browser that never answers, a prompt left open) is said to have
   * failed (ADR-0110 Amendment 2); a position that still comes later is used all the same (the prompt answered late) */
  const ask = () => {
    homeAsked = true;
    homeFresh = true;
    homeTimer = later(delays.locate, () => {
      homeTimer = undefined;
      homeAsked = false;
      if (state.homeReading) dispatch({ type: 'homeReading', on: false });
      if (state.view === 'home' && state.basis === 'gps') dispatch({ type: 'homeFail', why: 'unavailable' });
    });
    dispatch({ type: 'homeReading', on: true });
  };
  function locateHome(asked = false) {
    if (state.view !== 'home' || state.basis !== 'gps') return;
    // a read already under way (the silent one on opening, or one past its time): this tap waits for it
    if (homeLocating) {
      if (asked && !homeAsked) ask();
      // (a tap already waiting, its line gone with another basis picked meanwhile: back with 내 위치)
      else if (asked && !state.homeReading) dispatch({ type: 'homeReading', on: true });
      return;
    }
    // (the 자동 지역's weak start is no position: it is read all the same)
    if (!asked && knownOrigin(state)) return;
    homeLocating = true;
    if (asked) ask();
    void locateGps(deps, asked).then((r) => {
      stopHomeTimer();
      homeLocating = false;
      const told = homeAsked;
      const fresh = homeFresh;
      homeAsked = homeFresh = false;
      if (state.homeReading) dispatch({ type: 'homeReading', on: false });
      // a prompt answered after the user went on to the results or the saved list: not moved under them (ADR-0110)
      if (signal.aborted || state.view !== 'home') return;
      if (!r.ok) return told && state.basis === 'gps' ? dispatch({ type: 'homeFail', why: r.why, ...(r.at ? { at: r.at } : {}) }) : undefined;
      followGps(r.point);
      dispatch({ type: 'homeFix', point: r.point, fresh });
    });
  }

  // --- 여행지 (ADR-0094, specs/busan.md 1.3·1.4) ---
  /** Busan's part, or the 자동 지역's (with Busan's; 강원 opens with it, ADR-0102): asked for where that destination comes
   * into play. */
  const partOf = (d: Dest) => (d === 'busan' ? loadBusan() : loadNation());
  /** To `d`: its basis, region and 숙소 (each destination keeps its own, ADR-0097), its list asked for, kept on this
   * device. `basis`: what to start it with instead of the one kept there. `sgg`: the 자동 지역's 시군구 (the one in use, or
   * the one kept, when not given) or 강원's (ADR-0102 Amendment 2: the one in use, the one kept for it, the one its basis
   * stands on); another one is another list. */
  function switchDest(d: Dest, opts: { basis?: Basis; note?: boolean; sgg?: SggCode | null } = {}) {
    let sgg = d === 'nation' ? (opts.sgg ?? state.sgg ?? store.sgg()) : null;
    if (!released(d) || (d === 'nation' && !sgg)) return;
    store.useDest(d);
    store.setDest(d);
    const p = store.place();
    if (DEST[d].sgg) sgg = sggFor(d, p, opts.sgg, d === state.dest ? state.sgg : null, store.sgg(d));
    if (sgg) store.setSgg(sgg, d);
    if (d === state.dest && !opts.basis && (!sgg || sgg === state.sgg)) return;
    const basis = opts.basis ?? p.basis;
    batch(() => {
      dispatch({ type: 'dest', dest: d, basis, region: basis === 'region' ? null : p.region, stay: p.stay, note: opts.note, ...(sgg ? { sgg } : {}) });
      // its list already in (warmed under the 시작 화면, or before a trip to the other one): its onLoad has been, so
      // nothing else would bring it back and the home stayed without 「예:」, photos or 장날 (owner report 2026-10-24)
      const ready = data.peek();
      if (ready) dispatch({ type: 'spots', spots: ready, savedPool: poolOf(d, sgg, ready) });
      // into Jeju (or out): the clock read again, the half-hour timer set or let go (ADR-0111 7)
      tick();
    });
    if (opts.basis && opts.basis !== 'region') store.setBasis(opts.basis);
    warm();
  }
  /** A 시군구 picked in the 자동 지역's 동네 index (another 시도's, plans/nationwide-app.md 4): its list from now on. The
   * same index lists a 검수한 곳's 시군구 (강릉·속초·춘천·양양·평창, ADR-0102) and is drawn there too: one picked moves between the
   * two, or to another of 강원's (its list too, Amendment 2). */
  function toSgg(area: Area) {
    if (!NATION || (area.group !== 'nation' && !isSggDest(area.group))) return;
    const d = destOfArea(area);
    if (d !== state.dest || area.name !== state.sgg) switchDest(d, { basis: state.basis, sgg: area.name as SggCode });
  }
  /** A GPS point inside another open destination (or, in the 자동 지역, another 시군구), while the basis is 내 위치: moves
   * there (true). */
  function followGps(p: { lat: number; lng: number }): boolean {
    if (!BUSAN || state.basis !== 'gps') return false;
    const d = releasedDestOf(p);
    // the 자동 지역's 시군구, or 강원's nearest (ADR-0102 Amendment 2)
    const sgg = d === 'nation' ? sggOf(p) : d && DEST[d].sgg ? (areaOfPoint(p, d).name as SggCode) : null;
    if (!d || (d === state.dest && sgg === (d === 'nation' || DEST[d].sgg ? state.sgg : null)) || !released(d)) return false;
    switchDest(d, { basis: 'gps', note: d !== state.dest, sgg });
    return true;
  }
  /** 기준 시트's 여행지 row (specs/busan.md 1.4): with this session's position inside it, 내 위치 근처; else 지역 고르기 and
   * its 동네 index, opened in the sheet (the sheet stays open). */
  function pickDest(d: Dest) {
    if (d === state.dest) return;
    // Busan's (the 자동 지역's) part first (src/release.ts): a Jeju visit has not downloaded it
    if (BUSAN && !released(d)) return void partOf(d).then((ok) => ok && !signal.aborted && pickDest(d));
    const fix = state.origin?.key === GPS_KEY ? state.origin.point : null;
    // the 자동 지역 never chosen on this device: 서울시청's 시군구 (the nearest 자동 지역 one now that 중구 is 서울's, ADR-0106) until one is picked in its index
    // (not one a 검수한 곳 has taken over since it was kept: 강릉, ADR-0102); 강원 at the position's 시군구 when it is in 강원,
    // else the one kept for it (switchDest)
    const here = fix && releasedDestOf(fix) === d;
    const sgg = d === 'nation' ? ((fix && sggOf(fix)) ?? [state.sgg, store.sgg()].find((c) => c && !coveredBy(c)) ?? (areaOfPoint(DEST.nation.cityHall, 'nation').name as SggCode)) : fix && here && DEST[d].sgg ? (areaOfPoint(fix, d).name as SggCode) : undefined;
    switchDest(d, { basis: here ? 'gps' : 'region', sgg });
    if (state.view !== 'home') request('show');
    later(0, toAreas);
  }

  // --- mount: restore what this history entry was showing (S18·S54) ---
  try {
    if (win && 'scrollRestoration' in win.history) win.history.scrollRestoration = 'manual';
  } catch {
    /* sandboxed */
  }
  // One draw for the whole mount: the stored basis, a backup link, a deep link and a restored screen land in it
  // together (audit 2026-10-15: the first load's tasks).
  batch(() => {
    // the address it was opened at (readArrival): a backup link to merge; a deep link, applied only on a fresh
    // first-screen entry
    if (arrival.backup) useBackup(arrival.backup);
    const link: DeepLink | null = nav.initial.view === 'home' && arrival.search ? readDeepLink(arrival.search, state.today) : null;
    countSurvey();
    // Taps on the static mood buttons before this module ran: the last one is carried out now.
    const early = win as (Window & EarlyTap) | null;
    const earlyTap = early?.__tap;
    if (early?.__early) win!.removeEventListener('click', early.__early, true);
    if (early) {
      delete early.__early;
      delete early.__tap;
    }
    for (const b of doc.querySelectorAll('[data-mood][aria-busy]')) b.removeAttribute('aria-busy');
    for (const d of doc.querySelectorAll('.wait-dots')) d.remove();
    if (link) applyDeepLink(link);
    const rec = nav.initial.view !== 'home' ? store.readSession() : null;
    if (nav.initial.view === 'cards' && rec) {
      // The same mood again: its 3 cards if they were shown (no rotation), else asked again — a reload during
      // loading or on a failure notice (e.g. after turning location on) gets that mood, never an older one.
      dispatch({ type: 'restore', rec });
      request('show');
    } else if (nav.initial.view === 'saved') {
      if (rec) dispatch({ type: 'restore', rec });
      dispatch({ type: 'openSaved', restored: true });
      request('show');
    } else if (nav.initial.view === 'cards') {
      // A results entry with nothing to show for it (no session record: storage blocked or cleared): go
      // back past it, so the phone's back button never has an empty entry to swallow.
      nav.back(HOME);
    } else if (link?.mood) {
      onMood(link.mood);
    } else if (earlyTap && BUTTONS.includes(earlyTap as Button)) {
      onMood(earlyTap as Button);
    }
  });
  // The first draw, with the date and the time of day (tick); 비 소식 is asked with it (drawn), for the basis the mount
  // settled on. With deps.yieldToMain it comes a turn later: the mount above and its draw are then two tasks, each
  // short of a long one (audit 2026-10-15); input in between is handled at once and drawn with it.
  // 시작 화면 (ADR-0096): index.html drew it; the app answers its buttons and, with location already allowed, reads it
  let startOpen = starting;
  // its two counts (specs/busan.md 7, plans/busan.md 결과 생성 표): start_view once the cover has been up a second
  // (index.html draws it before the first paint, so from that paint; without paint timing, from this mount), never under a
  // webdriver; start_done when it is left, only after a start_view — so done ÷ view is one population. No position, no
  // place: the day, and how / why / the destination.
  const perf = starting ? win?.performance : undefined;
  const startAt = perf ? (perf.getEntriesByName?.('first-paint')[0]?.startTime ?? perf.now()) : 0;
  const startUp = () => (perf ? perf.now() - startAt : -1);
  let startSeen = false;
  function seeStart(): boolean {
    if (startSeen || !BUSAN || nav0?.webdriver || startUp() < 1000) return startSeen;
    startSeen = true;
    countStart({ e: 'start_view', d: state.today });
    return true;
  }
  function countStart(ev: UsageEvent) {
    tracker.track(ev);
    if (state.tracking) deps.analytics?.event(ev);
  }
  if (starting && startUp() >= 0) later(Math.max(0, 1020 - startUp()), () => startOpen && seeStart());
  if (starting)
    startScreen()!(doc, {
      geo: deps,
      signal,
      choose(d, how, why, point, sgg) {
        startOpen = false;
        if (seeStart()) countStart({ e: 'start_done', how, why: why ?? 'none', dest: d, d: state.today });
        // the 자동 지역 (강원, ADR-0102 Amendment 2): the 시군구 picked, or the one the position is in
        switchDest(d, { basis: 'gps', sgg: d === 'nation' ? (sgg ?? (point ? sggOf(point) : null)) : DEST[d].sgg ? (sgg ?? (point ? (areaOfPoint(point, d).name as SggCode) : null)) : undefined });
        // 거절 뒤에 골랐다면 라벨은 지금처럼 지역 고르기 (spec 1.2)
        if (why === 'denied') dispatch({ type: 'permission', permission: 'denied' });
        if (how === 'gps' && point) dispatch({ type: 'homeFix', point });
        warm();
        // the cover went with the button that had the focus: the first mood takes it
        doc.querySelector<HTMLElement>('[data-mood]')?.focus({ preventScroll: true });
      },
    });
  const firstDraw = () => {
    held = false;
    if (signal.aborted) return;
    batch(() => {
      tick();
      unrendered = true;
    });
    checkPermission();
    // Warm the data so the first tap is fast (what it brings is handled by the source's onLoad above). Under the 시작
    // 화면 too: the Jeju home drawn under it is whole (what a crawler renders), and the worker precaches that list on
    // every device anyway (ADR-0093 Amendment 8, plan m3 (가)).
    warm();
  };
  if (deps.yieldToMain) void deps.yieldToMain().then(firstDraw);
  else firstDraw();
  // the cover went without its module (fellBack): 「내 위치로 시작하기」 pressed on it is a position read now (a Busan one
  // asks for the part again, main.ts locate, and moves there); 「부산」 pressed asks for the part again
  if (pressedGps) later(0, () => locateHome(true));
  if (pressedDest) void loadBusan().then((ok) => ok && !signal.aborted && switchDest(pressedDest, { basis: 'gps' }));

  return {
    destroy: () => ac.abort(),
    state: () => state,
    unsaved: () => state.keep.restore?.k === 'ask' || (state.overlay === 'feedback' && [...els.sheet.querySelectorAll('textarea')].some((t) => t.value.trim() !== '')),
  };
}
