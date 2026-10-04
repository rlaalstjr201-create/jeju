// 홈 A′ (ADR-0075, specs/home-refresh.md): what the first screen shows besides the moods. Pure, no DOM — render.ts draws it.
import { AREAS, nearestArea, type Area, type AreaName } from './areas';
import type { Day } from './dates';
import { marketDay } from './market';
import { distanceKm, islandTop, listed, pool, tabOf, travel, travelText, withinReach, type Mood, type Point, type Spot } from './pick';
import { rainArea, whenDay, type State } from './state';
import { sunsetBucket, sunsetMinutes } from './sun';
import type { Origin } from './types';

/** 제주시청: the sunset's place when the basis is not known yet. */
const CITY_HALL: Point = { lat: 33.4996, lng: 126.5312 };

export { homeOrigin } from './state';

export const sunPoint = (origin: Origin | null): Point => origin?.point ?? CITY_HALL;

/** 「예: A, B」 and the two photos: the first two the mood's cards would show now (pool — range, 실내, the day),
 * the whole island by score without an origin. Places without a photo (or whose photo failed) are skipped. */
export function moodExamples(s: State, spots: Spot[], origin: Origin | null, mood: Mood): Spot[] {
  const tab = tabOf(mood, s.sub, s.newSub);
  const day = whenDay(s);
  const list = origin ? pool(spots, origin.point, mood, tab, s.reach, s.indoor, day).map((c) => c.spot) : islandTop(spots, mood, tab, s.indoor, day);
  return list.filter((x) => x.image && !s.broken.includes(x.id)).slice(0, 2);
}

export interface MarketRow {
  spot: Spot;
  /** "차로 약 25분" from the basis, or the area's name without one */
  where: string;
}
/** 오일장 open on `day`: with a basis, within 차로 30분, nearest first; without, all of them by score, with their area. */
export function openMarkets(spots: Spot[], origin: Origin | null, day: Day): MarketRow[] {
  const open = spots.filter((x) => listed(x) && x.market && marketDay(x.market, day) === 'open');
  if (!origin) return open.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).map((spot) => ({ spot, where: nearestArea(spot).label }));
  return open
    .filter((x) => withinReach('drive30', origin.point, x))
    .map((spot) => ({ spot, km: distanceKm(origin.point, spot) }))
    .sort((a, b) => a.km - b.km || a.spot.id.localeCompare(b.spot.id))
    .map(({ spot }) => ({ spot, where: travelText(travel(origin.point, origin.isPoint, spot)) }));
}

/** 노을 볼 곳 (ADR-0083): from 2시간 30분 before the sunset until it, with 3 or more confirmed places within 차로 45분. */
export const DUSK_LEAD_MIN = 150;
export const SUNSET_DRIVE_MAX = 45;
export const SUNSET_MIN = 3;
/** the most rows the 노을 볼 곳 section lists */
export const SUNSET_LIST_MAX = 5;

/** The 노을 window: `clock` (minutes after midnight KST) is within 2시간 30분 before the sunset at `p`, and before it. */
export function duskNow(clock: number | null, p: Point, day: Day): boolean {
  if (clock == null) return false;
  const set = sunsetMinutes(p, day);
  return clock >= set - DUSK_LEAD_MIN && clock < set;
}

/** Places confirmed to see the sunset at `day`'s azimuth, within 차로 45분 of the basis (no ferry), nearest first. */
export function sunsetSpots(spots: Spot[], origin: Origin, day: Day): MarketRow[] {
  const az = sunsetBucket(origin.point, day);
  const out: { spot: Spot; minutes: number; km: number; where: string }[] = [];
  for (const spot of spots) {
    if (!listed(spot) || !spot.sunsetView?.includes(az)) continue;
    const t = travel(origin.point, origin.isPoint, spot);
    if ((t.kind !== 'drive' && t.kind !== 'walk') || t.minutes > SUNSET_DRIVE_MAX) continue;
    out.push({ spot, minutes: t.minutes, km: distanceKm(origin.point, spot), where: travelText(t) });
  }
  return out.sort((a, b) => a.km - b.km || a.spot.id.localeCompare(b.spot.id)).map(({ spot, where }) => ({ spot, where }));
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
      .map((spot) => ({ spot, km: distanceKm(area, spot) }))
      .filter((c) => c.km < 5)
      .sort((a, b) => b.spot.score - a.spot.score || a.km - b.km || a.spot.id.localeCompare(b.spot.id));
    return { area, photo: near[0]?.spot ?? null };
  });
}
