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
  /** set on the tap that exhausted the pool; the next tap is the first of a new round (`wrapped`). */
  restarted?: boolean;
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

/** 직선거리 × 1.3 ÷ 4.5km/h, 5분 단위 반올림, 최소 5분 (design/SPEC.md §7). */
export function walkMinutes(km: number): number {
  const raw = ((km * 1.3) / 4.5) * 60;
  return Math.max(5, Math.round(raw / 5) * 5);
}

// --- Islands (S33): fixed boxes, no data collection. 우도 65 · 비양도 5 · 가파도 4 · 마라도 10 in spots.json.
export type Island = '우도' | '비양도' | '가파도' | '마라도';
const ISLANDS: readonly { name: Island; latMin: number; latMax: number; lngMin: number; lngMax: number }[] = [
  { name: '우도', latMin: 33.48, latMax: 33.53, lngMin: 126.93, lngMax: 126.98 },
  { name: '비양도', latMin: 33.4, latMax: 33.42, lngMin: 126.22, lngMax: 126.24 },
  { name: '가파도', latMin: 33.16, latMax: 33.18, lngMin: 126.26, lngMax: 126.28 },
  { name: '마라도', latMin: 33.11, latMax: 33.125, lngMin: 126.26, lngMax: 126.275 },
];
/** The small island a point is on, or null for the main island. */
export function islandOf(p: Point): Island | null {
  for (const i of ISLANDS) if (p.lat >= i.latMin && p.lat <= i.latMax && p.lng >= i.lngMin && p.lng <= i.lngMax) return i.name;
  return null;
}

export type Travel =
  | { kind: 'ferryTo'; island: Island } // spot is on a small island the origin is not on
  | { kind: 'ferryOut' } // origin is on a small island, spot is on the main island
  | { kind: 'sameIsland'; island: Island }
  | { kind: 'walk'; minutes: number }
  | { kind: 'drive'; minutes: number };

/** How to get from origin to spot. `originIsPoint` = a real position (GPS or a GPS-saved 숙소), not an area centre. */
export function travel(origin: Point, originIsPoint: boolean, spot: Point): Travel {
  const from = islandOf(origin);
  const to = islandOf(spot);
  if (from !== to) return to ? { kind: 'ferryTo', island: to } : { kind: 'ferryOut' };
  if (to) return { kind: 'sameIsland', island: to };
  const km = distanceKm(origin, spot);
  if (originIsPoint && km < 1) return { kind: 'walk', minutes: walkMinutes(km) };
  return { kind: 'drive', minutes: driveMinutes(km) };
}

/** 5분 / 1시간 / 1시간 10분 */
export function formatMinutes(min: number): string {
  if (min < 60) return `${min}분`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}시간 ${m}분` : `${h}시간`;
}

/** Card meta. `from` ("애월에서", "숙소에서", "여기서") is prefixed only to walk/drive times. */
export function travelText(t: Travel, from?: string): string {
  switch (t.kind) {
    case 'ferryTo':
      return `${t.island}라서 배를 타야 해요`;
    case 'ferryOut':
      return '본섬이라 배를 타고 나가야 해요';
    case 'sameIsland':
      return `같은 ${t.island} 안이에요`;
    case 'walk':
      return `${from ? `${from} ` : ''}걸어서 약 ${formatMinutes(t.minutes)}`;
    case 'drive':
      return `${from ? `${from} ` : ''}차로 약 ${formatMinutes(t.minutes)}`;
  }
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
  if (poolIds.every((id) => seen.includes(id))) return { seen: ids, last: ids, restarted: true };
  return { seen, last: ids };
}

export const historyKey = (button: Button, sub?: Sub): HistoryKey => (button === 'food' ? `food:${sub ?? 'meal'}` : button);

/**
 * sub only applies to the 'food' button (defaults to 'meal'); ignored otherwise.
 * `wrapped` = this tap shows a place already seen in this round, or is the first tap after the pool ran
 * out — i.e. everything nearby has been shown once and the rotation starts over (상태 줄 한 바퀴 문장).
 */
export function pickCards(
  spots: Spot[],
  origin: Point,
  button: Button,
  histories: Histories = {},
  sub?: Sub,
): { cards: Card[]; histories: Histories; wrapped: boolean } {
  const key = historyKey(button, sub);
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
  const wrapped = !!h && (!!h.restarted || cards.some((c) => h.seen.includes(c.spot.id)));
  return { cards, histories: { ...histories, [key]: remember(h, cards, poolIds) }, wrapped };
}
