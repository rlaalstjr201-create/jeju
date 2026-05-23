// Specific generic terms — always filter regardless of query length.
// A query containing these signals a topical search, not a place name.
const GENERIC_ALWAYS: RegExp[] = [
  /현지인/,
  /한달살이/,
  /숨은/,
  /비추천/,
  /아침식사 맛집/,
  /가성비 식당/,
];

// Generic suffix terms — only filter when query is long enough (> 10 chars).
// Short legitimate spot names like "선흘곶식당" (6 chars) must not be blocked.
const GENERIC_SUFFIX: RegExp[] = [
  /맛집$/,
  /카페$/,
  /식당$/,
  /숙소$/,
];

/**
 * Returns true if the Kakao/Naver result name substantially matches the search query.
 * Pre-filters generic phrase queries (topical searches, not place names) before
 * falling back to substring matching.
 */
export function isSubstantialMatch(query: string, resultName: string): boolean {
  if (GENERIC_ALWAYS.some((p) => p.test(query))) return false;
  if (query.length > 10 && GENERIC_SUFFIX.some((p) => p.test(query))) return false;
  const q = query.replace(/\s+/g, '');
  const r = resultName.replace(/\s+/g, '');
  return r.includes(q);
}
