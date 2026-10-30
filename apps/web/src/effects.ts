// Side effects that only *return* results — no UI. The controller checks the request id before it
// applies anything, so a late GPS answer can never open a sheet or overwrite newer cards (S37·S38).
import type { RegionName } from './areas';
import type { Point } from './pick';
import { nationPart } from './release';
import { gpsOrigin, staticOrigin } from './state';
import type { Basis, GeoHit, GeoPermission, NoOrigin, Origin, OutsideAt, Stay } from './types';

export type { GeoPermission };

export class LocateError extends Error {
  /** `at`: where an `outside` position was (release.ts outsideAt), when known */
  constructor(
    readonly reason: NoOrigin,
    readonly at?: OutsideAt,
  ) {
    super(reason);
  }
}

export interface GeoDeps {
  /** Current position inside Jeju; rejects with LocateError. */
  locate(): Promise<Point>;
  /** Permissions API state, when the browser has it. */
  geoPermission?(): Promise<GeoPermission>;
}

export type OriginResult = { ok: true; origin: Origin } | { ok: false; why: NoOrigin; at?: OutsideAt };

/** GPS position, skipping the prompt when the Permissions API already says denied (S07). */
export async function locateGps(deps: GeoDeps): Promise<{ ok: true; point: Point } | { ok: false; why: NoOrigin; at?: OutsideAt }> {
  try {
    if (deps.geoPermission && (await deps.geoPermission()) === 'denied') return { ok: false, why: 'denied' };
  } catch {
    /* no Permissions API — just ask */
  }
  try {
    const p = await deps.locate();
    return { ok: true, point: { lat: p.lat, lng: p.lng } };
  } catch (e) {
    return e instanceof LocateError ? { ok: false, why: e.reason, ...(e.at ? { at: e.at } : {}) } : { ok: false, why: 'unavailable' };
  }
}

export async function resolveOrigin(basis: Basis, region: RegionName | null, stay: Stay | null, deps: GeoDeps): Promise<OriginResult> {
  const fixed = staticOrigin(basis, region, stay);
  if (fixed) return { ok: true, origin: fixed };
  const r = await locateGps(deps);
  if (!r.ok) return r;
  return { ok: true, origin: gpsOrigin(r.point) };
}

/** fetch, as far as 비 소식 needs it. */
export type Fetch = (
  url: string,
  init?: { signal?: AbortSignal; method?: 'POST'; headers?: Record<string, string>; body?: string },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/** 비 소식 (ADR-0076): will it rain in `area` (slug) within 3 hours. Only the area's name leaves the device — for a
 * 자동 지역 시군구 (a code), the KMA grid of its centre (plans/nationwide-app.md 5: never the device's point).
 * null — nothing to show — for a 204 (no key, the agency failing), an error, a non-JSON answer (no function
 * here: the host's 404 page) or no answer within `timeoutMs`. */
/** 주소·숙소 검색 (ADR-0103): the words typed, to /api/geo (Kakao Local behind it) in a POST body — never in the URL, so
 * not in a request log's address. `off`: no key on the server, or one Kakao refuses (503); `fail`: anything else that is
 * not an answer (an error, a 429, no function here, no answer within `timeoutMs`). */
export async function fetchGeo(q: string, get: Fetch, timeoutMs = 6000): Promise<{ ok: true; hits: GeoHit[] } | { ok: false; why: 'off' | 'fail' }> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await Promise.race([
      get('/api/geo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q }), signal: ctl.signal }),
      new Promise<never>((_, reject) => ctl.signal.addEventListener('abort', () => reject(new Error('timeout')))),
    ]);
    if (res.status === 503) return { ok: false, why: 'off' };
    if (res.status !== 200) return { ok: false, why: 'fail' };
    const body = (await res.json()) as { hits?: unknown } | null;
    if (!Array.isArray(body?.hits)) return { ok: false, why: 'fail' };
    const hits = body.hits.filter(
      (h): h is GeoHit => !!h && typeof h.name === 'string' && typeof h.addr === 'string' && Number.isFinite(h.lat) && Number.isFinite(h.lng),
    );
    return { ok: true, hits: hits.slice(0, 6).map((h) => ({ name: h.name.slice(0, 60), addr: h.addr.slice(0, 80), lat: h.lat, lng: h.lng })) };
  } catch {
    return { ok: false, why: 'fail' };
  } finally {
    clearTimeout(timer);
  }
}

/** 고른 주소를 공공 주소로 (ADR-0103 Amendment 2): a picked answer's address, to /api/addr (the 행정안전부 도로명주소 API
 * behind it) in a POST body. Its { addr, lat, lng } is what may be kept on the device; null for anything else (no key,
 * nothing found, an error, no answer within `timeoutMs`). */
export async function fetchAddr(addr: string, get: Fetch, timeoutMs = 6000): Promise<{ addr: string; lat: number; lng: number } | null> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await Promise.race([
      get('/api/addr', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ addr }), signal: ctl.signal }),
      new Promise<never>((_, reject) => ctl.signal.addEventListener('abort', () => reject(new Error('timeout')))),
    ]);
    if (res.status !== 200) return null;
    const b = (await res.json()) as { addr?: unknown; lat?: unknown; lng?: unknown } | null;
    return b && typeof b.addr === 'string' && typeof b.lat === 'number' && typeof b.lng === 'number' && Number.isFinite(b.lat) && Number.isFinite(b.lng)
      ? { addr: b.addr.slice(0, 80), lat: b.lat, lng: b.lng }
      : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchRain(area: string, get: Fetch, timeoutMs = 5000): Promise<boolean | null> {
  const g = /^\d{4,8}$/.test(area) ? nationPart()?.grid(area) : undefined;
  if (g === null) return null;
  const q = g ? `grid=${g.nx},${g.ny}` : `area=${encodeURIComponent(area)}`;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await Promise.race([
      get(`/api/rain?${q}`, { signal: ctl.signal }),
      new Promise<never>((_, reject) => ctl.signal.addEventListener('abort', () => reject(new Error('timeout')))),
    ]);
    if (res.status !== 200) return null;
    const body = (await res.json()) as { rain?: unknown } | null;
    return typeof body?.rain === 'boolean' ? body.rain : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
