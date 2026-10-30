// 자동 지역 (ADR-0101, plans/nationwide-app.md 0·2): what scripts/nation/build.mjs ships under /nation/ and the app's
// reading of it. Pure — no fetch, no build-time define — so tests and scripts may import it. The app reaches it through
// src/nation-part.ts only (its own chunk).
import type { SggCode } from './areas';
import { cleanName } from './data';
import type { Dest } from './dest';
import { distanceKm, type Mood, type Point, type Spot } from './pick';

/** The moods a 자동 지역 record may carry: no 쉬기, no 유명한 데 (ADR-0101 2). */
export type NationMood = Extract<Mood, 'walk' | 'new' | 'food'>;
const MOODS: readonly NationMood[] = ['walk', 'new', 'food'];
/** 시군구 code (lDongRegnCd + lDongSignguCd) */
export const SGG_CODE = /^\d{4,8}$/;
/** 섬 군 (plans/nationwide-app.md 13 R9): 울릉군, 옹진군 — their places only when the start is in that 군 */
export const ISLAND_SGG: readonly string[] = ['47940', '28720'];

/** One record of a `nation/<f>.json` file, as shipped. No reason. */
export interface NationRecord {
  id: string;
  name: string;
  lat: number;
  lng: number;
  sgg: string;
  /** lclsSystm1, 2, 3 */
  cat: string[];
  image: string;
  moods: NationMood[];
  /** 먹기: meal | cafe; 새로운 것: sight (plans/nationwide-app.md header) */
  sub?: 'meal' | 'cafe' | 'sight';
  indoor?: true;
}

/** `nation/index.json` */
export interface NationIndex {
  v: 1;
  /** what passed N2's measure: the moods offered, and whether 실내만 is */
  rules: { moods: NationMood[]; indoor: boolean };
  /** 시도: code, name, short name */
  sido: { c: string; n: string; s: string }[];
  /** 시군구: code, name, its 시도's code, the median point of its records, the file its records are in, and the points a
   * position is told by (ADR-0104: up to 8 k-means points of its records; shipped as `p`, 0.001° off the median point) */
  sgg: { c: string; n: string; s: string; lat: number; lng: number; f: string; a?: Point[] }[];
  /** file key → its version (`nation/<key>.json?v=<version>`) */
  files: Record<string, string>;
}

/** A 자동 지역 place as the app holds it: a Spot (reason '', score 3, no 카카오 id) with all its moods and its 시군구. */
export interface NationSpot extends Spot {
  moods: NationMood[];
  sgg: string;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

/** A row's points (ADR-0104) from its `p`; its median point alone when it has none this app can read. */
function anchorsOf(x: Record<string, unknown>): Point[] {
  const lat = x.lat as number;
  const lng = x.lng as number;
  const p = x.p;
  if (!Array.isArray(p) || !p.length || p.length % 2 || !p.every((d) => Number.isInteger(d) && Math.abs(d) <= 5000)) return [{ lat, lng }];
  const out: Point[] = [];
  for (let i = 0; i < p.length; i += 2) out.push({ lat: lat + (p[i] as number) / 1000, lng: lng + (p[i + 1] as number) / 1000 });
  return out;
}

/** The index, or null when it is not one this app can read. Rows it cannot use (a bad code or point, a file not in
 * `files`) are left out; a mood it does not know is not offered. */
export function parseIndex(raw: unknown): NationIndex | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const rules = o.rules as Record<string, unknown> | null;
  if (o.v !== 1 || !rules || typeof rules !== 'object' || !Array.isArray(rules.moods) || !Array.isArray(o.sido) || !Array.isArray(o.sgg)) return null;
  if (!o.files || typeof o.files !== 'object' || Array.isArray(o.files)) return null;
  const files: Record<string, string> = {};
  for (const [k, v] of Object.entries(o.files as Record<string, unknown>)) if (/^\d{2,8}$/.test(k) && typeof v === 'string' && /^[0-9a-f]{10}$/.test(v)) files[k] = v;
  const sido = (o.sido as Record<string, unknown>[]).filter((x) => x && /^\d{2,5}$/.test(String(x.c)) && isStr(x.c) && isStr(x.n) && isStr(x.s)).map((x) => ({ c: x.c as string, n: x.n as string, s: x.s as string }));
  const sgg = (o.sgg as Record<string, unknown>[])
    .filter((x) => x && isStr(x.c) && SGG_CODE.test(x.c) && isStr(x.n) && isStr(x.s) && isNum(x.lat) && isNum(x.lng) && isStr(x.f) && x.f in files)
    .map((x) => ({ c: x.c as string, n: x.n as string, s: x.s as string, lat: x.lat as number, lng: x.lng as number, f: x.f as string, a: anchorsOf(x) }));
  return { v: 1, rules: { moods: MOODS.filter((m) => (rules.moods as unknown[]).includes(m)), indoor: rules.indoor === true }, sido, sgg, files };
}

/** One file's records as the app's places (plans/nationwide-app.md 2): reason '', `mood` the first of `moods`, score 3,
 * no 카카오 id, photos over https. Left out: what the app cannot render, a 먹기 without meal / cafe, the records of a
 * 시군구 a 검수한 곳 covers (`curatedSgg`), and an island 군's unless the start (`from`) is that 군. A 새로운 것 is 구경
 * (`sight`): 체험 needs a verified booking route (ADR-0074), which the 자동 지역 has none of. */
export function normalizeNation(raw: unknown, curatedSgg: Iterable<string> = [], from: string | null = null): NationSpot[] {
  if (!Array.isArray(raw)) throw new Error('nation file is not an array');
  const curated = new Set(curatedSgg);
  const out: NationSpot[] = [];
  for (const r of raw as Record<string, unknown>[]) {
    if (!r || typeof r !== 'object') continue;
    const { id, name, lat, lng, sgg, image } = r;
    if (typeof id !== 'string' || !/^nt-\d{1,20}$/.test(id) || typeof name !== 'string' || !cleanName(name)) continue;
    if (!isNum(lat) || !isNum(lng) || typeof sgg !== 'string' || !SGG_CODE.test(sgg)) continue;
    if (curated.has(sgg) || (ISLAND_SGG.includes(sgg) && from !== sgg)) continue;
    const food = r.sub === 'meal' || r.sub === 'cafe';
    const moods = (Array.isArray(r.moods) ? MOODS.filter((m) => (r.moods as unknown[]).includes(m)) : []).filter((m) => m !== 'food' || food);
    if (!moods.length) continue;
    const mood = moods[0];
    out.push({
      id,
      name: cleanName(name),
      lat,
      lng,
      mood,
      moods,
      reason: '',
      image: typeof image === 'string' ? image.replace(/^http:\/\//, 'https://') : '',
      kakaoPlaceId: null,
      bookable: false,
      ...(mood === 'food' ? { sub: r.sub as 'meal' | 'cafe' } : mood === 'new' ? { sub: 'sight' as const } : {}),
      score: 3,
      ...(r.indoor === true ? { indoor: true } : {}),
      sgg,
    });
  }
  return out;
}

/** Where a point is (plans/nationwide-app.md 1.1); a 검수한 곳 named by 시군구 (강원) says which of them too. */
export type Region = { k: 'dest'; dest: Dest; sgg?: SggCode } | { k: 'auto'; sgg: SggCode } | null;
type SggRow = NationIndex['sgg'][number];
/** a point farther than this from every 시군구 point (and from every ISLANDS point) has no 시군구 */
export const SGG_MAX_KM = 35;
/** 부산·제주's 시군구 are their 검수한 곳's: never a centre for the 자동 지역 */
const OWN = /^(26|50)/;

/** 섬 (predeploy review M-1): islands farther than SGG_MAX_KM from every centre, each a point of its own 시군구 — tried
 * only where no centre is near, within ISLAND_KM (백령도's holds 대청도·소청도, 흑산도's 홍도). */
export const ISLANDS: readonly { n: string; c: string; lat: number; lng: number }[] = [
  { n: '독도', c: '47940', lat: 37.2417, lng: 131.8647 },
  { n: '백령도', c: '28720', lat: 37.96, lng: 124.67 },
  { n: '연평도', c: '28720', lat: 37.6667, lng: 125.6983 },
  { n: '흑산도', c: '12870', lat: 34.6838, lng: 125.436 },
  { n: '가거도', c: '12870', lat: 34.0727, lng: 125.115 },
  { n: '만재도', c: '12870', lat: 34.21, lng: 125.47 },
  { n: '맹골도', c: '12860', lat: 34.228, lng: 125.853 },
  { n: '여서도', c: '12850', lat: 33.988, lng: 126.923 },
  { n: '거문도', c: '12130', lat: 34.029, lng: 127.309 },
  { n: '어청도', c: '52130', lat: 36.1197, lng: 125.9787 },
  { n: '외연도', c: '44180', lat: 36.225, lng: 126.08 },
  { n: '격렬비열도', c: '44825', lat: 36.6, lng: 125.56 },
];
export const ISLAND_KM = 25;

/** A point's 시군구: the one with the nearest of its points (ADR-0104: a few per 시군구, its median point when it has
 * none; no boundary) within 35 km, Busan's and Jeju's left out; else the 시군구 of an island (ISLANDS) within 25 km. */
export function nearestSgg(p: Point, sgg: readonly SggRow[]): SggRow | null {
  let best: SggRow | null = null;
  let bestKm = SGG_MAX_KM;
  for (const s of sgg) {
    if (OWN.test(s.c)) continue;
    for (const a of s.a ?? [s]) {
      const km = distanceKm(p, a);
      if (km <= bestKm) {
        best = s;
        bestKm = km;
      }
    }
  }
  if (best) return best;
  let isle: (typeof ISLANDS)[number] | null = null;
  bestKm = ISLAND_KM;
  for (const i of ISLANDS) {
    const km = distanceKm(p, i);
    if (km <= bestKm) {
      isle = i;
      bestKm = km;
    }
  }
  return isle ? (sgg.find((s) => s.c === isle.c) ?? null) : null;
}

/** Korea, drawn wide ([lng, lat]): the peninsula and every island (독도 131.87°E, 백령도, 가거도, 마라도), with sea and a
 * neighbour's edge (단둥, 쓰시마's north tip) in it. Only a point outside it is said to be outside Korea: in doubt, not. */
const KOREA: readonly [number, number][] = [
  [123.9, 37.3], [123.9, 39.6], [124.6, 40.6], [126.2, 41.6], [126.9, 42.1], [128.1, 42.2], [129.2, 42.5], [130.0, 43.1],
  [130.5, 42.8], [130.9, 42.3], [132.2, 37.9], [132.2, 36.9], [129.65, 34.95], [128.9, 34.25], [127.9, 33.6], [126.9, 32.95],
  [126.0, 32.95], [124.8, 33.7], [124.6, 34.5],
];
/** Inside KOREA (even–odd ray test, as inBusan); false for a broken point. */
export function inKorea(p: Point): boolean {
  if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return false;
  let c = false;
  for (let i = 0, j = KOREA.length - 1; i < KOREA.length; j = i++) {
    const [xi, yi] = KOREA[i];
    const [xj, yj] = KOREA[j];
    if (yi > p.lat !== yj > p.lat && p.lng < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/** The 검수한 곳 a point is in by its boundary (`inside`: Jeju's box, Busan's ring), else the destination whose 시군구 list
 * (`curated`, DEST[d].sgg) has its 시군구, else the 자동 지역's 시군구; null where no 시군구 is near (outside Korea only
 * where `inKorea` says so). */
export function regionOf(p: Point, sgg: readonly SggRow[], inside: (p: Point) => Dest | null, curated: Partial<Record<Dest, readonly string[]>> = {}): Region {
  const d = inside(p);
  if (d) return { k: 'dest', dest: d };
  const near = nearestSgg(p, sgg);
  if (!near) return null;
  for (const [dest, codes] of Object.entries(curated) as [Dest, readonly string[]][]) if (codes.includes(near.c)) return { k: 'dest', dest, sgg: near.c as SggCode };
  return { k: 'auto', sgg: near.c as SggCode };
}

/** The 이름 줄's word for each 시군구 (plans/nationwide-app.md 1.5): 시·군·구 off when 2 letters or more are left
 * (강릉시 → 강릉, 중구 stays); the 시도's short name before it when another 시군구 has the same word or the name was 2
 * letters at most (서울 중구, 강원 고성); that 시도 off again past 6 letters (ADR-0094 Amendment 3). A 일반구 (`수원시 장안구`)
 * is its 시's word: the 구 of one 시 do not clash with each other. */
export function sggShorts(ix: Pick<NationIndex, 'sido' | 'sgg'>): Record<string, string> {
  const sido = new Map(ix.sido.map((x) => [x.c, x.s]));
  const city = (n: string) => n.split(' ')[0];
  const word = (n: string) => {
    const c = city(n);
    const cut = c.replace(/[시군구]$/, '');
    return cut.length >= 2 ? cut : c;
  };
  // the places (시도 + 시) each word stands for
  const owners = new Map<string, Set<string>>();
  for (const s of ix.sgg) {
    const w = word(s.n);
    if (!owners.has(w)) owners.set(w, new Set());
    owners.get(w)!.add(`${s.s} ${city(s.n)}`);
  }
  const out: Record<string, string> = {};
  for (const s of ix.sgg) {
    const w = word(s.n);
    const both = `${sido.get(s.s) ?? ''} ${w}`.trim();
    out[s.c] = (owners.get(w)!.size > 1 || city(s.n).length <= 2) && both.length <= 6 ? both : w;
  }
  return out;
}

/** The files a 시군구's places come from (plans/nationwide-app.md 2): its own first, then those of the 시군구 whose
 * centre is within 40 km of its centre (차로 1시간's straight reach ≈ 30.8 km, and 10 km more), 3 at most. */
export function filesFor(code: string, sgg: readonly SggRow[]): string[] {
  const own = sgg.find((s) => s.c === code);
  if (!own) return [];
  const near = sgg
    .map((s) => ({ f: s.f, km: distanceKm(own, s) }))
    .filter((x) => x.km <= 40)
    .sort((a, b) => a.km - b.km);
  return [...new Set([own.f, ...near.map((x) => x.f)])].slice(0, 3);
}
