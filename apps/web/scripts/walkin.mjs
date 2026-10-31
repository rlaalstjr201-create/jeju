/**
 * 예약 없이 가는 곳 (ADR-0074 Amendment 1 2절, ADR-0105): a `new`·`do` place's code (TourAPI lclsSystm3) and name → whether
 * it can be done without booking. Used by the 자동 지역 rules v2 (review/nation/rules-criteria-02.md 3절) and the 검수한 곳
 * remap (review/gangwon/criteria-05.md D5). The order is the rule: the name first, then the booking codes, then the
 * on-site codes; anything else is null (the 검수한 곳 send it to a judge, the 자동 지역 count it as on-site).
 */

/** 이름에 이 말이 있으면 예약해야만 할 수 있는 곳 */
export const BOOKING_TITLE = /배낚시|선상낚시|공방|클래스|강습|스쿨|템플스테이/;

const span = (a, b) => {
  const head = a.slice(0, 2);
  const out = [];
  for (let n = Number(a.slice(2)); n <= Number(b.slice(2)); n += 100) out.push(head + String(n).padStart(6, '0'));
  return out;
};

/** 예약해야만 할 수 있는 코드 */
export const BOOKING_CODES = new Set([
  'EX010100', // 전통문화체험
  ...span('EX020100', 'EX020400'), // 공예체험
  'EX030100', // 체험마을
  'EX030400', // 체험어장
  'EX040100', // 템플스테이
  'EX040200', // 사찰문화체험
  ...span('EX050300', 'EX050600'), // 한방체험·힐링명상·뷰티스파·기타웰니스
  'LS010400', // 골프
  'LS020400', // 스노쿨링·스킨스쿠버다이빙
  ...span('LS030100', 'LS030600'), // 항공레저
]);

/** 예약 없이 가는 코드 */
export const ONSITE_CODES = new Set([
  'EX030200', // 체험목장
  'EX070100', // 유람선·잠수함관광
  'LS010300', // 카트
  'LS010800', // 스키·스노보드
  'LS010900', // 스케이트
  'LS011000', // 썰매장
  'VE020100', // 테마파크
  'VE020200', // 워터파크
  'VE020300', // 동물원
  'NA010400', // 계곡
]);

/** true: 예약 없이 감, false: 예약해야만 함, null: 코드·이름으로는 모름 */
export function walkinByRule(code, title) {
  if (BOOKING_TITLE.test(String(title ?? '').replace(/\s+/g, ''))) return false;
  const c = String(code ?? '');
  if (BOOKING_CODES.has(c)) return false;
  if (ONSITE_CODES.has(c)) return true;
  return null;
}
