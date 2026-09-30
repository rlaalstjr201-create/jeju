// Shared domain types (no runtime code).
import type { AreaName } from './areas';
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
export type Overlay = null | 'basis' | 'stay';
export interface Route {
  view: View;
  overlay: Overlay;
}
