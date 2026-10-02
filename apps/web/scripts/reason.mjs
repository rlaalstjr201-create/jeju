/**
 * The reason sentence as it ships (design/SPEC.md §10, §12.4, 3판). A reason is a card caption: whitespace
 * collapsed, `돈까스` spelled `돈가스`, and no final full stop whatever the ending (2판's "…요 gets a full
 * stop" is gone). Idempotent: shipReason(shipReason(s)) === shipReason(s).
 */
export const shipReason = (s) =>
  String(s)
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/돈까스/g, '돈가스')
    .replace(/[\s.。．｡]+$/, '');

// One sentence per caption: a full stop after a Hangul syllable, or any stop then a space, followed by more
// text is a second sentence ("딱새우김밥과 양념새우컵밥. 포장해 가도 돼요", "약 1.5km. 걸어요"). Decimals
// ("4.3", "17.5km") are not.
const MID_STOP = /[가-힣][.。．｡]\s*\S|(?<!\d)[.。．｡]\s+\S|[.。．｡]\s+(?!\d)\S/;

/** Why a shipped reason breaks the §10 punctuation rule, or null. */
export function reasonPunctuationProblem(reason) {
  if (/[.。．｡]$/.test(reason)) return 'ends with a full stop';
  if (MID_STOP.test(reason)) return 'full stop mid-sentence';
  return null;
}
