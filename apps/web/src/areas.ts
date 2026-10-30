// 15 destination areas with fixed centres (ADR-0029, plans/tomorrow-picker.md "지역 15곳 중심 좌표").
import type { BUSAN_AREAS } from './busan';
import type { Dest } from './dest';
import { distanceKm, islandOf, type Point } from './pick';

// Listed west → east within each group (longitude order), so the grid reads like a map (design/SPEC.md §6.9).
// `name` is the stored key (plans/tomorrow-picker.md); `slug` is its URL name (specs/seo-landing.md, the deep link of
// ADR-0067); `label` is how it is written on screen; `landmark` is
// the one place a traveller knows there, written under the name in the area index (SPEC §6.9, D7).
export const AREAS = [
  { name: '한경', slug: 'hangyeong', label: '한경', landmark: '수월봉', lat: 33.3274, lng: 126.2212, group: 'jeju' },
  { name: '한림', slug: 'hallim', label: '한림', landmark: '협재', lat: 33.3957, lng: 126.2651, group: 'jeju' },
  { name: '애월', slug: 'aewol', label: '애월', landmark: '한담', lat: 33.4475, lng: 126.3678, group: 'jeju' },
  { name: '신제주', slug: 'sinjeju', label: '신제주', landmark: '공항 근처', lat: 33.487, lng: 126.488, group: 'jeju' },
  { name: '구제주', slug: 'gujeju', label: '구제주', landmark: '동문시장', lat: 33.5125, lng: 126.526, group: 'jeju' },
  { name: '조천', slug: 'jocheon', label: '조천', landmark: '함덕', lat: 33.5012, lng: 126.6668, group: 'jeju' },
  { name: '구좌', slug: 'gujwa', label: '구좌', landmark: '월정리', lat: 33.5189, lng: 126.8079, group: 'jeju' },
  { name: '우도', slug: 'udo', label: '우도', landmark: '배로 가는 섬', lat: 33.5079, lng: 126.9538, group: 'jeju' },
  { name: '대정', slug: 'daejeong', label: '대정', landmark: '모슬포', lat: 33.2472, lng: 126.2689, group: 'seogwipo' },
  { name: '안덕', slug: 'andeok', label: '안덕', landmark: '산방산', lat: 33.2693, lng: 126.3295, group: 'seogwipo' },
  { name: '중문', slug: 'jungmun', label: '중문', landmark: '주상절리', lat: 33.2576, lng: 126.4205, group: 'seogwipo' },
  { name: '서귀포시내', slug: 'seogwipo', label: '서귀포 시내', landmark: '올레시장', lat: 33.2573, lng: 126.5338, group: 'seogwipo' },
  { name: '남원', slug: 'namwon', label: '남원', landmark: '위미', lat: 33.3053, lng: 126.6735, group: 'seogwipo' },
  { name: '표선', slug: 'pyoseon', label: '표선', landmark: '성읍', lat: 33.3643, lng: 126.7973, group: 'seogwipo' },
  { name: '성산', slug: 'seongsan', label: '성산', landmark: '일출봉', lat: 33.4387, lng: 126.9026, group: 'seogwipo' },
] as const;

/** 시군구 code (lDongRegnCd + lDongSignguCd, src/nation.ts SGG_CODE). */
export type SggCode = `${number}`;
/** A 시군구 as the 자동 지역's 동네 (plans/nationwide-app.md 1.4): named by its code (`중구`, `고성군` are not one place each);
 * `label` its name (`강릉시`), `landmark` its 시도's short name. From the index, once the 자동 지역's part is in. */
export interface SggArea {
  name: SggCode;
  slug: SggCode;
  label: string;
  landmark: string;
  lat: number;
  lng: number;
  group: 'nation';
}
/** A destination's area: Jeju's 15 here, Busan's 12 in src/busan.ts (BUSAN_AREAS, ALL_AREAS) — a module of its own
 * that the app's entry never imports (plans/busan.md budget) — and the 자동 지역's 시군구. */
export type Area = (typeof AREAS)[number] | (typeof BUSAN_AREAS)[number] | SggArea;
/** a 검수한 곳's 동네 */
export type AreaName = Exclude<Area, SggArea>['name'];
/** a 동네 of any destination: a 검수한 곳's, or a 시군구 */
export type RegionName = AreaName | SggCode;
export const destOfArea = (a: Area): Dest => (a.group === 'busan' ? 'busan' : a.group === 'nation' ? 'nation' : 'jeju');

export const AREA_GROUPS: readonly { group: (typeof AREAS)[number]['group']; heading: string }[] = [
  { group: 'jeju', heading: '제주시 쪽' },
  { group: 'seogwipo', heading: '서귀포 쪽' },
];

/** Region names written by the 4-region build (af3f008) → the nearest of the 15 areas. */
export const LEGACY_REGION: Readonly<Record<string, AreaName>> = {
  제주시: '구제주',
  서귀포: '서귀포시내',
  동쪽: '성산',
  서쪽: '한림',
};

/** The area of that name among `areas` (Jeju's 15 unless given; the app passes release.ts OPEN_AREAS). */
export const areaByName = (name: unknown, areas: readonly Area[] = AREAS): Area | null =>
  typeof name === 'string' ? areas.find((a) => a.name === name) ?? null : null;

/** On-screen name of a stored area key ('서귀포시내' → '서귀포 시내'). */
export const areaLabel = (name: RegionName, areas: readonly Area[] = AREAS): string => areaByName(name, areas)?.label ?? name;

/** The area whose centre is nearest, among `areas` (Jeju's 15 unless given). */
export function nearestArea<A extends Area = (typeof AREAS)[number]>(p: Point, areas: readonly A[] = AREAS as readonly Area[] as readonly A[]): A {
  let best: A = areas[0];
  let bestKm = Infinity;
  for (const a of areas) {
    const km = distanceKm(p, a);
    if (km < bestKm) {
      best = a;
      bestKm = km;
    }
  }
  return best;
}

const JEJU = { latMin: 33.0, latMax: 33.7, lngMin: 126.0, lngMax: 127.1 };
/** Jeju's box, and 추자도 (제주시 추자면, north of it: pick.ts's island box) */
export const inJeju = (p: Point) =>
  Number.isFinite(p.lat) &&
  Number.isFinite(p.lng) &&
  ((p.lat >= JEJU.latMin && p.lat <= JEJU.latMax && p.lng >= JEJU.lngMin && p.lng <= JEJU.lngMax) || islandOf(p) === '추자도');
