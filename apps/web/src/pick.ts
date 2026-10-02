// Card selection (plan OQ 1·2·4). Pure functions, no DOM.
import type { Day } from './dates';
import { marketDay, type Market } from './market';

export type Mood = 'rest' | 'walk' | 'new' | 'food';
export type Button = Mood | 'any';
/** food-only sub-type: 식사 | 카페·디저트 (ADR-0028 update). */
export type Sub = 'meal' | 'cafe';
/** new-only kind (ADR-0064): 구경 | 체험. */
export type NewKind = 'sight' | 'do';
/** 새로운 거 tab: 섞어서 (every kind) | 구경 | 체험. */
export type NewSub = 'mix' | NewKind;
export const NEW_SUBS: readonly NewSub[] = ['mix', 'sight', 'do'];
/** The tab a button's cards are picked under: the food sub, the 새로운 거 tab, or none. */
export type Tab = Sub | NewSub;

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
  /** food: meal | cafe; new: sight | do (ADR-0064); unset otherwise. */
  sub?: Sub | NewKind;
  /** 만족도 1~5 (ADR-0060, specs/ranking.md): orders the cards, never shown. */
  score: number;
  /** 실내 (ADR-0065): what 비 와요(실내만) keeps; missing = outdoor. */
  indoor?: boolean;
  /** 오일장 장날 (ADR-0066): set on the five-day markets only. */
  market?: Market;
  /** 체험 예약 경로 (ADR-0074): the one verified route, its kind and URL (`tel:` for phone). Set on 체험 only. */
  book?: Book;
  /** 'closed' (ADR-0074): gone from the source, 폐업·이전 의심 — left out everywhere. */
  hide?: string;
}

export type BookKind = 'naver' | 'mrt' | 'visitjeju' | 'homepage' | 'phone';
export interface Book {
  k: BookKind;
  u: string;
}

/** ADR-0074: a place the picks may show — not hidden, and a 체험 only with a verified booking route (a 체험 card
 * that cannot lead to a reservation is no use). */
export const listed = (s: Spot): boolean => !s.hide && !(s.mood === 'new' && s.sub === 'do' && !s.book);

export interface Point {
  lat: number;
  lng: number;
}

export interface Card {
  spot: Spot;
  minutes: number;
}

/** Per-button memory of what was shown, so a re-tap moves on (plan OQ4). food keeps meal/cafe history
 * separately, new keeps mix/sight/do separately (ADR-0064). */
export interface History {
  seen: string[];
  last: string[];
  /** set on the tap that exhausted the pool; the next tap is the first of a new round (`wrapped`). */
  restarted?: boolean;
}
export type HistoryKey = Exclude<Button, 'food' | 'new'> | `food:${Sub}` | `new:${NewSub}`;
export type Histories = Partial<Record<HistoryKey, History>>;

export const CARD_COUNT = 3;
const ANY_MOODS: Mood[] = ['rest', 'walk', 'new'];

/** 얼마나 (ADR-0060): 걸어서 = 걷기 15분 이내, 차로 30분, 차로 1시간. */
export type Reach = 'walk' | 'drive30' | 'drive60';
export const REACHES: readonly Reach[] = ['walk', 'drive30', 'drive60'];
export const DEFAULT_REACH: Reach = 'drive30';
const REACH_MAX: Record<Reach, number> = { walk: 15, drive30: 30, drive60: 60 };

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

/** The trip in the range's own terms: on foot for 걸어서, by car otherwise. */
export function reachMinutes(reach: Reach, km: number): number {
  return reach === 'walk' ? walkMinutes(km) : driveMinutes(km);
}
export function withinReach(reach: Reach, origin: Point, spot: Point): boolean {
  return reachMinutes(reach, distanceKm(origin, spot)) <= REACH_MAX[reach];
}

// --- Islands (S33): fixed boxes, no data collection. 우도 65 · 비양도 6 · 가파도 4 · 마라도 10 · 차귀도 1 · 추자도 0
// in spots.json. Each one's 길찾기 goes to the pier its boat leaves from (ADR-0069, src/links.ts TERMINALS).
export type Island = '우도' | '비양도' | '가파도' | '마라도' | '차귀도' | '추자도';
const ISLANDS: readonly { name: Island; latMin: number; latMax: number; lngMin: number; lngMax: number }[] = [
  { name: '우도', latMin: 33.48, latMax: 33.53, lngMin: 126.93, lngMax: 126.98 },
  { name: '비양도', latMin: 33.4, latMax: 33.42, lngMin: 126.22, lngMax: 126.24 },
  { name: '가파도', latMin: 33.16, latMax: 33.18, lngMin: 126.26, lngMax: 126.28 },
  { name: '마라도', latMin: 33.11, latMax: 33.125, lngMin: 126.26, lngMax: 126.275 },
  { name: '차귀도', latMin: 33.305, latMax: 33.32, lngMin: 126.135, lngMax: 126.155 },
  { name: '추자도', latMin: 33.9, latMax: 34.0, lngMin: 126.25, lngMax: 126.4 },
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

interface Ranked extends Card {
  /** the trip in the range's terms (sort key only) */
  trip: number;
  /** a market on its market day (ADR-0066): first among the same score (sort key only) */
  open: boolean;
}
/** specs/ranking.md: score high to low, then a market on its day (ADR-0066), then the shorter trip, then id. */
const byRank = (a: Ranked, b: Ranked) =>
  b.spot.score - a.spot.score || Number(b.open) - Number(a.open) || a.trip - b.trip || a.spot.id.localeCompare(b.spot.id);

/** The places one mood may show, wherever they are: `pool`'s filters (tab, 비 와요, a market closed on `day`). */
function candidates(spots: Spot[], mood: Mood, tab: Tab | undefined, indoor: boolean, day: Day | undefined): Spot[] {
  const want = mood === 'food' ? foodSub(tab) : mood === 'new' ? newSub(tab) : 'mix';
  const status = (s: Spot) => (day && s.market ? marketDay(s.market, day) : 'off');
  let list = spots.filter((s) => listed(s) && s.mood === mood && (want === 'mix' || s.sub === want) && (!indoor || s.indoor === true) && status(s) !== 'closed');
  // 비 와요 (ADR-0065 4): a list with fewer than 3 indoor places on the whole island (걷기) also takes indoor
  // 구경 — places walked round inside.
  if (indoor && list.length < CARD_COUNT && !(mood === 'new' && want === 'sight')) {
    list = [...list, ...spots.filter((s) => listed(s) && s.mood === 'new' && s.sub === 'sight' && s.indoor === true)];
  }
  return list;
}

/** No origin yet (ADR-0075 3, the home's 「예:」 before GPS has answered): the whole island, score then id. */
export function islandTop(spots: Spot[], mood: Mood, tab?: Tab, indoor = false, day?: Day): Spot[] {
  return candidates(spots, mood, tab, indoor, day).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

/**
 * Candidates for one mood, best first (ADR-0060). Everything within the range; if that leaves fewer than 3,
 * the nearest 3 on the whole island (빈손 없음). `day` (ADR-0066): the day being viewed — a market the source
 * says is closed that day is left out, one on its market day ranks first among the same score.
 */
export function pool(spots: Spot[], origin: Point, mood: Mood, tab?: Tab, reach: Reach = DEFAULT_REACH, indoor = false, day?: Day): Ranked[] {
  const status = (s: Spot) => (day && s.market ? marketDay(s.market, day) : 'off');
  const all = candidates(spots, mood, tab, indoor, day)
    .map((spot) => {
      const km = distanceKm(origin, spot);
      return { spot, km, minutes: driveMinutes(km), trip: reachMinutes(reach, km), open: status(spot) === 'open' };
    });
  let near = all.filter((c) => c.trip <= REACH_MAX[reach]);
  if (near.length < CARD_COUNT) near = [...all].sort((a, b) => a.km - b.km || a.spot.id.localeCompare(b.spot.id)).slice(0, CARD_COUNT);
  return near.map(({ spot, minutes, trip, open }) => ({ spot, minutes, trip, open })).sort(byRank);
}

/** Unseen first, then seen, and the cards shown last time at the very back. */
function rotate(cards: Ranked[], h: History | undefined): Ranked[] {
  if (!h) return cards;
  const seen = new Set(h.seen);
  const last = new Set(h.last);
  const rank = (c: Ranked) => (last.has(c.spot.id) ? 2 : seen.has(c.spot.id) ? 1 : 0);
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

const foodSub = (tab?: Tab): Sub => (tab === 'cafe' ? 'cafe' : 'meal');
const newSub = (tab?: Tab): NewSub => (tab === 'sight' || tab === 'do' ? tab : 'mix');

export const historyKey = (button: Button, tab?: Tab): HistoryKey =>
  button === 'food' ? `food:${foodSub(tab)}` : button === 'new' ? `new:${newSub(tab)}` : button;

/** The tab that applies to `button`: the food sub for food, the 새로운 거 tab for new, none otherwise. */
export const tabOf = (button: Button | null, sub: Sub, newTab: NewSub): Tab | undefined =>
  button === 'food' ? sub : button === 'new' ? newTab : undefined;

/**
 * tab only applies to the 'food' button (meal | cafe, defaults to 'meal') and the 'new' button (mix | sight | do,
 * defaults to 'mix'); ignored otherwise. `indoor` (비 와요, ADR-0065): only indoor places. `day` (ADR-0066): the
 * day being viewed, for the market days.
 * `wrapped` = this tap shows a place already seen in this round, or is the first tap after the pool ran
 * out — i.e. everything nearby has been shown once and the rotation starts over (상태 줄 한 바퀴 문장).
 */
export function pickCards(
  spots: Spot[],
  origin: Point,
  button: Button,
  histories: Histories = {},
  tab?: Tab,
  reach: Reach = DEFAULT_REACH,
  indoor = false,
  day?: Day,
): { cards: Card[]; histories: Histories; wrapped: boolean } {
  const key = historyKey(button, tab);
  const h = histories[key];
  let picked: Ranked[];
  let poolIds: string[];
  if (button === 'any') {
    // 아무거나: 쉬기·걷기·새로운 것에서 한 장씩. 먹기는 섞지 않는다(맛집은 전용 버튼으로만).
    const pools = ANY_MOODS.map((m) => pool(spots, origin, m, undefined, reach, indoor, day));
    // one card per mood, never the same place twice (걷기 may have widened to 구경 indoors)
    picked = [];
    for (const p of pools) {
      const c = rotate(p, h).find((x) => !picked.some((y) => y.spot.id === x.spot.id));
      if (c) picked.push(c);
    }
    poolIds = pools.flat().map((c) => c.spot.id);
  } else {
    const p = pool(spots, origin, button, tab, reach, indoor, day);
    picked = rotate(p, h).slice(0, CARD_COUNT);
    poolIds = p.map((c) => c.spot.id);
  }
  // The rotation decides which 3; they are shown best first (R3), the score itself never.
  const cards: Card[] = picked.sort(byRank).map(({ spot, minutes }) => ({ spot, minutes }));
  const wrapped = !!h && (!!h.restarted || cards.some((c) => h.seen.includes(c.spot.id)));
  return { cards, histories: { ...histories, [key]: remember(h, cards, poolIds) }, wrapped };
}
