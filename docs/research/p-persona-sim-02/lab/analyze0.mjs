// 0단계 판정(10-stage0-prereg.md의 G1~G8). 숫자는 엔진 상태에서 센다. 출력은 work/stage0/result.json + 표(stdout).
//   node analyze0.mjs [work/stage0 경로]
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { judge, rng } from './screen.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = resolve(process.argv[2] ?? resolve(HERE, '../work/stage0'));
// 0b단계(10b-stage0b-prereg.md): 「없는 차이」 비교의 기준을 base·dup 두 표본 평균으로, 1인 호출은 판정 밖, 교차 모델은 opus·haiku·fable
const S0B = /stage0b/.test(DIR);
const manifest = JSON.parse(readFileSync(resolve(DIR, 'manifest.json'), 'utf8'));
const meta = new Map(readFileSync(resolve(DIR, 'sessions.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)).map((m) => [m.sid, m]));
const panel = new Map(readFileSync(resolve(DIR, 'panel.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)).map((p) => [p.id, p]));

// ── 세션 행
const rows = [];
const missing = [];
for (const c of manifest) {
  const f = resolve(DIR, 'calls', c.file);
  const call = JSON.parse(readFileSync(f, 'utf8'));
  const nf = f.replace(/\.json$/, '.notes.jsonl');
  const notes = existsSync(nf) ? readFileSync(nf, 'utf8').trim().split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }) : [];
  call.sessions.forEach((s, i) => {
    const m = meta.get(s.sid);
    const st = s.state;
    if (!st.end) missing.push(`${c.file}:s${i + 1}`);
    const note = notes.find((n) => n && n.s === `s${i + 1}`);
    rows.push({ run: m.run, arm: m.arm, scenario: m.scenario, pid: m.pid, group: panel.get(m.pid)?.group, call: c.file, model: c.model,
      ended: !!st.end, end: st.end, done: st.end ? judge(st) : null, taps: st.taps, bad: st.bad, again: note?.again ?? null, burden: note?.burden ?? null });
  });
}
const valid = rows.filter((r) => r.ended);

// ── 통계 도구
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const pct = (x) => (x == null || Number.isNaN(x) ? '—' : `${(100 * x).toFixed(1)}`);
const sel = (f) => valid.filter(f);
const rate = (rs) => (rs.length ? mean(rs.map((r) => (r.done ? 1 : 0))) : NaN);

/** 짝 차이(뒤 − 앞): 같은 사람·같은 상황끼리. 사람 단위 부트스트랩 구간. */
function paired(fa, fb, label, B = 4000) {
  // 앞쪽이 한 열쇠에 여러 행이면(0b의 base·dup 기준) 그 평균
  const A = new Map();
  for (const r of sel(fa)) { const k = `${r.pid}|${r.scenario}`; if (!A.has(k)) A.set(k, []); A.get(k).push(r.done ? 1 : 0); }
  const pairs = sel(fb).filter((r) => A.has(`${r.pid}|${r.scenario}`)).map((r) => ({ pid: r.pid, a: mean(A.get(`${r.pid}|${r.scenario}`)), b: r.done ? 1 : 0 }));
  const byP = new Map();
  for (const p of pairs) { if (!byP.has(p.pid)) byP.set(p.pid, []); byP.get(p.pid).push(p.b - p.a); }
  const people = [...byP.values()];
  const diff = pairs.length ? mean(pairs.map((p) => p.b - p.a)) : NaN;
  const r = rng(`boot-${label}`);
  const boots = [];
  for (let k = 0; k < B && people.length; k++) {
    let s = 0, n = 0;
    for (let i = 0; i < people.length; i++) { const d = people[Math.floor(r() * people.length)]; for (const x of d) { s += x; n++; } }
    boots.push(s / n);
  }
  boots.sort((x, y) => x - y);
  const q = (p) => boots[Math.min(boots.length - 1, Math.floor(p * boots.length))];
  const disc = pairs.filter((p) => p.a !== p.b).length;
  return { label, n: pairs.length, a: mean(pairs.map((p) => p.a)), b: mean(pairs.map((p) => p.b)), diff, ci95: [q(0.025), q(0.975)], ci90: [q(0.05), q(0.95)], agree: pairs.length ? 1 - disc / pairs.length : NaN };
}
const fmt = (p) => `${p.label}: n=${p.n} ${pct(p.a)}→${pct(p.b)} 차이 ${pct(p.diff)}%p [95% ${pct(p.ci95[0])}, ${pct(p.ci95[1])}] [90% ${pct(p.ci90[0])}, ${pct(p.ci90[1])}] 일치 ${pct(p.agree)}%`;
const is = (run, arm, sc) => (r) => r.run === run && r.arm === arm && (!sc || (Array.isArray(sc) ? sc.includes(r.scenario) : r.scenario === sc));

// 기준값: 가짜 무작위 정책 30회(조건과 무관하게 누름)로 우연 실패율을 재서 정했다(10-stage0-prereg.md 「기준 보정」)
const MARGIN = 0.06, RETEST = 0.045;
const out = { generated: new Date().toISOString(), sessions: rows.length, ended: valid.length, missing, gates: {}, tables: {} };
const G = out.gates;
const line = [];

// 표 1: 팔 × 상황 성공률(main)
const T1 = {};
for (const arm of ['base', 'dup', 'neg', 'L1', 'L2', 'L3']) T1[arm] = Object.fromEntries(['S1', 'S2', 'S5'].map((sc) => { const rs = sel(is('main', arm, sc)); return [sc, { n: rs.length, done: rate(rs), taps: rs.length ? mean(rs.map((r) => r.taps)) : NaN, quit: rs.length ? mean(rs.map((r) => (r.end === 'quit' ? 1 : 0))) : NaN }]; }));
out.tables.main = T1;
line.push('## 팔 × 상황 성공률 (main, %)', '| 팔 | S1 | S2 | S5 | S5 평균 탭 |', '|---|---|---|---|---|');
for (const [arm, v] of Object.entries(T1)) line.push(`| ${arm} | ${pct(v.S1.done)} (${v.S1.n}) | ${pct(v.S2.done)} (${v.S2.n}) | ${pct(v.S5.done)} (${v.S5.n}) | ${v.S5.taps.toFixed(2)} |`);

// G1 A/A
const g1 = paired(is('main', 'base'), is('main', 'dup'), 'G1 A/A dup−base 전체');
G.G1 = { ...g1, pass: g1.ci95[0] <= 0 && g1.ci95[1] >= 0 };
// G2 음성 대조(TOST ±5%p: 90% 구간이 ±5 안)
const REF = (sc) => (S0B ? (r) => r.run === 'main' && (r.arm === 'base' || r.arm === 'dup') && (!sc || sc.includes(r.scenario)) : is('main', 'base', sc));
const g2 = paired(REF(), is('main', 'neg'), S0B ? 'G2 neg−(base·dup 평균) 전체' : 'G2 neg−base 전체');
G.G2 = { ...g2, pass: g2.ci90[0] > -MARGIN && g2.ci90[1] < MARGIN };
// G3 양성 대조
const g3 = paired(is('main', 'base', 'S5'), is('main', 'L3', 'S5'), 'G3 L3−base S5');
G.G3 = { ...g3, pass: g3.diff <= -0.15 && g3.ci95[1] < 0 };
// G4 용량-반응(S5): base ≥ L1 ≥ L2 ≥ L3, 이웃끼리 뒤집힘 2%p까지 허용
const s5 = ['base', 'L1', 'L2', 'L3'].map((a) => T1[a].S5.done);
const inversions = s5.slice(1).map((x, i) => x - s5[i]).filter((d) => d > 0.02).length;
G.G4 = { s5, pass: inversions === 0 && s5[3] < s5[0], dose: ['L1', 'L2', 'L3'].map((a) => paired(is('main', 'base', 'S5'), is('main', a, 'S5'), `G4 ${a}−base S5`)) };
// G5 특이성: L1~L3가 S1·S2에서 base와 같다(TOST ±5%p)
// 판정은 L1~L3를 합친 하나(사전등록 보정 — 셋을 따로 보면 우연 실패가 커진다). 팔별은 참고로.
const g5 = paired(REF(['S1', 'S2']), (r) => r.run === 'main' && ['L1', 'L2', 'L3'].includes(r.arm) && ['S1', 'S2'].includes(r.scenario), 'G5 L1~L3−base S1·S2 합침');
G.G5 = { ...g5, pass: g5.ci90[0] > -MARGIN && g5.ci90[1] < MARGIN, checks: ['L1', 'L2', 'L3'].map((a) => paired(is('main', 'base', ['S1', 'S2']), is('main', a, ['S1', 'S2']), `G5 참고 ${a}−base S1·S2`)) };
// G6 재검사: retest vs main(같은 120명·같은 팔·같은 상황, 다른 호출)
// 팔별로 따로 짝지은 결과를 합친다
const g6a = ['base', 'L3'].map((a) => paired(is('main', a), is('retest', a), `G6 재검사 ${a}`));
const n6 = g6a[0].n + g6a[1].n;
const d6 = (g6a[0].diff * g6a[0].n + g6a[1].diff * g6a[1].n) / n6;
G.G6 = { diff: d6, n: n6, checks: g6a, pass: Math.abs(d6) <= RETEST };
// G7·G8 교란·모델: S5 base−L3 차이의 방향과 크기(같은 48명의 main 차이 대비 절반 이상)
const sub = new Set(rows.filter((r) => r.run === 'per1').map((r) => r.pid));
const effect = (run) => { const b = rate(sel((r) => is(run, 'base', 'S5')(r) && sub.has(r.pid))); const l = rate(sel((r) => is(run, 'L3', 'S5')(r) && sub.has(r.pid))); return { base: b, L3: l, diff: l - b }; };
const ref = effect('main');
const axis = (run) => { const e = effect(run); return { run, ...e, pass: e.diff < 0 && e.diff <= ref.diff / 2 }; };
G.G7 = { ref, axes: (S0B ? ['per50', 'en', 'nonarr'] : ['per1', 'per50', 'en', 'nonarr']).map(axis), upper: S0B ? axis('per1') : null };
G.G7.pass = G.G7.axes.every((a) => a.pass);
G.G7.perCall = ['per1', 'main', 'per50'].map((run) => ({ run, baseS5: rate(sel((r) => is(run, 'base', 'S5')(r) && sub.has(r.pid))) }));
G.G8 = { ref, axes: (S0B ? ['m-opus', 'm-haiku', 'm-fable'] : ['m-sonnet', 'm-haiku', 'm-fable']).map(axis) };
G.G8.pass = G.G8.axes.every((a) => a.pass);
G.G8.s1 = ['main', ...G.G8.axes.map((a) => a.run)].map((run) => ({ run, baseS1: rate(sel((r) => is(run, 'base', 'S1')(r) && sub.has(r.pid))) }));

// 묶음(호출) 간 흩어짐: 같은 팔·상황 안에서 호출별 성공률 분산 ÷ 이항 기대 분산
const disp = [];
for (const arm of Object.keys(T1)) for (const sc of ['S1', 'S2', 'S5']) {
  const byCall = new Map();
  for (const r of sel(is('main', arm, sc))) { if (!byCall.has(r.call)) byCall.set(r.call, []); byCall.get(r.call).push(r.done ? 1 : 0); }
  const rates = [...byCall.values()].filter((v) => v.length >= 5).map(mean);
  const p = rate(sel(is('main', arm, sc)));
  const nAvg = mean([...byCall.values()].map((v) => v.length));
  const obs = mean(rates.map((x) => (x - mean(rates)) ** 2)) * rates.length / (rates.length - 1);
  disp.push({ arm, sc, ratio: obs / (p * (1 - p) / nAvg) });
}
out.tables.dispersion = disp;

// 판정
const core = ['G1', 'G2', 'G3', 'G5', 'G6'].every((k) => G[k].pass);
out.verdict = !core ? '실패' : G.G4.pass && G.G7.pass && G.G8.pass ? '통과' : '조건부 통과';

line.push('', '## 판정', fmt(G.G1) + ` → ${G.G1.pass ? '통과' : '실패'}`, fmt(G.G2) + ` → ${G.G2.pass ? '통과' : '실패'}`, fmt(G.G3) + ` → ${G.G3.pass ? '통과' : '실패'}`);
line.push(`G4 S5 base/L1/L2/L3 = ${s5.map(pct).join(' / ')} → ${G.G4.pass ? '통과' : '실패'}`, ...G.G4.dose.map(fmt));
line.push(fmt(G.G5) + ` → ${G.G5.pass ? '통과' : '실패'}`, ...G.G5.checks.map(fmt));
line.push(`G6 재검사 합친 차이 ${pct(G.G6.diff)}%p (n=${G.G6.n}) → ${G.G6.pass ? '통과' : '실패'}`, ...G.G6.checks.map(fmt));
line.push(`G7 기준(main 48명) base ${pct(ref.base)} L3 ${pct(ref.L3)} 차이 ${pct(ref.diff)}`, ...G.G7.axes.map((a) => `  ${a.run}: base ${pct(a.base)} L3 ${pct(a.L3)} 차이 ${pct(a.diff)} → ${a.pass ? '유지' : '깨짐'}`));
if (G.G7.upper) line.push(`  (판정 밖) 1인 호출 상한: base ${pct(G.G7.upper.base)} L3 ${pct(G.G7.upper.L3)} 차이 ${pct(G.G7.upper.diff)}`);
line.push(`  한 호출당 인원 S5 base: ${G.G7.perCall.map((x) => `${x.run} ${pct(x.baseS5)}`).join(' · ')}`);
line.push(...G.G8.axes.map((a) => `G8 ${a.run}: base ${pct(a.base)} L3 ${pct(a.L3)} 차이 ${pct(a.diff)} → ${a.pass ? '유지' : '깨짐'}`), `  S1 base: ${G.G8.s1.map((x) => `${x.run} ${pct(x.baseS1)}`).join(' · ')}`);
line.push(`호출 간 흩어짐(관측/이항 분산): ${disp.map((d) => `${d.arm}-${d.sc} ${d.ratio.toFixed(2)}`).join(' · ')}`);
line.push('', `세션 ${rows.length}, 끝난 것 ${valid.length}, 안 끝난 것 ${missing.length}`, `**0단계 판정: ${out.verdict}**`);
writeFileSync(resolve(DIR, 'result.json'), JSON.stringify(out, null, 1));
writeFileSync(resolve(DIR, 'result.md'), line.join('\n') + '\n');
console.log(line.join('\n'));
