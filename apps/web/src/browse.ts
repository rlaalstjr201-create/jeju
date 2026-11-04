// 오늘 서울 둘러보기 (ADR-0114 2·3): the day's list (/api/culture?city=seoul) as themed shelves, each scrolled sideways. Pure:
// the view (browse-view.ts) and the tests share it. What is shut now (openNow) is left out; an item is in one shelf only,
// the first that takes it (the same thing on every shelf is what made the cards dull); at most 7 shelves × 12, an empty
// one not there at all.
import { nowness, openNow, parseCultureTime, prominence, seoulMinutes, whyNow, type CultureItem, type Now } from './culture';
import { distanceKm, type Point } from './pick';

/** The shelves, in the order they are filled and shown (ADR-0114 2). */
export const SHELVES = ['near', 'today', 'week', 'stage', 'live', 'exhibit', 'free'] as const;
export type ShelfKey = (typeof SHELVES)[number];
export const PER_SHELF = 12;
/** 지금 근처: as far as the home's own picks reach (culture.ts pickCulture, 홈은 3km 안). */
export const NEAR_KM = 3;

export interface BrowseCard {
  item: CultureItem;
  /** why now (culture.ts whyNow): 「19:30 시작」「지금 열림 · 18:00까지」 */
  why: string;
  /** with a basis only */
  trip: { walk: boolean; minutes: number } | null;
}
export interface Shelf {
  key: ShelfKey;
  cards: BrowseCard[];
}

interface Cand extends BrowseCard {
  km: number | null;
}

const STAGE = /연극|뮤지컬/;
/** 라이브·인디: a concert, or a show in a small live venue (a club, a live hall) */
const LIVE_KIND = /콘서트/;
const LIVE_PLACE = /라이브|클럽|인디|live/i;
const SHOW = /연극|뮤지컬|콘서트|클래식|국악|무용|오페라|공연/;

/** An item as a card for `now`: why now, and how far with a basis; null when it is shut now (openNow, with the time to get
 * there). */
function candOf(item: CultureItem, now: Now, origin: Point | null): Cand | null {
  const km = origin ? distanceKm(origin, item) : null;
  const trip = km === null ? null : seoulMinutes(km);
  const t = parseCultureTime(item.time);
  const state = openNow(item, now, t, trip?.minutes ?? 0);
  return state === 'shut' ? null : { item, km, trip, why: whyNow(item, now, t, state) };
}
/** The card sheet's own (browse-view.ts): the same why and distance the shelf showed. */
export function browseCard(item: CultureItem, now: Now, origin: Point | null): BrowseCard | null {
  const c = candOf(item, now, origin);
  return c && { item, why: c.why, trip: c.trip };
}

/** The shelves for `now`, nearest first where there is a basis (`origin`); without one there is no 지금 근처 and no distance. */
export function buildShelves(items: readonly CultureItem[], now: Now, origin: Point | null): Shelf[] {
  const cands = items.map((item) => candOf(item, now, origin)).filter((c): c is Cand => !!c);
  const takes: Record<ShelfKey, (c: Cand) => boolean> = {
    near: (c) => c.km !== null && c.km <= NEAR_KM,
    // 오늘만·오늘까지 / 이번 주에 끝나요: nowness 0 / 1 (culture.ts)
    today: (c) => nowness(c.item, now.day) === 0,
    week: (c) => nowness(c.item, now.day) === 1,
    stage: (c) => STAGE.test(c.item.kind),
    live: (c) => LIVE_KIND.test(c.item.kind) || (SHOW.test(c.item.kind) && LIVE_PLACE.test(c.item.place)),
    exhibit: (c) => c.item.kind.startsWith('전시'),
    free: (c) => c.item.free,
  };
  // 지금 근처 by distance; the others the clear ones (museums, big stages) first, then the nearer
  const far = (c: Cand) => c.km ?? 0;
  const order = (key: ShelfKey) => (a: Cand, b: Cand) => (key === 'near' ? far(a) - far(b) : prominence(a.item) - prominence(b.item) || far(a) - far(b));
  const shown = new Set<string>();
  const out: Shelf[] = [];
  for (const key of SHELVES) {
    const cards = cands
      .filter((c) => !shown.has(c.item.id) && takes[key](c))
      .sort(order(key))
      .slice(0, PER_SHELF);
    // only what a shelf shows is taken: one cut by the 12 may still be on a later shelf
    for (const c of cards) shown.add(c.item.id);
    if (cards.length) out.push({ key, cards: cards.map(({ item, why, trip }) => ({ item, why, trip })) });
  }
  return out;
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
