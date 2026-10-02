// 홈 A′ (ADR-0075, specs/home-refresh.md): what the first screen shows besides the moods. Pure, no DOM — render.ts draws it.
import { AREAS, nearestArea, type Area, type AreaName } from './areas';
import type { Day } from './dates';
import { marketDay } from './market';
import { distanceKm, islandTop, listed, pool, tabOf, travel, travelText, withinReach, type Mood, type Point, type Spot } from './pick';
import { GPS_KEY, staticOrigin, whenDay, type State } from './state';
import type { Origin } from './types';

/** 제주시청: the sunset's place when the basis is not known yet. */
const CITY_HALL: Point = { lat: 33.4996, lng: 126.5312 };

/** The basis the home speaks for: 지역·숙소 centre, else this session's GPS fix (never a region origin read as GPS). */
export const homeOrigin = (s: State): Origin | null =>
  staticOrigin(s.basis, s.region, s.stay) ?? (s.origin?.key === GPS_KEY ? s.origin : null);

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

/** 오늘 판's second line: at most one row, the one that is gone soonest if missed (ADR-0075 2) — 비 소식 (U5)
 * goes in front of the market. The others fold into the grey date line. */
export type TodayAct = { k: 'market'; row: MarketRow };
export function todayActs(markets: MarketRow[]): TodayAct[] {
  return markets.length ? [{ k: 'market', row: markets[0] }] : [];
}

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
