/**
 * 노을 보이는 곳 (ADR-0083, specs/sunset-view.md 「계산」): whether the sun sets over open sea as seen from a place,
 * for one sunset azimuth. Pure; the coastline comes in as closed rings of [lng, lat], ring 0 the main island
 * (data/coast/jeju-coast.geojson, largest first).
 *
 * A place sees the sunset at azimuth `az` when one of three rays (az − 10°, az, az + 10°) does all of:
 * - 300 m out, the ray is off land: outside the main island and outside the land the place itself is on;
 * - beyond 300 m it never crosses the main island's coast again within 20 km;
 * - beyond 300 m it never crosses the coast of the place's own land again (a small island's far side).
 * Other small islands on the way are allowed (the sun sets past them).
 */
const rad = Math.PI / 180;
const R = 6371000;

/** The three sunset azimuths (degrees from north): 동지 무렵, 봄·가을(10월 초), 하지 무렵. */
export const AZIMUTHS = [242, 264, 298];
export const NEAR_M = 300;
export const FAR_M = 20000;
const SPREAD = [-10, 0, 10];

/** Rings ([[lng, lat], ...] closed) → the shape the tests and the scan use: segments and per-ring boxes. */
export function prepareCoast(rings) {
  return rings.map((ring) => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [x, y] of ring) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    return { ring, box: [minX, minY, maxX, maxY] };
  });
}

/** Rings from the frozen GeoJSON (FeatureCollection of Polygons, outer rings only). */
export function ringsOf(geojson) {
  return geojson.features.map((f) => f.geometry.coordinates[0]);
}

function inRing(x, y, { ring, box }) {
  if (x < box[0] || x > box[2] || y < box[1] || y > box[3]) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** The ring a point is on (index), or -1 at sea. */
export function landOf(p, coast) {
  for (let k = 0; k < coast.length; k++) if (inRing(p.lng, p.lat, coast[k])) return k;
  return -1;
}

/** Distances (m) along the ray from `p` at `az` to where it crosses ring `k`'s coast, up to `len` m. */
function crossings(p, az, len, c) {
  const kx = 1 / (R * Math.cos(p.lat * rad) * rad);
  const ky = 1 / (R * rad);
  const ex = p.lng + Math.sin(az * rad) * len * kx;
  const ey = p.lat + Math.cos(az * rad) * len * ky;
  const [bx0, by0, bx1, by1] = c.box;
  if (Math.max(p.lng, ex) < bx0 || Math.min(p.lng, ex) > bx1 || Math.max(p.lat, ey) < by0 || Math.min(p.lat, ey) > by1) return [];
  const out = [];
  const r = c.ring;
  for (let i = 0; i + 1 < r.length; i++) {
    const [x1, y1] = r[i];
    const [x2, y2] = r[i + 1];
    if (Math.max(x1, x2) < Math.min(p.lng, ex) || Math.min(x1, x2) > Math.max(p.lng, ex) || Math.max(y1, y2) < Math.min(p.lat, ey) || Math.min(y1, y2) > Math.max(p.lat, ey)) continue;
    const d = (ex - p.lng) * (y2 - y1) - (ey - p.lat) * (x2 - x1);
    if (!d) continue;
    const t = ((x1 - p.lng) * (y2 - y1) - (y1 - p.lat) * (x2 - x1)) / d;
    const u = ((x1 - p.lng) * (ey - p.lat) - (y1 - p.lat) * (ex - p.lng)) / d;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) out.push(t * len);
  }
  return out;
}

/** The point `m` metres from `p` at `az`. */
export function along(p, az, m) {
  return { lat: p.lat + (Math.cos(az * rad) * m) / (R * rad), lng: p.lng + (Math.sin(az * rad) * m) / (R * Math.cos(p.lat * rad) * rad) };
}

/** One ray: off land at 300 m, then clear of the main island (20 km) and of its own land. */
export function rayClear(p, az, coast, home = landOf(p, coast)) {
  const out = along(p, az, NEAR_M);
  if (inRing(out.lng, out.lat, coast[0])) return false;
  if (home > 0 && inRing(out.lng, out.lat, coast[home])) return false;
  if (crossings(p, az, FAR_M, coast[0]).some((t) => t > NEAR_M)) return false;
  if (home > 0 && crossings(p, az, FAR_M, coast[home]).some((t) => t > NEAR_M)) return false;
  return true;
}

/** The sunset over open sea at `az`: any of the three rays clear. */
export function seesSunset(p, az, coast) {
  const home = landOf(p, coast);
  return SPREAD.some((o) => rayClear(p, az + o, coast, home));
}

/** The azimuths (of AZIMUTHS) a place sees the sunset at, in AZIMUTHS order. */
export function sunsetAzimuths(p, coast) {
  return AZIMUTHS.filter((az) => seesSunset(p, az, coast));
}
