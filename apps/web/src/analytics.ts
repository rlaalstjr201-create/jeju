// GA4 and 네이버 애널리틱스 (ADR-0078): their scripts are added after the page's `load`, and only while 기록 is on.
// 기록 끄기 before that: nothing is loaded. Turned off later: GA4 is told to stop (`ga-disable-<ID>`) and no
// event goes to either. Only the mood, the place id and plain context go to GA4 — never a position.
import type { UsageEvent } from './track';

export interface AnalyticsIds {
  /** GA4 measurement ID (VITE_GA4_ID). */
  ga4?: string;
  /** 네이버 애널리틱스 site id, wcs_add.wa (VITE_NAVER_WA). */
  naverWa?: string;
}

export interface Analytics {
  /** a usage event, mirrored to GA4 when it is one of mood / shown / map / save / the saved list opened or arranged. */
  event(ev: UsageEvent): void;
  /** the 기록 끄기 setting (called at start with the stored value, then on every change). */
  setEnabled(on: boolean): void;
}

type Gtag = (...args: unknown[]) => void;
type Win = Window & Record<string, unknown> & { dataLayer?: unknown[] };

/** GA4 event names for our events; the rest stay ours only. public/privacy.html names each (tests/deploy.test.ts). */
// shown goes too, so 철 cards can be compared with the rest (ADR-0080 8)
// the saved list opened and arranged (ADR-0085)
export const GA_NAME: Partial<Record<UsageEvent['e'], string>> = {
  tap: 'mood_tap',
  shown: 'card_shown',
  map: 'map_open',
  save: 'place_save',
  open: 'saved_open',
  arrange: 'saved_arrange',
};

/** The fields GA4 gets: no area name, no day, nothing positional. public/privacy.html names each (tests/deploy.test.ts). */
export function gaParams(ev: UsageEvent): Record<string, string | number | boolean> {
  const p: Record<string, string | number | boolean> = {};
  if (ev.id) p.place_id = ev.id;
  if (ev.mood) p.mood = ev.mood;
  if (ev.sub) p.sub = ev.sub;
  if (ev.range) p.range = ev.range;
  if (ev.basis) p.basis = ev.basis;
  if (ev.dated !== undefined) p.dated = ev.dated;
  if (ev.season) p.season = ev.season;
  if (ev.from) p.from = ev.from;
  if (ev.age !== undefined) p.age = ev.age;
  if (ev.past) p.past = ev.past;
  if (ev.live0) p.live0 = ev.live0;
  if (ev.op) p.op = ev.op;
  return p;
}

/** Our own dev servers and previews: counted nowhere, so 방문 통계 holds real visitors only. */
export function isLocalHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname.endsWith('.localhost');
}

export function createAnalytics(win: Window, ids: AnalyticsIds): Analytics | null {
  const ga = ids.ga4?.trim();
  const wa = ids.naverWa?.trim();
  if (!ga && !wa) return null;
  const w = win as Win;
  const doc = win.document;
  let on = false;
  let loaded = doc.readyState === 'complete';
  let added = false;
  const script = (src: string, onload?: () => void) => {
    const s = doc.createElement('script');
    s.async = true;
    s.src = src;
    if (onload) s.onload = onload;
    doc.head.appendChild(s);
  };
  function add() {
    if (added || !on || !loaded) return;
    added = true;
    if (ga) {
      // gtag.js reads the `arguments` object itself, not an array
      const gtag: Gtag = function () {
        // eslint-disable-next-line prefer-rest-params
        (w.dataLayer ??= []).push(arguments);
      };
      w.gtag = gtag;
      gtag('js', new Date());
      gtag('config', ga, {
        // never the query: a 숙소 링크's position and tag (ADR-0089 3) stay out whatever ran first
        page_location: `${win.location.origin}${win.location.pathname}`,
        allow_google_signals: false,
        allow_ad_personalization_signals: false,
      });
      script(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ga)}`);
    }
    if (wa) {
      w.wcs_add = { wa };
      script('https://wcs.pstatic.net/wcslog.js', () => {
        const wcs = w.wcs as { inflow?: (d?: string) => void } | undefined;
        try {
          wcs?.inflow?.(win.location.hostname);
          (w.wcs_do as (() => void) | undefined)?.();
        } catch {
          /* the app never depends on it */
        }
      });
    }
  }
  if (!loaded) win.addEventListener('load', () => ((loaded = true), add()), { once: true });
  return {
    event(ev) {
      const name = GA_NAME[ev.e];
      if (!on || !added || !ga || !name || typeof w.gtag !== 'function') return;
      (w.gtag as Gtag)('event', name, gaParams(ev));
    },
    setEnabled(next) {
      on = next;
      if (ga) w[`ga-disable-${ga}`] = !on;
      add();
    },
  };
}
