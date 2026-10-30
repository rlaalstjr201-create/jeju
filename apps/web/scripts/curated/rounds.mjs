/**
 * 도시마다 쓰는 판정 회차와 감사 씨앗. 판정 회차는 출하 입력이 되는 `judge-<도시>-<회차>` 폴더다.
 * 양양은 01이 감사에서 떨어져(주인 승인으로) 02를 새로 판정한다(review/gangwon/criteria-02.md). 다른 도시는 01 그대로.
 */
export const JUDGE_ROUND = { 양양: '02' };
export const judgeRound = (city) => JUDGE_ROUND[city] ?? '01';
/** 회차마다 표본 씨앗(criteria-02.md 5절: 02는 표본 전에 정한 새 씨앗). */
export const SEEDS = { '01': 20261030, '02': 20261031 };
/** 회차마다 사전등록 문서. */
export const CRITERIA = { '01': 'criteria.md', '02': 'criteria-02.md' };
