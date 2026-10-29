// 자동 지역 (ADR-0101, plans/nationwide-app.md 0·2): what scripts/nation/build.mjs ships under /nation/ and the app's
// reading of it. Pure — no fetch, no build-time define — so tests and scripts may import it. The app reaches it through
// src/nation-part.ts only (its own chunk).
import { cleanName } from './data';
import type { Mood, Spot } from './pick';

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
  /** 시군구: code, name, its 시도's code, the median point of its records, the file its records are in */
  sgg: { c: string; n: string; s: string; lat: number; lng: number; f: string }[];
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
    .map((x) => ({ c: x.c as string, n: x.n as string, s: x.s as string, lat: x.lat as number, lng: x.lng as number, f: x.f as string }));
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
