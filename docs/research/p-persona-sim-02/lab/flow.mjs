// 흐름 비교용 화면 엔진 (1단계부터, 00-design.md 2절 1~3단계). 0단계 엔진 screen.mjs는 재현을 위해 그대로 둔다.
// 화면 규칙·카드·버튼 모양은 screen.mjs와 같고, 팔이 「저장 흐름 후보」다:
//   A    지금 앱: 기준 시트 「언제」, 하트는 고른 날(지금=오늘)에 담김, ♥ 숫자는 오늘 이후만, 지난 날은 접힘
//   A2   A′ 최소 수정: A + 밤(20시 이후) 「지금」으로 담으면 내일에 담김 + 지난 날을 접지 않고 맨 위 「담아 둔 곳」으로 + ♥ 숫자에 포함
//   B    날짜 없이 담고 저장 목록에서 줄마다 「날짜에 두기」(선택). 기준 시트 「언제」 없음. 날짜에 둔 날이 지나면 「담아 둔 곳」으로 돌아옴
//   C    날짜 없음: 담기만, 목록은 한 묶음, 날짜 정리 없음. 기준 시트 「언제」 없음
// 상황(scenario):
//   N  두 장면: 밤 10시 훑어보기(장면 1, 카드·줄을 눌러 지도를 열어도 위치만 보고 돌아온 것으로 — 장면은 앱 닫기로 끝) → 다음 날 아침 9시 반 「어젯밤 담은 곳 중 하나로」(장면 2). 같은 사람이 이어서 한다
//   P  저녁 8시, 계획 맡은 사람: 오늘 낮에 담아 둔 4곳을 내일·모레로 나눠 두기
//   S2 오후 2시 현장, 다음 할 곳 찾기(흐름과 무관해야 하는 대조 상황)

import { SPOTS, AREAS, carMin, rng, attachRand, MAX_TAPS } from './screen.mjs';
export { SPOTS, AREAS, carMin, rng, attachRand, MAX_TAPS };

export const ARMS = ['A', 'A2', 'B', 'C'];
const NIGHT_HOUR = 20;
export const DATES = ['10월 16일 (금)', '10월 17일 (토)', '10월 18일 (일)', '10월 19일 (월)', '10월 20일 (화)', '10월 21일 (수)'];

const W = {
  moods: { rest: '푹 쉬고 싶어', walk: '좀 걷고 싶어', new: '새로운 거 해보고 싶어', food: '맛있는 거 먹고 싶어', any: '아무거나 골라줘' },
  ask: '지금 뭐 하고 싶어요?', more: '다른 3곳 보기', savedTitle: '저장한 곳', here: '내 위치 근처', stay: '숙소 근처',
  meal: '식사', cafe: '카페·디저트', guide: '저장한 곳은 맨 위 하트 버튼에 모여요',
};
const hasWhen = (arm) => arm === 'A' || arm === 'A2';

export function newSession(spec) {
  // spec: { sid, seed, arm, scenario, area, day, hour, dateLabel, where, saved:[{id,day}], next?: {day, hour, dateLabel, situation} }
  const st = { ...spec, randN: 0, screen: 'home', when: 'now', from: 'home', cards: [], queue: [], pastOpen: false,
    saved: (spec.saved ?? []).map((x, i) => ({ ...x, order: i })), hearts: [], unhearts: 0, go: null, taps: 0, bad: 0, end: null, guideShown: false, log: [], part: 1, banner: null, parts: [] };
  st.savedAtStart = st.saved.map((x) => ({ id: x.id, day: x.day }));
  return attachRand(st);
}

const spotById = (id) => SPOTS.find((s) => s.id === id);
const dayName = (st, d) => (d === st.day ? '오늘' : d === st.day + 1 ? '내일' : d > st.day ? `${d - st.day}일 뒤` : '지난 날');
const undated = (st, x) => x.day == null || (st.arm !== 'A' && x.day < st.day); // A2·B: 지난 날은 「담아 둔 곳」으로 돌아옴
export const heartCount = (st) => (st.arm === 'A' ? st.saved.filter((s) => s.day >= st.day).length : st.saved.length);

/** 저장 목록 줄(보이는 순서)과 묶음 이름. */
export function savedRows(st) {
  const ord = (a, b) => a.order - b.order;
  if (st.arm === 'C') return st.saved.slice().sort(ord).map((r) => ({ r, g: null }));
  const top = st.saved.filter((x) => undated(st, x)).sort(ord).map((r) => ({ r, g: '담아 둔 곳' }));
  const cur = st.saved.filter((x) => !undated(st, x) && x.day >= st.day).sort((a, b) => a.day - b.day || ord(a, b)).map((r) => ({ r, g: dayName(st, r.day) }));
  const past = st.arm === 'A' ? st.saved.filter((x) => x.day < st.day).sort((a, b) => b.day - a.day || ord(a, b)).map((r) => ({ r, g: '지난 날' })) : [];
  return [...top, ...cur, ...(st.pastOpen ? past : [])];
}

const btn = (label, code) => `[${label}](${code})`;

export function render(st) {
  const basisLabel = `${st.when === 'tomorrow' ? '내일 · ' : st.when === 'date' ? '모레 · ' : ''}${st.where === 'stay' ? W.stay : W.here}`;
  const L = [];
  if (st.banner) { L.push(`(${st.banner})`, ''); }
  const n = heartCount(st);
  const hasSaved = st.saved.length > 0;
  switch (st.screen) {
    case 'home': {
      const top = [btn(basisLabel, 'open_basis')];
      if (hasSaved) top.push(btn(`♥ ${n}`, 'open_saved'));
      L.push(`맨 위 줄: ${top.join('  ')}`, '여차나:제주 · P를 위한 여행동반자', `${st.dateLabel} · 해 지는 시각 18:04`, '', W.ask);
      L.push(Object.entries(W.moods).map(([k, v]) => btn(v, `mood:${k}`)).join(' '));
      break;
    }
    case 'food':
      L.push('어떤 걸로?', `${btn(W.meal, 'food:meal')} ${btn(W.cafe, 'food:cafe')}`, btn('뒤로', 'back'));
      break;
    case 'cards': {
      const top = [btn('←', 'back'), btn(basisLabel, 'open_basis')];
      if (hasSaved) top.push(btn(`♥ ${n}`, 'open_saved'));
      L.push(`맨 위 줄: ${top.join('  ')}`);
      if (st.toast) { L.push(`(알림) ${st.toast}`); st.toast = null; }
      st.cards.forEach((id, i) => {
        const s = spotById(id);
        const on = st.saved.some((x) => x.id === id);
        L.push(`카드 ${i + 1}: ${s.name} — ${s.reason} · 차로 약 ${carMin(AREAS[st.area], s)}분  ${btn(on ? '♥ 저장됨' : '♡', `heart:${i + 1}`)}  (카드 누르면 길찾기 열림: ${btn('이 카드 누르기', `go:${i + 1}`)})`);
      });
      L.push(btn(W.more, 'more'));
      break;
    }
    case 'basis':
      L.push('기준 시트');
      if (hasWhen(st.arm)) L.push(`언제: ${btn('지금', 'when:now')} ${btn('내일', 'when:tomorrow')} ${btn('날짜 고르기', 'when:date')}  (지금: ${st.when === 'now' ? '지금' : st.when === 'tomorrow' ? '내일' : '모레'})`);
      L.push(`어디: ${btn('지금 있는 곳', 'where:gps')} ${btn('숙소', 'where:stay')}`);
      L.push(`얼마나: ${btn('걸어서', 'reach:walk')} ${btn('차로 30분', 'reach:30')} ${btn('차로 1시간', 'reach:60')}`);
      L.push(`날씨: ${btn('비 와요(실내만)', 'indoor')}`, `동네: 애월 · 한림 · 신제주 … 15곳 ${btn('동네 고르기', 'area')}`, btn('닫기', 'close'));
      break;
    case 'saved': {
      L.push(`${W.savedTitle}  ${btn('←', 'back')}`);
      if (st.toast) { L.push(`(알림) ${st.toast}`); st.toast = null; }
      const rows = savedRows(st);
      let group;
      rows.forEach(({ r, g }, i) => {
        if (g && g !== group) { L.push(`— ${g} —`); group = g; }
        const s = spotById(r.id);
        const ctl = st.arm === 'A' ? [btn('위로', `up:${i + 1}`), btn('아래로', `down:${i + 1}`), btn('다른 날로', `move:${i + 1}`)]
          : st.arm === 'A2' ? [btn('다른 날로', `move:${i + 1}`)]
          : st.arm === 'B' ? [btn(undated(st, r) ? '날짜에 두기' : '날짜 바꾸기', `move:${i + 1}`)] : [];
        L.push(`${i + 1}. ${s.name} — ${s.reason} · 차로 약 ${carMin(AREAS[st.area], s)}분 (줄 누르면 길찾기: ${btn('누르기', `go:${i + 1}`)}) ${[...ctl, btn('♥ 빼기', `unheart:${i + 1}`)].join(' ')}`);
      });
      if (!rows.length) L.push(st.arm === 'A' ? '(오늘 이후 저장한 곳 없음)' : '(저장한 곳 없음)');
      const hidden = st.arm === 'A' ? st.saved.filter((s) => s.day < st.day).length : 0;
      if (hidden && !st.pastOpen) L.push(`지난 날 ${hidden}곳 ${btn('펼치기', 'past_toggle')}`);
      break;
    }
    case 'move':
      L.push(st.arm === 'B' ? '어느 날에 둘까요?' : '어느 날로 옮길까요?', `${btn('오늘', 'day:today')} ${btn('내일', 'day:tomorrow')} ${btn('날짜 고르기', 'day:date')}${st.arm === 'B' ? ' ' + btn('날짜 빼기', 'day:none') : ''} ${btn('취소', 'back')}`);
      break;
    case 'cal':
      L.push('달력', [0, 1, 2, 3].map((i) => btn(`${DATES[st.day + i] ?? `+${i}일`}${i === 0 ? ' 오늘' : ''}`, `cal:${i}`)).join(' '), btn('취소', 'back'));
      break;
  }
  L.push(btn('앱 닫기', 'quit'));
  return L.join('\n');
}

const MOODS = ['rest', 'walk', 'new', 'food', 'any'];
function pool(st, mood, sub) {
  const from = AREAS[st.area];
  return SPOTS.filter((s) => (mood === 'any' ? true : s.mood === mood) && (!sub || s.sub === sub) && carMin(from, s) <= 40)
    .map((s) => ({ s, k: carMin(from, s) - (s.score ?? 0) * 2 + st.rand() * 12 }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.s);
}
function showCards(st, mood, sub) {
  st.queue = pool(st, mood, sub).slice(0, 45).map((s) => s.id);
  st.cards = st.queue.splice(0, 3);
  st.screen = 'cards';
}

/** 하트를 눌렀을 때 담기는 날. A: 고른 날(지금=오늘). A2: 밤에 「지금」이면 내일. B·C: 날짜 없음. */
function heartDay(st) {
  if (st.arm === 'B' || st.arm === 'C') return null;
  if (st.when === 'tomorrow') return st.day + 1;
  if (st.when === 'date') return st.day + 2;
  return st.arm === 'A2' && st.hour >= NIGHT_HOUR ? st.day + 1 : st.day;
}

/** 장면 1이 끝나면 장면 2로(같은 사람, 다음 날). 저장 목록만 이어진다. */
function endPart(st, how) {
  if (st.part === 1 && st.next) {
    st.parts.push({ end: how, hearts: [...st.hearts], taps: st.taps, bad: st.bad, go: st.go, log: st.log });
    const nx = st.next;
    Object.assign(st, { part: 2, day: nx.day, hour: nx.hour, dateLabel: nx.dateLabel, banner: nx.situation, screen: 'home', when: 'now', from: 'home', cards: [], queue: [], pastOpen: false,
      hearts: [], go: null, taps: 0, bad: 0, end: null, log: [], toast: null });
    st.part2Start = { live: heartCount(st), saved: st.saved.length };
    return st;
  }
  st.end = how;
  return st;
}

export function act(st, code) {
  if (st.end) return st;
  const [v, a] = String(code).trim().split(':');
  const k = Number(a);
  const ok = () => { st.taps++; st.log.push(code); st.banner = null; if (st.taps >= MAX_TAPS) endPart(st, 'cap'); return st; };
  const goTo = (g) => { st.taps++; st.log.push(code); st.banner = null; st.go = g; return endPart(st, 'go'); };
  const no = () => { st.bad++; st.log.push(`!${code}`); if (st.bad >= 3) endPart(st, 'stuck'); return st; };
  if (v === 'quit') { st.log.push('quit'); return endPart(st, 'quit'); }
  const hasSaved = st.saved.length > 0;
  switch (st.screen) {
    case 'home':
      if (v === 'mood' && MOODS.includes(a)) { if (a === 'food') st.screen = 'food'; else showCards(st, a); return ok(); }
      if (v === 'open_basis') { st.from = 'home'; st.screen = 'basis'; return ok(); }
      if (v === 'open_saved' && hasSaved) { st.from = 'home'; st.screen = 'saved'; return ok(); }
      return no();
    case 'food':
      if (v === 'food' && (a === 'meal' || a === 'cafe')) { showCards(st, 'food', a); return ok(); }
      if (v === 'back') { st.screen = 'home'; return ok(); }
      return no();
    case 'cards':
      if ((v === 'heart' || v === 'go') && k >= 1 && k <= st.cards.length) {
        const id = st.cards[k - 1];
        if (v === 'go' && st.part === 1 && st.next) { st.peeks = (st.peeks ?? 0) + 1; st.toast = '지도 앱에서 위치를 보고 이 화면으로 돌아왔다'; return ok(); } // 밤 훑어보기: 지도는 위치 확인, 장면은 이어짐
        if (v === 'go') return goTo({ id, from: 'cards' });
        const i = st.saved.findIndex((x) => x.id === id);
        if (i >= 0) { st.saved.splice(i, 1); st.unhearts++; }
        else {
          st.saved.push({ id, day: heartDay(st), order: st.saved.length ? Math.max(...st.saved.map((x) => x.order)) + 1 : 0 }); st.hearts.push(id);
          if (!st.guideShown) { st.toast = W.guide; st.guideShown = true; }
        }
        return ok();
      }
      if (v === 'more') { if (st.queue.length < 3) return no(); st.cards = st.queue.splice(0, 3); return ok(); }
      if (v === 'back') { st.screen = 'home'; return ok(); }
      if (v === 'open_basis') { st.from = 'cards'; st.screen = 'basis'; return ok(); }
      if (v === 'open_saved' && hasSaved) { st.from = 'cards'; st.screen = 'saved'; return ok(); }
      return no();
    case 'basis':
      if (v === 'when' && hasWhen(st.arm) && ['now', 'tomorrow', 'date'].includes(a)) { st.when = a; if (a === 'date') st.taps++; return ok(); }
      if (v === 'where' && (a === 'gps' || a === 'stay')) { st.where = a; st.screen = st.from; return ok(); }
      if (v === 'reach' && ['walk', '30', '60'].includes(a)) { st.screen = st.from; return ok(); }
      if (v === 'indoor' || v === 'area') { st.screen = st.from; if (v === 'area') st.taps++; return ok(); }
      if (v === 'close') { st.screen = st.from; return ok(); }
      return no();
    case 'saved': {
      const rows = savedRows(st).map((x) => x.r);
      if (v === 'back') { st.screen = st.from; return ok(); }
      if (v === 'past_toggle' && st.arm === 'A' && st.saved.some((s) => s.day < st.day)) { st.pastOpen = !st.pastOpen; return ok(); }
      const row = rows[k - 1];
      if (!row) return no();
      if (v === 'go' && st.part === 1 && st.next) { st.peeks = (st.peeks ?? 0) + 1; st.toast = '지도 앱에서 위치를 보고 이 화면으로 돌아왔다'; return ok(); }
      if (v === 'go') return goTo({ id: row.id, from: 'saved' });
      if (v === 'unheart') { st.saved = st.saved.filter((s) => s.id !== row.id); st.unhearts++; return ok(); }
      if (v === 'move' && st.arm !== 'C') { st.moving = row.id; st.screen = 'move'; return ok(); }
      if ((v === 'up' || v === 'down') && st.arm === 'A') {
        const same = rows.filter((r) => r.day === row.day);
        const i = same.indexOf(row), j = v === 'up' ? i - 1 : i + 1;
        if (j < 0 || j >= same.length) return no();
        [row.order, same[j].order] = [same[j].order, row.order];
        return ok();
      }
      return no();
    }
    case 'move':
      if (v === 'back') { st.screen = 'saved'; return ok(); }
      if (v === 'day' && (['today', 'tomorrow', 'date'].includes(a) || (a === 'none' && st.arm === 'B'))) {
        if (a === 'date') { st.screen = 'cal'; return ok(); }
        const m = st.saved.find((x) => x.id === st.moving);
        if (m) m.day = a === 'none' ? null : a === 'today' ? st.day : st.day + 1;
        st.screen = 'saved'; return ok();
      }
      return no();
    case 'cal':
      if (v === 'back') { st.screen = 'move'; return ok(); }
      if (v === 'cal' && k >= 0 && k <= 3 && a !== '') { const m = st.saved.find((x) => x.id === st.moving); if (m) m.day = st.day + k; st.screen = 'saved'; return ok(); }
      return no();
  }
  return no();
}

/** 성공 규칙(1단계 사전등록). N은 장면 2 기준, P는 끝난 상태 기준. */
export function judge(st) {
  switch (st.scenario) {
    case 'N':
    case 'NI': {
      const night = new Set(st.parts[0]?.hearts ?? []);
      return st.part === 2 && !!st.go && st.go.from === 'saved' && night.has(st.go.id);
    }
    case 'P': return st.saved.some((x) => x.day === st.day + 1) && st.saved.some((x) => x.day === st.day + 2);
    case 'S2': return !!st.go;
    default: return false;
  }
}
