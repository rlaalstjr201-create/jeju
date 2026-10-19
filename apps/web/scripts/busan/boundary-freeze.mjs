/**
 * 부산 경계 (plans/busan.md S5, specs/busan.md 2절 「부산 안」): freezes OSM's 부산광역시 boundary (relation 2396450, admin_level 4)
 * into data/geo/busan-boundary.json, the one ring src/dest.ts tests a point against. Input: an Overpass answer (JSON,
 * `out geom`) to `relation(2396450);out geom;`. The outer ways are joined end to end into one closed ring, simplified
 * (Douglas–Peucker, TOLERANCE_M on a local metric plane, scripts/coast-freeze.mjs) and rounded to 4 decimals (about 10 m).
 * Run once by hand: node scripts/busan/boundary-freeze.mjs <overpass.json>. The build and the app never fetch.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { simplify } from '../coast-freeze.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const OUT = resolve(root, 'data/geo/busan-boundary.json');
export const TOLERANCE_M = 400;

/** The relation's outer ways ([lng, lat] lists) → one closed ring, joined where an end meets an end. Throws unless they
 * make exactly one closed ring. */
export function oneRing(ways) {
  const key = (p) => `${p[0]},${p[1]}`;
  const left = ways.map((w) => [...w]);
  let ring = left.shift();
  while (left.length) {
    const end = key(ring.at(-1));
    const i = left.findIndex((w) => key(w[0]) === end || key(w.at(-1)) === end);
    if (i < 0) throw new Error(`boundary: ${left.length} way(s) do not join the ring`);
    const [w] = left.splice(i, 1);
    ring = ring.concat((key(w[0]) === end ? w : [...w].reverse()).slice(1));
  }
  if (key(ring[0]) !== key(ring.at(-1))) throw new Error('boundary: the ring does not close');
  return ring;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const src = process.argv[2];
  if (!src) throw new Error('usage: node scripts/busan/boundary-freeze.mjs <overpass.json>');
  const text = readFileSync(src);
  const raw = JSON.parse(text.toString('utf8'));
  const rel = raw.elements.find((e) => e.type === 'relation' && e.id === 2396450);
  if (!rel) throw new Error('boundary: relation 2396450 (부산광역시) is not in the input');
  const ways = rel.members.filter((m) => m.type === 'way' && m.role === 'outer').map((m) => m.geometry.map((g) => [g.lon, g.lat]));
  const full = oneRing(ways);
  const round = (v) => Math.round(v * 1e4) / 1e4;
  const ring = simplify(full, TOLERANCE_M).map(([x, y]) => [round(x), round(y)]);
  const out = {
    source: 'OpenStreetMap relation 2396450 부산광역시 (boundary=administrative, admin_level=4). © OpenStreetMap contributors, ODbL 1.0',
    fetched: raw.osm3s?.timestamp_osm_base ?? null,
    query: 'relation(2396450);out geom;',
    input: { sha256: createHash('sha256').update(text).digest('hex'), ways: ways.length, points: full.length },
    toleranceM: TOLERANCE_M,
    decimals: 4,
    points: ring.length,
    ring,
  };
  mkdirSync(dirname(OUT), { recursive: true });
  const body = `${JSON.stringify(out)}\n`;
  writeFileSync(OUT, body);
  console.log(`busan-boundary.json: ${ring.length} points (from ${full.length}), sha256 ${createHash('sha256').update(body).digest('hex')}`);
}
