import './style.css';
import { createAnalytics, isLocalHost } from './analytics';
import { LocateError, mountApp, type Deps } from './app';
import { DEST, type Dest } from './dest';
import type { GeoPermission } from './effects';
import type { Point } from './pick';
import { BUSAN, NATION, loadBusan, loadNation, nationSpots, outsideAt, releasedDestOf } from './release';
import { reloadOnUpdate, runsCachedCode } from './update';
import { yieldToMain } from './yield';

function locate(): Promise<Point> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new LocateError('unavailable'));
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const p = { lat: coords.latitude, lng: coords.longitude };
        // inside a destination open in this build (plans/busan.md: with the switch off, Jeju only — as before). Outside
        // Jeju with the switch on, Busan's part (its boundary) is asked for first (src/release.ts) — the 자동 지역's with it
        // where that is on (plans/nationwide-app.md 9: a position outside Jeju and Busan).
        if (releasedDestOf(p)) resolve(p);
        // (where it is, for the words: outside Korea only by nation.ts inKorea — predeploy review M-1)
        else if (BUSAN) void (NATION ? loadNation() : loadBusan()).then(() => (releasedDestOf(p) ? resolve(p) : reject(new LocateError('outside', outsideAt(p)))));
        else reject(new LocateError('outside'));
      },
      (err) => reject(new LocateError(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable')),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 10 * 60 * 1000 },
    );
  });
}

/** Lets a known "denied" skip the GPS call entirely (S07). Unknown on browsers without the API. */
async function geoPermission(): Promise<GeoPermission> {
  try {
    const s = await navigator.permissions?.query({ name: 'geolocation' as PermissionName });
    return (s?.state as GeoPermission | undefined) ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

function storageOf(name: 'localStorage' | 'sessionStorage'): Storage | null {
  try {
    return window[name];
  } catch {
    return null; // blocked (private mode, sandbox) — the app keeps state in memory for this visit
  }
}

/** '/' (vite.config.ts): absolute, so a page served at any address finds its files (ADR-0063). */
const BASE = import.meta.env.BASE_URL;
/** Each destination's place list (plans/busan.md): Jeju's address and version as before; Busan's is fetched only on a
 * Busan visit; 강원's on a 강원 visit (ADR-0102). */
const spotsUrl = (dest: Dest) => (BUSAN && dest !== 'jeju' ? `${BASE}${DEST[dest].file}?v=${dest === 'gangwon' ? __GANGWON_V__ : __BUSAN_V__}` : `${BASE}spots.json?v=${__SPOTS_V__}`);

/** Ask the browser to keep this site's storage (ADR-0063 2a): no prompt of ours; Chrome and Safari decide by
 * themselves, and a "no" changes nothing. */
async function persist(): Promise<void> {
  const s = navigator.storage;
  if (!s?.persist || (await s.persisted?.())) return;
  await s.persist();
}

/** After the first screen has been painted: the browser's paint entry (already there on a later load such as
 * 다시 불러오기, buffered), or the next frame (a task after requestAnimationFrame) where paint timing is missing; a
 * hidden tab, where frames stop, goes on after 100 ms instead. */
function afterPaint(): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    let seen: PerformanceObserver | undefined;
    const go = () => {
      if (done) return;
      done = true;
      seen?.disconnect();
      resolve();
    };
    try {
      seen = new PerformanceObserver((list) => {
        if (list.getEntries().length) go();
      });
      seen.observe({ type: 'paint', buffered: true });
    } catch {
      /* no paint timing: the frame below */
    }
    requestAnimationFrame(() => setTimeout(go, 0));
    setTimeout(go, 100);
  });
}

/** The first download of the place list, settled either way: the service worker is registered after it (below), so
 * its precache takes the list from the HTTP cache instead of downloading the 1.2MB a second time — the page no
 * longer preloads it, so `load` can come before the list is in (audit 2026-10-16). */
let listSettled: () => void = () => undefined;
const listIn = new Promise<void>((resolve) => (listSettled = resolve));

/** ADR-0093: another language than Korean (chosen by index.html's first script) — its words, a chunk of their own
 * that a Korean visit never loads, go in before the app mounts, and its place texts before the list is used. A
 * failure leaves the app in Korean. */
type Words = { applyWords: (doc: Document, places: Promise<unknown>) => Promise<void>; addPlaces: (places: Promise<unknown>) => Promise<void> };
const WORDS: Record<string, () => Promise<Words>> = {
  en: () => import('./i18n/en'),
  'zh-Hans': () => import('./i18n/zh-Hans'),
  ja: () => import('./i18n/ja'),
};
let placesIn: Promise<void> = Promise.resolve();
/** the language's module once in: it also takes Busan's place texts (ADR-0093 Amendment 9) */
let inLang: Words | null = null;
const json = (url: string): Promise<unknown> =>
  fetch(url)
    .then((r) => (r.ok ? (r.json() as Promise<unknown>) : null))
    .catch(() => null);
/** `p`, or a rejection after `ms`: a weak connection never holds the app back. */
const within = <T>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<never>((_, no) => setTimeout(() => no(new Error('timeout')), ms))]);
/** The words in 4 s at most (from the service worker's cache on a device that has used them, at once): else the app
 * opens in Korean — the home's last line has each language's own name to try again. The place texts were asked for by
 * index.html's early script (`__places`), else here. */
function words(lang: string): Promise<void> {
  const early = (window as { __places?: Promise<Response | undefined> }).__places;
  const places = (early ?? fetch(`${BASE}i18n/places.${lang}.json?v=${__PLACES_V__}`))
    .then((r) => (r?.ok ? (r.json() as Promise<unknown>) : null))
    .catch(() => null);
  return within(WORDS[lang](), 4000)
    .then(
      (m) => void ((inLang = m), (placesIn = m.applyWords(document, places))),
      () => void (document.documentElement.lang = 'ko'),
    )
    .finally(() => document.documentElement.classList.remove('l10n'));
}
const LANG = document.documentElement.lang;
// back to a page kept from before a language switch (bfcache): it is in the old language, so it is loaded again
window.addEventListener('pageshow', (e) => {
  if (!e.persisted) return;
  try {
    const kept = localStorage.getItem('lang');
    if (kept && kept !== (document.documentElement.lang || 'ko')) location.reload();
  } catch {
    /* no storage: the page stays as it is */
  }
});

const deps: Deps = {
  // Versioned URL: a returning user's old service worker can never pair new code with old data (S26).
  // The text, then the parse only once the first screen has been painted: json() on the whole 1.2MB was one long
  // task (audit 2026-10-15), and a list that came in before the first paint held that paint back (audit 2026-10-16).
  loadSpots: (dest, sgg) => {
    // the 자동 지역: a 시군구's files, through its part (plans/nationwide-app.md 2)
    if (NATION && dest === 'nation') return nationSpots(sgg ?? '').finally(listSettled);
    // Busan in another language: its place texts, asked for with its list (ADR-0093 Amendment 9)
    const lang = document.documentElement.lang;
    const more = BUSAN && dest === 'busan' && inLang ? inLang.addPlaces(json(`${BASE}i18n/places-busan.${lang}.json?v=${__BUSAN_PLACES_V__}`)) : null;
    return fetch(spotsUrl(dest))
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        const text = await r.text();
        listSettled();
        await afterPaint();
        const raw = JSON.parse(text) as unknown;
        // the place texts if they come within 3 s more; later ones are used from the next draw on
        await within(Promise.all([placesIn, more]), 3000).catch(() => undefined);
        return raw;
      })
      .catch((e: unknown) => {
        listSettled();
        throw e;
      });
  },
  locate,
  geoPermission,
  storage: storageOf('localStorage'),
  session: storageOf('sessionStorage'),
  // Anonymous usage counts (ADR-0061): only when the build names a collection address.
  eventsUrl: import.meta.env.VITE_EVENTS_URL,
  // GA4 · 네이버 애널리틱스 (ADR-0078): added after load, only while 기록 is on
  analytics: isLocalHost(window.location.hostname) ? null : createAnalytics(window, { ga4: import.meta.env.VITE_GA4_ID, naverWa: import.meta.env.VITE_NAVER_WA }),
  persist,
  // 비 소식 (ADR-0076): the area's name only, to this site's own function
  fetch: (url, init) => fetch(url, init),
  // 의견 보내기 (ADR-0081): only when the user presses 보내기; the answers and the version, to this site's own function
  postFeedback: (body) =>
    void fetch(`${BASE}api/feedback`, { method: 'POST', headers: { 'content-type': 'application/json' }, body, credentials: 'omit', keepalive: true }).catch(() => undefined),
  appVersion: __APP_V__,
  yieldToMain,
};

/** The app mounts in a task of its own, right after the page's parsing task: mounted inside it, all its first draw
 * changed was laid out by the browser's end-of-parsing step in that same task (audit 2026-10-15, the first load's
 * long tasks). A mood tapped before then is kept by index.html's inline script and carried out at mount. */
function start() {
  const app = mountApp(document, deps);
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    reloadOnUpdate({
      sw: navigator.serviceWorker,
      doc: document,
      idle: () => {
        const s = app.state();
        return s.view === 'home' && !s.overlay && s.phase.k !== 'pending';
      },
      hold: () => app.unsaved(),
      current: () => runsCachedCode(document, 'caches' in window ? caches : undefined, new URL(import.meta.url).href),
      reload: () => location.reload(),
    });
  }
}
/** With the switch on, Busan's part goes in before the mount where Busan is in play from the start (src/release.ts): the
 * 시작 화면 is up, or index.html's first script decided Busan (a link, the device's choice). A failure (offline, 4 s)
 * mounts Jeju. Anywhere else it is asked for only once Busan is chosen. */
const busanFirst = (): Promise<unknown> =>
  BUSAN && (document.documentElement.classList.contains('yc-start') || (window as { __dest?: unknown }).__dest === 'busan')
    ? within(loadBusan(), 4000).catch(() => undefined)
    : Promise.resolve();
/** The 자동 지역's part (and its index) before the mount where it may be in play from the start (plans/nationwide-app.md 9):
 * the 시작 화면 is up, the device chose it, or a link names it — or 강원, which opens with it (ADR-0102). A failure
 * (offline, 4 s) mounts Jeju. */
const nationFirst = (): Promise<unknown> =>
  NATION &&
  (document.documentElement.classList.contains('yc-start') ||
    ['nation', 'gangwon'].includes((window as { __dest?: string }).__dest ?? '') ||
    /[?&]dest=(?:nation|gangwon)(?:[&#]|$)/.test(location.search))
    ? within(loadNation(), 4000).catch(() => undefined)
    : Promise.resolve();
void (
  BUSAN ? Promise.all([WORDS[LANG] ? words(LANG) : null, busanFirst(), nationFirst()]).then(yieldToMain) : WORDS[LANG] ? words(LANG).then(yieldToMain) : yieldToMain()
).then(start);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  // after load and after the app's own download of the list (listIn), or 10 s at most if that never settles
  window.addEventListener('load', () => {
    void Promise.race([listIn, new Promise<void>((resolve) => setTimeout(resolve, 10_000))]).then(() =>
      navigator.serviceWorker
        .register(`${BASE}sw.js`)
        .then((reg) => {
          // ADR-0093: this device uses another language — the worker keeps its files for offline and after a deploy
          const lang = document.documentElement.lang;
          if (WORDS[lang]) void navigator.serviceWorker.ready.then((r) => r.active?.postMessage({ type: 'lang', lang }));
          // A home-screen app that stays resident never navigates, so it would never look for a new
          // deploy. Check when it comes back to the foreground (at most once a minute).
          let last = Date.now();
          document.addEventListener('visibilitychange', () => {
            if (document.visibilityState !== 'visible' || Date.now() - last < 60_000) return;
            last = Date.now();
            reg.update().catch(() => undefined);
          });
        })
        .catch(() => undefined),
    );
  });
}
