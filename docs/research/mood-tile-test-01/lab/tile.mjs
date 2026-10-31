// 기분 타일 첫 탭 시험 엔진 (00-prereg.md). p-persona-sim-02/lab/step.mjs가 call.engine === 'tile'일 때 쓴다.
// 화면 두 개: 첫 화면(기분 타일) → 고른 기분의 결과 화면(탭 이름). 곳 이름은 보이지 않는다(이름만 시험한다).
// 누를 코드는 자리 번호(m1…, t1…)라 코드에서 기분 id가 드러나지 않는다.

const NEW_TABS_A = [['mix', '섞어서'], ['sight', '구경'], ['do', '놀거리']];
const FOOD_TABS = [['meal', '식사'], ['cafe', '카페·디저트']];
/** 판마다 첫 화면 줄(375px 위→아래 순서)과 결과 화면 탭. 「아무거나」는 줄 아래 따로 놓인 버튼(index.html과 같음). */
export const SETS = {
  cur: {
    rows: [['rest', '푹 쉬고 싶어'], ['walk', '좀 걷고 싶어'], ['new', '새로운 거 해보고 싶어'], ['famous', '유명한 데 가 보고 싶어'], ['food', '맛있는 거 먹고 싶어']],
    tabs: { new: [['mix', '섞어서'], ['sight', '구경'], ['do', '체험']], food: FOOD_TABS },
  },
  A: {
    rows: [['rest', '푹 쉬고 싶어'], ['walk', '좀 걷고 싶어'], ['new', '놀러 가고 싶어'], ['famous', '유명한 데 가 보고 싶어'], ['food', '맛있는 거 먹고 싶어']],
    tabs: { new: NEW_TABS_A, food: FOOD_TABS },
  },
  C: {
    rows: [['view', '경치 보고 싶어'], ['new', '놀러 가고 싶어'], ['famous', '유명한 데 가 보고 싶어'], ['food', '맛있는 거 먹고 싶어']],
    tabs: { view: [['mix', '섞어서'], ['water', '물가'], ['hill', '산·길']], new: NEW_TABS_A, food: FOOD_TABS },
  },
};
export const ANY = ['any', '아무거나 골라줘'];
export const MAX_TAPS = 8;

const tilesOf = (arm) => [...SETS[arm].rows, ANY];
const labelOf = (arm, id) => tilesOf(arm).find(([x]) => x === id)?.[1];

export function newState(sid, armCode) {
  return { sid, arm: armCode, screen: 'home', mood: null, taps: 0, bad: 0, end: null, first: null, final: null, tab: null, backs: 0, log: [] };
}
export const attachRand = (st) => st;

export function render(st) {
  if (st.screen === 'home') {
    const rows = SETS[st.arm].rows.map(([, l], i) => `[${l}](m${i + 1})`);
    return [
      '— 앱 첫 화면 (폰 세로, 위에서 아래로) —',
      '지금 뭐 하고 싶어요?',
      '지금 내 위치 근처에서 갈 만한 곳 3곳을 골라 드려요. 마음에 들면 바로 길찾기로 가요.',
      ...rows,
      `[${ANY[1]}](m${rows.length + 1})`,
      '',
      '[앱 닫기](quit)',
    ].join('\n');
  }
  const tabs = SETS[st.arm].tabs[st.mood];
  return [
    `— 「${labelOf(st.arm, st.mood)}」 결과 화면 —`,
    tabs ? `위쪽 탭: ${tabs.map(([, l], i) => `[${l}](t${i + 1})`).join(' ')}   (처음엔 「${tabs[0][1]}」 탭이 골라져 있다)` : '(탭 없음)',
    '아래에 근처에서 고른 곳 3곳이 카드로 뜬다. (이 시험에서는 곳 이름을 보여 주지 않는다. 이 기분이 맞다고 생각하면 그대로 보면 된다.)',
    '',
    tabs ? '' : '[이대로 볼래](ok)',
    '[뒤로 — 다른 기분 고르기](back)',
    '[앱 닫기](quit)',
  ].filter((x, i, a) => x !== '' || a[i - 1] !== '').join('\n');
}

export function act(st, code) {
  if (st.end) return st;
  const ok = () => { st.taps++; st.log.push(code); if (!st.end && st.taps >= MAX_TAPS) st.end = 'cap'; return st; };
  if (code === 'quit') { st.end = 'quit'; return ok(); }
  if (st.screen === 'home') {
    const m = /^m(\d+)$/.exec(code);
    const t = m && tilesOf(st.arm)[Number(m[1]) - 1];
    if (!t) { st.bad++; return st; }
    st.mood = t[0];
    st.first ??= t[0];
    if (t[0] === 'any') { st.final = 'any'; st.end = 'pick'; return ok(); }
    st.screen = 'result';
    return ok();
  }
  if (code === 'back') { st.backs++; st.screen = 'home'; st.mood = null; return ok(); }
  const tabs = SETS[st.arm].tabs[st.mood];
  const m = /^t(\d+)$/.exec(code);
  if (tabs && m && tabs[Number(m[1]) - 1]) { st.tab = tabs[Number(m[1]) - 1][0]; st.final = st.mood; st.end = 'pick'; return ok(); }
  if (!tabs && code === 'ok') { st.final = st.mood; st.end = 'pick'; return ok(); }
  st.bad++;
  return st;
}
