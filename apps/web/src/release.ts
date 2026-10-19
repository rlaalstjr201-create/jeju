// 출시 스위치 (plans/busan.md): the one module that reads __BUSAN__ (vite.config.ts, on in mode `busan` only). The server
// functions and the tsx scripts never import it and never see the define: areas, destinations and their checks know
// nothing of the switch; the app filters where it takes a point or a link in.
// Busan's own part (its 12 areas, its boundary, the 시작 화면's module: src/busan-part.ts) is a chunk of its own, asked for
// only where Busan is in play — the 시작 화면, a Busan link or a device that chose Busan (main.ts, before the app mounts),
// Busan chosen in the sheet, a position outside Jeju — so a Jeju visit never downloads it (plans/busan.md budget: the
// Korean entry ≤ 50 kB). Until it is in, Busan is not open: `released('busan')` is false and the app is Jeju's.
import { AREAS, inJeju, nearestArea, type Area } from './areas';
import type { Dest } from './dest';
import type { Point } from './pick';
import type { StartDeps, StartScreen } from './start';

/** On in a build or test run with `--mode busan`; off (and safe to read) where no define exists. */
export const BUSAN: boolean = typeof __BUSAN__ !== 'undefined' && __BUSAN__;

/** What src/busan-part.ts brings (nothing with the switch off, or before it is in). */
interface Part {
  areas: readonly Area[];
  inside(p: Point): boolean;
  mountStart(doc: Document, deps: StartDeps): StartScreen | null;
}
let part: Part | null = null;
const waiting: (() => void)[] = [];

/** Busan's 12 areas once its part is in; empty before (and always with the switch off). */
const BUSAN_OPEN: Area[] = [];
/** The areas the app may name: Jeju's 15, and Busan's 12 once its part is in. */
export const OPEN_AREAS: readonly Area[] = BUSAN ? [...AREAS] : AREAS;

/** Called by src/busan-part.ts when its chunk has run. */
export function installBusan(p: Part): void {
  if (!BUSAN || part) return;
  part = p;
  BUSAN_OPEN.push(...p.areas);
  (OPEN_AREAS as Area[]).push(...p.areas);
  for (const fn of waiting.splice(0)) fn();
}
/** `fn` now if Busan's part is in, else once it is (another language's area names, i18n/apply.ts). */
export function whenBusan(fn: () => void): void {
  if (part) fn();
  else waiting.push(fn);
}

let loading: Promise<boolean> | null = null;
/** Busan's part, asked for once (again after a failure); false with the switch off or when it could not be loaded. */
export function loadBusan(): Promise<boolean> {
  if (!BUSAN) return Promise.resolve(false);
  return (loading ??= import('./busan-part').then(
    (m) => (m.install(), true),
    () => ((loading = null), false),
  ));
}

/** The 시작 화면's module (src/start.ts), once Busan's part is in. */
export const startScreen = (): Part['mountStart'] | null => part?.mountStart ?? null;

export const released = (d: Dest): boolean => d === 'jeju' || (BUSAN && !!part);

/** The destination a point is in, if it is open to visitors in this build; else null (as outside them all). With the
 * switch off the boundary is never read (and, with it, never in the Jeju bundle: plans/busan.md budget). */
export function releasedDestOf(p: Point): Dest | null {
  return inJeju(p) ? 'jeju' : BUSAN && part?.inside(p) ? 'busan' : null;
}

/** One destination's areas (Jeju's with the switch off). */
export const openAreasOf = (d: Dest): readonly Area[] => (BUSAN && d === 'busan' ? BUSAN_OPEN : AREAS);
/** A point's 동네: the nearest centre of its destination's areas (Jeju's outside both, as before). */
export const areaOfPoint = (p: Point, d: Dest = releasedDestOf(p) ?? 'jeju'): Area => nearestArea(p, openAreasOf(d));
