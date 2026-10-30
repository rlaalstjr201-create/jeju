// Shared domain types (no runtime code).
import type { RegionName } from './areas';
import type { Day } from './dates';
import type { Dest } from './dest';
import type { Point } from './pick';

export type Basis = 'gps' | 'stay' | 'region';
/** 숙소. `area` = the 동네 it belongs to (shown in the basis sheet); `source` = how it was set (`link`: a 숙소
 * 링크, ADR-0089). */
export interface Stay extends Point {
  area: RegionName;
  source: 'gps' | 'area' | 'link';
}
/** Permissions API answer for geolocation ('unknown' where the API is missing). */
export type GeoPermission = 'granted' | 'denied' | 'prompt' | 'unknown';
/** Why there is no usable position. */
export type NoOrigin = 'denied' | 'unavailable' | 'outside';
/** Where a position `outside` the destination in use was (predeploy review M-1): outside Korea (nation.ts inKorea, drawn
 * wide), in Korea where no 시군구 is near, or in that destination. Only `abroad` is ever said to be outside Korea. */
export type OutsideAt = 'abroad' | 'nodata' | Dest;
/** The point cards are measured from. `key` identifies it across renders (basis + which 숙소/지역). */
export interface Origin {
  key: string;
  point: Point;
  /** a real position (GPS, or a 숙소 saved from GPS) — only then may a short hop read "걸어서". */
  isPoint: boolean;
  /** "여기서" / "숙소에서" / "애월에서" — prefixed to the first card's travel time. */
  from: string;
}
export type View = 'home' | 'cards' | 'saved';
/** 'move': the 다른 날로 sheet of a saved row. 'feedback': 의견 보내기 (ADR-0081). */
export type Overlay = null | 'basis' | 'stay' | 'move' | 'feedback';
/** The day hearts go to: 'now' = today (the default), or a later day (specs/date-mode.md). */
export type When = 'now' | Day;
/** A saved place on a day. `order` = its place in that day's list (0, 1, 2, …). `at` = the day it was saved
 * (ADR-0085): on this device only — never sent, never in a backup link; missing on rows saved before it was
 * kept and on rows brought back from a backup. */
export interface SavedEntry {
  id: string;
  date: Day;
  order: number;
  at?: Day;
}
export interface Route {
  view: View;
  overlay: Overlay;
}
