/**
 * One-off: re-geocode spots whose coordinates are a fallback, not the place (QA 2026-09-30, S9-4 data).
 *
 * Found: 16 spots sat on the Jeju City Hall geocoding fallback (33.499622,126.53119) although they are all
 * over the island, and 30-odd other points are shared by 3+ unrelated spots (a village / 동 centroid). The
 * app then says "여기서 걸어서 약 5분" for a place 30km away. Targets = every spot on a known fallback point,
 * plus every member of a group of 3+ spots on one exact coordinate unless all of them carry a Kakao place
 * id (several venues in one building, e.g. a hotel's restaurants, legitimately share a point).
 *
 * Each target is looked up once with the Kakao Local keyword API near where it should be (its source
 * area's centre for the City Hall fallback, the shared point otherwise). A hit is accepted only when the
 * place name matches and it lies inside that radius; two different same-name places → unresolved. The
 * result goes to review/geo/regeocode.json; build-spots.mjs applies it (matched → the Kakao point and
 * place id; unresolved → the spot is left out, recorded as "확인 실패", never as "없는 곳").
 *
 * The unresolved ones were then looked at by hand (Kakao candidates vs. the source summary and area);
 * review/geo/manual.json holds the ones judged to be the same place, each with its reason, and overrides
 * this file by id. Everything else unresolved stays out.
 *
 * Run once: `npx tsx scripts/regeocode.ts` (reads KAKAO_REST_API_KEY from the repo .env; GET only).
 * Already-decided ids in the output file are kept, so a re-run after a network failure only fills gaps.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { AREAS } from '../src/region/areas';
import { distanceKm, type Point } from '../src/pick/pick';
import { FALLBACK_POINTS, pointKey } from './positions.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
config({ path: resolve(root, '../../.env') });
const outPath = resolve(root, 'review/geo/regeocode.json');

const key = pointKey;

interface Spot {
  id: string;
  name: string;
  lat: number;
  lng: number;
  kakaoPlaceId: string | null;
}
export interface GeoFix {
  id: string;
  name: string;
  from: Point;
  status: 'matched' | 'unresolved';
  lat?: number;
  lng?: number;
  placeId?: string;
  placeName?: string;
  address?: string;
  note?: string;
}

// Source "area" (review/input) → where to look. 제주시내 spans 신제주·구제주.
const AREA_HINT: Record<string, Point> = Object.fromEntries(AREAS.map((a) => [a.name, { lat: a.lat, lng: a.lng }]));
AREA_HINT['제주시내'] = { lat: 33.4998, lng: 126.507 };
AREA_HINT['비양도'] = { lat: 33.4089, lng: 126.2297 };

const norm = (s: string) => s.replace(/\([^)]*\)|（[^）]*）/g, '').replace(/[\s·.,'"!&-]/g, '').toLowerCase();
const hangulOnly = (s: string) => s.replace(/[^가-힣0-9]/g, '');

/** Names the place might be listed under: as written, without the "(…)" part, each name inside the
 * brackets ("알밤(알바매기, 알밤오름)"), the Korean part only ("살롱드라방 SALON de LAVANT"). */
function variants(name: string): string[] {
  const bracket = /[(（]([^)）]*)[)）]/.exec(name)?.[1] ?? '';
  const out = [
    name.trim(),
    name.replace(/\s*[(（].*[)）]\s*/g, ' ').trim(),
    ...bracket.split(/[,，]/).map((x) => x.replace(/^구\s*/, '').trim()),
    name.replace(/[A-Za-z]+/g, ' ').replace(/\s+/g, ' ').trim(),
  ];
  return [...new Set(out.filter((q) => hangulOnly(q).length >= 2))];
}

function nameMatches(spotName: string, placeName: string): 'exact' | 'part' | null {
  const b = norm(placeName);
  let part = false;
  for (const v of variants(spotName)) {
    const a = norm(v);
    if (!a || !b) continue;
    if (a === b || hangulOnly(a) === hangulOnly(b)) return 'exact';
    const [short, long] = a.length <= b.length ? [a, b] : [b, a];
    // "돛오름" vs "돛오름 주차장" is not the place. Allowed: a branch suffix ("조은빵 아라점"), or a longer
    // official name around a 4+ letter core ("비양도의 비양나무자생지" / "비양나무자생지").
    if (short.length >= 3 && long.startsWith(short) && (short.length / long.length >= 0.6 || /점$/.test(long))) part = true;
    else if (short.length >= 4 && long.includes(short) && short.length / long.length >= 0.6) part = true;
  }
  return part ? 'part' : null;
}

interface Doc {
  id: string;
  place_name: string;
  address_name: string;
  road_address_name: string;
  x: string;
  y: string;
}

async function search(query: string, near: Point, radiusM: number): Promise<Doc[]> {
  const url = new URL('https://dapi.kakao.com/v2/local/search/keyword.json');
  url.searchParams.set('query', query);
  url.searchParams.set('x', String(near.lng));
  url.searchParams.set('y', String(near.lat));
  url.searchParams.set('radius', String(Math.min(20000, radiusM)));
  url.searchParams.set('sort', 'accuracy');
  url.searchParams.set('size', '15');
  const res = await fetch(url, { headers: { Authorization: `KakaoAK ${process.env.KAKAO_REST_API_KEY}` } });
  if (!res.ok) throw new Error(`Kakao ${res.status}`);
  return ((await res.json()) as { documents: Doc[] }).documents;
}

async function resolveOne(spot: Spot, near: Point, radiusKm: number): Promise<GeoFix> {
  const base: GeoFix = { id: spot.id, name: spot.name, from: { lat: spot.lat, lng: spot.lng }, status: 'unresolved' };
  for (const q of variants(spot.name)) {
    const docs = await search(q, near, Math.round(radiusKm * 1000));
    await new Promise((r) => setTimeout(r, 120));
    const hits = docs
      .map((d) => ({ d, p: { lat: Number(d.y), lng: Number(d.x) }, m: spot.kakaoPlaceId === d.id ? ('id' as const) : nameMatches(spot.name, d.place_name) }))
      .filter((h) => h.m && distanceKm(near, h.p) <= radiusKm);
    if (!hits.length) continue;
    const rank = { id: 0, exact: 1, part: 2 } as const;
    hits.sort((a, b) => rank[a.m!] - rank[b.m!] || distanceKm(near, a.p) - distanceKm(near, b.p));
    const best = hits[0];
    const rival = hits.find((h) => h !== best && rank[h.m!] === rank[best.m!] && distanceKm(h.p, best.p) > 1);
    if (rival && best.m !== 'id') return { ...base, note: `ambiguous: ${best.d.place_name} / ${rival.d.place_name}` };
    return {
      ...base,
      status: 'matched',
      lat: best.p.lat,
      lng: best.p.lng,
      placeId: best.d.id,
      placeName: best.d.place_name,
      address: best.d.road_address_name || best.d.address_name,
      note: best.m!,
    };
  }
  return { ...base, note: 'no matching place nearby' };
}

async function main() {
  if (!process.env.KAKAO_REST_API_KEY) throw new Error('KAKAO_REST_API_KEY missing');
  const spots = JSON.parse(readFileSync(resolve(root, 'public/spots.json'), 'utf8')) as Spot[];
  const areaById = new Map<string, string>();
  for (const f of readdirSync(resolve(root, 'review/input')).filter((f) => /^batch-\d{3}\.json$/.test(f))) {
    for (const i of JSON.parse(readFileSync(resolve(root, 'review/input', f), 'utf8')) as { id: string; area: string }[]) areaById.set(i.id, i.area);
  }
  const groups = new Map<string, Spot[]>();
  for (const s of spots) {
    const k = key(s);
    groups.set(k, [...(groups.get(k) ?? []), s]);
  }
  const fallback = new Set(FALLBACK_POINTS.map(key));
  const targets: { spot: Spot; near: Point; radiusKm: number }[] = [];
  for (const [k, g] of groups) {
    if (fallback.has(k)) {
      for (const s of g) {
        const hint = AREA_HINT[areaById.get(s.id) ?? ''];
        targets.push({ spot: s, near: hint ?? { lat: s.lat, lng: s.lng }, radiusKm: hint ? 15 : 40 });
      }
    } else if (g.length >= 3 && !g.every((s) => s.kakaoPlaceId)) {
      for (const s of g) targets.push({ spot: s, near: { lat: s.lat, lng: s.lng }, radiusKm: 10 });
    }
  }
  const done = new Map<string, GeoFix>(existsSync(outPath) ? (JSON.parse(readFileSync(outPath, 'utf8')) as GeoFix[]).map((f) => [f.id, f]) : []);
  for (const t of targets) {
    if (done.has(t.spot.id)) continue;
    done.set(t.spot.id, await resolveOne(t.spot, t.near, t.radiusKm));
  }
  mkdirSync(dirname(outPath), { recursive: true });
  const out = targets.map((t) => done.get(t.spot.id)!);
  writeFileSync(outPath, `${JSON.stringify(out, null, 1)}\n`);
  const matched = out.filter((f) => f.status === 'matched').length;
  console.log(JSON.stringify({ targets: out.length, matched, unresolved: out.length - matched }));
}

if (process.argv[1] && /regeocode\.ts$/.test(process.argv[1])) await main();
