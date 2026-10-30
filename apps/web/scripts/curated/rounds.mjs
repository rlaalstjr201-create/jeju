/**
 * 도시마다 쓰는 판정 회차와 감사 씨앗. 판정 회차는 출하 입력이 되는 `judge-<도시>-<회차>` 폴더다.
 * 강릉·속초·춘천은 v1(01, criteria.md) 그대로. 양양은 01이 감사에서 떨어지고 02의 감사가 오염됐을 수 있어(주인 승인으로)
 * 03을 새로 판정한다(review/gangwon/criteria-03.md). 아직 판정하지 않은 도시(평창, 서울의 구 등)는 04(criteria-04.md — 03에 주인 결정
 * 「등산 코스는 walk, 낚시 장소는 rest」를 판정 규칙·지시서에 넣은 것)를 쓴다.
 */
export const JUDGE_ROUND = { 강릉: '01', 속초: '01', 춘천: '01', 양양: '03' };
export const NEW_CITY_ROUND = '04';
export const judgeRound = (city) => JUDGE_ROUND[city] ?? NEW_CITY_ROUND;
/** 회차마다 표본 씨앗(각 회차 문서 5절: 표본 전에 정한 새 씨앗). */
export const SEEDS = { '01': 20261030, '02': 20261031, '03': 20261101, '04': 20261102 };
/** 회차마다 사전등록 문서. 03·04는 강원 폴더의 문서를 다른 목적지(서울 등)도 쓴다. */
export const CRITERIA = { '01': 'review/<dest>/criteria.md', '02': 'review/<dest>/criteria-02.md', '03': 'review/gangwon/criteria-03.md', '04': 'review/gangwon/criteria-04.md' };
/** 감사 표본에서 뺄 앞 회차 표본(criteria-03.md 5절): 양양 03은 01·02 표본에 들었던 곳을 뺀다. */
export const SAMPLE_EXCLUDE = { 양양: ['01', '02'] };
