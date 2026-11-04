// 출시 스위치 (plans/busan.md): the one module that reads __BUSAN__ (vite.config.ts, on in mode `busan` only). The server
// functions and the tsx scripts never import it and never see the define: areas, destinations and their checks know
// nothing of the switch; the app filters where it takes a point or a link in.
// Busan's own part (its 12 areas, its boundary, the 시작 화면's module: src/busan-part.ts) is a chunk of its own, asked for
// only where Busan is in play — the 시작 화면, a Busan link or a device that chose Busan (main.ts, before the app mounts),
// Busan chosen in the sheet, a position outside Jeju — so a Jeju visit never downloads it (plans/busan.md budget: the
// Korean entry ≤ 50 kB). Until it is in, Busan is not open: `released('busan')` is false and the app is Jeju's.
import { AREAS, areaByName, inJeju, nearestArea, type Area, type SggArea, type SggCode } from './areas';
import { isSggDest, type Dest } from './dest';
import type { Region } from './nation';
import type { NationCopy } from './nation-part';
import type { Point } from './pick';
import type { StartDeps, StartScreen } from './start';
import type { OutsideAt } from './types';

/** On in a build or test run with `--mode busan`; off (and safe to read) where no define exists. */
export const BUSAN: boolean = typeof __BUSAN__ !== 'undefined' && __BUSAN__;
/** 자동 지역 (plans/nationwide-app.md 1.2): on in `vite build` and `--mode nation` (Busan on with it), off in `--mode busan`·`--mode jeju`; off where no define exists. */
export const NATION: boolean = typeof __NATION__ !== 'undefined' && __NATION__;

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

/** What src/nation-part.ts brings (plans/nationwide-app.md 1.1·9): the index's 시군구 as areas, where a point is, the
 * 이름 줄's word for a 시군구, and the places around one. */
interface NationPart {
  /** its 시군구, as areas */
  list: readonly SggArea[];
  region(p: Point): Region;
  /** outside Korea, drawn wide (nation.ts inKorea): in doubt, false */
  abroad(p: Point): boolean;
  short(sgg: string): string;
  spots(sgg: string): Promise<unknown>;
  /** its words (plans/nationwide-app.md 8) */
  copy: NationCopy;
  /** the 시도 that have a 시군구 in it, named in the page's language; a 시군구's 시도 */
  sido(): { c: string; name: string }[];
  sidoOf(sgg: string): string | null;
  /** 비 소식's KMA grid of a 시군구's centre (null: not one of its) */
  grid(sgg: string): { nx: number; ny: number } | null;
  /** the 동네 index (render.ts areaGroups), drawn with the app's option row */
  areas(parent: HTMLElement, where: string, selected: string | null, sgg: string | null, option: (label: string, sub: string | null, attrs: Record<string, string>) => HTMLButtonElement): void;
}
let nation: NationPart | null = null;
/** the 자동 지역's 시군구 once its part is in */
const NATION_OPEN: Area[] = [];
/** 강원's (ADR-0102): the 시군구 it covers, from the same index — it has no part of its own, its 동네 and where a point is
 * are the 자동 지역's */
const GANGWON_OPEN: Area[] = [];
/** 서울 (ADR-0106): its 구, like 강원's 시군구 */
const SEOUL_OPEN: Area[] = [];
const nationWaiting: (() => void)[] = [];

/** Called by src/nation-part.ts once it has read the index. */
export function installNation(p: NationPart): void {
  if (!NATION || nation) return;
  nation = p;
  for (const a of p.list) (a.group === 'gangwon' ? GANGWON_OPEN : a.group === 'seoul' ? SEOUL_OPEN : NATION_OPEN).push(a);
  (OPEN_AREAS as Area[]).push(...p.list);
  for (const fn of nationWaiting.splice(0)) fn();
}
/** `fn` now if the 자동 지역's part is in, else once it is (another language's words, i18n/apply.ts). */
export function whenNation(fn: () => void): void {
  if (nation) fn();
  else nationWaiting.push(fn);
}
/** The 자동 지역's part once it is in (its words, its 시도, its 동네 index), else null. */
export const nationPart = () => nation;
let nationLoading: Promise<boolean> | null = null;
/** The 자동 지역's part and its index (Busan's part with it: a point in Busan is Busan's), asked for once (again after a
 * failure); false with the switch off or when either could not be loaded. */
export function loadNation(): Promise<boolean> {
  if (!NATION) return Promise.resolve(false);
  const failed = () => ((nationLoading = null), false);
  return (nationLoading ??= Promise.all([loadBusan(), import('./nation-part').then((m) => m.install())]).then(([, ok]) => ok || failed(), failed));
}
/** A point's 시군구 in the 자동 지역 (null: in a 검수한 곳, outside Korea, or the part not in). */
export function sggOf(p: Point): SggCode | null {
  const r = nation?.region(p);
  return r?.k === 'auto' ? r.sgg : null;
}
/** The 이름 줄's word for a 시군구 ('' before the part is in). */
export const sggShort = (sgg: string): string => nation?.short(sgg) ?? '';
/** The places around a 시군구 (its file and its neighbours'), as the app's places. */
export const nationSpots = (sgg: string): Promise<unknown> => (nation ? nation.spots(sgg) : Promise.reject(new Error('no part')));

/** 오늘 근처에서 하는 것 (ADR-0112 8): its view and the list's ask, a chunk of its own (ADR-0100), asked for only on 서울's home
 * (app.ts askCulture), once (again after a failure); false with the switch off or when it could not be loaded. */
type CulturePart = typeof import('./culture-view');
let culture: CulturePart | null = null;
let cultureLoading: Promise<boolean> | null = null;
const cultureWaiting: ((p: CulturePart) => void)[] = [];
export function loadCulture(): Promise<boolean> {
  if (!NATION) return Promise.resolve(false);
  return (cultureLoading ??= import('./culture-view').then(
    (m) => {
      culture = m;
      for (const fn of cultureWaiting.splice(0)) fn(m);
      return true;
    },
    () => ((cultureLoading = null), false),
  ));
}
/** The culture part once it is in, else null. */
export const culturePart = () => culture;
/** `fn` now if the culture part is in, else once it is (another language's words, i18n/apply.ts). */
export function whenCulture(fn: (p: CulturePart) => void): void {
  if (culture) fn(culture);
  else cultureWaiting.push(fn);
}

/** 강원 (ADR-0102) opens with the 자동 지역's part: its 동네 and where a point is come from that index. */
export const released = (d: Dest): boolean => (d === 'nation' || isSggDest(d) ? NATION && !!nation : d === 'jeju' || (BUSAN && !!part));

/** The destination a point is in, if it is open to visitors in this build; else null (as outside them all). With the
 * switch off the boundary is never read (and, with it, never in the Jeju bundle: plans/busan.md budget). A 시군구 a
 * 검수한 곳 covers (강릉, ADR-0102) is that destination's. */
export function releasedDestOf(p: Point): Dest | null {
  if (inJeju(p)) return 'jeju';
  if (BUSAN && part?.inside(p)) return 'busan';
  const r = NATION ? nation?.region(p) : null;
  return r?.k === 'auto' ? 'nation' : r?.k === 'dest' && r.dest !== 'busan' && released(r.dest) ? r.dest : null;
}

/** Where a position is when it is not usable for the destination in use (predeploy review M-1): the open destination it
 * is in, else outside Korea or in Korea with no 시군구 near (`nodata`); undefined, outside every destination, before the
 * 자동 지역's part is in. */
export function outsideAt(p: Point): OutsideAt | undefined {
  return releasedDestOf(p) ?? (nation ? (nation.abroad(p) ? 'abroad' : 'nodata') : undefined);
}

/** A point's 시군구 by the 자동 지역's index, a 검수한 곳 named by 시군구 (강원) included (ADR-0104); null before the part is in. */
function sggAt(p: Point): SggCode | null {
  const r = nation?.region(p);
  return r?.sgg ?? null;
}

/** One destination's areas (Jeju's with the switch off). */
export const openAreasOf = (d: Dest): readonly Area[] =>
  BUSAN && d === 'busan' ? BUSAN_OPEN : NATION && d === 'nation' ? NATION_OPEN : NATION && d === 'gangwon' ? GANGWON_OPEN : NATION && d === 'seoul' ? SEOUL_OPEN : AREAS;
/** A point's 동네: the nearest centre of its destination's areas (Jeju's outside both, as before); in the 자동 지역, its
 * 시군구 (sggOf: an island's is not always the nearest centre); in 강원, the 시군구 regionOf says when it is one of 강원's
 * (ADR-0104: 횡계 is 평창's though 강릉's centre is nearer). */
export const areaOfPoint = (p: Point, d: Dest = releasedDestOf(p) ?? 'jeju'): Area =>
  (NATION && d === 'nation' && areaByName(sggOf(p), NATION_OPEN)) || (NATION && isSggDest(d) && areaByName(sggAt(p), openAreasOf(d))) || nearestArea(p, openAreasOf(d));
