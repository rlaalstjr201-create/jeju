// 해 지는 시각 (ADR-0075 2): NOAA's solar calculator (the spreadsheet form), on the device, no requests.
// Checked against Open-Meteo for 제주시 within ±2 minutes (tests/sun.test.ts).
import type { Day } from './dates';
import type { Point } from './pick';

const rad = Math.PI / 180;
/** KST, no daylight saving. */
const TZ_HOURS = 9;

/** The sun's declination (radians) and the equation of time (minutes) at `utcMin` on `day`. */
function solar(day: Day, utcMin: number): { decl: number; eqTime: number } {
  const [y, m, d] = day.split('-').map(Number);
  const jd = Date.UTC(y, m - 1, d) / 86400000 + 2440587.5 + utcMin / 1440;
  const t = (jd - 2451545) / 36525; // Julian centuries since J2000
  const l0 = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360;
  const ma = 357.52911 + t * (35999.05029 - 0.0001537 * t);
  const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const c = Math.sin(ma * rad) * (1.914602 - t * (0.004817 + 0.000014 * t)) + Math.sin(2 * ma * rad) * (0.019993 - 0.000101 * t) + Math.sin(3 * ma * rad) * 0.000289;
  const omega = 125.04 - 1934.136 * t;
  const lambda = l0 + c - 0.00569 - 0.00478 * Math.sin(omega * rad);
  const eps0 = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(omega * rad);
  const decl = Math.asin(Math.sin(eps * rad) * Math.sin(lambda * rad));
  const v = Math.tan((eps / 2) * rad) ** 2;
  const eqTime =
    (4 / rad) *
    (v * Math.sin(2 * l0 * rad) - 2 * e * Math.sin(ma * rad) + 4 * e * v * Math.sin(ma * rad) * Math.cos(2 * l0 * rad) - 0.5 * v * v * Math.sin(4 * l0 * rad) - 1.25 * e * e * Math.sin(2 * ma * rad));
  return { decl, eqTime };
}

/** Minutes after midnight UTC of `day` at which the sun sets at `p`, for the sun's position at `utcMin`. */
function setAt(p: Point, day: Day, utcMin: number): number {
  const { decl, eqTime } = solar(day, utcMin);
  // 90.833°: the sun's upper edge on the horizon, with refraction
  const ha = Math.acos(Math.cos(90.833 * rad) / (Math.cos(p.lat * rad) * Math.cos(decl)) - Math.tan(p.lat * rad) * Math.tan(decl)) / rad;
  return 720 - 4 * p.lng - eqTime + 4 * ha;
}

/** Sunset at `p` on `day`, in minutes after midnight KST. Two passes: the sun's position at the sunset itself. */
export function sunsetMinutes(p: Point, day: Day): number {
  const first = setAt(p, day, 18 * 60 - TZ_HOURS * 60);
  return setAt(p, day, first) + TZ_HOURS * 60;
}

/** 노을 볼 곳 (ADR-0083): the sunset's azimuth (degrees from north) at `p` on `day`, the geometric horizon. */
export function sunsetAzimuth(p: Point, day: Day): number {
  const { decl } = solar(day, 18 * 60 - TZ_HOURS * 60);
  return 360 - Math.acos(Math.sin(decl) / Math.cos(p.lat * rad)) / rad;
}

/** The one of `sunsetView`'s three azimuths (242·264·298) nearest the day's sunset. */
export function sunsetBucket(p: Point, day: Day): number {
  const az = sunsetAzimuth(p, day);
  return [242, 264, 298].reduce((best, a) => (Math.abs(a - az) < Math.abs(best - az) ? a : best));
}

/** "18:16" */
export function sunsetText(p: Point, day: Day): string {
  const m = Math.round(sunsetMinutes(p, day));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
