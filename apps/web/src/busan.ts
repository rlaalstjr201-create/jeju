// 부산 (ADR-0094, specs/busan.md 2절): the destination's 12 areas and its boundary. Pure — it reads no build-time define —
// so the server functions and the tsx scripts may import it as they import areas.ts. The app's entry never imports it:
// it comes with the lazily loaded src/busan-part.ts (plans/busan.md budget: a Jeju visit downloads none of it).
import { AREAS, inJeju, nearestArea, type Area } from './areas';
import type { Dest } from './dest';
import type { Point } from './pick';
// only the ring: Vite's JSON import leaves the file's header (source, query, tolerance) out of the bundle
import { ring } from '../data/geo/busan-boundary.json';

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

/** Both destinations' areas, for what must know either (a stored name, a deep link's slug, the collector). */
export const ALL_AREAS: readonly Area[] = (AREAS as readonly Area[]).concat(BUSAN_AREAS);
/** The areas of a destination. */
export const areasOf = (dest: Dest): readonly Area[] => (dest === 'busan' ? BUSAN_AREAS : AREAS);

/** 부산광역시 (specs/busan.md 2절 「부산 안」): inside the OSM boundary, simplified to 400 m (data/geo/busan-boundary.json).
 * Even–odd ray test on [lng, lat]. */
export function inBusan(p: Point): boolean {
  if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return false;
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > p.lat !== yj > p.lat && p.lng < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/** The destination a point is in, or null outside them all. */
export const destOf = (p: Point): Dest | null => (inJeju(p) ? 'jeju' : inBusan(p) ? 'busan' : null);

/** The 동네 of a point: the nearest centre of its destination's areas (Jeju's outside both, as before). */
export const areaAt = (p: Point, dest: Dest = destOf(p) ?? 'jeju'): Area => nearestArea(p, areasOf(dest));
