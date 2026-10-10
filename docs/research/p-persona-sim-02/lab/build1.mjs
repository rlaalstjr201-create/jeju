// 흐름 비교 단계 호출 묶음 만들기 (05-goal.md, 각 단계 사전등록). 결과를 보기 전에 한 번 실행하고 출력을 커밋한다.
//   node build1.mjs 1            → work/stage1/   (1단계 안전성)
//   node build1.mjs 2 [팔,...]   → work/stage2/   (2단계 탐색, 사전등록에서 팔 확정)
//   node build1.mjs 3 팔,...     → work/stage3/   (3단계 확증)
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AREAS, DATES, SPOTS, carMin, rng, newSession } from './flow.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SIM1 = resolve(HERE, '../../p-persona-sim-01');
const STAGE = process.argv[2];
const ARMS_ARG = process.argv[3]?.split(',');
if (!['1', '1b', '2', '3'].includes(STAGE)) { console.error('사용법: node build1.mjs 1|1b|2|3 [팔,...]'); process.exit(2); }
const OUT = resolve(HERE, `../work/stage${STAGE}`);

// ── 패널: build0.mjs와 같은 섞기(같은 씨앗·같은 호출 순서) → 05-goal.md 「사람 배정」 칸
let R = rng('stage0-2026-10-09');
const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const skel = readFileSync(resolve(SIM1, 'personas-skeleton.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const narr = new Map();
for (const f of readdirSync(resolve(SIM1, 'work')).filter((f) => /^narr-\d\.jsonl$/.test(f)))
  for (const l of readFileSync(resolve(SIM1, 'work', f), 'utf8').trim().split('\n')) { const x = JSON.parse(l); narr.set(x.id, x); }
const withNarr = skel.filter((p) => narr.has(p.id));
const P = shuffle(withNarr.filter((p) => p.group === 'P')), G = shuffle(withNarr.filter((p) => p.group === '보통'));
const SLICE = {
  1: [...P.slice(158, 223), ...G.slice(86, 121)],   // 0c 사람 중 100명(P 65 · 보통 35)
  2: [...P.slice(314, 444), ...G.slice(170, 240)],  // 새 200명
  3: [...P.slice(444, 590), ...G.slice(240, 310)],  // 새 216명
};
SLICE['1b'] = SLICE[1];
R = rng(`flow-stage${STAGE}-2026-10-10`);

const ALONE_BAD = ['동행이 옆에서 말을 건다', '아이를 챙기느라 자주 끊긴다'];
function person(p) {
  let constraint = p.constraint;
  if (p.companion === '혼자' && ALONE_BAD.includes(constraint)) constraint = '특별한 제약 없음';
  if (p.companion !== '가족' && constraint === '아이를 챙기느라 자주 끊긴다') constraint = '동행이 옆에서 말을 건다';
  const n = narr.get(p.id);
  const areaKeys = Object.keys(AREAS);
  const area = areaKeys[Math.floor(rng(`area-${p.id}`)() * areaKeys.length)];
  return {
    id: p.id, group: p.group, type: p.type, name: n.name, narrative: n.narrative,
    attrs: { 나이: p.age, 성별: p.sex, 사는곳: p.home, 직업: p.job, 동행: p.companion === '혼자' ? '혼자' : `${p.companion} ${p.party}명`, 정하는사람: p.decider, 체류: `${p.days}일`, 방문: p.visits, 숙소: p.lodge, 이동: p.move, 저장습관: p.save, 폰쓰는때: p.phone, 폰솜씨: `${p.fluency}/5`, 제약: constraint },
    area,
  };
}

// ── 상황
const SIT = {
  N: (a) => `밤 10시쯤, ${a} 쪽 숙소에서 누워 있다. 내일 뭐 할지 정해 둔 건 없다. 자기 전에 이 앱을 열어 훑어본다.`,
  NI: (a) => `밤 10시쯤, ${a} 쪽 숙소에서 누워 있다. 내일 뭐 할지 정해 둔 건 없다. 자기 전에 내일 갈 만한 데를 훑어보고, 끌리는 데가 있으면 표시해 두고 싶다.`,
  N2: '다음 날 아침 9시 반, 같은 숙소. 어젯밤 이 앱에서 본 곳 중에 끌리는 데가 있었던 것 같다(이름은 정확히 기억 안 난다). 오늘 갈 곳을 정하려고 앱을 다시 연다.',
  P: (a) => `저녁 8시, ${a} 쪽 숙소. 남은 일정(내일·모레)은 사실상 내가 챙긴다. 오늘 낮에 이 앱에서 끌리는 곳 4곳에 하트를 눌러 두었다. 자기 전에 그 4곳을 내일 갈 곳과 모레 갈 곳으로 나눠 두고 싶다.`,
  S2: (a) => `오후 2시, ${a} 근처. 점심은 먹었고 다음에 뭐 할지 정한 게 없다. 이 앱을 연다.`,
};

/** P 시작 저장 목록: 오늘 낮에 담은 4곳(걷기·먹기·쉬기·새로운 것 하나씩). A·A2는 「오늘」 묶음, B·C는 날짜 없음. */
function presetP(pid, area, arm) {
  const r = rng(`savedP-${pid}`);
  const from = AREAS[area];
  const pickOne = (f) => { const c = SPOTS.filter((s) => f(s) && carMin(from, s) <= 30); return c[Math.floor(r() * c.length)]; };
  return ['walk', 'food', 'rest', 'new'].map((m) => pickOne((s) => s.mood === m)).map((s) => ({ id: s.id, day: arm === 'A' || arm === 'A2' ? 0 : null }));
}

const ALL = ['A', 'A2', 'B', 'C'];
const ARM_CODE = {}, KEY = {};
for (const a of ALL) { let c; do c = `f${Math.floor(R() * 900 + 100)}`; while (KEY[c]); ARM_CODE[a] = c; KEY[c] = a; }
const hash = (s) => { const r = rng(s); return Math.floor(r() * 2 ** 32).toString(36) + Math.floor(r() * 2 ** 32).toString(36); };
const sessionsMeta = [];

function session(per, arm, scenario, run, rep) {
  const sid = hash(`${STAGE}-${run}-${arm}-${scenario}-${per.id}-${rep}`);
  sessionsMeta.push({ sid, run, arm, scenario, pid: per.id, group: per.group, rep });
  // 카드 씨앗은 팔과 무관(같은 사람·같은 상황·같은 반복이면 팔이 달라도 같은 카드 순서)
  const seed = hash(`card-${STAGE}-${scenario}-${per.id}-${rep}`);
  const spec = { sid, seed, arm: ARM_CODE[arm], scenario, area: per.area, where: 'gps', day: 0, dateLabel: DATES[0], saved: [] };
  if (scenario === 'N' || scenario === 'NI') Object.assign(spec, { hour: 22, next: { day: 1, hour: 9, dateLabel: DATES[1], situation: `다음 장면 — ${SIT.N2}` } });
  if (scenario === 'P') Object.assign(spec, { hour: 20, saved: presetP(per.id, per.area, arm) });
  if (scenario === 'S2') Object.assign(spec, { hour: 14 });
  return { sid, pid: per.id, scenario, situation: SIT[scenario](per.area), state: newSession(spec) };
}

const calls = [];
function addCalls(run, people, arms, scenarios, perCall, rep = 1) {
  for (const arm of arms) for (const sc of scenarios) {
    const order = shuffle(people);
    for (let i = 0; i < order.length; i += perCall)
      calls.push({ id: `${run}-${arm}-${sc}-r${rep}-${String(i / perCall + 1).padStart(2, '0')}`, run, arm, scenario: sc, rep, model: 'sonnet',
        sessions: order.slice(i, i + perCall).map((p) => session(p, arm, sc, run, rep)) });
  }
}

const people = SLICE[STAGE].map(person);
const arms = ARMS_ARG ?? ALL;
if (STAGE === '1' || STAGE === '1b') addCalls('main', people, arms, ['N', 'P', 'S2'], 10);
if (STAGE === '2') { addCalls('w1', people.slice(0, 100), arms, ['NI', 'P'], 10); addCalls('w2', people.slice(100), arms, ['NI', 'P'], 10); }
if (STAGE === '3') for (const rep of [1]) addCalls('main', people, arms, ['NI', 'P', 'S2'], 10, rep);

mkdirSync(resolve(OUT, 'calls'), { recursive: true });
const order = shuffle(calls.map((_, i) => i));
order.forEach((ci, k) => (calls[ci].file = `c${String(k + 1).padStart(4, '0')}.json`));
for (const c of calls) {
  const persons = Object.fromEntries(c.sessions.map((s) => [s.pid, people.find((p) => p.id === s.pid)]));
  writeFileSync(resolve(OUT, 'calls', c.file), JSON.stringify({ engine: 'flow', lang: 'ko', narrative: true, sessions: c.sessions, persons }, null, 1));
}
writeFileSync(resolve(OUT, 'key.json'), JSON.stringify(KEY, null, 1));
writeFileSync(resolve(OUT, 'sessions.jsonl'), sessionsMeta.map((m) => JSON.stringify(m)).join('\n') + '\n');
writeFileSync(resolve(OUT, 'manifest.json'), JSON.stringify(calls.map((c) => ({ file: c.file, id: c.id, run: c.run, arm: c.arm, scenario: c.scenario, rep: c.rep, model: c.model, n: c.sessions.length })), null, 1));
writeFileSync(resolve(OUT, 'panel.jsonl'), people.map((p) => JSON.stringify(p)).join('\n') + '\n');
console.log(`stage ${STAGE}: people ${people.length} (P ${people.filter((p) => p.group === 'P').length}), arms ${arms.join(',')}, calls ${calls.length}, sessions ${calls.reduce((s, c) => s + c.sessions.length, 0)}`);
