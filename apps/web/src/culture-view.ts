// 오늘 근처에서 하는 것 (ADR-0112 8, plans/now-culture.md §3): the home's block (홈 2) and the list sheet (목록 6), a chunk of
// its own (release.ts loadCulture) so the entry stays in its budget (ADR-0100). The list is asked for here too: 서울 목록
// 전체, no position in the request (ADR-0112 6); the app filters by distance (culture.ts pickCulture).
import { buildShelves, homeShelves, type MoodShelf } from './browse';
import { BROWSE_COPY, browseCardSheet, browseScreen, homeShelvesView, type MoodCard } from './browse-view';
export { scrolledRows } from './browse-view';
import { WHY_TEXT, pickCulture, type CultureItem, type Now, type Pick } from './culture';
import type { Fetch } from './effects';
import { funItems, isFun, realItems } from './fun';
import { goLink, type MapApp } from './links';
import { TRAVEL_TEXT, formatMinutes, type Spot } from './pick';
import { COPY } from './render';
import type { State } from './state';
import { sunsetMinutes } from './sun';
import type { Day } from './dates';
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
/** with 오늘 서울 둘러보기's (browse-view.ts BROWSE_COPY) */
export type CultureWords = typeof CULTURE_COPY & { why: typeof WHY_TEXT; browse: typeof BROWSE_COPY };
export function words(w: CultureWords): void {
  const { why, browse, ...rest } = w;
  Object.assign(CULTURE_COPY, rest);
  Object.assign(WHY_TEXT, why);
  Object.assign(BROWSE_COPY, browse);
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
    // the curated places and 동네 (ADR-0115) ride along as the day's items: the card sheet finds them by id like the rest
    return { day: b.day, items: [...b.items.filter(okItem), ...funItems(b.day)] };
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
  // the home's picks are the day's own list only (ADR-0112 2), never the curated places
  const picks = pickCulture(realItems(c.items), origin.point, { day: c.day, weekday, minute: c.minute });
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
const sources = (doc: Document, picks: readonly { item: CultureItem }[]) => [
  el(doc, 'p', { class: 'cult-src', 'data-src': 'seoul' }, CULTURE_COPY.from),
  ...(picks.some((p) => p.item.id.startsWith('kp-')) ? [el(doc, 'p', { class: 'cult-src', 'data-src': 'kopis' }, CULTURE_COPY.fromShows)] : []),
];

/** The home's block: at most 2, 더 보기 when the list has more, and the source. With nothing near, 오늘 서울 둘러보기's way in
 * alone (ADR-0114 Amendment 1); null when today's list is empty. */
export function homeBlock(doc: Document, s: State, origin: Origin): HTMLElement | null {
  const { home, list } = picksOf(s.culture!, origin);
  const way = el(doc, 'button', { type: 'button', class: 'browse-in', 'data-action': 'browse' }, BROWSE_COPY.open);
  if (!home.length) {
    if (!s.culture!.items.length) return null;
    const alone = el(doc, 'section', { id: 'culture', class: 'more-sec', 'aria-label': BROWSE_COPY.open });
    alone.append(way);
    return alone;
  }
  const sec = el(doc, 'section', { id: 'culture', class: 'more-sec', 'aria-labelledby': 'culture-h' });
  sec.append(el(doc, 'h2', { id: 'culture-h' }, CULTURE_COPY.head), rows(doc, home, s.mapApp));
  if (list.length > home.length) sec.append(el(doc, 'button', { type: 'button', class: 'tbtn', 'data-action': 'culture-more' }, CULTURE_COPY.more));
  // 오늘 서울 둘러보기 (ADR-0114 1): the one way in, under the picks
  sec.append(way, ...sources(doc, home));
  return sec;
}

/** The list sheet's body: up to 6, the same rows, and the source. */
export function sheetBody(doc: Document, panel: HTMLElement, s: State, origin: Origin): void {
  const { list } = picksOf(s.culture!, origin);
  panel.append(rows(doc, list, s.mapApp), ...sources(doc, list));
}

/** The day's list as of the minute it was read (KST). */
const nowOf = (c: NonNullable<State['culture']>): Now => ({ day: c.day, weekday: new Date(`${c.day}T00:00:00Z`).getUTCDay(), minute: c.minute });
/** every item shown is from today's list: the KOPIS line whenever a show is in it */
const allItems = (c: NonNullable<State['culture']>) => realItems(c.items).map((item) => ({ item }));

/** 오늘 서울 둘러보기 (ADR-0114): the whole screen, distances from the home's point when there is one. */
export function browseBody(doc: Document, s: State, origin: Origin | null): HTMLElement {
  const c = s.culture!;
  return browseScreen(doc, c.items, nowOf(c), origin?.point ?? null, [...sources(doc, allItems(c)), el(doc, 'p', { class: 'cult-src' }, BROWSE_COPY.fromKakao)]);
}
/** 서울 홈의 선반 (ADR-0117): today's list's shelves (when it is in) and the moods' (`moods`, home.ts moodShelf, nearest first),
 * in the hour's order (browse.ts homeShelves), and at the end the source lines of what they show. `card`: a mood place's name
 * and how far, as the home words them. Null with no shelf at all. */
let last: { sig: string; box: HTMLElement } | null = null;
export function shelvesBlock(doc: Document, s: State, origin: Origin, moods: Partial<Record<MoodShelf, Spot[]>>, labels: Record<MoodShelf, string>, card: (spot: Spot) => MoodCard, here: Spot | null = null): HTMLElement | null {
  const c = s.culture?.day === s.today ? s.culture : null;
  const day = (c?.day ?? s.today) as Day;
  const sunset = sunsetMinutes(origin.point, day);
  const minute = c?.minute ?? s.clock ?? 12 * 60;
  const list = homeShelves(c ? buildShelves(c.items, nowOf(c), origin.point, sunset) : [], moods, minute, sunset, here);
  if (!list.length) return null;
  const rows = list.map((sh) => ('spots' in sh ? { key: sh.key, cards: sh.spots.map(card) } : sh));
  // the same shelves as drawn (the list's minute moved on, nothing it shows did): the same block, so its scroll, focus and
  // pictures stay as they are (ADR-0117 Amendment 4)
  const sig = JSON.stringify([labels, rows.map((r) => [r.key, r.cards.map((x) => ('item' in x ? [x.item.id, x.why, x.trip, x.count] : [x.id, x.image, x.trip, x.name]))])]);
  if (last?.sig === sig && last.box.isConnected) return last.box;
  const shown = list.flatMap((sh) => ('cards' in sh ? sh.cards.map((x) => x.item) : []));
  // only the sources of what is shown: the city's for an event, KOPIS for a show, 카카오맵 for a curated place
  const src = [
    ...(shown.some((i) => !isFun(i) && !i.id.startsWith('kp-')) ? [el(doc, 'p', { class: 'cult-src', 'data-src': 'seoul' }, CULTURE_COPY.from)] : []),
    ...(shown.some((i) => i.id.startsWith('kp-')) ? [el(doc, 'p', { class: 'cult-src', 'data-src': 'kopis' }, CULTURE_COPY.fromShows)] : []),
    ...(shown.some(isFun) ? [el(doc, 'p', { class: 'cult-src', 'data-src': 'kakao' }, BROWSE_COPY.fromKakao)] : []),
  ];
  const box = homeShelvesView(doc, rows, labels, src);
  last = { sig, box };
  return box;
}

/** A card's sheet over it; null when the item is not in today's list. */
function browseCard(doc: Document, s: State, origin: Origin | null, id: string): HTMLElement | null {
  const c = s.culture!;
  const it = c.items.find((x) => x.id === id);
  // the source lines: a curated place's is 카카오맵; a 동네 can hold both
  const kakao = el(doc, 'p', { class: 'cult-src', 'data-src': 'kakao' }, BROWSE_COPY.fromKakao);
  const src = !it ? [] : !isFun(it) ? sources(doc, [{ item: it }]) : it.fun.g === 'hood' ? [kakao, ...sources(doc, allItems(c))] : [kakao];
  return browseCardSheet(doc, c.items, id, nowOf(c), origin?.point ?? null, s.mapApp, CULTURE_COPY.cast, src);
}

/** The card's sheet on over the screen (which goes inert, focus to the card's title) or off again (focus back to the card
 * pressed), as `s` says; render.ts patchSheet, in this chunk so the entry stays in its budget (ADR-0100). */
export function patchBrowse(doc: Document, box: HTMLElement, s: State, origin: Origin | null): void {
  const screen = box.querySelector<HTMLElement>('.browse');
  const layer = box.querySelector<HTMLElement>('.bc-layer');
  const want = s.overlay === 'browse-card' ? s.browseId : null;
  if (layer && layer.dataset.id === want) return;
  layer?.remove();
  const card = want && s.culture?.day === s.today ? browseCard(doc, s, origin, want) : null;
  if (card) {
    card.dataset.id = want!;
    box.append(card);
    screen?.setAttribute('inert', '');
    card.querySelector<HTMLElement>('#bc-title')?.focus({ preventScroll: true });
  } else if (layer) {
    screen?.removeAttribute('inert');
    [...(screen?.querySelectorAll<HTMLElement>('[data-action="browse-card"]') ?? [])].find((b) => b.dataset.id === s.browseId)?.focus({ preventScroll: true });
  }
}
