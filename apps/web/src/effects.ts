// Side effects that only *return* results — no UI. The controller checks the request id before it
// applies anything, so a late GPS answer can never open a sheet or overwrite newer cards (S37·S38).
import type { RegionName } from './areas';
import type { Point } from './pick';
import { nationPart } from './release';
import { gpsOrigin, staticOrigin } from './state';
import type { Basis, GeoPermission, NoOrigin, Origin, Stay } from './types';

export type { GeoPermission };

export class LocateError extends Error {
  constructor(readonly reason: NoOrigin) {
    super(reason);
  }
}

export interface GeoDeps {
  /** Current position inside Jeju; rejects with LocateError. */
  locate(): Promise<Point>;
  /** Permissions API state, when the browser has it. */
  geoPermission?(): Promise<GeoPermission>;
}

export type OriginResult = { ok: true; origin: Origin } | { ok: false; why: NoOrigin };

/** GPS position, skipping the prompt when the Permissions API already says denied (S07). */
export async function locateGps(deps: GeoDeps): Promise<{ ok: true; point: Point } | { ok: false; why: NoOrigin }> {
  try {
    if (deps.geoPermission && (await deps.geoPermission()) === 'denied') return { ok: false, why: 'denied' };
  } catch {
    /* no Permissions API — just ask */
  }
  try {
    const p = await deps.locate();
    return { ok: true, point: { lat: p.lat, lng: p.lng } };
  } catch (e) {
    return { ok: false, why: e instanceof LocateError ? e.reason : 'unavailable' };
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
export type Fetch = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/** 비 소식 (ADR-0076): will it rain in `area` (slug) within 3 hours. Only the area's name leaves the device — for a
 * 자동 지역 시군구 (a code), the KMA grid of its centre (plans/nationwide-app.md 5: never the device's point).
 * null — nothing to show — for a 204 (no key, the agency failing), an error, a non-JSON answer (no function
 * here: the host's 404 page) or no answer within `timeoutMs`. */
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
