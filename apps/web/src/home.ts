// 홈 A′ (ADR-0075, specs/home-refresh.md): what the first screen shows besides the moods. Pure, no DOM — render.ts draws it.
import { AREAS, areaByName, nearestArea, type Area, type AreaName } from './areas';
import { addDays, type Day } from './dates';
import { DEST, destOfId, type Dest } from './dest';
import { marketDay } from './market';
import { BUSAN, NATION, OPEN_AREAS, openAreasOf } from './release';
import { byId, distanceKm, islandTop, listed, pickCards, pool, tabOf, travel, travelText, withinReach, type Kind, type Point, type Spot } from './pick';
import { pickSpots, rainArea, whenDay, type State } from './state';
import { RAIN_TTL_MS } from './store';
import { nightNow, sunsetBucket, sunsetMinutes } from './sun';
import type { Origin } from './types';

export { homeOrigin } from './state';

/** The sun's place: the basis, else the destination's city hall (the 자동 지역 and 강원: its 시군구's centre, plans/nationwide-app.md 5). */
export const sunPoint = (origin: Origin | null, dest: Dest = 'jeju', sgg: string | null = null): Point => {
  const a = NATION && (dest === 'nation' || DEST[dest].sgg) && !origin ? areaByName(sgg, OPEN_AREAS) : null;
  return origin?.point ?? (a ? { lat: a.lat, lng: a.lng } : DEST[BUSAN ? dest : 'jeju'].cityHall);
};

/** 밤 (ADR-0091) on the home: 지금 only, at the basis (the city hall's sun without one), by the time the app last read. */
export const nightHome = (s: State, origin: Origin | null): boolean => s.when === 'now' && nightNow(s.clock, sunPoint(origin, s.dest, s.sgg), s.today);

/** The rows above 유명한 데 on the first screen, whose 「예:」 its own skips (ADR-0092 7). */
const ABOVE_FAMOUS: readonly Kind[] = ['rest', 'walk', 'new'];

/** 「예: A, B」 and the two photos: the first two the mood's cards would show now (pool — range, 실내, the day, 밤),
 * the whole island by score without an origin. Places without a photo (or whose photo failed) are skipped.
 * 유명한 데 (ADR-0092 7) passes over the places `taken` (by default: the 「예:」 of the rows above it) and takes the next
 * of its own; with fewer than 2 left it takes back the ones passed over. */
export function moodExamples(s: State, spots: Spot[], origin: Origin | null, mood: Kind, taken?: readonly string[]): Spot[] {
  const tab = tabOf(mood, s.sub, s.newSub);
  const day = whenDay(s);
  const night = nightHome(s, origin);
  const list = origin ? pool(spots, origin.point, mood, tab, s.reach, s.indoor, day, night).map((c) => c.spot) : islandTop(spots, mood, tab, s.indoor, day, night);
  const shown = list.filter((x) => x.image && !s.broken.includes(x.id));
  if (mood !== 'famous') return shown.slice(0, 2);
  const skip = new Set(taken ?? ABOVE_FAMOUS.flatMap((m) => moodExamples(s, spots, origin, m).map((x) => x.id)));
  const fresh = shown.filter((x) => !skip.has(x.id)).slice(0, 2);
  return fresh.length >= 2 ? fresh : [...fresh, ...shown.filter((x) => skip.has(x.id))].slice(0, 2);
}

/** 지금 여기서 (ADR-0101 7, specs/home-v2.md 1): the first card 「아무거나」 would show now — the same pool, rotation start and
 * order (nothing seen yet), skipping a place without a photo (Q-C). Without a basis the best of the three moods' first
 * 「예:」 by score, like the island's 「제주 인기」. Null when no place with a photo is left. 아무거나's moods are the
 * destination's (DEST[d].any: the 자동 지역 has no 쉬기). */
export function nowSpot(s: State, spots: Spot[], origin: Origin | null): Spot | null {
  const shown = (x: Spot) => !!x.image && !s.broken.includes(x.id);
  if (origin) {
    return pickCards(spots, origin.point, 'any', {}, undefined, s.reach, s.indoor, whenDay(s), nightHome(s, origin), DEST[s.dest].any).cards.map((c) => c.spot).find(shown) ?? null;
  }
  const tops = DEST[s.dest].any.flatMap((m) => moodExamples(s, spots, origin, m).slice(0, 1));
  return tops.sort((a, b) => b.score - a.score || byId(a.id, b.id))[0] ?? null;
}

export interface MarketRow {
  spot: Spot;
  /** "차로 약 25분" from the basis, or the area's name without one */
  where: string;
}
/** 오일장 open on `day`: with a basis, within 차로 30분, nearest first; without, all of them by score, with their area. */
export function openMarkets(spots: Spot[], origin: Origin | null, day: Day): MarketRow[] {
  const open = spots.filter((x) => listed(x) && x.market && marketDay(x.market, day) === 'open');
  if (!origin) return open.sort((a, b) => b.score - a.score || byId(a.id, b.id)).map((spot) => ({ spot, where: nearestArea(spot, openAreasOf(destOfId(spot.id))).label }));
  return open
    .filter((x) => withinReach('drive30', origin.point, x))
    .map((spot) => ({ spot, km: distanceKm(origin.point, spot) }))
    .sort((a, b) => a.km - b.km || byId(a.spot.id, b.spot.id))
    .map(({ spot }) => ({ spot, where: travelText(travel(origin.point, origin.isPoint, spot)) }));
}

/** 노을 볼 곳 (ADR-0083): from 2시간 30분 before the sunset until it, with 3 or more confirmed places within 차로 45분. */
export const DUSK_LEAD_MIN = 150;
const SUNSET_DRIVE_MAX = 45;
const SUNSET_MIN = 3;
/** the most rows the 노을 볼 곳 section lists */
export const SUNSET_LIST_MAX = 5;

/** The 노을 window: `clock` (minutes after midnight KST) is within 2시간 30분 before the sunset at `p`, and before it. */
export function duskNow(clock: number | null, p: Point, day: Day): boolean {
  if (clock == null) return false;
  const set = sunsetMinutes(p, day);
  return clock >= set - DUSK_LEAD_MIN && clock < set;
}

/** Places confirmed to see the sunset at `day`'s azimuth, within 차로 45분 of the basis (no ferry): those the
 * calculation sees setting over the sea first, then 오름·text-only ones (Amendment 1); nearest first in each. */
export function sunsetSpots(spots: Spot[], origin: Origin, day: Day): MarketRow[] {
  const az = sunsetBucket(origin.point, day);
  const out: { spot: Spot; tier: number; km: number; where: string }[] = [];
  for (const spot of spots) {
    if (!listed(spot) || !spot.sunsetView?.includes(az)) continue;
    const t = travel(origin.point, origin.isPoint, spot);
    if ((t.kind !== 'drive' && t.kind !== 'walk') || t.minutes > SUNSET_DRIVE_MAX) continue;
    const tier = !spot.sunsetSea || spot.sunsetSea.includes(az) ? 0 : 1;
    out.push({ spot, tier, km: distanceKm(origin.point, spot), where: travelText(t) });
  }
  return out
    .sort((a, b) => a.tier - b.tier || a.km - b.km || byId(a.spot.id, b.spot.id))
    .map(({ spot, where }) => ({ spot, where }));
}

/** 오늘 판's second line: at most one row, the one that is gone soonest if missed (ADR-0075 2) — 비 소식
 * (ADR-0076), then 노을 볼 곳 (ADR-0083, never under rain, only with 3 or more places), then the market. The
 * others fold into the grey date line. */
export type TodayAct = { k: 'rain' } | { k: 'sunset'; rows: MarketRow[] } | { k: 'market'; row: MarketRow };
export function todayActs(markets: MarketRow[], rain = false, sunset: MarketRow[] = []): TodayAct[] {
  return [
    ...(rain ? [{ k: 'rain' } as const] : []),
    ...(!rain && sunset.length >= SUNSET_MIN ? [{ k: 'sunset', rows: sunset } as const] : []),
    ...(markets.length ? [{ k: 'market', row: markets[0] } as const] : []),
  ];
}

/** 비 소식 shows: it rains (pop ≥ 60) in the area the home speaks for now. */
export const rainNow = (s: State): boolean => !!s.rain?.rain && s.rain.area === rainArea(s);

/** How many days ahead rowTimes looks. */
export const ROW_DAYS = 14;
const DAY_MS = 86_400_000;
/** 오늘 판's row ahead: when, from `now` through the next ROW_DAYS days, the home as it is set now (basis, the day viewed,
 * 뺀 곳) draws a row to tap, as merged [from, to) ms pairs — a market's day whole, else 노을 볼 곳's window, and 비 소식 for
 * the half hour its answer is kept. index.html's first script holds the row's place at those times, before the data.
 * None with 내 위치: the position is read anew each visit, often after the list, so a place held for it would be let go
 * and the row then come back (two moves instead of one). */
export function rowTimes(s: State, spots: Spot[], origin: Origin | null, now: number): number[] {
  const out: number[] = [];
  if (s.basis === 'gps') return out;
  const add = (from: number, until: number) => {
    const a = Math.round(Math.max(from, now));
    const to = Math.round(until);
    if (to <= a) return;
    if (out.length && out[out.length - 1] >= a) out[out.length - 1] = Math.max(out[out.length - 1], to);
    else out.push(a, to);
  };
  if (rainNow(s)) add(now, now + RAIN_TTL_MS);
  if (!origin) return out;
  const list = pickSpots(spots, s.visited);
  for (let i = 0; i < ROW_DAYS; i++) {
    const d = addDays(s.today, i);
    const view = s.when !== 'now' && s.when > d ? s.when : d;
    const start = Date.parse(`${d}T00:00:00+09:00`);
    if (openMarkets(list, origin, view).length) add(start, start + DAY_MS);
    else if (view === d && sunsetSpots(list, origin, d).length >= SUNSET_MIN) {
      const set = sunsetMinutes(origin.point, d);
      add(start + (set - DUSK_LEAD_MIN) * 60_000, start + set * 60_000);
    }
  }
  return out;
}

/** km along a meridian per degree of latitude (distanceKm's earth radius 6371) */
const KM_PER_LAT_DEG = (6371 * Math.PI) / 180;
export interface AreaTile {
  area: Area;
  photo: Spot | null;
}
/** 다른 동네 둘러보기: every area but the one the basis is in; its photo is the best non-food place within 5km of
 * its centre (score, then nearer, then id). */
export function otherAreas(spots: Spot[], origin: Origin | null, broken: readonly string[]): AreaTile[] {
  const here: AreaName | null = origin ? nearestArea(origin.point).name : null;
  const photos = spots.filter((x) => listed(x) && x.image && x.mood !== 'food' && !broken.includes(x.id));
  return AREAS.filter((a) => a.name !== here).map((area) => {
    const near = photos
      // the latitude gap alone is never longer than the distance: skip those 5km+ apart by it before the sines
      .filter((spot) => Math.abs(spot.lat - area.lat) * KM_PER_LAT_DEG < 5.01)
      .map((spot) => ({ spot, km: distanceKm(area, spot) }))
      .filter((c) => c.km < 5)
      .sort((a, b) => b.spot.score - a.spot.score || a.km - b.km || byId(a.spot.id, b.spot.id));
    return { area, photo: near[0]?.spot ?? null };
  });
}
