// 15 destination areas with fixed centres (ADR-0029, plans/tomorrow-picker.md "지역 15곳 중심 좌표").
import { distanceKm, type Point } from './pick';

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

/** 부산 세부 지역 12곳 (specs/busan.md 2절), west → east, one group with no heading. The centre is the 대표 지명's own point
 * (review/busan/areas-criteria.md 고침 2·3, areas-02.json). `AREAS` stays Jeju's 15: the landing pages, the sitemap and
 * the other Jeju readers never see these (plans/busan.md M1). */
export const BUSAN_AREAS = [
  { name: '다대포', slug: 'dadaepo', label: '다대포', landmark: '다대포해수욕장', lat: 35.0462, lng: 128.9632, group: 'busan' },
  { name: '송도·감천', slug: 'gamcheon', label: '송도·감천', landmark: '감천문화마을', lat: 35.0975, lng: 129.0106, group: 'busan' },
  { name: '원도심', slug: 'nampo', label: '원도심', landmark: '자갈치시장', lat: 35.0966, lng: 129.0306, group: 'busan' },
  { name: '영도', slug: 'yeongdo', label: '영도', landmark: '흰여울마을', lat: 35.0799, lng: 129.0435, group: 'busan' },
  { name: '부산역·초량', slug: 'choryang', label: '부산역·초량', landmark: '이바구길', lat: 35.1169, lng: 129.0367, group: 'busan' },
  { name: '서면', slug: 'seomyeon', label: '서면', landmark: '서면', lat: 35.1557, lng: 129.0579, group: 'busan' },
  { name: '동래·금정', slug: 'dongnae', label: '동래·금정', landmark: '범어사', lat: 35.2838, lng: 129.0702, group: 'busan' },
  { name: '오륙도·용호', slug: 'yongho', label: '오륙도·용호', landmark: '오륙도', lat: 35.092, lng: 129.1269, group: 'busan' },
  { name: '광안리', slug: 'gwangalli', label: '광안리', landmark: '광안대교', lat: 35.1475, lng: 129.1301, group: 'busan' },
  { name: '센텀', slug: 'centum', label: '센텀', landmark: '센텀시티', lat: 35.1688, lng: 129.1295, group: 'busan' },
  { name: '해운대', slug: 'haeundae', label: '해운대', landmark: '해운대해수욕장', lat: 35.1591, lng: 129.1603, group: 'busan' },
  { name: '송정·기장', slug: 'songjeong', label: '송정·기장', landmark: '해동용궁사', lat: 35.1882, lng: 129.2235, group: 'busan' },
] as const;
/** Both destinations' areas, for what must know either (a stored name, a deep link's slug). */
export type Area = (typeof AREAS)[number] | (typeof BUSAN_AREAS)[number];
// pure: a Jeju build, which never reads it (release.ts OPEN_AREAS), leaves it and BUSAN_AREAS out
export const ALL_AREAS: readonly Area[] = /* @__PURE__ */ (AREAS as readonly Area[]).concat(BUSAN_AREAS);
export type AreaName = Area['name'];
/** The areas of a destination (src/dest.ts Dest; areas.ts imports nothing from it). */
export const areasOf = (dest: 'jeju' | 'busan'): readonly Area[] => (dest === 'busan' ? BUSAN_AREAS : AREAS);
export const destOfArea = (a: Area): 'jeju' | 'busan' => (a.group === 'busan' ? 'busan' : 'jeju');

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
export const areaLabel = (name: AreaName, areas: readonly Area[] = AREAS): string => areaByName(name, areas)?.label ?? name;

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
export const inJeju = (p: Point) =>
  Number.isFinite(p.lat) &&
  Number.isFinite(p.lng) &&
  p.lat >= JEJU.latMin &&
  p.lat <= JEJU.latMax &&
  p.lng >= JEJU.lngMin &&
  p.lng <= JEJU.lngMax;
