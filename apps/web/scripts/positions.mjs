// Position sanity for spots.json (QA 2026-09-30). Shared by build-spots.mjs (build fails), regeocode.ts
// (what to look up again) and tests/data.test.ts (the shipped file).

/** Points a geocoder falls back to when it only knows the city, not the place. */
export const FALLBACK_POINTS = [{ lat: 33.499622, lng: 126.53119, what: '제주시청' }];

const onPoint = (s, p) => Math.abs(s.lat - p.lat) < 1e-5 && Math.abs(s.lng - p.lng) < 1e-5;
export const pointKey = (s) => `${s.lat.toFixed(6)},${s.lng.toFixed(6)}`;

/**
 * Problems, as readable lines (empty = fine):
 * - a spot on a known fallback point;
 * - 3+ spots on one exact point, unless each of them is a Kakao place or was re-checked (`verified` ids):
 *   several venues in one building share a point legitimately, a village centroid does not.
 * @param {{id: string, name: string, lat: number, lng: number, kakaoPlaceId: string | null}[]} spots
 * @param {Set<string>} [verified]
 * @returns {string[]}
 */
export function positionProblems(spots, verified = new Set()) {
  const out = [];
  for (const s of spots) {
    for (const p of FALLBACK_POINTS) if (onPoint(s, p)) out.push(`${s.name} (${s.id}) sits on the ${p.what} fallback point`);
  }
  const groups = new Map();
  for (const s of spots) groups.set(pointKey(s), [...(groups.get(pointKey(s)) ?? []), s]);
  for (const [k, g] of groups) {
    if (g.length < 3) continue;
    const loose = g.filter((s) => !s.kakaoPlaceId && !verified.has(s.id));
    if (loose.length) out.push(`${g.length} spots share ${k}; not verified: ${loose.map((s) => s.name).join(', ')}`);
  }
  return out;
}
