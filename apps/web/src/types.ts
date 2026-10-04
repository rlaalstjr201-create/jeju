// Shared domain types (no runtime code).
import type { AreaName } from './areas';
import type { Day } from './dates';
import type { Point } from './pick';

export type Basis = 'gps' | 'stay' | 'region';
/** 숙소. `area` = the 동네 it belongs to (shown in the basis sheet); `source` = how it was set. */
export interface Stay extends Point {
  area: AreaName;
  source: 'gps' | 'area';
}
/** Permissions API answer for geolocation ('unknown' where the API is missing). */
export type GeoPermission = 'granted' | 'denied' | 'prompt' | 'unknown';
/** Why there is no usable position. */
export type NoOrigin = 'denied' | 'unavailable' | 'outside';
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
/** A saved place on a day. `order` = its place in that day's list (0, 1, 2, …). */
export interface SavedEntry {
  id: string;
  date: Day;
  order: number;
}
export interface Route {
  view: View;
  overlay: Overlay;
}
