/**
 * 도시마다 쓰는 판정 회차와 감사 씨앗. 판정 회차는 출하 입력이 되는 `judge-<도시>-<회차>` 폴더다.
 * 강릉·속초·춘천은 v1(01, criteria.md) 그대로. 양양은 01이 감사에서 떨어지고 02의 감사가 오염됐을 수 있어(주인 승인으로)
 * 03을 새로 판정한다(review/gangwon/criteria-03.md). 아직 판정하지 않은 강원 도시는 04(criteria-04.md — 03에 주인 결정
 * 「등산 코스는 walk, 낚시 장소는 rest」를 판정 규칙·지시서에 넣은 것)를 쓴다. 서울의 구(ADR-0106)는 06(review/seoul/criteria-06.md —
 * v4에 장소 종류 표 v5·walkin(ADR-0105)과 서울 줄을 더한 것)을 쓴다.
 */
export const JUDGE_ROUND = { 강릉: '01', 속초: '01', 춘천: '01', 양양: '03' };
export const NEW_CITY_ROUND = '04';
/** 서울(ADR-0106): scope.json의 도시 칸은 구 코드(시군구 코드의 뒤 세 자리)다. 코드 → 구 이름. */
export const SEOUL_GU = {
  110: '종로구', 140: '중구', 170: '용산구', 200: '성동구', 215: '광진구', 230: '동대문구', 260: '중랑구', 290: '성북구', 305: '강북구',
  320: '도봉구', 350: '노원구', 380: '은평구', 410: '서대문구', 440: '마포구', 470: '양천구', 500: '강서구', 530: '구로구', 545: '금천구',
  560: '영등포구', 590: '동작구', 620: '관악구', 650: '서초구', 680: '강남구', 710: '송파구', 740: '강동구',
};
export const SEOUL_ROUND = '06';
export const isSeoulGu = (city) => Object.hasOwn(SEOUL_GU, String(city));
export const judgeRound = (city) => JUDGE_ROUND[city] ?? (isSeoulGu(city) ? SEOUL_ROUND : NEW_CITY_ROUND);
/** 회차마다 표본 씨앗(각 회차 문서 5절: 표본 전에 정한 새 씨앗). */
export const SEEDS = { '01': 20261030, '02': 20261031, '03': 20261101, '04': 20261102, '06': 20261107 };
/** 회차마다 사전등록 문서. 03·04는 강원 폴더의 문서를 다른 목적지도 쓸 수 있다. 06은 서울 폴더. */
export const CRITERIA = {
  '01': 'review/<dest>/criteria.md',
  '02': 'review/<dest>/criteria-02.md',
  '03': 'review/gangwon/criteria-03.md',
  '04': 'review/gangwon/criteria-04.md',
  '06': 'review/seoul/criteria-06.md',
};
/** 판정에 `walkin`(예약 없이 가는지, ADR-0105)을 함께 적는 회차. */
export const WALKIN_ROUNDS = new Set(['06']);
/** 감사 표본에서 뺄 앞 회차 표본(criteria-03.md 5절): 양양 03은 01·02 표본에 들었던 곳을 뺀다. */
export const SAMPLE_EXCLUDE = { 양양: ['01', '02'] };

/** 이름 규칙(카카오 머리말·검색수 K1·K2)에 쓰는 도시 낱말. 강원은 도시 이름 그대로, 서울 구는 「구」를 뗀 이름(두 글자 미만이면 그대로: 중구). */
export const cityWord = (city) => {
  if (!isSeoulGu(city)) return city;
  const full = SEOUL_GU[city];
  const cut = full.replace(/구$/, '');
  return cut.length >= 2 ? cut : full;
};
/** 이름 앞에서 떼는 머리말(긴 것부터). 강원: 「도시시」·「도시」. 서울: 「서울특별시」·「서울시」·「서울」·구 이름·구 낱말. */
export const cityHeads = (city) => (isSeoulGu(city) ? [...new Set(['서울특별시', '서울시', '서울', SEOUL_GU[city], cityWord(city)])] : [`${city}시`, city]);
/** 이름 끝 「(…)」 지역 표시(TourAPI가 다른 지역의 같은 이름과 가르려고 붙임). 강원: 도시 이름, 서울: 「서울」. */
export const cityMark = (city) => (isSeoulGu(city) ? '서울' : city);
/** 출하 레코드의 `area`(앱 `sggShorts`와 같은 짧은 이름, ADR-0106 2). 서울 중구·강서구는 다른 시도에도 있어 「서울 」을 붙인다. */
export const areaOf = (city) => {
  if (!isSeoulGu(city)) return city;
  const w = cityWord(city);
  return ['중구', '강서'].includes(w) ? `서울 ${w}` : w;
};
