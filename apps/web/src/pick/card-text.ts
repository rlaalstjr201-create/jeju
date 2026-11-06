// Card text rule (spec S1': 가격·운영시간·요일·평점 문구는 카드에 없다; 맛집은 ADR-0028로 포함됨).
// build-spots.mjs applies this at merge time; kept here only for tests to assert on the shipped file.

/** Prices, admission, free notes, opening hours / closed days / weekday, ratings. */
export const PRICE_HOURS =
  /\d[\d,]*\s*(원|천원)|입장료|요금|무료|영업|휴무|\d{1,2}:\d{2}|오전\s*\d|오후\s*\d|\d+시(부터|까지)|오픈|평점|별점|월요일|화요일|수요일|목요일|금요일|토요일|일요일|매주|정기휴무/;

export function cardTextProblem(s: { name: string; reason: string }): 'price_hours' | null {
  if (PRICE_HOURS.test(s.reason)) return 'price_hours';
  return null;
}

export const isCardSafe = (s: { name: string; reason: string }) => cardTextProblem(s) === null;
