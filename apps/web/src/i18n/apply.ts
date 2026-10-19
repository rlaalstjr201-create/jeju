// ADR-0093: another language's words in place of the Korean ones, before the app mounts. The Korean tables stay
// in their modules; this replaces their entries, writes the page's own words (index.html) and, once its file is
// in, the place texts. Loaded only for a language other than Korean (main.ts), never precached (vite.config.ts).
import { AREA_GROUPS, type AreaName } from '../areas';
import { DAY_TEXT, type Day } from '../dates';
import { BOOK_TEXT, GO_TEXT, MAP_APP_NAME, type MapApp } from '../links';
import { MARKET_TEXT } from '../market';
import { TRAVEL_TEXT, type Button, type Spot } from '../pick';
import { BUSAN, OPEN_AREAS } from '../release';
import { BUSAN_COPY, COPY, MOOD_LABEL, PLACE } from '../render';
import { SEASON_TEXT, type SeasonKind } from '../season';
import { FROM_TEXT } from '../state';

/** COPY's shape with its words as plain strings (the Korean table is `as const`). */
type Words<T> = { -readonly [K in keyof T]: T[K] extends string ? string : T[K] extends readonly string[] ? readonly string[] : T[K] extends (...a: infer A) => infer R ? (...a: A) => R extends string ? string : R : Words<T[K]> };

export interface Lang {
  /** the page title */
  title: string;
  copy: Words<typeof COPY>;
  /** 여행지 (ADR-0094): the switched-on build's words (render.ts BUSAN_COPY) */
  busan: Words<typeof BUSAN_COPY>;
  mood: Record<Button, string>;
  travel: typeof TRAVEL_TEXT;
  day: typeof DAY_TEXT;
  market: Words<typeof MARKET_TEXT>;
  season: Record<SeasonKind, string>;
  from: typeof FROM_TEXT;
  go: typeof GO_TEXT;
  book: typeof BOOK_TEXT;
  mapApp: Record<MapApp, string>;
  /** each 동네: its name and its landmark */
  areas: Record<AreaName, [string, string]>;
  areaGroups: Record<'jeju' | 'seogwipo', string>;
  /** index.html's own words: `selector` → its text (an element with child elements: its first words), or
   * `selector@attr` → that attribute. Every key matches in index.html (tests/i18n.test.ts). */
  page: Record<string, string>;
}

/** Dates and clock times in the phone's own format (owner, 2026-10-17): the browser's languages that are this one
 * (en-GB, en-US …; for Chinese only the Simplified ones), else the language itself, and always Korea time — a trip in
 * Jeju runs on Korea time whatever the phone is set to. The locale decides 12 or 24 hours and the date order; a web
 * page cannot read the phone's own 12/24-hour switch. */
export function localDays(lang: string, prefs: readonly string[] = typeof navigator === 'undefined' ? [] : navigator.languages ?? []): typeof DAY_TEXT {
  const mine = (p: string) => {
    const t = p.toLowerCase();
    return lang === 'zh-Hans' ? /^zh-(hans|cn|sg)/.test(t) : t.split('-')[0] === lang;
  };
  const locales = [...prefs.filter(mine), lang];
  const at = (day: Day, min: number) => new Date(Date.parse(`${day}T00:00:00+09:00`) + min * 60_000);
  const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locales, { timeZone: 'Asia/Seoul', ...o });
  const short = f({ month: 'short', day: 'numeric' });
  const long = f({ weekday: 'short', month: 'short', day: 'numeric' });
  const clock = f({ hour: 'numeric', minute: '2-digit' });
  return {
    short: (_m, _d, day) => short.format(at(day, 720)),
    long: (_m, _d, _w, day) => long.format(at(day, 720)),
    clock: (min, day) => clock.format(at(day, min)),
  };
}

function write(doc: Document, key: string, value: string) {
  const [sel, attr] = key.split('@');
  for (const e of doc.querySelectorAll(sel)) {
    if (attr) e.setAttribute(attr, value);
    else if (!e.children.length) e.textContent = value;
    else {
      const t = [...e.childNodes].find((n) => n.nodeType === 3 && n.textContent!.trim());
      if (t) t.textContent = value;
    }
  }
}

/** The place texts, by id: [name, reason] ('' = the Korean one). */
type Places = Record<string, [string, string]>;
const validPlaces = (v: unknown): v is Places => !!v && typeof v === 'object' && !Array.isArray(v);

export function apply(lang: string, w: Lang, doc: Document, places: Promise<unknown>): Promise<void> {
  Object.assign(COPY, w.copy);
  if (BUSAN) Object.assign(BUSAN_COPY, w.busan);
  Object.assign(MOOD_LABEL, w.mood);
  Object.assign(TRAVEL_TEXT, w.travel);
  Object.assign(DAY_TEXT, w.day);
  Object.assign(MARKET_TEXT, w.market);
  SEASON_TEXT.text = (k: SeasonKind) => w.season[k];
  Object.assign(FROM_TEXT, w.from);
  Object.assign(GO_TEXT, w.go);
  Object.assign(BOOK_TEXT, w.book);
  Object.assign(MAP_APP_NAME, w.mapApp);
  for (const a of OPEN_AREAS) {
    const area = a as { label: string; landmark: string };
    [area.label, area.landmark] = w.areas[a.name];
  }
  for (const g of AREA_GROUPS) (g as { heading: string }).heading = w.areaGroups[g.group];

  doc.documentElement.lang = lang;
  doc.title = w.title;
  for (const [k, v] of Object.entries(w.page)) write(doc, k, v);
  for (const b of doc.querySelectorAll<HTMLElement>('[data-mood]')) {
    const label = b.querySelector('.label') ?? b.querySelector('span');
    if (label) label.textContent = MOOD_LABEL[b.dataset.mood as Button];
  }
  for (const b of doc.querySelectorAll<HTMLElement>('[data-action="map-app"]')) b.textContent = MAP_APP_NAME[b.dataset.app as MapApp];
  for (const a of doc.querySelectorAll('.langs a')) {
    if (a.getAttribute('hreflang') === lang) a.setAttribute('aria-current', 'true');
    else a.removeAttribute('aria-current');
  }
  return places.then((v) => {
    if (!validPlaces(v)) return;
    const of = (s: Spot) => (Object.prototype.hasOwnProperty.call(v, s.id) && Array.isArray(v[s.id]) ? v[s.id] : null);
    const name = PLACE.name;
    const reason = PLACE.reason;
    PLACE.name = (s) => of(s)?.[0] || name(s);
    PLACE.reason = (s) => of(s)?.[1] || reason(s);
  });
}
