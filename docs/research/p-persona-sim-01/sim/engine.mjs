// 화면 엔진: 시뮬레이터가 낸 행동 목록을 흐름(X·Y·Z) 규칙대로 다시 재생해 탭 수·성공·막힘을 센다.
// 시뮬레이터의 자기보고를 믿지 않기 위한 장치(13-research-methods.md R5). 행동 어휘는 20-flows.md 화면과 같다.
//
// 상태: { flow, day(0,1,2… 시나리오의 날), screen, when, saved:[{id, day:null|n, order}], log }
// 날짜는 정수 day로만 다룬다(오늘=현재 day, 내일=day+1, 「날짜 고르기」=day+2 로 고정).

export const MOODS = ['rest', 'walk', 'new', 'food', 'any'];
const SHEET_VERBS = new Set(['when', 'where', 'area', 'reach', 'indoor']);

export function newState(flow, day = 0, saved = [], opts = {}) {
  return { flow, day, needArea: !!opts.needArea, screen: 'home', when: 'now', saved: saved.map((s) => ({ ...s })), shown: [], hearts: [], go: null, invalid: [], taps: 0, pastOpen: false, quit: false };
}

/** 저장 목록이 화면에 보이는 순서(행 번호 k는 1부터). Y는 지난 날이 접혀 있으면 그 줄들을 보이지 않는다. */
export function savedRows(st) {
  const live = st.saved;
  if (st.flow === 'Z') return [...live];
  if (st.flow === 'X') {
    const undated = live.filter((s) => s.day === null || s.day < st.day);
    const dated = live.filter((s) => s.day !== null && s.day >= st.day).sort((a, b) => a.day - b.day || a.order - b.order);
    return [...undated, ...dated];
  }
  // Y
  const cur = live.filter((s) => s.day >= st.day).sort((a, b) => a.day - b.day || a.order - b.order);
  const past = live.filter((s) => s.day < st.day).sort((a, b) => b.day - a.day || a.order - b.order);
  return st.pastOpen ? [...cur, ...past] : cur;
}

/** 첫 화면 맨 위 ♥ 숫자: Y는 오늘 이후만 센다(지난 날은 빼고), X·Z는 전체. 0이어도 저장한 게 있으면 버튼은 보인다. */
export function heartCount(st) {
  return st.flow === 'Y' ? st.saved.filter((s) => s.day >= st.day).length : st.saved.length;
}

/** 사람이 읽는 저장 목록(다음 라운드 프롬프트에 그대로 넣는다). */
export function renderSaved(st) {
  const rows = savedRows(st);
  const name = (d) => (d === st.day ? '오늘' : d === st.day + 1 ? '내일' : d > st.day ? `${d - st.day}일 뒤` : '지난 날');
  const lines = [];
  if (st.flow === 'Z') rows.forEach((s, i) => lines.push(`${i + 1}. ${s.id}`));
  else if (st.flow === 'X') {
    rows.forEach((s, i) => lines.push(`${i + 1}. ${s.id} — ${s.day === null || s.day < st.day ? '날짜 안 정함 [날짜에 두기]' : `${name(s.day)} [날짜에 두기]`}`));
  } else {
    rows.forEach((s, i) => lines.push(`${i + 1}. [${name(s.day)}] ${s.id} [위로][아래로][다른 날로]`));
    const hidden = st.saved.filter((s) => s.day < st.day).length;
    if (hidden && !st.pastOpen) lines.push(`(맨 아래: 지난 날 ${hidden}곳 — 접혀 있음 [펼치기])`);
  }
  return lines.length ? lines.join('\n') : '(저장한 곳 없음)';
}

let seq = 0;
const cardId = (mood) => `${mood}-카드${++seq}`;

/** 행동 하나를 적용한다. 안 되는 행동이면 invalid에 남기고 그 시나리오를 거기서 멈춘다(막힘). */
export function apply(st, action) {
  if (st.quit || st.go) return st;
  const [verb, a1, a2] = String(action).split(':');
  const bad = () => { st.invalid.push(`${st.screen}:${action}`); st.quit = true; return st; };
  const tap = (n = 1) => { st.taps += n; };
  // 관대한 규칙(수정 2): 그만두기는 어디서나. 시트 밖의 시트 동작은 시트를 다시 연 것으로(+1탭).
  // 이미 닫힌 시트의 닫기는 헛탭. 시트 안에서 시트 밖 동작이 오면 시트가 닫힌 것으로 보고 그 화면에서 다시 적용.
  if (verb === 'quit') { st.quit = true; return st; }
  if ((st.screen === 'home' || st.screen === 'cards') && SHEET_VERBS.has(verb)) { tap(); st.from = st.screen; st.screen = 'basis'; }
  else if ((st.screen === 'home' || st.screen === 'cards') && verb === 'close') { tap(); return st; }
  else if (st.screen === 'basis' && !SHEET_VERBS.has(verb) && verb !== 'close' && !st.needArea) { st.screen = st.from ?? 'home'; return apply(st, action); }
  switch (st.screen) {
    case 'home':
      if (verb === 'mood' && MOODS.includes(a1) && st.needArea) { tap(); st.pendingMood = a1; st.screen = 'basis'; st.from = 'home'; return st; } // 제주 밖: 동네부터 고르라고 뜬다
      if (verb === 'mood' && MOODS.includes(a1)) { tap(); if (a1 === 'food') st.screen = 'food'; else { st.screen = 'cards'; st.shown = [1, 2, 3].map(() => cardId(a1)); } return st; }
      if (verb === 'open_basis') { tap(); st.screen = 'basis'; st.from = 'home'; return st; }
      if (verb === 'open_saved') { if (!st.saved.length) return bad(); tap(); st.screen = 'saved'; st.from = 'home'; return st; }
      if (verb === 'today_line') { tap(); st.screen = 'cards'; st.shown = [1, 2, 3].map(() => cardId('line')); return st; }
      if (verb === 'quit') { st.quit = true; return st; }
      return bad();
    case 'food':
      if (verb === 'food' && ['meal', 'cafe'].includes(a1)) { tap(); st.screen = 'cards'; st.shown = [1, 2, 3].map(() => cardId(`food-${a1}`)); return st; }
      if (verb === 'back') { tap(); st.screen = 'home'; return st; }
      return bad();
    case 'cards': {
      const k = Number(a1);
      if (verb === 'heart' && k >= 1 && k <= 3) {
        tap();
        const id = st.shown[k - 1];
        const day = st.flow === 'Y' ? (st.when === 'now' ? st.day : st.when === 'tomorrow' ? st.day + 1 : st.day + 2) : null;
        if (!st.saved.some((s) => s.id === id && s.day === day)) { st.saved.push({ id, day, order: st.saved.length }); st.hearts.push(id); }
        return st;
      }
      if (verb === 'go' && k >= 1 && k <= 3) { tap(); st.go = { id: st.shown[k - 1], from: 'cards' }; return st; }
      if (verb === 'more') { tap(); st.shown = st.shown.map((id) => cardId(id.split('-')[0])); return st; }
      if (verb === 'back') { tap(); st.screen = 'home'; return st; }
      if (verb === 'open_saved') { if (!st.saved.length) return bad(); tap(); st.screen = 'saved'; st.from = 'cards'; return st; }
      if (verb === 'open_basis') { tap(); st.screen = 'basis'; st.from = 'cards'; return st; }
      if (verb === 'quit') { st.quit = true; return st; }
      return bad();
    }
    case 'basis':
      if (verb === 'when') {
        if (st.flow !== 'Y' || !['now', 'tomorrow', 'date'].includes(a1)) return bad();
        tap(a1 === 'date' ? 2 : 1); st.when = a1; return st; // 날짜 고르기는 달력에서 하루를 더 누른다
      }
      if (verb === 'where' && ['gps', 'stay'].includes(a1)) { tap(); st.screen = st.from ?? 'home'; return st; }
      if (verb === 'area') { tap(); st.needArea = false; if (st.pendingMood) { const m = st.pendingMood; st.pendingMood = null; st.screen = m === 'food' ? 'food' : 'cards'; if (m !== 'food') st.shown = [1, 2, 3].map(() => cardId(m)); } else st.screen = st.from ?? 'home'; return st; }
      if (st.needArea && verb !== 'when' && verb !== 'close') return bad(); // 동네를 고르기 전에는 다른 기준이 안 된다
      if (verb === 'reach' && ['walk', '30', '60'].includes(a1)) { tap(); st.screen = st.from ?? 'home'; return st; }
      if (verb === 'indoor') { tap(); st.screen = st.from ?? 'home'; return st; }
      if (verb === 'close') { tap(); st.screen = st.from ?? 'home'; return st; }
      return bad();
    case 'saved': {
      const rows = savedRows(st);
      const k = Number(a1);
      const row = rows[k - 1];
      if (verb === 'back') { tap(); st.screen = st.from ?? 'home'; return st; }
      if (verb === 'quit') { st.quit = true; return st; }
      if (verb === 'past_toggle') { if (st.flow !== 'Y') return bad(); tap(); st.pastOpen = !st.pastOpen; return st; }
      if (!row) return bad();
      if (verb === 'go') { tap(); st.go = { id: row.id, from: 'saved', savedDay: row.day }; return st; }
      if (verb === 'unheart') { tap(); st.saved = st.saved.filter((s) => s !== row); return st; }
      const target = (t) => (t === 'today' ? st.day : t === 'tomorrow' ? st.day + 1 : t === 'date' ? st.day + 2 : NaN);
      if (st.flow === 'X' && verb === 'set_day') { const d = target(a2); if (Number.isNaN(d)) return bad(); tap(a2 === 'date' ? 3 : 2); row.day = d; return st; }
      if (st.flow === 'Y' && verb === 'move') { const d = target(a2); if (Number.isNaN(d)) return bad(); tap(a2 === 'date' ? 3 : 2); row.day = d; return st; }
      if (st.flow === 'Y' && (verb === 'up' || verb === 'down')) {
        const same = rows.filter((r) => r.day === row.day);
        const i = same.indexOf(row), j = verb === 'up' ? i - 1 : i + 1;
        if (j < 0 || j >= same.length) return bad();
        tap(); [row.order, same[j].order] = [same[j].order, row.order]; return st;
      }
      return bad();
    }
  }
  return bad();
}

/** 한 시나리오의 행동 목록을 재생한다. */
export function run(flow, day, saved, actions, opts = {}) {
  const st = newState(flow, day, saved, opts);
  for (const a of actions) { apply(st, a); if (st.quit || st.go) break; }
  return st;
}

/** 사전등록 「done」 규칙(00-prereg.md)을 기록으로 판정한다. */
export function judge(scenario, st, before) {
  const priorIds = new Set(before.map((s) => s.id));
  switch (scenario) {
    case 'S1': case 'S3': return st.hearts.length > 0 || !!st.go; // 후보를 남겼나(담기) — 그 자리에서 가기로 정해도 성공
    case 'S2': case 'S4': return !!st.go;                         // 지금 갈 곳을 골랐나
    case 'S5': return !!st.go && st.go.from === 'saved' && priorIds.has(st.go.id); // 담아 둔 곳을 다시 꺼내 갔나
    default: return false;
  }
}
