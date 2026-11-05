// 오늘 서울 둘러보기 (ADR-0114, ADR-0115): the day's list (/api/culture?city=seoul) and the curated places (fun.ts) as themed
// shelves, each scrolled sideways, the shelves that suit the hour first (ADR-0115 6). Pure: the view (browse-view.ts) and
// the tests share it. What is shut now is left out (a show: openNow; a curated place: its kind's usual hours); an item is
// in one shelf only; at most 12 a shelf, an empty one not there at all.
import { nowness, openNow, parseCultureTime, prominence, seoulMinutes, whyNow, type CultureItem, type Now } from './culture';
import { HOOD_KM, bandOf, isFun, likelyOpen, type Band } from './fun';
import { distanceKm, type Kind, type Point, type Spot } from './pick';

/** The shelves (ADR-0115 1·6): 동네, the five curated kinds, then the day's own list (무대, 오늘만·이번 주까지, 전시). */
export const SHELVES = ['hood', 'g1', 'g2', 'g4', 'g5', 'g6', 'g7', 'stage', 'today', 'exhibit'] as const;
export type ShelfKey = (typeof SHELVES)[number];
/** Which shelves come first at each hour: what the hour is for leads, the day's exhibitions (교과서 서울) never in the first three. */
export const ORDER: Record<Band, readonly ShelfKey[]> = {
  morning: ['g2', 'g1', 'hood', 'g5', 'g4', 'today', 'g7', 'stage', 'g6', 'exhibit'],
  day: ['hood', 'g4', 'g5', 'g7', 'g1', 'today', 'stage', 'g2', 'g6', 'exhibit'],
  dusk: ['g1', 'hood', 'stage', 'g7', 'g2', 'g4', 'g5', 'g6', 'today', 'exhibit'],
  night: ['stage', 'g7', 'g2', 'g1', 'g5', 'hood', 'g4', 'g6', 'today', 'exhibit'],
  late: ['g5', 'g2', 'g1', 'g7', 'hood', 'stage', 'g4', 'g6', 'today', 'exhibit'],
};
export const PER_SHELF = 12;
/** A shelf with fewer cards goes after the full ones (ADR-0115 성공 기준: 줄마다 6장 이상 at the top). */
export const FULL = 6;
/** A 동네 is shown with at least this many things in it now. */
export const HOOD_MIN = 2;

export interface BrowseCard {
  item: CultureItem;
  /** why now (culture.ts whyNow, 「19:30 시작」); a curated place's card line (「LP바 · 망원」); '' for a 동네 */
  why: string;
  /** with a basis only */
  trip: { walk: boolean; minutes: number } | null;
  /** a 동네's: what is in it now */
  count?: number;
}
export interface Shelf {
  key: ShelfKey;
  cards: BrowseCard[];
}

interface Cand extends BrowseCard {
  km: number | null;
}

const SHOW = /연극|뮤지컬|콘서트|클래식|국악|무용|오페라|공연/;
const month = (day: string) => Number(day.slice(5, 7));

/** An item as a card for `now`, or null when it is shut now (with the time to get there). */
function candOf(item: CultureItem, now: Now, origin: Point | null): Cand | null {
  const km = origin ? distanceKm(origin, item) : null;
  const trip = km === null ? null : seoulMinutes(km);
  if (isFun(item)) {
    if (item.fun.g === 'hood') return { item, km, trip, why: '' };
    return likelyOpen(item, now.minute, trip?.minutes ?? 0, month(now.day)) ? { item, km, trip, why: item.place } : null;
  }
  const t = parseCultureTime(item.time);
  const state = openNow(item, now, t, trip?.minutes ?? 0);
  return state === 'shut' ? null : { item, km, trip, why: whyNow(item, now, t, state) };
}
/** The card sheet's own (browse-view.ts): the same why and distance the shelf showed. */
export function browseCard(item: CultureItem, now: Now, origin: Point | null): BrowseCard | null {
  const c = candOf(item, now, origin);
  return c && { item, why: c.why, trip: c.trip };
}
/** What is in a 동네 now: the curated places likely open and the day's items not shut, within HOOD_KM of its middle. */
export function inHood(hood: CultureItem, items: readonly CultureItem[], now: Now, origin: Point | null): BrowseCard[] {
  return items
    .filter((i) => !(isFun(i) && i.fun.g === 'hood') && distanceKm(hood, i) <= HOOD_KM)
    .map((i) => candOf(i, now, origin))
    .filter((c): c is Cand => !!c)
    .sort((a, b) => distanceKm(hood, a.item) - distanceKm(hood, b.item))
    .map(({ item, why, trip }) => ({ item, why, trip }));
}

/** The shelves for `now` (`sunset`: minutes after midnight KST, sun.ts), nearest first where there is a basis (`origin`). */
export function buildShelves(items: readonly CultureItem[], now: Now, origin: Point | null, sunset: number): Shelf[] {
  const cands = items.map((item) => candOf(item, now, origin)).filter((c): c is Cand => !!c);
  const g = (k: string) => (c: Cand) => isFun(c.item) && c.item.fun.g === k;
  const takes: Record<ShelfKey, (c: Cand) => boolean> = {
    hood: g('hood'),
    g1: g('G1'),
    g2: g('G2'),
    g4: g('G4'),
    g5: g('G5'),
    g6: g('G6'),
    g7: g('G7'),
    stage: (c) => !isFun(c.item) && SHOW.test(c.item.kind),
    today: (c) => !isFun(c.item) && nowness(c.item, now.day) <= 1,
    exhibit: (c) => !isFun(c.item) && c.item.kind.startsWith('전시'),
  };
  const far = (c: Cand) => c.km ?? 0;
  // the day's own: the clear ones (big stages, museums) first, then the nearer; a curated place or a 동네: the nearer first
  const order = (a: Cand, b: Cand) => (isFun(a.item) ? 0 : prominence(a.item) - prominence(b.item)) || far(a) - far(b) || (a.item.title < b.item.title ? -1 : 1);
  const shown = new Set<string>();
  const out: Shelf[] = [];
  // filled in SHELVES order (an item takes its own kind's shelf first), shown in the hour's ORDER
  for (const key of SHELVES) {
    let cards = cands.filter((c) => !shown.has(c.item.id) && takes[key](c)).sort(order);
    if (key === 'hood') {
      cards = cards
        .map((c) => ({ ...c, count: inHood(c.item, items, now, origin).length }))
        .filter((c) => c.count >= HOOD_MIN)
        .sort((a, b) => (origin ? far(a) - far(b) : b.count - a.count));
    }
    cards = cards.slice(0, PER_SHELF);
    for (const c of cards) shown.add(c.item.id);
    if (cards.length) out.push({ key, cards: cards.map(({ item, why, trip, count }) => ({ item, why, trip, ...(count !== undefined ? { count } : {}) })) });
  }
  const rank = ORDER[bandOf(now.minute, sunset)];
  const short = (s: Shelf) => (s.cards.length < FULL ? 1 : 0);
  return out.sort((a, b) => short(a) - short(b) || rank.indexOf(a.key) - rank.indexOf(b.key));
}

/** 서울 홈의 선반 (ADR-0117, specs/seoul-home-shelves.md): the five moods' shelves among the hour's. */
export const MOOD_SHELVES = ['rest', 'walk', 'new', 'famous', 'food'] as const satisfies readonly Kind[];
export type MoodShelf = (typeof MOOD_SHELVES)[number];
export type HomeKey = ShelfKey | MoodShelf;
/** 밥때: 먹기 second (11:00–14:00, 17:00–21:00) */
const MEAL = (minute: number) => (minute >= 660 && minute < 840) || (minute >= 1020 && minute < 1260);
/** The order (spec 선반 순서): the hour's shelves (`keys`, ORDER) with 먹기 second at 밥때 (else after them), 유명한 데 third,
 * 놀러 fifth, 쉬기·걷기 last. */
export function homeOrder(keys: readonly ShelfKey[], minute: number): HomeKey[] {
  const out: HomeKey[] = [...keys];
  const meal = MEAL(minute);
  if (meal) out.splice(1, 0, 'food');
  out.splice(2, 0, 'famous');
  out.splice(4, 0, 'new');
  if (!meal) out.push('food');
  out.push('rest', 'walk');
  return out;
}
export type HomeShelf = Shelf | { key: MoodShelf; spots: Spot[] };
const kakaoOf = (link: string) => /place\.map\.kakao\.com\/(\d+)/.exec(link)?.[1];
/** The home's shelves: `shelves` (buildShelves) and each mood's places (home.ts moodShelf, nearest first) in homeOrder, each
 * place once — a place another shelf before it took (by id, 카카오 id or name: a curated place may be a mood's too) is passed
 * over — at most PER_SHELF a shelf, an empty one not there, then those under FULL at the back (ADR-0115 Amendment 3). */
export function homeShelves(shelves: readonly Shelf[], moods: Partial<Record<MoodShelf, readonly Spot[]>>, minute: number, sunset: number): HomeShelf[] {
  const rank = ORDER[bandOf(minute, sunset)];
  const fun = new Map(shelves.map((s) => [s.key, s]));
  const taken = new Set<string>(shelves.flatMap((s) => s.cards.flatMap((c) => [c.item.title, kakaoOf(c.item.link) ?? ''])).filter(Boolean));
  const out: HomeShelf[] = [];
  for (const key of homeOrder([...fun.keys()].sort((a, b) => rank.indexOf(a) - rank.indexOf(b)), minute)) {
    const f = fun.get(key as ShelfKey);
    if (f) {
      out.push(f);
      continue;
    }
    const spots: Spot[] = [];
    for (const x of moods[key as MoodShelf] ?? []) {
      if (spots.length >= PER_SHELF) break;
      if ([x.id, x.name, x.kakaoPlaceId].some((k) => k && taken.has(k))) continue;
      spots.push(x);
      for (const k of [x.id, x.name, x.kakaoPlaceId]) if (k) taken.add(k);
    }
    if (spots.length) out.push({ key: key as MoodShelf, spots });
  }
  const size = (s: HomeShelf) => ('spots' in s ? s.spots : s.cards).length;
  return out.sort((a, b) => Number(size(a) < FULL) - Number(size(b) < FULL));
}

const hhmm = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
/** 오늘 시간 for the card sheet: today's read times (「11:00~18:00」, 「19:00, 21:00」), or '' when they are not read. */
export function todayTimes(it: CultureItem, now: Now): string {
  const day = parseCultureTime(it.time)?.[now.weekday];
  if (!day) return '';
  return [...day.spans.map(([a, b]) => `${hhmm(a)}~${hhmm(b)}`), ...day.starts.map(hhmm)].join(', ');
}

/** Cloudflare image resizing on this site's own zone (ADR-0114 Amendment 1): a card is 128px wide, so 256 for a 2× screen. The
 * originals run to 10 MB (KOPIS posters 2480×3508), far too much for a phone; the resized ones are tens of KB. Always
 * yeochana.com's, so a preview or localhost shows the same pictures. */
export const RESIZE = 'https://yeochana.com/cdn-cgi/image/width=256,quality=75,format=auto/';
/** A picture's address: https only (an http one is asked for over https; anything else is no picture), resized (RESIZE).
 * KOPIS's www. address only redirects to kopis.or.kr: asked for there at once. The Seoul events site never answers
 * Cloudflare's fetch (9504 after about 7.5 s, measured 2026-11-05): its pictures are the text card at once. */
export function imageUrl(u: string | undefined): string | null {
  const s = String(u ?? '').trim().replace(/^http:\/\//i, 'https://').replace(/^https:\/\/www\.kopis\.or\.kr\//i, 'https://kopis.or.kr/');
  try {
    const url = new URL(s);
    return url.protocol === 'https:' && url.hostname !== 'culture.seoul.go.kr' ? RESIZE + s : null;
  } catch {
    return null;
  }
}
/** 자세히's address: http(s) only, else none (a javascript: or a bare word never becomes a link). */
export function linkUrl(u: string | undefined): string | null {
  const s = String(u ?? '').trim();
  if (!/^https?:\/\//i.test(s)) return null;
  try {
    const p = new URL(s).protocol;
    return p === 'https:' || p === 'http:' ? s : null;
  } catch {
    return null;
  }
}
