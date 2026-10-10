// 흐름 비교 단계 판정(10-stage1-prereg.md 이후). 숫자는 엔진 상태에서 센다. 출력은 <dir>/result.json + 표(stdout).
//   node analyze1.mjs <work/stageN 경로> [--wave w1] [--ref A]
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { judge, rng } from './flow.mjs';

const DIR = resolve(process.argv[2]);
const WAVE = process.argv.includes('--wave') ? process.argv[process.argv.indexOf('--wave') + 1] : null;
const QX = process.argv.includes('--q') ? Number(process.argv[process.argv.indexOf('--q') + 1]) : null;
const REF = process.argv.includes('--ref') ? process.argv[process.argv.indexOf('--ref') + 1] : 'A';
const manifest = JSON.parse(readFileSync(resolve(DIR, 'manifest.json'), 'utf8')).filter((c) => !WAVE || c.run === WAVE);
const meta = new Map(readFileSync(resolve(DIR, 'sessions.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)).map((m) => [m.sid, m]));

const none = (x) => x == null || /^\s*(없음|없다|none)\.?\s*$/i.test(String(x));
const rows = [], missing = [];
for (const c of manifest) {
  const f = resolve(DIR, 'calls', c.file);
  const call = JSON.parse(readFileSync(f, 'utf8'));
  const nf = f.replace(/\.json$/, '.notes.jsonl');
  const notes = existsSync(nf) ? readFileSync(nf, 'utf8').trim().split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }) : [];
  call.sessions.forEach((s, i) => {
    const m = meta.get(s.sid), st = s.state;
    const note = notes.find((n) => n && n.s === `s${i + 1}`);
    if (!st.end || !note) missing.push(`${c.file}:s${i + 1}`);
    const p1 = st.parts?.[0];
    rows.push({ arm: m.arm, scenario: m.scenario, pid: m.pid, rep: m.rep ?? 1, group: m.group, call: c.file, ended: !!st.end, end: st.end,
      done: st.end ? judge(st) : null, taps: st.taps, bad: st.bad + (p1?.bad ?? 0), p1end: p1?.end ?? null,
      nightHeart: p1 ? (p1.hearts.length ?? 0) > 0 : null, live0: p1?.hearts.length ? st.part2Start?.live === 0 : null,
      stuck: st.end === 'stuck' || p1?.end === 'stuck', burden: note ? !none(note.burden) : null, stuckNote: note ? !none(note.stuck) : null, again: note?.again ?? null });
  });
}
const valid = rows.filter((r) => r.ended);
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
const pct = (x) => (x == null || Number.isNaN(x) ? '—' : (100 * x).toFixed(1));
const arms = [...new Set(rows.map((r) => r.arm))].sort();
const scen = ['N', 'NI', 'P', 'S2'].filter((s) => rows.some((r) => r.scenario === s));
const cell = (a, s) => valid.filter((r) => r.arm === a && r.scenario === s);
const rateOf = (rs, k) => mean(rs.filter((r) => r[k] != null).map((r) => (r[k] ? 1 : 0)));

/** 짝 차이(arm − ref): 같은 사람·상황·반복끼리, 사람 단위 부트스트랩. */
function paired(arm, sc, key = 'done', B = 4000) {
  const ref = new Map(valid.filter((r) => r.arm === REF && r.scenario === sc && r[key] != null).map((r) => [`${r.pid}|${r.rep}`, r[key] ? 1 : 0]));
  const pairs = valid.filter((r) => r.arm === arm && r.scenario === sc && r[key] != null && ref.has(`${r.pid}|${r.rep}`)).map((r) => ({ pid: r.pid, d: (r[key] ? 1 : 0) - ref.get(`${r.pid}|${r.rep}`) }));
  const byP = new Map();
  for (const p of pairs) { if (!byP.has(p.pid)) byP.set(p.pid, []); byP.get(p.pid).push(p.d); }
  const people = [...byP.values()];
  const r = rng(`boot1-${arm}-${sc}-${key}`);
  const boots = [];
  for (let k = 0; k < B && people.length; k++) { let s = 0, n = 0; for (let i = 0; i < people.length; i++) { for (const x of people[Math.floor(r() * people.length)]) { s += x; n++; } } boots.push(s / n); }
  boots.sort((x, y) => x - y);
  const q = (p) => boots[Math.min(boots.length - 1, Math.floor(p * boots.length))];
  return { n: pairs.length, diff: mean(pairs.map((p) => p.d)), lo95: q(0.025), hi95: q(0.975), lo90: q(0.05), hi90: q(0.95), ...(QX ? { loQ: q(QX), hiQ: q(1 - QX) } : {}), disc: mean(pairs.map((p) => (p.d !== 0 ? 1 : 0))) };
}
const fmtP = (x) => `${(100 * x.diff).toFixed(1)}%p [95% ${(100 * x.lo95).toFixed(1)}, ${(100 * x.hi95).toFixed(1)}] [90% ${(100 * x.lo90).toFixed(1)}, ${(100 * x.hi90).toFixed(1)}] n=${x.n} 엇갈림 ${pct(x.disc)}%${x.loQ != null ? ` [${(100 * (1 - 2 * QX)).toFixed(1)}% ${(100 * x.loQ).toFixed(1)}, ${(100 * x.hiQ).toFixed(1)}]` : ''}`;

const out = { dir: DIR, wave: WAVE, ref: REF, sessions: rows.length, ended: valid.length, missing: missing.length, cells: {}, paired: {} };
console.log(`## 팔 × 상황 (%, ${WAVE ?? '전체'})`);
console.log('| 팔 | 상황 | n | 성공 | 막힘 | 15번 | 없는 버튼/세션 | 탭(마지막 장면) | 부담 답 | 멈칫 답 | 다시 열기 | 밤 하트 | ♥0 시작(하트 낸 사람) |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const s of scen) for (const a of arms) {
  const rs = cell(a, s);
  const c = { n: rs.length, done: rateOf(rs, 'done'), stuck: rateOf(rs, 'stuck'), cap: mean(rs.map((r) => (r.end === 'cap' || r.p1end === 'cap' ? 1 : 0))), bad: mean(rs.map((r) => r.bad)), taps: mean(rs.map((r) => r.taps)),
    burden: rateOf(rs, 'burden'), stuckNote: rateOf(rs, 'stuckNote'), again: mean(rs.filter((r) => r.again != null).map((r) => r.again)), nightHeart: rateOf(rs, 'nightHeart'), live0: rateOf(rs, 'live0') };
  out.cells[`${a}|${s}`] = c;
  console.log(`| ${a} | ${s} | ${c.n} | ${pct(c.done)} | ${pct(c.stuck)} | ${pct(c.cap)} | ${c.bad.toFixed(2)} | ${c.taps.toFixed(1)} | ${pct(c.burden)} | ${pct(c.stuckNote)} | ${c.again.toFixed(2)} | ${pct(c.nightHeart)} | ${pct(c.live0)} |`);
}
console.log(`\n## 짝 차이 (팔 − ${REF})`);
for (const s of scen) for (const a of arms.filter((x) => x !== REF)) {
  const p = paired(a, s);
  out.paired[`${a}|${s}`] = p;
  console.log(`${a} ${s} 성공: ${fmtP(p)}`);
}
// 하트 낸 사람 중 다음 날 꺼내기(조건부, 참고 — 무작위가 깨지므로 짝 없는 비율만)
for (const sc of scen.filter((s) => s.startsWith('N'))) for (const a of arms) { const rs = cell(a, sc).filter((r) => r.nightHeart); out.cells[`${a}|${sc}|hearted`] = { n: rs.length, done: rateOf(rs, 'done') }; console.log(`${a} ${sc} 하트 낸 사람 중 꺼내기: ${pct(rateOf(rs, 'done'))}% (n=${rs.length})`); }
for (const sc of scen.filter((s) => s.startsWith('N'))) for (const a of arms.filter((x) => x !== REF)) { const p = paired(a, sc, 'nightHeart'); out.paired[`${a}|${sc}|nightHeart`] = p; if (p.n) console.log(`${a} ${sc} 밤 하트: ${fmtP(p)}`); }
console.log(`\n세션 ${rows.length}, 끝난 것 ${valid.length}, 안 끝났거나 사후 답 없음 ${missing.length}${missing.length ? ` (${missing.slice(0, 10).join(', ')}…)` : ''}`);
writeFileSync(resolve(DIR, WAVE ? `result-${WAVE}.json` : 'result.json'), JSON.stringify(out, null, 1));
