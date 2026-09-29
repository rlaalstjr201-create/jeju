// Card selection (plan OQ 1·2·4). Pure functions, no DOM.

export type Mood = 'rest' | 'walk' | 'new' | 'food';
export type Button = Mood | 'any';
/** food-only sub-type: 식사 | 카페·디저트 (ADR-0028 update). */
export type Sub = 'meal' | 'cafe';

export interface Spot {
  id: string;
  name: string;
  lat: number;
  lng: number;
  mood: Mood;
  reason: string;
  image: string;
  kakaoPlaceId: string | null;
  bookable: boolean;
  /** set iff mood === 'food' */
  sub?: Sub;
}

export interface Point {
  lat: number;
  lng: number;
}

export interface Card {
  spot: Spot;
  minutes: number;
}

/** Per-button memory of what was shown, so a re-tap moves on (plan OQ4). food keeps meal/cafe history separately. */
export interface History {
  seen: string[];
  last: string[];
}
export type HistoryKey = Exclude<Button, 'food'> | `food:${Sub}`;
export type Histories = Partial<Record<HistoryKey, History>>;

export const CARD_COUNT = 3;
export const MAX_MINUTES = 60;
const ANY_MOODS: Mood[] = ['rest', 'walk', 'new'];

export function distanceKm(a: Point, b: Point): number {
  const R = 6371;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** 직선거리 × 1.3 ÷ 40km/h, 5분 단위 반올림, 최소 5분 (plan OQ2). */
export function driveMinutes(km: number): number {
  const raw = ((km * 1.3) / 40) * 60;
  return Math.max(5, Math.round(raw / 5) * 5);
}

/**
 * Candidates for one mood, nearest first. Normally everything within an hour's drive;
 * if that leaves fewer than 3, widen to the nearest 3 on the whole island (빈손 없음).
 */
export function pool(spots: Spot[], origin: Point, mood: Mood, sub?: Sub): Card[] {
  const sorted = spots
    .filter((s) => s.mood === mood && (mood !== 'food' || s.sub === (sub ?? 'meal')))
    .map((spot) => ({ spot, km: distanceKm(origin, spot) }))
    .sort((a, b) => a.km - b.km || a.spot.id.localeCompare(b.spot.id))
    .map(({ spot, km }) => ({ spot, minutes: driveMinutes(km) }));
  const near = sorted.filter((c) => c.minutes <= MAX_MINUTES);
  return near.length >= CARD_COUNT ? near : sorted.slice(0, CARD_COUNT);
}

/** Unseen first, then seen, and the cards shown last time at the very back. */
function rotate(cards: Card[], h: History | undefined): Card[] {
  if (!h) return cards;
  const seen = new Set(h.seen);
  const last = new Set(h.last);
  const rank = (c: Card) => (last.has(c.spot.id) ? 2 : seen.has(c.spot.id) ? 1 : 0);
  return cards
    .map((c, i) => ({ c, i }))
    .sort((a, b) => rank(a.c) - rank(b.c) || a.i - b.i)
    .map(({ c }) => c);
}

function remember(h: History | undefined, shown: Card[], poolIds: string[]): History {
  const ids = shown.map((c) => c.spot.id);
  let seen = [...new Set([...(h?.seen ?? []), ...ids])];
  // Everything in the pool has been shown: start the round over (keeping `last` at the back).
  if (poolIds.every((id) => seen.includes(id))) seen = ids;
  return { seen, last: ids };
}

/** sub only applies to the 'food' button (defaults to 'meal'); ignored otherwise. */
export function pickCards(
  spots: Spot[],
  origin: Point,
  button: Button,
  histories: Histories = {},
  sub?: Sub,
): { cards: Card[]; histories: Histories } {
  const key: HistoryKey = button === 'food' ? `food:${sub ?? 'meal'}` : button;
  const h = histories[key];
  let cards: Card[];
  let poolIds: string[];
  if (button === 'any') {
    // 아무거나: 쉬기·걷기·새로운 것에서 한 장씩. 먹기는 섞지 않는다(맛집은 전용 버튼으로만).
    const pools = ANY_MOODS.map((m) => pool(spots, origin, m));
    cards = pools.map((p) => rotate(p, h)[0]).filter((c): c is Card => !!c);
    cards.sort((a, b) => distanceKm(origin, a.spot) - distanceKm(origin, b.spot));
    poolIds = pools.flat().map((c) => c.spot.id);
  } else {
    const p = pool(spots, origin, button, sub);
    cards = rotate(p, h).slice(0, CARD_COUNT);
    poolIds = p.map((c) => c.spot.id);
  }
  return { cards, histories: { ...histories, [key]: remember(h, cards, poolIds) } };
}
