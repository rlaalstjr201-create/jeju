// 비 소식 (ADR-0076): the pure half of /api/rain — area → KMA grid, which issuance to read, and the answer's POP.
// No I/O here; functions/api/rain.ts does the fetch and the caching.
import { AREAS, type Area } from '../../src/areas';

export const areaBySlug = (slug: string | null): Area | null => AREAS.find((a) => a.slug === slug) ?? null;

/** KMA's Lambert conformal conic grid (단기예보 5km 격자): lat/lng → (nx, ny), the agency's own formula and constants. */
export function kmaGrid(lat: number, lng: number): { nx: number; ny: number } {
  const RE = 6371.00877, GRID = 5.0, SLAT1 = 30.0, SLAT2 = 60.0, OLON = 126.0, OLAT = 38.0, XO = 43, YO = 136;
  const D = Math.PI / 180;
  const re = RE / GRID;
  const s1 = SLAT1 * D, s2 = SLAT2 * D, olon = OLON * D, olat = OLAT * D;
  const q = (x: number) => Math.tan(Math.PI * 0.25 + x * 0.5);
  const sn = Math.log(Math.cos(s1) / Math.cos(s2)) / Math.log(q(s2) / q(s1));
  const sf = (Math.pow(q(s1), sn) * Math.cos(s1)) / sn;
  const ro = (re * sf) / Math.pow(q(olat), sn);
  const ra = (re * sf) / Math.pow(q(lat * D), sn);
  let theta = lng * D - olon;
  if (theta > Math.PI) theta -= 2 * Math.PI;
  if (theta < -Math.PI) theta += 2 * Math.PI;
  theta *= sn;
  return { nx: Math.floor(ra * Math.sin(theta) + XO + 0.5), ny: Math.floor(ro - ra * Math.cos(theta) + YO + 0.5) };
}

/** KST wall clock of an instant, as zero-padded parts. */
function kst(ms: number) {
  const d = new Date(ms + 9 * 3600_000);
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return {
    date: `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}`,
    h: d.getUTCHours(),
    m: d.getUTCMinutes(),
    hhmm: `${p(d.getUTCHours())}${p(d.getUTCMinutes())}`,
  };
}

const ISSUES = [2, 5, 8, 11, 14, 17, 20, 23];
/** The newest 단기예보 issuance usable at `now`: 02·05·…·23시 KST, each from 10 minutes past; before 02:10, the
 * previous day's 23시. */
export function baseTime(now: number): { base_date: string; base_time: string } {
  const t = kst(now);
  const min = t.h * 60 + t.m;
  const h = [...ISSUES].reverse().find((x) => min >= x * 60 + 10);
  if (h === undefined) return { base_date: kst(now - 24 * 3600_000).date, base_time: '2300' };
  return { base_date: t.date, base_time: `${String(h).padStart(2, '0')}00` };
}

/** Highest 강수확률 (POP) among the hourly slots from the current hour up to now + 3h; null when the body is not a
 * successful getVilageFcst JSON answer or has no slot in that window. */
export function maxPop(body: unknown, now: number): number | null {
  const res = (body as { response?: { header?: { resultCode?: unknown }; body?: { items?: { item?: unknown } } } } | null)?.response;
  if (!res || res.header?.resultCode !== '00') return null;
  const items = res.body?.items?.item;
  if (!Array.isArray(items)) return null;
  const a = kst(now);
  const from = `${a.date}${String(a.h).padStart(2, '0')}00`;
  const b = kst(now + 3 * 3600_000);
  const to = `${b.date}${b.hhmm}`;
  let best: number | null = null;
  for (const it of items as { category?: unknown; fcstDate?: unknown; fcstTime?: unknown; fcstValue?: unknown }[]) {
    if (it?.category !== 'POP' || typeof it.fcstDate !== 'string' || typeof it.fcstTime !== 'string') continue;
    const at = it.fcstDate + it.fcstTime;
    if (at < from || at > to) continue;
    const pop = Number(it.fcstValue);
    if (Number.isFinite(pop) && pop >= 0 && pop <= 100) best = Math.max(best ?? 0, pop);
  }
  return best;
}
