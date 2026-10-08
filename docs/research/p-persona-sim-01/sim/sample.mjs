// 가상 여행자 1000명의 골격(속성)을 고정 난수로 뽑는다. 서사는 다음 단계(LLM)가 이 속성만 풀어 쓴다(R2).
// 분포 근거: 11-research-jeju-stats.md(원보고서, 확인) · 10-research-p-archetypes.md · 12-research-app-habits.md(추정).
//   node sim/sample.mjs > ../personas-skeleton.jsonl      (stderr에 분포 점검표)
const SEED = 20261008;
let s = SEED >>> 0;
const rnd = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (w) => { const ks = Object.keys(w); const tot = ks.reduce((a, k) => a + w[k], 0); let r = rnd() * tot; for (const k of ks) { r -= w[k]; if (r <= 0) return k; } return ks.at(-1); };
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));

// --- 확인된 분포 (2025 실태조사 통계편, 내국인 7,015명) ---
const AGE = { '15-19': 1.4, '20대': 23.9, '30대': 27.6, '40대': 19.7, '50대': 21.6, '60+': 5.8 };
const SEX = { 여: 58.5, 남: 41.5 };
const COMPANION_BY_AGE = {
  '15-19': { 혼자: 6.3, 가족: 21.3, 친구연인: 69.1, 직장동료: 2.1 },
  '20대': { 혼자: 5.9, 가족: 17.8, 친구연인: 73.3, 직장동료: 3.8 },
  '30대': { 혼자: 5.5, 가족: 56.7, 친구연인: 34.5, 직장동료: 4.7 },
  '40대': { 혼자: 6.2, 가족: 68.1, 친구연인: 18.3, 직장동료: 8.6 },
  '50대': { 혼자: 4.1, 가족: 65.3, 친구연인: 23.8, 직장동료: 9.2 },
  '60+': { 혼자: 3.5, 가족: 63.1, 친구연인: 25.2, 직장동료: 8.6 },
};
const DAYS = { 1: 0.4, 2: 3.4, 3: 61.8, 4: 23.2, 5: 5.4, 6: 1.3, 7: 4.5 };
const VISITS = { '첫 방문': 9.9, '2회': 37.1, '3회': 29.8, '4회 이상': 23.2 };
const HOME = { 서울: 18.6, '경기/인천': 37.9, 충청강원: 15.2, 경상: 16.5, 호남: 11.6 };
const LODGE = { 호텔: 57.0, 펜션: 16.3, '콘도/리조트': 15.6, 게스트하우스: 5.6, 기타: 5.5 };
const MOVE = { 렌터카: 82.7, 택시: 3.7, 버스: 2.9, 전세버스: 2.8 };
const JOB = { 사무직: 34.1, 서비스직: 26.4, 주부: 11.1, '기타 종사자': 9.4, 전문가: 7.0, '무직 등': 5.5, 학생: 4.6, 관리자: 2.0 };

// --- 추정: 유형 비중(많음=3, 보통=2) ---
const P_TYPES = {
  '저장 수집가': 3, '큰 틀만': 3, '숙소·항공만': 3, '전날 밤 검색파': 2, '지금 근처파': 3, '충동 출발파': 3, 'J 따라가는 P': 3,
  'J인 척하는 P': 2, 'P끼리 동행': 2, '발길 드라이브파': 2, '쉬러 가는 무계획': 2, '동행 구하는 혼행러': 2, '아이·부모님 동반 반즉흥 가족': 2, '데어 본 즉흥파': 2,
};
const G_TYPES = { '일정 짜는 계획형(J)': 3, '큰 줄기만 정하는 보통형': 4, '동행이 다 짜는 맡김형': 2, '패키지·코스 따라가는 형': 1 };
// 저장 습관(12-research-app-habits.md 시뮬레이터용 요약, 추정)
const SAVE = { '지도앱 저장·동선': 35, 캡처: 20, '저장 안 함·현장 검색': 20, '닥치는 대로 저장': 10, '인스타 저장': 8, '맡기기·공유받기': 5, '큐레이터·정리': 2 };

const N_P = 650, N_G = 350, N_NO_NARRATIVE = 100;

function companionFor(type, age) {
  if (type === '동행 구하는 혼행러') return '혼자';
  if (type === '아이·부모님 동반 반즉흥 가족') return '가족';
  if (type === 'P끼리 동행') return '친구연인';
  const c = pick(COMPANION_BY_AGE[age]);
  if ((type === 'J 따라가는 P' || type === '동행이 다 짜는 맡김형') && c === '혼자') return pick({ 가족: 1, 친구연인: 1 });
  return c;
}
function ageFor(type) {
  if (type === '아이·부모님 동반 반즉흥 가족') return pick({ '30대': 45, '40대': 40, '50대': 15 });
  if (type === '동행 구하는 혼행러') return pick({ '20대': 70, '30대': 25, '40대': 5 });
  return pick(AGE);
}
function saveFor(type) {
  if (type === '저장 수집가') return pick({ '닥치는 대로 저장': 50, '지도앱 저장·동선': 35, '인스타 저장': 15 });
  if (type === 'J인 척하는 P' || type === '일정 짜는 계획형(J)') return pick({ '지도앱 저장·동선': 55, '큐레이터·정리': 20, 캡처: 25 });
  if (type === 'J 따라가는 P' || type === '동행이 다 짜는 맡김형') return pick({ '맡기기·공유받기': 55, '저장 안 함·현장 검색': 30, 캡처: 15 });
  if (type === '지금 근처파' || type === '충동 출발파') return pick({ '저장 안 함·현장 검색': 50, 캡처: 25, '지도앱 저장·동선': 25 });
  return pick(SAVE);
}
// 언제 폰을 여행 앱 용도로 보나(서사의 생활 맥락 단서, 추정). 흐름 선호를 직접 쓰지 않는다(R2).
function phoneFor(type, age) {
  const base = { '전날 밤 누워서': 3, '아침 출발 전': 3, '이동 중 차 안': 2, '현장에서 그때그때': 3, '여행 며칠 전 집에서': 2 };
  if (type === '전날 밤 검색파') base['전날 밤 누워서'] += 8;
  if (type === '지금 근처파' || type === '발길 드라이브파') base['현장에서 그때그때'] += 6;
  if (type === 'J인 척하는 P' || type === '일정 짜는 계획형(J)' || type === '큰 틀만') base['여행 며칠 전 집에서'] += 5;
  if (age === '60+') base['현장에서 그때그때'] += 2;
  return pick(base);
}
// 동행 중 누가 정하나
function deciderFor(type, comp) {
  if (comp === '혼자') return '본인';
  if (type === 'J 따라가는 P' || type === '동행이 다 짜는 맡김형') return '동행(계획형)';
  if (type === 'P끼리 동행') return '그때그때 같이';
  if (type === '아이·부모님 동반 반즉흥 가족') return pick({ 본인: 2, '배우자': 2, '같이': 1 });
  return pick({ 본인: 2, '같이': 2, 동행: 1 });
}
const FLUENCY = { '15-19': 5, '20대': 5, '30대': 4, '40대': 4, '50대': 3, '60+': 2 };
// 현실 제약(R7): 시뮬레이터가 너무 유능해지지 않게 상황 단서를 준다.
const CONSTRAINT = ['한 손으로 누워서 본다', '동행이 옆에서 말을 건다', '화면 아래쪽은 잘 안 읽는다', '버튼 글자를 끝까지 안 읽는다', '배터리가 간당간당하다', '아이를 챙기느라 자주 끊긴다', '운전석 옆자리에서 흔들리며 본다', '특별한 제약 없음'];

function firstScenario(p) {
  // 사람마다 그럴 법한 첫 상황 하나(00-prereg.md S1~S4)
  const w = { S1: 2, S2: 3, S3: 1, S4: 1 };
  if (p.phone === '전날 밤 누워서') w.S1 += 6;
  if (p.phone === '현장에서 그때그때' || p.phone === '이동 중 차 안') w.S2 += 5;
  if (p.phone === '여행 며칠 전 집에서') w.S3 += 6;
  if (p.companion !== '혼자' && p.decider !== '본인') w.S4 += 3;
  return pick(w);
}

const out = [];
let n = 0;
for (const [group, count, types] of [['P', N_P, P_TYPES], ['보통', N_G, G_TYPES]]) {
  for (let i = 0; i < count; i++) {
    const type = pick(types);
    const age = ageFor(type);
    const companion = companionFor(type, age);
    const p = {
      id: `T${String(++n).padStart(4, '0')}`, group, type, age, sex: pick(SEX), home: pick(HOME), job: age === '15-19' ? '학생' : pick(JOB),
      companion, party: companion === '혼자' ? 1 : companion === '가족' ? int(3, 5) : int(2, 4), decider: deciderFor(type, companion),
      days: Number(pick(DAYS)), visits: pick(VISITS), lodge: type === '동행 구하는 혼행러' ? '게스트하우스' : pick(LODGE), move: pick(MOVE),
      save: saveFor(type), phone: phoneFor(type, age), fluency: Math.max(1, Math.min(5, FLUENCY[age] + (rnd() < 0.2 ? -1 : rnd() < 0.15 ? 1 : 0))),
      constraint: CONSTRAINT[Math.floor(rnd() * CONSTRAINT.length)],
      offType: rnd() < 0.1, // 전형에서 벗어난 사람(R3): 서사에서 유형과 다른 면 하나를 갖게 한다
    };
    p.scenario1 = firstScenario(p);
    out.push(p);
  }
}
// 서사 없음 대조군(R2): 섞은 뒤 앞 100명
const idx = out.map((_, i) => i).sort(() => rnd() - 0.5);
idx.slice(0, N_NO_NARRATIVE).forEach((i) => (out[i].narrative = false));
// 흐름 보는 순서(R6, 6가지 순서를 고르게): 선호 순위 비교용
const ORDERS = ['XYZ', 'XZY', 'YXZ', 'YZX', 'ZXY', 'ZYX'];
out.forEach((p, i) => (p.order = ORDERS[i % 6]));

for (const p of out) process.stdout.write(JSON.stringify(p) + '\n');

// 분포 점검(stderr)
const tally = (k) => { const t = {}; out.forEach((p) => (t[p[k]] = (t[p[k]] ?? 0) + 1)); return Object.entries(t).sort((a, b) => b[1] - a[1]).map(([v, c]) => `${v} ${(c / out.length * 100).toFixed(1)}`).join(' · '); };
for (const k of ['group', 'age', 'sex', 'companion', 'days', 'visits', 'lodge', 'move', 'save', 'phone', 'scenario1', 'decider']) console.error(`${k}: ${tally(k)}`);
console.error(`offType ${out.filter((p) => p.offType).length}, narrative=false ${out.filter((p) => p.narrative === false).length}, total ${out.length}`);
