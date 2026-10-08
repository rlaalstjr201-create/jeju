// 닫힌 고리 화면 엔진 (2차 실험, 00-design.md 3-A).
// 시뮬레이터는 화면 글을 보고 버튼 하나를 고른다 → 엔진이 다음 화면을 그린다. 보이지 않는 버튼은 화면에 없다.
// 성공·탭 수·막힘은 엔진이 센다(시뮬레이터 자기보고를 쓰지 않는다). 카드는 실제 spots.json 장소다.
//
// 팔(arm) — 0단계는 모두 지금 앱(A, 날짜 먼저) 위에서 도구를 시험한다:
//   base  지금 앱 그대로            dup  base와 똑같은 화면(A/A)
//   neg   겉모양만 바꿈(문구 동의어)  L1   ♥ 버튼이 첫 화면 맨 아래(내려야 보임)
//   L2    ♥ 버튼 없음, ⋯ 메뉴 안 「보관함」   L3   첫 화면에서 저장 목록으로 가는 길 없음, 카드 화면 맨 아래 작은 링크만

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const SPOTS = JSON.parse(readFileSync(resolve(HERE, '../../../../apps/web/public/spots.json'), 'utf8'));
export const ARMS = ['base', 'dup', 'neg', 'L1', 'L2', 'L3'];
export const MAX_TAPS = 15; // 이만큼 눌러도 못 끝내면 포기로 본다

// 동네(apps/web/src/areas.ts 일부)
export const AREAS = {
  애월: [33.4475, 126.3678], 신제주: [33.487, 126.488], 조천: [33.5012, 126.6668], 구좌: [33.5189, 126.8079],
  중문: [33.2576, 126.4205], 서귀포시내: [33.2573, 126.5338], 성산: [33.4387, 126.9026], 한림: [33.3957, 126.2651],
};

const T = {
  base: {
    moods: { rest: '푹 쉬고 싶어', walk: '좀 걷고 싶어', new: '새로운 거 해보고 싶어', food: '맛있는 거 먹고 싶어', any: '아무거나 골라줘' },
    ask: '지금 뭐 하고 싶어요?', more: '다른 3곳 보기', savedTitle: '저장한 곳', here: '내 위치 근처', stay: '숙소 근처',
    meal: '식사', cafe: '카페·디저트', guide: '저장한 곳은 맨 위 하트 버튼에 모여요',
  },
  neg: {
    moods: { rest: '쉬고 싶어', walk: '걷고 싶어', new: '새로운 걸 해볼래', food: '뭐 좀 먹고 싶어', any: '아무 데나 골라줘' },
    ask: '지금 뭐 할까요?', more: '3곳 더 보기', savedTitle: '담아 둔 곳', here: '지금 있는 곳 근처', stay: '숙소 주변',
    meal: '밥', cafe: '카페·디저트', guide: '담아 둔 곳은 맨 위 하트 버튼에서 볼 수 있어요',
  },
};
const words = (arm) => (arm === 'neg' ? T.neg : T.base);

// 결정적 난수(세션 id로 씨앗)
export function rng(seedStr) {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) { h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const km = ([a, b], [c, d]) => { const R = 6371, r = Math.PI / 180; const x = Math.sin(((c - a) * r) / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(((d - b) * r) / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
export const carMin = (from, s) => Math.max(3, Math.round(km(from, [s.lat, s.lng]) * 1.5 + 2));

/** 기분(과 식사/카페)에 맞는 가까운 곳 순 후보. 차로 40분 안, 점수 높은 곳 위주. */
function pool(st, mood, sub) {
  const from = AREAS[st.area];
  return SPOTS.filter((s) => (mood === 'any' ? true : s.mood === mood) && (!sub || s.sub === sub) && carMin(from, s) <= 40)
    .map((s) => ({ s, k: carMin(from, s) - (s.score ?? 0) * 2 + st.rand() * 12 }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.s);
}

export function newSession(spec) {
  // spec: { sid, arm, scenario, area, day, clock, saved:[{id,day}] }
  const st = { ...spec, randN: 0, screen: 'home', when: 'now', scrolled: false, from: 'home', cards: [], queue: [], pastOpen: false,
    saved: (spec.saved ?? []).map((x, i) => ({ ...x, order: i })), hearts: [], unhearts: 0, go: null, taps: 0, bad: 0, end: null, guideShown: false, log: [] };
  st.savedAtStart = st.saved.map((x) => ({ id: x.id, day: x.day }));
  return attachRand(st);
}

/** 파일에서 다시 읽은 세션에 난수를 붙인다(같은 씨앗, 이미 쓴 만큼 건너뜀) — 실행이 여러 프로세스로 나뉘어도 같은 카드가 나온다. */
export function attachRand(st) {
  const r = rng(st.seed ?? st.sid);
  for (let i = 0; i < st.randN; i++) r();
  Object.defineProperty(st, 'rand', { value: () => { st.randN++; return r(); }, enumerable: false, configurable: true });
  return st;
}

const spotById = (id) => SPOTS.find((s) => s.id === id);
const dayName = (st, d) => (d === st.day ? '오늘' : d === st.day + 1 ? '내일' : d > st.day ? `${d - st.day}일 뒤` : '지난 날');
const heartCount = (st) => st.saved.filter((s) => s.day >= st.day).length; // 지금 앱: 오늘 이후만 센다(render.ts)

function savedRows(st) {
  const cur = st.saved.filter((s) => s.day >= st.day).sort((a, b) => a.day - b.day || a.order - b.order);
  const past = st.saved.filter((s) => s.day < st.day).sort((a, b) => b.day - a.day || a.order - b.order);
  return st.pastOpen ? [...cur, ...past] : cur;
}

const btn = (label, code) => `[${label}](${code})`;

/** 지금 화면을 글로. 누를 수 있는 것은 [글자](코드)로만 보인다. */
export function render(st) {
  const w = words(st.arm);
  const basisLabel = `${st.when === 'tomorrow' ? '내일 · ' : st.when === 'date' ? '모레 · ' : ''}${st.where === 'stay' ? w.stay : w.here}`;
  const L = [];
  const n = heartCount(st);
  const hasSaved = st.saved.length > 0;
  switch (st.screen) {
    case 'home': {
      const top = [btn(basisLabel, 'open_basis')];
      if (hasSaved && ['base', 'dup', 'neg'].includes(st.arm)) top.push(btn(`♥ ${n}`, 'open_saved'));
      if (st.arm === 'L2') top.push(btn('⋯', 'menu'));
      L.push(`맨 위 줄: ${top.join('  ')}`, '여차나:제주 · P를 위한 여행동반자', `${st.dateLabel} · 해 지는 시각 18:04`, '', w.ask);
      L.push(Object.entries(w.moods).map(([k, v]) => btn(v, `mood:${k}`)).join(' '));
      if (st.arm === 'L1' && hasSaved) {
        if (st.scrolled) L.push('', '(화면 맨 아래)', btn(`♥ 저장한 곳 ${n}`, 'open_saved'), '개인정보 · 의견 보내기');
        else L.push('', '(아래로 더 있음) ' + btn('내리기', 'scroll'));
      }
      break;
    }
    case 'menu':
      L.push('메뉴', ['설정', '도움말', '보관함', '의견 보내기', '앱 소개'].map((x, i) => btn(x, `menu:${i + 1}`)).join(' '), btn('닫기', 'back'));
      break;
    case 'food':
      L.push('어떤 걸로?', `${btn(w.meal, 'food:meal')} ${btn(w.cafe, 'food:cafe')}`, btn('뒤로', 'back'));
      break;
    case 'cards': {
      const top = [btn('←', 'back'), btn(basisLabel, 'open_basis')];
      if (hasSaved && ['base', 'dup', 'neg'].includes(st.arm)) top.push(btn(`♥ ${n}`, 'open_saved'));
      L.push(`맨 위 줄: ${top.join('  ')}`);
      if (st.toast) { L.push(`(알림) ${st.toast}`); st.toast = null; }
      st.cards.forEach((id, i) => {
        const s = spotById(id);
        const on = st.saved.some((x) => x.id === id);
        L.push(`카드 ${i + 1}: ${s.name} — ${s.reason} · 차로 약 ${carMin(AREAS[st.area], s)}분  ${btn(on ? '♥ 저장됨' : '♡', `heart:${i + 1}`)}  (카드 누르면 길찾기 열림: ${btn('이 카드 누르기', `go:${i + 1}`)})`);
      });
      L.push(btn(w.more, 'more'));
      if (st.arm === 'L3' && hasSaved) L.push(`(맨 아래 작은 글씨) ${btn('담은 곳', 'saved_link')}`);
      break;
    }
    case 'basis':
      L.push('기준 시트');
      L.push(`언제: ${btn('지금', 'when:now')} ${btn('내일', 'when:tomorrow')} ${btn('날짜 고르기', 'when:date')}  (지금: ${st.when === 'now' ? '지금' : st.when === 'tomorrow' ? '내일' : '모레'})`);
      L.push(`어디: ${btn('지금 있는 곳', 'where:gps')} ${btn('숙소', 'where:stay')}`);
      L.push(`얼마나: ${btn('걸어서', 'reach:walk')} ${btn('차로 30분', 'reach:30')} ${btn('차로 1시간', 'reach:60')}`);
      L.push(`날씨: ${btn('비 와요(실내만)', 'indoor')}`, `동네: 애월 · 한림 · 신제주 … 15곳 ${btn('동네 고르기', 'area')}`, btn('닫기', 'close'));
      break;
    case 'saved': {
      L.push(`${w.savedTitle}  ${btn('←', 'back')}`);
      const rows = savedRows(st);
      let group = null;
      rows.forEach((r, i) => {
        const g = dayName(st, r.day);
        if (g !== group) { L.push(`— ${g} —`); group = g; }
        const s = spotById(r.id);
        L.push(`${i + 1}. ${s.name} — ${s.reason} · 차로 약 ${carMin(AREAS[st.area], s)}분 (줄 누르면 길찾기: ${btn('누르기', `go:${i + 1}`)}) ${btn('위로', `up:${i + 1}`)} ${btn('아래로', `down:${i + 1}`)} ${btn('다른 날로', `move:${i + 1}`)} ${btn('♥ 빼기', `unheart:${i + 1}`)}`);
      });
      if (!rows.length) L.push('(오늘 이후 저장한 곳 없음)');
      const hidden = st.saved.filter((s) => s.day < st.day).length;
      if (hidden && !st.pastOpen) L.push(`지난 날 ${hidden}곳 ${btn('펼치기', 'past_toggle')}`);
      break;
    }
    case 'move':
      L.push('어느 날로 옮길까요?', `${btn('오늘', 'day:today')} ${btn('내일', 'day:tomorrow')} ${btn('날짜 고르기', 'day:date')} ${btn('취소', 'back')}`);
      break;
  }
  L.push(btn('앱 닫기', 'quit'));
  return L.join('\n');
}

const MOODS = ['rest', 'walk', 'new', 'food', 'any'];
function showCards(st, mood, sub) {
  st.queue = pool(st, mood, sub).slice(0, 45).map((s) => s.id); // 15번 안에 볼 수 있는 만큼만(파일 크기)
  st.cards = st.queue.splice(0, 3);
  st.screen = 'cards';
}

/** 버튼 하나 누르기. 화면에 없는 코드는 「없는 버튼」으로 세고(bad) 화면은 그대로. */
export function act(st, code) {
  if (st.end) return st;
  const [v, a] = String(code).trim().split(':');
  const k = Number(a);
  const ok = () => { st.taps++; st.log.push(code); if (st.taps >= MAX_TAPS && !st.end) st.end = 'cap'; return st; };
  const no = () => { st.bad++; st.log.push(`!${code}`); if (st.bad >= 3) st.end = 'stuck'; return st; };
  if (v === 'quit') { st.log.push('quit'); st.end = 'quit'; return st; }
  const hasSaved = st.saved.length > 0;
  switch (st.screen) {
    case 'home':
      if (v === 'mood' && MOODS.includes(a)) { if (a === 'food') st.screen = 'food'; else showCards(st, a); return ok(); }
      if (v === 'open_basis') { st.from = 'home'; st.screen = 'basis'; return ok(); }
      if (v === 'open_saved' && hasSaved && (['base', 'dup', 'neg'].includes(st.arm) || (st.arm === 'L1' && st.scrolled))) { st.from = 'home'; st.screen = 'saved'; return ok(); }
      if (v === 'scroll' && st.arm === 'L1' && hasSaved && !st.scrolled) { st.scrolled = true; return ok(); }
      if (v === 'menu' && st.arm === 'L2') { st.screen = 'menu'; return ok(); }
      return no();
    case 'menu':
      if (v === 'back') { st.screen = 'home'; return ok(); }
      if (v === 'menu' && k === 3 && hasSaved) { st.from = 'home'; st.screen = 'saved'; return ok(); }
      if (v === 'menu' && k >= 1 && k <= 5) { st.taps++; st.log.push(code); st.screen = 'home'; st.offPath = (st.offPath ?? 0) + 1; return st; } // 엉뚱한 메뉴: 열었다 닫힌 것으로
      return no();
    case 'food':
      if (v === 'food' && (a === 'meal' || a === 'cafe')) { showCards(st, 'food', a); return ok(); }
      if (v === 'back') { st.screen = 'home'; return ok(); }
      return no();
    case 'cards':
      if ((v === 'heart' || v === 'go') && k >= 1 && k <= st.cards.length) {
        const id = st.cards[k - 1];
        if (v === 'go') { st.go = { id, from: 'cards' }; st.end = 'go'; return ok(); }
        const i = st.saved.findIndex((x) => x.id === id);
        if (i >= 0) { st.saved.splice(i, 1); st.unhearts++; }
        else {
          const day = st.when === 'now' ? st.day : st.when === 'tomorrow' ? st.day + 1 : st.day + 2;
          st.saved.push({ id, day, order: st.saved.length }); st.hearts.push(id);
          if (!st.guideShown && st.arm !== 'L2' && st.arm !== 'L3') { st.toast = st.arm === 'L1' ? '저장한 곳은 첫 화면 맨 아래에 모여요' : words(st.arm).guide; st.guideShown = true; }
        }
        return ok();
      }
      if (v === 'more') { if (st.queue.length < 3) return no(); st.cards = st.queue.splice(0, 3); return ok(); }
      if (v === 'back') { st.screen = 'home'; st.scrolled = false; return ok(); }
      if (v === 'open_basis') { st.from = 'cards'; st.screen = 'basis'; return ok(); }
      if (v === 'open_saved' && hasSaved && ['base', 'dup', 'neg'].includes(st.arm)) { st.from = 'cards'; st.screen = 'saved'; return ok(); }
      if (v === 'saved_link' && hasSaved && st.arm === 'L3') { st.from = 'cards'; st.screen = 'saved'; return ok(); }
      return no();
    case 'basis':
      if (v === 'when' && ['now', 'tomorrow', 'date'].includes(a)) { st.when = a; if (a === 'date') st.taps++; return ok(); } // 달력에서 하루를 더 누른다
      if (v === 'where' && (a === 'gps' || a === 'stay')) { st.where = a; st.screen = st.from; return ok(); }
      if (v === 'reach' && ['walk', '30', '60'].includes(a)) { st.screen = st.from; return ok(); }
      if (v === 'indoor' || v === 'area') { st.screen = st.from; if (v === 'area') st.taps++; return ok(); }
      if (v === 'close') { st.screen = st.from; if (st.from === 'cards' && st.cards.length) { /* 기준이 바뀌면 카드도 다시 */ } return ok(); }
      return no();
    case 'saved': {
      const rows = savedRows(st);
      if (v === 'back') { st.screen = st.from; return ok(); }
      if (v === 'past_toggle' && st.saved.some((s) => s.day < st.day)) { st.pastOpen = !st.pastOpen; return ok(); }
      const row = rows[k - 1];
      if (!row) return no();
      if (v === 'go') { st.go = { id: row.id, from: 'saved' }; st.end = 'go'; return ok(); }
      if (v === 'unheart') { st.saved = st.saved.filter((s) => s.id !== row.id); st.unhearts++; return ok(); }
      if (v === 'move') { st.moving = row.id; st.screen = 'move'; return ok(); }
      if (v === 'up' || v === 'down') {
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
      if (v === 'day' && ['today', 'tomorrow', 'date'].includes(a)) { const m = st.saved.find((x) => x.id === st.moving); if (m) m.day = a === 'today' ? st.day : a === 'tomorrow' ? st.day + 1 : st.day + 2; if (a === 'date') st.taps++; st.screen = 'saved'; return ok(); }
      return no();
  }
  return no();
}

/** 사전등록 성공 규칙(10-stage0-prereg.md). */
export function judge(st) {
  const prior = new Set((st.savedAtStart ?? []).map((s) => s.id));
  switch (st.scenario) {
    case 'S1': return st.hearts.length > 0 || !!st.go;
    case 'S2': return !!st.go;
    case 'S5': return !!st.go && st.go.from === 'saved' && prior.has(st.go.id);
    default: return false;
  }
}
