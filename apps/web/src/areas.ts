// 15 destination areas with fixed centres (ADR-0029, plans/tomorrow-picker.md "지역 15곳 중심 좌표").
import { distanceKm, type Point } from './pick';

// Listed west → east within each group (longitude order), so the grid reads like a map (design/SPEC.md §6.8).
// `name` is the stored key (plans/tomorrow-picker.md); `label` is how it is written on screen.
export const AREAS = [
  { name: '한경', label: '한경', lat: 33.3274, lng: 126.2212, group: 'jeju' },
  { name: '한림', label: '한림', lat: 33.3957, lng: 126.2651, group: 'jeju' },
  { name: '애월', label: '애월', lat: 33.4475, lng: 126.3678, group: 'jeju' },
  { name: '신제주', label: '신제주', lat: 33.487, lng: 126.488, group: 'jeju' },
  { name: '구제주', label: '구제주', lat: 33.5125, lng: 126.526, group: 'jeju' },
  { name: '조천', label: '조천', lat: 33.5012, lng: 126.6668, group: 'jeju' },
  { name: '구좌', label: '구좌', lat: 33.5189, lng: 126.8079, group: 'jeju' },
  { name: '우도', label: '우도', lat: 33.5079, lng: 126.9538, group: 'jeju' },
  { name: '대정', label: '대정', lat: 33.2472, lng: 126.2689, group: 'seogwipo' },
  { name: '안덕', label: '안덕', lat: 33.2693, lng: 126.3295, group: 'seogwipo' },
  { name: '중문', label: '중문', lat: 33.2576, lng: 126.4205, group: 'seogwipo' },
  { name: '서귀포시내', label: '서귀포 시내', lat: 33.2573, lng: 126.5338, group: 'seogwipo' },
  { name: '남원', label: '남원', lat: 33.3053, lng: 126.6735, group: 'seogwipo' },
  { name: '표선', label: '표선', lat: 33.3643, lng: 126.7973, group: 'seogwipo' },
  { name: '성산', label: '성산', lat: 33.4387, lng: 126.9026, group: 'seogwipo' },
] as const;
export type Area = (typeof AREAS)[number];
export type AreaName = Area['name'];

export const AREA_GROUPS: readonly { group: Area['group']; heading: string }[] = [
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

export const areaByName = (name: unknown): Area | null =>
  typeof name === 'string' ? AREAS.find((a) => a.name === name) ?? null : null;

/** On-screen name of a stored area key ('서귀포시내' → '서귀포 시내'). */
export const areaLabel = (name: AreaName): string => areaByName(name)?.label ?? name;

export function nearestArea(p: Point): Area {
  let best: Area = AREAS[0];
  let bestKm = Infinity;
  for (const a of AREAS) {
    const km = distanceKm(p, a);
    if (km < bestKm) {
      best = a;
      bestKm = km;
    }
  }
  return best;
}

const JEJU = { latMin: 33.0, latMax: 33.7, lngMin: 126.0, lngMax: 127.1 };
export const inJeju = (p: Point) =>
  Number.isFinite(p.lat) &&
  Number.isFinite(p.lng) &&
  p.lat >= JEJU.latMin &&
  p.lat <= JEJU.latMax &&
  p.lng >= JEJU.lngMin &&
  p.lng <= JEJU.lngMax;
