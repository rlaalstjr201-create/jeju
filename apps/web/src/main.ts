import './style.css';
import { createAnalytics, isLocalHost } from './analytics';
import { LocateError, inJeju, mountApp, type Deps } from './app';
import type { GeoPermission } from './effects';
import type { Point } from './pick';
import { reloadOnUpdate, runsCachedCode } from './update';
import { yieldToMain } from './yield';

function locate(): Promise<Point> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new LocateError('unavailable'));
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const p = { lat: coords.latitude, lng: coords.longitude };
        if (inJeju(p)) resolve(p);
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
const WORDS: Record<string, () => Promise<{ applyWords: (doc: Document, places: Promise<unknown>) => Promise<void> }>> = {
  en: () => import('./i18n/en'),
  'zh-Hans': () => import('./i18n/zh-Hans'),
  ja: () => import('./i18n/ja'),
};
let placesIn: Promise<void> = Promise.resolve();
function words(lang: string): Promise<void> {
  const places = fetch(`${BASE}i18n/places.${lang}.json?v=${__PLACES_V__}`)
    .then((r) => (r.ok ? (r.json() as Promise<unknown>) : null))
    .catch(() => null);
  return WORDS[lang]()
    .then(
      (m) => void (placesIn = m.applyWords(document, places)),
      () => void (document.documentElement.lang = 'ko'),
    )
    .finally(() => document.documentElement.classList.remove('l10n'));
}
const LANG = document.documentElement.lang;

const deps: Deps = {
  // Versioned URL: a returning user's old service worker can never pair new code with old data (S26).
  // The text, then the parse only once the first screen has been painted: json() on the whole 1.2MB was one long
  // task (audit 2026-10-15), and a list that came in before the first paint held that paint back (audit 2026-10-16).
  loadSpots: () =>
    fetch(`${BASE}spots.json?v=${__SPOTS_V__}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        const text = await r.text();
        listSettled();
        await afterPaint();
        const raw = JSON.parse(text) as unknown;
        await placesIn;
        return raw;
      })
      .catch((e: unknown) => {
        listSettled();
        throw e;
      }),
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
void (WORDS[LANG] ? words(LANG).then(yieldToMain) : yieldToMain()).then(start);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  // after load and after the app's own download of the list (listIn), or 10 s at most if that never settles
  window.addEventListener('load', () => {
    void Promise.race([listIn, new Promise<void>((resolve) => setTimeout(resolve, 10_000))]).then(() =>
      navigator.serviceWorker
        .register(`${BASE}sw.js`)
        .then((reg) => {
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
