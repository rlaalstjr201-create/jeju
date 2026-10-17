// 출시 스위치 (plans/busan.md): the one module that reads __BUSAN__ (vite.config.ts, on in mode `busan` only). The server
// functions and the tsx scripts never import it and never see the define: areas, destinations and their checks know
// nothing of the switch; the app filters where it takes a point or a link in.
import { destOf, type Dest } from './dest';
import type { Point } from './pick';

/** On in a build or test run with `--mode busan`; off (and safe to read) where no define exists. */
export const BUSAN: boolean = typeof __BUSAN__ !== 'undefined' && __BUSAN__;

export const released = (d: Dest): boolean => d === 'jeju' || BUSAN;

/** The destination a point is in, if it is open to visitors in this build; else null (as outside them all). */
export function releasedDestOf(p: Point): Dest | null {
  const d = destOf(p);
  return d && released(d) ? d : null;
}
