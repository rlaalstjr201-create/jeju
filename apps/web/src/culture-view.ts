// 오늘 근처에서 하는 것 (ADR-0112 8, plans/now-culture.md §3): the home's block (홈 2) and the list sheet (목록 6), a chunk of
// its own (release.ts loadCulture) so the entry stays in its budget (ADR-0100). The list is asked for here too: 서울 목록
// 전체, no position in the request (ADR-0112 6); the app filters by distance (culture.ts pickCulture).
import { WHY_TEXT, pickCulture, type CultureItem, type Pick } from './culture';
import type { Fetch } from './effects';
import { goLink, type MapApp } from './links';
import { TRAVEL_TEXT, formatMinutes, type Spot } from './pick';
import { COPY } from './render';
import type { State } from './state';
import type { Origin } from './types';

/** Its words (ADR-0093: another language's come in through `words`). Titles and places stay as the list gives them. */
export const CULTURE_COPY = {
  head: '오늘 근처에서 하는 것',
  more: '근처에서 하는 것 더 보기',
  from: '정보: 서울시 문화행사(서울 열린데이터광장)',
  /** KOPIS 이용 조건 (ADR-0113 6): shown when a show is among the picks */
  fromShows: '출처: (재)예술경영지원센터 공연예술통합전산망(KOPIS)',
  /** 출연 (ADR-0113 4), after the why line: 「김상우·이원우 출연」 */
  cast: (names: string) => `${names} 출연`,
};
export type CultureWords = typeof CULTURE_COPY & { why: typeof WHY_TEXT };
export function words(w: CultureWords): void {
  const { why, ...rest } = w;
  Object.assign(CULTURE_COPY, rest);
  Object.assign(WHY_TEXT, why);
}

const okItem = (x: unknown): x is CultureItem => {
  const i = x as CultureItem | null;
  return !!i && typeof i.title === 'string' && typeof i.place === 'string' && Number.isFinite(i.lat) && Number.isFinite(i.lng) && typeof i.start === 'string' && typeof i.end === 'string';
};

/** 서울's list for today, or null — nothing to show — for a 204 (no key, the city's API failing), an error, a non-JSON
 * answer or no answer within `timeoutMs`. */
export async function fetchCulture(get: Fetch, timeoutMs = 15000): Promise<{ day: string; items: CultureItem[] } | null> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await Promise.race([
      get('/api/culture?city=seoul', { signal: ctl.signal }),
      new Promise<never>((_, reject) => ctl.signal.addEventListener('abort', () => reject(new Error('timeout')))),
    ]);
    if (res.status !== 200) return null;
    const b = (await res.json()) as { day?: unknown; items?: unknown } | null;
    if (typeof b?.day !== 'string' || !Array.isArray(b.items)) return null;
    return { day: b.day, items: b.items.filter(okItem) };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** The picks for the home's point at the minute the list was read: worked out once per list, point and minute. */
let memo: { key: string; items: readonly CultureItem[]; picks: { home: Pick[]; list: Pick[] } } | null = null;
export function picksOf(c: NonNullable<State['culture']>, origin: Origin): { home: Pick[]; list: Pick[] } {
  const key = `${c.day}|${c.minute}|${origin.point.lat},${origin.point.lng}`;
  if (memo?.key === key && memo.items === c.items) return memo.picks;
  const weekday = new Date(`${c.day}T00:00:00Z`).getUTCDay();
  const picks = pickCulture([...c.items], origin.point, { day: c.day, weekday, minute: c.minute });
  memo = { key, items: c.items, picks };
  return picks;
}

function el(doc: Document, tag: string, attrs: Record<string, string> = {}, text?: string): HTMLElement {
  const e = doc.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}

/** One pick: the title (one line), why now, how far; the whole row is 길찾기 to the place in the chosen map app, on foot when
 * the trip says 걸어서. */
function rows(doc: Document, picks: Pick[], app: MapApp): HTMLElement {
  const list = el(doc, 'ul', { class: 'mk-list cult' });
  for (const p of picks) {
    const it = p.item;
    const to = { id: it.id, name: it.place || it.title, lat: it.lat, lng: it.lng } as Spot;
    // goLink picks foot only within its own walk reach: measured from the place itself, a walk here is always on foot
    // (`from` only picks the link, it is never put in it)
    const g = goLink(to, p.walk ? to : null, p.walk, false, app);
    const trip = (p.walk ? TRAVEL_TEXT.walk : TRAVEL_TEXT.drive)(undefined, formatMinutes(p.minutes));
    const why = [p.why, it.cast ? CULTURE_COPY.cast(it.cast) : ''].filter(Boolean).join(' · ');
    const a = el(doc, 'a', { class: 'mk', href: g.href, target: '_blank', rel: 'noopener', 'aria-label': [it.title, why, trip, COPY.goAria(to.name, g.mode === 'foot', g.app)].filter(Boolean).join(', ') });
    const txt = el(doc, 'span', { class: 'txt' });
    txt.append(el(doc, 'span', { class: 'nm' }, it.title));
    if (why) txt.append(el(doc, 'span', { class: 'meta' }, why));
    txt.append(el(doc, 'span', { class: 'meta' }, trip));
    a.append(txt);
    const li = el(doc, 'li');
    li.append(a);
    list.append(li);
  }
  return list;
}

/** The source lines: the Seoul list's, and KOPIS's when a show is among `picks` (ADR-0113 6). */
const sources = (doc: Document, picks: Pick[]) => [
  el(doc, 'p', { class: 'cult-src' }, CULTURE_COPY.from),
  ...(picks.some((p) => p.item.id.startsWith('kp-')) ? [el(doc, 'p', { class: 'cult-src' }, CULTURE_COPY.fromShows)] : []),
];

/** The home's block: at most 2, 더 보기 when the list has more, and the source. null: nothing near to show. */
export function homeBlock(doc: Document, s: State, origin: Origin): HTMLElement | null {
  const { home, list } = picksOf(s.culture!, origin);
  if (!home.length) return null;
  const sec = el(doc, 'section', { id: 'culture', class: 'more-sec', 'aria-labelledby': 'culture-h' });
  sec.append(el(doc, 'h2', { id: 'culture-h' }, CULTURE_COPY.head), rows(doc, home, s.mapApp));
  if (list.length > home.length) sec.append(el(doc, 'button', { type: 'button', class: 'tbtn', 'data-action': 'culture-more' }, CULTURE_COPY.more));
  sec.append(...sources(doc, home));
  return sec;
}

/** The list sheet's body: up to 6, the same rows, and the source. */
export function sheetBody(doc: Document, panel: HTMLElement, s: State, origin: Origin): void {
  const { list } = picksOf(s.culture!, origin);
  panel.append(rows(doc, list, s.mapApp), ...sources(doc, list));
}
