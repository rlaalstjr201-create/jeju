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
