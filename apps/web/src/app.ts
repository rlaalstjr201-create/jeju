// One screen: 5 mood buttons (static HTML, ADR-0028) + basis toggle → 3 cards (spec, plan OQ3·5; design/SPEC.md).
// Controller only: user intents → reduce(state) → render(state); effects (GPS, data, storage, history)
// report back with a request id and stale results are dropped. See design/qa/scenarios.md for the cases.
import { AREAS, areaByName, inJeju, nearestArea, type AreaName } from './areas';
import { createSpotSource } from './data';
import { DAYS_AHEAD, addDays, dayOf, isDay, msToNextDay, type Day } from './dates';
import { readDeepLink, type DeepLink } from './deeplink';
import { LocateError, fetchRain, locateGps, resolveOrigin, type Fetch, type GeoDeps, type OriginResult } from './effects';
import { BACKUP_HASH, appHome, backupUrl, copyText, inAppOf, installHow, readBackup } from './keep';
import { MAP_APPS, kakaoUrl, type MapApp } from './links';
import { HOME, createNav } from './nav';
import { REACHES, type Button, type Reach, type Tab } from './pick';
import { createRenderer, dateLabel, findEls } from './render';
import { basisIsCurrent, cardsValid, hasSaved, initialState, moodIntent, rainArea, reduce, sessionOf, spotIndex, staticOrigin, whenDay, type Action, type Intent, type Keep, type State } from './state';
import { KEYS, RAIN_TTL_MS, createStore } from './store';
import type { Analytics } from './analytics';
import { contextOf, createTracker, type EventName } from './track';
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
}
export const DELAYS: Delays = { slow: 300, long: 3000, guard: 400, settle: 1000, quiet: 300, dataTimeout: 10000 };

export interface Deps extends GeoDeps {
  loadSpots(): Promise<unknown>;
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
}

/** The browser's install prompt (Chrome, Edge, Samsung Internet): not in the DOM typings. */
interface InstallPrompt extends Event {
  prompt(): Promise<unknown>;
}

export interface App {
  destroy(): void;
  state(): State;
}

const CARDS: Route = { view: 'cards', overlay: null };
const SAVED: Route = { view: 'saved', overlay: null };
/** Stopped waiting for GPS (saved list only): nothing is known about the position, nothing failed. */
const GAVE_UP = { ok: false, why: 'unavailable', gaveUp: true } as const;
type GaveUp = typeof GAVE_UP;
const BUTTONS: readonly Button[] = ['rest', 'walk', 'new', 'food', 'any'];

/** index.html's inline script: the mood tapped before this module ran (a slow first visit). */
interface EarlyTap {
  __early?: EventListener;
  __tap?: string;
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
  const data = createSpotSource(deps.loadSpots, delays.dataTimeout, (spots) => {
    dispatch({ type: 'spots', spots });
    retryFailedLoad();
  });
  const renderer = createRenderer(doc, els);
  const clockNow = () => deps.today?.() ?? new Date();
  const today0 = dayOf(clockNow());
  const loaded = store.load(today0);
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
  let state = initialState({ ...loaded, today: today0, offline: !online(), keep: keep0 });
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
    renderer.render(state);
    countShown();
    askRain();
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
      // a failed ask after an expired answer must not leave the old rain row up for hours
      if (rain === null) return void (state.rain?.area === area && state.rain.rain && dispatch({ type: 'rain', area, rain: false }));
      store.writeRain({ v: 1, area, at, rain });
      dispatch({ type: 'rain', area, rain });
    });
  }

  // --- anonymous usage counts (ADR-0061): place-level events, never a position ---
  /** `day`: the day a heart is about (dated = not today). */
  function count(e: EventName, id?: string, day?: Day) {
    const ev = { e, ...(id ? { id } : {}), ...contextOf(state), ...(day ? { dated: day !== state.today } : {}) };
    tracker.track(ev);
    if (state.tracking) deps.analytics?.event(ev);
  }
  /** Each new set of 3 on screen, once: a re-render, the same 3 brought back or restored after a reload are
   * not shown again. */
  let shownSeq = 0;
  function countShown() {
    const c = state.cards;
    if (!c || c.seq === shownSeq || state.view !== 'cards' || state.phase.k !== 'ready') return;
    shownSeq = c.seq;
    if (c.how === 'restore') return;
    for (const card of c.list) count('shown', card.spot.id);
  }
  /** A link tapped twice (a 2nd tab opening) counts once. */
  const lastLink = new Map<string, number>();
  function countLink(e: 'map' | 'book', id: string) {
    const key = `${e}:${id}`;
    const t = now();
    const prev = lastLink.get(key);
    lastLink.set(key, t);
    if (prev === undefined || t - prev >= delays.guard) count(e, id);
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
    dispatch({ type: 'request', req, intent, step: fixed ? 'loading' : 'locating' });
    remember();
    reqTimers.push(later(delays.slow, () => dispatch({ type: 'slow', req })));
    if (!fixed) reqTimers.push(later(delays.long, () => dispatch({ type: 'long', req })));
    // GPS and data start together; the data promise is shared and memoized only on success (S24).
    const spotsP = data.get();
    spotsP.catch(() => undefined);
    let originP: Promise<OriginResult | GaveUp> = kept ? Promise.resolve({ ok: true, origin: kept }) : resolveOrigin(state.basis, state.region, state.stay, deps);
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
        dispatch({ type: 'noOrigin', req, why: o.why });
        return;
      }
      // Saved list without a position is still shown, in saved order — never a dead end.
      if (!fixed) dispatch({ type: 'located', req, why: o.ok || o === GAVE_UP ? undefined : o.why, unknown: o === GAVE_UP });
      let spots;
      try {
        spots = await spotsP;
      } catch {
        if (req !== reqSeq) return;
        clearReqTimers();
        dispatch({ type: 'loadError', req, offline: !online() });
        return;
      }
      if (req !== reqSeq) return;
      clearReqTimers();
      dispatch({ type: 'resolved', req, origin: o.ok ? o.origin : null, spots });
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
  const nav = createNav(win, { signal, settleMs: delays.settle, onRoute: applyRoute });
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
    if (r.overlay === 'move' && state.overlay !== 'move') nav.back({ view: state.view, overlay: null });
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
    if (b.entries) dispatch({ type: 'keep', keep: { restore: { k: 'ask', entries: b.entries } } });
    // 비 와요 rode along (ADR-0065): this session starts with it on
    if (b.indoor) setIndoor(true);
    // so did a map app other than 네이버지도 (ADR-0071)
    if (b.mapApp) setMapApp(b.mapApp);
  }
  /** A deep link (`/?mood=…&area=…`, ADR-0067): read once, and the query goes from the address at once (like
   * `#s=`), so a reload, back or forward follows the usual rules. Applied only on a fresh first-screen entry. */
  function takeDeepLink(apply: boolean): DeepLink | null {
    const loc = win?.location;
    if (!loc?.search) return null;
    const link = readDeepLink(loc.search, state.today);
    try {
      win!.history.replaceState(win!.history.state, '', loc.pathname + loc.hash);
    } catch {
      /* sandboxed */
    }
    return apply ? link : null;
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
  }
  function mergeBackup() {
    const r = state.keep.restore;
    if (r?.k !== 'ask') return;
    // places this data no longer has are left behind (once the data is in)
    const idx = state.spots ? spotIndex(state.spots) : null;
    const { entries, added } = store.mergeSaved(idx ? r.entries.filter((e) => idx.has(e.id)) : r.entries);
    dispatch({ type: 'saved', entries });
    dispatch({ type: 'keep', keep: { restore: { k: 'done', added } } });
    if (added) askPersist();
  }
  async function backup() {
    const entries = store.saved();
    if (!entries.length) return;
    const ok = await copy(backupUrl(home(), entries, state.indoor, state.mapApp));
    if (!signal.aborted && state.view === 'saved') dispatch({ type: 'keep', keep: { backup: ok ? 'copied' : 'failed' } });
  }
  /** Outside KakaoTalk (its own link does it): the address, with what is saved here, onto the clipboard. */
  async function inappCopy() {
    const ok = await copy(state.saved.length ? backupUrl(home(), state.saved, state.indoor, state.mapApp) : home());
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
  function onMood(b: Button) {
    // The mood buttons live on the first screen; from the results they are reached only programmatically
    // (tests), from the saved list not at all (hidden, and 돌아가기 comes first).
    if (state.overlay || state.view === 'saved' || guarded(`mood:${b}`)) return;
    const intent = moodIntent(state, b);
    if (!intent) return;
    const from = state.view;
    if (from === 'home') hush();
    // a merge already answered has said its piece
    if (state.keep.restore?.k === 'done') dispatch({ type: 'keep', keep: { restore: null } });
    dispatch({ type: 'mood', button: b });
    count('tap');
    if (from === 'home') nav.push(CARDS);
    request(intent);
  }

  function onMore() {
    if (guarded('more') || state.view !== 'cards' || state.phase.k !== 'ready') return;
    hush();
    request('more');
  }

  /** 바꾸기: back to the moods (the results entry is popped, so phone back never lands on it again). */
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
    dispatch({ type: 'sub', sub });
    request('show');
  }

  function openSaved() {
    hush();
    dispatch({ type: 'openSaved' });
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
  function openOverlay(kind: 'basis' | 'stay' | 'move') {
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

  function changeBasis(next: { basis: Basis; region?: AreaName; stay?: Stay }) {
    dispatch({ type: 'basis', ...next });
    store.setBasis(next.basis);
    if (next.region) store.setRegion(next.region);
    if (next.stay) store.setStay(next.stay);
    closeOverlay();
    // A new request also abandons any GPS request still in flight (S37·S38).
    if (state.view === 'home') abortRequest();
    else request('show');
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
      if (!r.ok) dispatch({ type: 'stayForm', pending: false, error: r.why });
      else changeBasis({ basis: 'stay', stay: { ...r.point, area: nearestArea(r.point).name, source: 'gps' } });
    });
  }

  /** `day`: a saved-list row's heart (that day); a card's heart is about the day chosen now (지금 = today). */
  function onHeart(id: string, day?: Day) {
    tick(); // past midnight with the timer asleep: the heart goes to the real today
    const date = day ?? whenDay(state);
    // putting back a row taken out in this visit: where it was
    const out = day ? state.unsaved.find((e) => e.id === id && e.date === day) : undefined;
    const { entries, added, removed } = store.toggleSaved(id, date, out?.order);
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

  /** 언제 in the basis sheet: applied at once (label, hearts), the sheet stays open for 어디. No request:
   * the cards do not depend on the day (ADR-0027). */
  function setWhen(w: When) {
    const when: When = w === 'now' || !isDay(w) || w <= state.today ? 'now' : w;
    if (when === state.when) return;
    dispatch({ type: 'when', when });
    store.setWhen(when);
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
  }
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
    }
    closeOverlay();
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
    if (action === 'stay-here') return stayHere();
    const basis = b.dataset.basis;
    if (basis === 'gps') return basisIsCurrent(state, 'gps') ? closeOverlay() : changeBasis({ basis: 'gps' });
    if (basis === 'stay') {
      if (!state.stay) return openOverlay('stay');
      return basisIsCurrent(state, 'stay') ? closeOverlay() : changeBasis({ basis: 'stay' });
    }
    const area = areaByName(b.dataset.area);
    if (!area) return;
    if (b.dataset.where === 'stay') return changeBasis({ basis: 'stay', stay: { lat: area.lat, lng: area.lng, area: area.name, source: 'area' } });
    return basisIsCurrent(state, 'region', area.name) ? closeOverlay() : changeBasis({ basis: 'region', region: area.name });
  }

  function onMainButton(b: HTMLButtonElement) {
    const keepAct = b.dataset.action ? KEEP_ACTIONS[b.dataset.action] : undefined;
    if (keepAct) return guarded(`keep:${b.dataset.action}`) ? undefined : keepAct();
    if (b.dataset.mood) return onMood(b.dataset.mood as Button);
    if (b.dataset.sub) return onSub(b.dataset.sub as Tab);
    if (b.classList.contains('heart') && b.dataset.id) return onHeart(b.dataset.id, b.dataset.date);
    const action = b.dataset.action;
    if (state.view === 'saved' && b.dataset.id && b.dataset.date) {
      if (action === 'up' || action === 'down') return moveRow(b.dataset.id, b.dataset.date, action === 'up' ? -1 : 1);
      if (action === 'move-day') return openMove(b.dataset.id, b.dataset.date);
    }
    if (action === 'past') {
      if (!guarded('past') && state.view === 'saved') {
        hush(); // the days gone by open under the finger
        dispatch({ type: 'pastOpen', open: !state.pastOpen });
      }
      return;
    }
    // 비 소식 on 오늘 판: 실내만 on (실내만 볼까요?) or off again (모두 보기) — the same switch as the sheet's (ADR-0065)
    if (action === 'rain-indoor' || action === 'rain-all') {
      if (!guarded('indoor')) setIndoor(action === 'rain-indoor');
      return;
    }
    if (action === 'more') return onMore();
    if (action === 'change') return onChange();
    if (action === 'choose-area') return openOverlay('basis');
    if (action === 'retry') {
      if (!guarded('retry')) {
        hush(); // the cards replace the notice under the finger
        request('show');
      }
      return;
    }
    if (action === 'close-saved') {
      if (!guarded('close-saved') && state.view === 'saved') closeSaved();
      return;
    }
    if (action === 'track') {
      if (!guarded('track')) setTracking(!state.tracking);
      return;
    }
    if (action === 'map-app') {
      const app = b.dataset.app as MapApp;
      if (MAP_APPS.includes(app) && !guarded(`map-app:${app}`)) setMapApp(app);
      return;
    }
    const area = areaByName(b.dataset.area);
    if (area && !guarded(`area:${area.name}`)) {
      hush();
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
    const id = a && els.main.contains(a) ? a.closest<HTMLElement>('.card[data-id]')?.dataset.id : undefined;
    if (!a || !id) return;
    // 길찾기 (ADR-0067) leaves for the map app too: the same event
    if (a.classList.contains('card-link') || a.classList.contains('go')) countLink('map', id);
    else if (a.classList.contains('book')) countLink('book', id);
  });
  // 오늘 판's market row (ADR-0075): down to 오늘 장 서는 곳 without touching the address or history (home stays depth 0)
  on(els.main, 'click', (e) => {
    const a = (e.target as Element | null)?.closest?.('a[data-action="to-market"]');
    if (!a) return;
    e.preventDefault(); // never the #market jump: it would push a history entry (home stays depth 0)
    if (state.overlay) return;
    const head = doc.getElementById('market-h');
    if (!head) return;
    if (typeof head.scrollIntoView === 'function') head.scrollIntoView({ block: 'start' });
    head.focus({ preventScroll: true });
  });
  on(els.basis, 'click', () => {
    if (!state.overlay && !guarded('basis')) openOverlay('basis');
  });
  on(els.saved, 'click', () => {
    if (state.overlay || guarded('saved')) return;
    if (state.view === 'saved') closeSaved();
    else openSaved();
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
      k.preventDefault();
      closeOverlay();
    } else if (k.key === 'Tab') {
      // Focus stays inside the sheet (inert covers modern browsers; this covers the rest, S58).
      const f = [...els.sheet.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([tabindex="-1"])')];
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
  // Hearts saved in another tab show up here too, and are never overwritten (read-modify-write); so does 기록.
  on(win, 'storage', (e) => {
    const s = e as StorageEvent;
    if (s.storageArea && deps.storage && s.storageArea !== deps.storage) return;
    if (s.key === KEYS.savedV2 || s.key === null) dispatch({ type: 'saved', entries: store.saved() });
    if (s.key === KEYS.hint && s.newValue === 'true') dispatch({ type: 'hintSeen' });
    if (s.key === KEYS.mapApp || s.key === null) dispatch({ type: 'mapApp', app: store.mapApp() });
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
  on(doc, 'visibilitychange', () => {
    if (doc.visibilityState !== 'visible') return;
    tick();
    checkPermission();
    askRain(); // an answer may have grown old while the app was in the background
  });

  /** A new day in Jeju (the midnight timer, or back in the foreground): the date line, and a chosen day
   * that has now come or gone goes back to 지금 (D5); saves of days gone by move to 지난 날. */
  let midnight: ReturnType<typeof setTimeout> | null = null;
  function tick() {
    const now = clockNow();
    const day = dayOf(now);
    if (day !== state.today) {
      const was = state.when;
      dispatch({ type: 'today', today: day });
      if (state.when !== was) store.setWhen(state.when);
    }
    renderer.setDate(dateLabel(now));
    if (midnight) {
      clearTimeout(midnight);
      timers.delete(midnight);
    }
    midnight = later(msToNextDay(now) + 1000, tick);
  }
  function checkPermission() {
    if (!deps.geoPermission || state.basis !== 'gps') return;
    deps.geoPermission().then(
      (permission) => {
        if (signal.aborted) return;
        dispatch({ type: 'permission', permission });
        // Location turned back on in settings while the results say it is off: the label says 내 주변 again,
        // so the cards come too, instead of a notice that now contradicts it.
        const p = state.phase;
        const on = permission === 'granted' || permission === 'prompt';
        if (on && state.view === 'cards' && state.basis === 'gps' && p.k === 'noOrigin' && p.why === 'denied') request('show');
      },
      () => undefined,
    );
  }

  // --- mount: restore what this history entry was showing (S18·S54) ---
  try {
    if (win && 'scrollRestoration' in win.history) win.history.scrollRestoration = 'manual';
  } catch {
    /* sandboxed */
  }
  tick();
  renderer.render(state);
  askRain();
  takeBackup();
  checkPermission();
  // Taps on the static mood buttons before this module ran: the last one is carried out now.
  const early = win as (Window & EarlyTap) | null;
  const earlyTap = early?.__tap;
  if (early?.__early) win!.removeEventListener('click', early.__early, true);
  if (early) {
    delete early.__early;
    delete early.__tap;
  }
  const link = takeDeepLink(nav.initial.view === 'home');
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
  // Warm the data so the first tap is fast (what it brings is handled by the source's onLoad above).
  data.get().catch(() => undefined);

  return {
    destroy: () => ac.abort(),
    state: () => state,
  };
}
