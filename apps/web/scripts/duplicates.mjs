// One place listed twice in the source data (QA 2026-09-30). Shared by build-spots.mjs (the record is left
// out of the merge) and tests/data.test.ts (the shipped file). Keyed by the id that is left out; `keep` is the
// record that ships for that place. Add a pair only after checking it is one place, not two neighbours.

/** @type {ReadonlyMap<string, { keep: string; why: string }>} */
export const DUPLICATES = new Map([
  [
    '671cd095-2026-4f74-bba5-bb1a2f851db6', // 몰질식육식당
    { keep: '1730e98c-6aff-410d-bb05-cf894787cfdb', why: '물질식육식당의 오타. 같은 좌표, 같은 고기짬뽕·복국 집' },
  ],
]);

/**
 * Spots without the left-out duplicates. Throws when the record kept for a place is missing, so a rule can
 * never drop both copies.
 * @template {{ id: string }} T
 * @param {readonly T[]} spots
 * @returns {T[]}
 */
export function dropDuplicates(spots) {
  const ids = new Set(spots.map((s) => s.id));
  for (const [id, { keep }] of DUPLICATES) {
    if (ids.has(id) && !ids.has(keep)) throw new Error(`duplicate rule ${id}: the record it keeps (${keep}) is not in the list`);
  }
  return spots.filter((s) => !DUPLICATES.has(s.id));
}

// General rule (QA 2026-09-30): two records whose names (whitespace removed) are the same length and differ
// in exactly one character, placed within TYPO_RADIUS_M of each other, are one place entered twice with a
// typo (물질식육식당 / 몰질식육식당: 0 m apart). A wider radius catches real neighbours — 덕승식당(신관) /
// 덕승식당(구관) are 15 m apart, 용두성 / 용두암 93 m — so the rule does not guess which spelling is right: the
// build refuses to ship a pair until a DUPLICATES entry names the record to keep.
export const TYPO_RADIUS_M = 10;

const squash = (s) => String(s).replace(/\s+/g, '');

function oneCharApart(a, b) {
  const x = [...a];
  const y = [...b];
  if (x.length !== y.length || x.length < 2) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i] && ++diff > 1) return false;
  return diff === 1;
}

function metres(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

/**
 * Pairs that look like one place entered twice with a typo (see TYPO_RADIUS_M).
 * @template {{ id: string; name: string; lat: number; lng: number }} T
 * @param {readonly T[]} spots
 * @returns {[T, T][]}
 */
export function typoTwins(spots) {
  const pairs = [];
  for (let i = 0; i < spots.length; i++) {
    for (let j = i + 1; j < spots.length; j++) {
      const a = spots[i];
      const b = spots[j];
      if (oneCharApart(squash(a.name), squash(b.name)) && metres(a, b) <= TYPO_RADIUS_M) pairs.push([a, b]);
    }
  }
  return pairs;
}

/**
 * typoTwins pairs no DUPLICATES entry resolves (neither id is the one left out) — the build fails on these.
 * @template {{ id: string; name: string; lat: number; lng: number }} T
 * @param {readonly T[]} spots
 * @returns {[T, T][]}
 */
export function unresolvedTwins(spots) {
  return typoTwins(spots).filter(([a, b]) => !DUPLICATES.has(a.id) && !DUPLICATES.has(b.id));
}
