// Side effects that only *return* results — no UI. The controller checks the request id before it
// applies anything, so a late GPS answer can never open a sheet or overwrite newer cards (S37·S38).
import type { AreaName } from './areas';
import type { Point } from './pick';
import { GPS_KEY, staticOrigin } from './state';
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

export async function resolveOrigin(basis: Basis, region: AreaName | null, stay: Stay | null, deps: GeoDeps): Promise<OriginResult> {
  const fixed = staticOrigin(basis, region, stay);
  if (fixed) return { ok: true, origin: fixed };
  const r = await locateGps(deps);
  if (!r.ok) return r;
  return { ok: true, origin: { key: GPS_KEY, point: r.point, isPoint: true, from: '여기서' } };
}
