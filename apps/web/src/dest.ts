// 여행지 (ADR-0094, specs/busan.md, plans/busan.md): which destination a point is in. Pure — it reads no build-time
// define — so the server functions and the tsx scripts may import it as they import areas.ts. Whether a destination
// is open to visitors yet is src/release.ts's question, asked only where the app takes a point in.
import { areasOf, inJeju, nearestArea, type Area } from './areas';
import type { Point } from './pick';
// only the ring: Vite's JSON import leaves the file's header (source, query, tolerance) out of the bundle
import { ring } from '../data/geo/busan-boundary.json';

export type Dest = 'jeju' | 'busan';
export const DESTS: readonly Dest[] = ['jeju', 'busan'];

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

/** A destination's id prefix (specs/busan.md 3.1): Busan ids are `bs-<contentid>`, Jeju's are UUIDs. */
export const destOfId = (id: string): Dest => (id.startsWith('bs-') ? 'busan' : 'jeju');

/** The 동네 of a point: the nearest centre of its destination's areas (Jeju's outside both, as before). */
export const areaAt = (p: Point, dest: Dest = destOf(p) ?? 'jeju'): Area => nearestArea(p, areasOf(dest));
