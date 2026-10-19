// 출시 스위치 (plans/busan.md): the one module that reads __BUSAN__ (vite.config.ts, on in mode `busan` only). The server
// functions and the tsx scripts never import it and never see the define: areas, destinations and their checks know
// nothing of the switch; the app filters where it takes a point or a link in.
import { ALL_AREAS, AREAS, BUSAN_AREAS, inJeju, nearestArea, type Area } from './areas';
import { inBusan, type Dest } from './dest';
import type { Point } from './pick';

/** On in a build or test run with `--mode busan`; off (and safe to read) where no define exists. */
export const BUSAN: boolean = typeof __BUSAN__ !== 'undefined' && __BUSAN__;

export const released = (d: Dest): boolean => d === 'jeju' || BUSAN;

/** The destination a point is in, if it is open to visitors in this build; else null (as outside them all). With the
 * switch off the boundary is never read (and, with it, never in the Jeju bundle: plans/busan.md budget). */
export function releasedDestOf(p: Point): Dest | null {
  return inJeju(p) ? 'jeju' : BUSAN && inBusan(p) ? 'busan' : null;
}

/** The areas the app may name: Jeju's 15, and Busan's 12 with the switch on. */
export const OPEN_AREAS: readonly Area[] = BUSAN ? ALL_AREAS : AREAS;
/** One destination's areas (Jeju's with the switch off). */
export const openAreasOf = (d: Dest): readonly Area[] => (BUSAN && d === 'busan' ? BUSAN_AREAS : AREAS);
/** A point's 동네: the nearest centre of its destination's areas (Jeju's outside both, as before). */
export const areaOfPoint = (p: Point, d: Dest = releasedDestOf(p) ?? 'jeju'): Area => nearestArea(p, openAreasOf(d));
