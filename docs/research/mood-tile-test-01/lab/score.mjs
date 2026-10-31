// 채점 (00-prereg.md 6·7절). 실행 1회. 결과 → work/result.json, 표준 출력에 요약.
//   node docs/research/mood-tile-test-01/lab/score.mjs
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CARDS, PLAY_CARDS, SANITY_CARDS } from './cards.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORK = resolve(HERE, '../work');
const ARMS = ['cur', 'A', 'C'];
const card = (n) => CARDS.find((c) => c.n === n);

function load(run) {
  const dir = resolve(WORK, run);
  const key = JSON.parse(readFileSync(resolve(dir, 'key.json'), 'utf8'));
  const out = [];
  for (const m of JSON.parse(readFileSync(resolve(dir, 'manifest.json'), 'utf8'))) {
    const call = JSON.parse(readFileSync(resolve(dir, 'calls', m.file), 'utf8'));
    const nf = resolve(dir, 'calls', m.file.replace(/\.json$/, '.notes.jsonl'));
    const notes = existsSync(nf) ? readFileSync(nf, 'utf8').trim().split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }) : [];
    call.sessions.forEach((s, i) => {
      const st = s.state, arm = key[st.arm];
      if (arm !== m.arm) throw new Error(`판 어긋남 ${m.file}`);
      out.push({ run, file: m.file, s: `s${i + 1}`, arm, pid: s.pid, card: s.card, end: st.end, first: st.first, final: st.final, tab: st.tab, backs: st.backs, taps: st.taps,
        fit: !!st.first && card(s.card).key[arm].includes(st.first), none: st.end !== 'pick', why: notes.find((n) => n?.s === `s${i + 1}`)?.why ?? null });
    });
  }
  return out;
}

const pct = (a, f) => (a.length ? (100 * a.filter(f).length) / a.length : NaN);
const r1 = (x) => Math.round(x * 10) / 10;
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
/** 짝지은 차이(사람·카드가 같은 세션끼리) b − a, 퍼센트포인트, 부트스트랩 2,000회 95% 구간 */
function paired(S, a, b, f = (x) => x.fit) {
  const by = (arm) => new Map(S.filter((x) => x.arm === arm && x.end).map((x) => [`${x.pid}|${x.card}`, x]));
  const A = by(a), B = by(b);
  const pairs = [...A.keys()].filter((k) => B.has(k)).map((k) => (f(B.get(k)) ? 1 : 0) - (f(A.get(k)) ? 1 : 0));
  const mean = (xs) => (100 * xs.reduce((s, x) => s + x, 0)) / xs.length;
  const R = rng(20261031), boots = [];
  for (let i = 0; i < 2000; i++) boots.push(mean(pairs.map(() => pairs[Math.floor(R() * pairs.length)])));
  boots.sort((x, y) => x - y);
  return { n: pairs.length, diff: r1(mean(pairs)), lo: r1(boots[49]), hi: r1(boots[1949]) };
}

const main = load('main');
const unfinished = main.filter((x) => !x.end).length;
const done = main.filter((x) => x.end);
const arm = Object.fromEntries(ARMS.map((a) => {
  const S = done.filter((x) => x.arm === a);
  return [a, { n: S.length, fit: r1(pct(S, (x) => x.fit)), none: r1(pct(S, (x) => x.none)), back: r1(pct(S, (x) => x.backs > 0)), finalFit: r1(pct(S, (x) => x.final && card(x.card).key[a].includes(x.final))),
    play: r1(pct(S.filter((x) => PLAY_CARDS.includes(x.card)), (x) => x.fit)) }];
}));
const byCard = CARDS.map((c) => ({ n: c.n, type: c.type, ...Object.fromEntries(ARMS.map((a) => {
  const S = done.filter((x) => x.arm === a && x.card === c.n);
  const taps = {};
  for (const x of S) taps[x.first ?? '(없음)'] = (taps[x.first ?? '(없음)'] ?? 0) + 1;
  return [a, { n: S.length, fit: r1(pct(S, (x) => x.fit)), taps }];
})) }));
const tabs = Object.fromEntries(ARMS.map((a) => [a, Object.fromEntries(CARDS.map((c) => {
  const t = {};
  for (const x of done.filter((y) => y.arm === a && y.card === c.n && y.tab)) t[`${x.final}:${x.tab}`] = (t[`${x.final}:${x.tab}`] ?? 0) + 1;
  return [c.n, t];
}))]));
const CA = paired(done, 'A', 'C'), Acur = paired(done, 'cur', 'A'), Ccur = paired(done, 'cur', 'C');
const noneCA = paired(done, 'A', 'C', (x) => x.none);

// 재검사
let retest = null;
if (existsSync(resolve(WORK, 'retest', 'manifest.json'))) {
  const re = load('retest').filter((x) => x.end);
  const mm = new Map(done.map((x) => [`${x.arm}|${x.pid}|${x.card}`, x]));
  const pairs = re.map((x) => [mm.get(`${x.arm}|${x.pid}|${x.card}`), x]).filter(([m]) => m);
  const per = Object.fromEntries(ARMS.map((a) => {
    const P = pairs.filter(([m]) => m.arm === a);
    return [a, { n: P.length, mainFit: r1(pct(P, ([m]) => m.fit)), retestFit: r1(pct(P, ([, r]) => r.fit)), agree: r1(pct(P, ([m, r]) => m.first === r.first)) }];
  }));
  retest = { n: pairs.length, unfinished: load('retest').filter((x) => !x.end).length, agree: r1(pct(pairs, ([m, r]) => m.first === r.first)), per };
}

// 판정 (00-prereg.md 7절)
const sanity = SANITY_CARDS.every((n) => ARMS.every((a) => byCard.find((c) => c.n === n)[a].fit >= 80));
const reliable = !!retest && retest.agree >= 70 && ARMS.every((a) => Math.abs(retest.per[a].mainFit - retest.per[a].retestFit) <= 7);
const noneC_le = arm.C.none <= arm.A.none + 2;
const cWins = CA.diff >= 10 && CA.lo > 0 && noneC_le;
const aOk = arm.A.fit >= arm.cur.fit - 5 && arm.A.play >= 80;
const decision = !sanity ? '판단 못 함(도구 점검 실패)' : cWins ? 'C' : aOk ? 'A' : 'A 보류(이름 다시 보기)';
const result = { unfinished, arm, CA, Acur, Ccur, noneCA, byCard, tabs, retest, gates: { sanity, reliable, cWins, aOk, noneC_le }, decision, label: reliable ? '확정' : '참고만(재검사 기준 못 넘음)', sessions: done };
writeFileSync(resolve(WORK, 'result.json'), JSON.stringify(result, null, 1));
console.log(JSON.stringify({ ...result, sessions: undefined, byCard: undefined, tabs: undefined }, null, 1));
console.log('\n카드별 첫 탭(판: 맞음% {타일:수})');
for (const c of byCard) console.log(`${c.n} ${c.type} | ${ARMS.map((a) => `${a} ${c[a].fit}% ${JSON.stringify(c[a].taps)}`).join(' | ')}`);
console.log('\n탭', JSON.stringify(tabs));
