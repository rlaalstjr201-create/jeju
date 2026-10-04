/**
 * 노을 보이는 곳 (ADR-0083): freezes the OSM coastline into the build input data/coast/jeju-coast.geojson.
 * Input: an Overpass answer (JSON, `out geom`) to the query in data/coast/README.md. The ways are joined into
 * closed rings by their shared end nodes, each ring simplified (Douglas–Peucker, 5 m) and rounded to 5 decimals
 * (about 1 m). Rings come out largest first, so ring 0 is the main island. Prints the file's sha256.
 * Run once by hand: node scripts/coast-freeze.mjs <overpass.json>. The build never fetches.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TOLERANCE_M = 5;

/** Ways ({ nodes, geometry: [{lat, lon}] }) → closed rings of [lng, lat]. Throws on a way that does not close. */
export function stitch(ways) {
  const byStart = new Map(ways.map((w) => [w.nodes[0], w]));
  const used = new Set();
  const rings = [];
  for (const w of ways) {
    if (used.has(w.id)) continue;
    used.add(w.id);
    const nodes = [...w.nodes];
    const pts = w.geometry.map((g) => [g.lon, g.lat]);
    while (nodes.at(-1) !== nodes[0]) {
      const n = byStart.get(nodes.at(-1));
      if (!n || used.has(n.id)) throw new Error(`coastline way ${w.id} does not close`);
      used.add(n.id);
      nodes.push(...n.nodes.slice(1));
      pts.push(...n.geometry.slice(1).map((g) => [g.lon, g.lat]));
    }
    rings.push(pts);
  }
  return rings;
}

/** Douglas–Peucker on a local metric plane; the first and last points stay. */
export function simplify(pts, tolM) {
  if (pts.length < 4) return pts;
  const lat0 = pts[0][1] * (Math.PI / 180);
  const kx = 111320 * Math.cos(lat0);
  const ky = 110540;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = [pts[a][0] * kx, pts[a][1] * ky];
    const [bx, by] = [pts[b][0] * kx, pts[b][1] * ky];
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);
    let far = -1;
    let farD = tolM;
    for (let i = a + 1; i < b; i++) {
      const px = pts[i][0] * kx - ax;
      const py = pts[i][1] * ky - ay;
      const d = len ? Math.abs(px * dy - py * dx) / len : Math.hypot(px, py);
      if (d > farD) {
        farD = d;
        far = i;
      }
    }
    if (far > 0) {
      keep[far] = 1;
      stack.push([a, far], [far, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const src = process.argv[2];
  if (!src) throw new Error('usage: node scripts/coast-freeze.mjs <overpass.json>');
  const raw = JSON.parse(readFileSync(src, 'utf8'));
  const round = (v) => Math.round(v * 1e5) / 1e5;
  const rings = stitch(raw.elements.filter((e) => e.type === 'way'))
    .map((r) => simplify(r, TOLERANCE_M).map(([x, y]) => [round(x), round(y)]))
    .sort((a, b) => b.length - a.length);
  const out = {
    type: 'FeatureCollection',
    properties: { source: 'OpenStreetMap natural=coastline', osmBase: raw.osm3s?.timestamp_osm_base ?? null, license: 'ODbL 1.0, © OpenStreetMap contributors', simplifiedM: TOLERANCE_M },
    features: rings.map((ring, i) => ({ type: 'Feature', properties: { ring: i }, geometry: { type: 'Polygon', coordinates: [ring] } })),
  };
  const path = resolve(root, 'data/coast/jeju-coast.geojson');
  mkdirSync(dirname(path), { recursive: true });
  const text = `${JSON.stringify(out)}\n`;
  writeFileSync(path, text);
  const n = rings.reduce((t, r) => t + r.length, 0);
  console.log(`${rings.length} rings, ${n} points (from ${raw.elements.reduce((t, w) => t + (w.geometry?.length ?? 0), 0)}), sha256 ${createHash('sha256').update(text).digest('hex')}`);
}
