// 0단계 호출 묶음 만들기 (10-stage0-prereg.md). 결과를 보기 전에 한 번 실행하고 출력(work/stage0/)을 커밋한다.
//   node build0.mjs            → work/stage0/calls/*.json, work/stage0/manifest.json, work/stage0/panel.jsonl
//   node build0.mjs --pilot    → work/pilot/ (도구 점검용 4명, 본 패널과 겹치지 않음, 결과 미사용)
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AREAS, SPOTS, carMin, rng, newSession } from './screen.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SIM1 = resolve(HERE, '../../p-persona-sim-01');
const PILOT = process.argv.includes('--pilot');
const OUT = resolve(HERE, PILOT ? '../work/pilot' : '../work/stage0');
const R = rng('stage0-2026-10-09');
const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

// ── 패널: 1차 인물 중 서사가 있는 900명에서 층화(P 156 · 보통 84) + 따로 파일럿 4명
const skel = readFileSync(resolve(SIM1, 'personas-skeleton.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const narr = new Map();
for (const f of readdirSync(resolve(SIM1, 'work')).filter((f) => /^narr-\d\.jsonl$/.test(f)))
  for (const l of readFileSync(resolve(SIM1, 'work', f), 'utf8').trim().split('\n')) { const x = JSON.parse(l); narr.set(x.id, x); }
const withNarr = skel.filter((p) => narr.has(p.id));
const byGroup = (g) => shuffle(withNarr.filter((p) => p.group === g));
const P = byGroup('P'), G = byGroup('보통');
const panel = [...P.slice(0, 156), ...G.slice(0, 84)];
const pilot = [...P.slice(156, 158), ...G.slice(84, 86)];

// 제약이 동행과 안 맞으면 고친다(1차 한계 수정)
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
  S1: (a) => `밤 10시쯤, ${a} 쪽 숙소에서 누워 있다. 내일 뭐 할지 정해 둔 건 없다. 자기 전에 이 앱을 열어 본다.`,
  S2: (a) => `오후 2시, ${a} 근처. 점심은 먹었고 다음에 뭐 할지 정한 게 없다. 이 앱을 연다.`,
  S5: (a) => `다음 날 아침 9시 반, ${a} 쪽 숙소. 어젯밤 이 앱에서 오늘 갈 만한 곳 몇 군데에 하트를 눌러 두었다(이름은 정확히 기억 안 난다). 오늘 그중 한 곳으로 가 볼까 하고 앱을 연다.`,
};
const DAY = { S1: 0, S2: 0, S5: 1 };
const DATE = ['10월 16일 (금)', '10월 17일 (토)'];

/** S5 시작 저장 목록: 어젯밤 「내일」로 담은 3곳(오늘 묶음에 보임) — 걷기 1, 먹거나 카페 1, 쉬기·새로운 거 1. */
function presetSaved(pid, area) {
  const r = rng(`saved-${pid}`);
  const from = AREAS[area];
  const pickOne = (f) => { const c = SPOTS.filter((s) => f(s) && carMin(from, s) <= 30); return c[Math.floor(r() * c.length)]; };
  return [pickOne((s) => s.mood === 'walk'), pickOne((s) => s.mood === 'food'), pickOne((s) => s.mood === 'rest' || s.mood === 'new')]
    .map((s) => ({ id: s.id, day: 1 }));
}

// 시뮬레이터가 파일을 열어 봐도 조건을 알 수 없게: 팔은 무작위 코드, 세션 id·씨앗은 해시(파일럿에서 하위 작업이 묶음 파일을 연 일이 있었다)
const ARM_CODE = {};
const KEY = {};
for (const a of ['base', 'dup', 'neg', 'L1', 'L2', 'L3']) { let c; do c = `k${Math.floor(R() * 900 + 100)}`; while (KEY[c]); ARM_CODE[a] = c; KEY[c] = a; }
const hash = (s) => { const r = rng(s); return Math.floor(r() * 2 ** 32).toString(36) + Math.floor(r() * 2 ** 32).toString(36); };
const sessionsMeta = [];

function session(per, arm, scenario, tag, seedTag = '') {
  const sid = hash(`${tag}-${arm}-${scenario}-${per.id}`);
  sessionsMeta.push({ sid, run: tag, arm, scenario, pid: per.id });
  const st = newSession({ sid, seed: hash(`${arm === 'dup' ? 'base' : arm}-${scenario}-${per.id}${seedTag}`), arm: ARM_CODE[arm], scenario, area: per.area, day: DAY[scenario], dateLabel: DATE[DAY[scenario]], where: 'gps', saved: scenario === 'S5' ? presetSaved(per.id, per.area) : [] });
  return { sid, pid: per.id, arm, scenario, situation: SIT[scenario](per.area), state: st };
}

// ── 실행 묶음
// 묶음(call) = 한 하위 작업. 한 묶음엔 한 팔·한 상황만, 서로 다른 사람만.
const calls = [];
function addCalls(run, people, arms, scenarios, perCall, opts = {}) {
  for (const arm of arms) for (const sc of scenarios) {
    const order = shuffle(people);
    for (let i = 0; i < order.length; i += perCall) {
      const id = `${run}-${arm}-${sc}-${String(i / perCall + 1).padStart(2, '0')}`;
      calls.push({ id, run, arm, scenario: sc, model: opts.model ?? 'opus', lang: opts.lang ?? 'ko', narrative: opts.narrative ?? true,
        sessions: order.slice(i, i + perCall).map((p) => session(p, arm, sc, run, opts.seedTag)) });
    }
  }
}

const people = (PILOT ? pilot : panel).map(person);
if (PILOT) {
  addCalls('pilot', people, ['base', 'L2'], ['S5', 'S1'], 4);
} else {
  const ARMS = ['base', 'dup', 'neg', 'L1', 'L2', 'L3'];
  addCalls('main', people, ARMS, ['S1', 'S2', 'S5'], 10);                       // 0-1~0-4
  addCalls('retest', people.slice(0, 120), ['base', 'L3'], ['S1', 'S2', 'S5'], 10); // 0-5 (같은 카드·같은 시작, 다른 호출)
  const sub = people.slice(120, 168);                                            // 0-6·0-7 소패널 48명
  addCalls('per1', sub, ['base', 'L3'], ['S5'], 1);
  addCalls('per50', sub, ['base', 'L3'], ['S5'], 48);
  addCalls('en', sub, ['base', 'L3'], ['S5', 'S1'], 10, { lang: 'en' });
  addCalls('nonarr', sub, ['base', 'L3'], ['S5', 'S1'], 10, { narrative: false });
  for (const model of ['sonnet', 'haiku', 'fable']) addCalls(`m-${model}`, sub, ['base', 'L3'], ['S5', 'S1'], 10, { model });
}

mkdirSync(resolve(OUT, 'calls'), { recursive: true });
const order = shuffle(calls.map((_, i) => i));
order.forEach((ci, k) => (calls[ci].file = `c${String(k + 1).padStart(4, '0')}.json`));
for (const c of calls) {
  const persons = Object.fromEntries(c.sessions.map((s) => [s.pid, people.find((p) => p.id === s.pid)]));
  // 묶음 파일엔 조건 이름을 남기지 않는다(lang·narrative는 step.mjs가 화면에 써야 해서 남김)
  const sessions = c.sessions.map(({ sid, pid, scenario, situation, state }) => ({ sid, pid, scenario, situation, state }));
  writeFileSync(resolve(OUT, 'calls', c.file), JSON.stringify({ lang: c.lang, narrative: c.narrative, sessions, persons }, null, 1));
}
writeFileSync(resolve(OUT, 'key.json'), JSON.stringify(KEY, null, 1));
writeFileSync(resolve(OUT, 'sessions.jsonl'), sessionsMeta.map((m) => JSON.stringify(m)).join('\n') + '\n');
writeFileSync(resolve(OUT, 'manifest.json'), JSON.stringify(calls.map((c) => ({ file: c.file, id: c.id, run: c.run, arm: c.arm, scenario: c.scenario, model: c.model, lang: c.lang, narrative: c.narrative, n: c.sessions.length })), null, 1));
writeFileSync(resolve(OUT, 'panel.jsonl'), people.map((p) => JSON.stringify(p)).join('\n') + '\n');
const by = {};
for (const c of calls) by[c.run] = [(by[c.run]?.[0] ?? 0) + 1, (by[c.run]?.[1] ?? 0) + c.sessions.length];
console.log(`people ${people.length} (P ${people.filter((p) => p.group === 'P').length}), calls ${calls.length}, sessions ${calls.reduce((s, c) => s + c.sessions.length, 0)}`);
console.log(Object.entries(by).map(([k, [a, b]]) => `${k}: ${a} calls / ${b} sessions`).join('\n'));
