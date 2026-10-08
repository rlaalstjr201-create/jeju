// 선호 순위(수정 1 · 3): 200명 층화 표본, 세 흐름을 순서를 바꿔 두 번 보여 준다.
//   node sim/prefer.mjs build   → work/pref-1.jsonl, work/pref-2.jsonl, work/pref-key.json
//   node sim/prefer.mjs score   → stdout 표 (work/out-pref-{1,2}.jsonl 필요)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const W = path.join(ROOT, 'work');
const rd = (f) => fs.readFileSync(f, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
const h = (s) => { let x = 2166136261; for (const c of s) x = Math.imul(x ^ c.charCodeAt(0), 16777619) >>> 0; return x; };
const LET = ['가', '나', '다'];
const N = 200;

function build() {
  const skel = rd(path.join(ROOT, 'personas-skeleton.jsonl'));
  const narr = new Map(fs.readdirSync(W).filter((n) => /^narr-\d\.jsonl$/.test(n)).flatMap((n) => rd(path.join(W, n))).map((r) => [r.id, r]));
  // 층화: 집단 × 첫 상황 비례, 칸 안에서는 고정 난수 순
  const strata = new Map();
  for (const p of skel) { const k = `${p.group}|${p.scenario1}`; (strata.get(k) ?? strata.set(k, []).get(k)).push(p); }
  const picked = [];
  for (const [, ps] of strata) { ps.sort((a, b) => h(a.id + 'pref') - h(b.id + 'pref')); picked.push(...ps.slice(0, Math.round((ps.length / skel.length) * N))); }
  const screen = Object.fromEntries(['X', 'Y', 'Z'].map((f) => [f, fs.readFileSync(path.join(W, `flow-${f}.md`), 'utf8').split('## 날짜와 저장 목록')[1].trim()]));
  const rep = new Map([...rd(path.join(W, 'replay-r1.jsonl')), ...rd(path.join(W, 'replay-r2.jsonl'))].map((r) => [`${r.id}|${r.flow}|${r.round}`, r]));
  const outs = new Map(fs.readdirSync(W).filter((n) => /^out-r[12]-/.test(n)).flatMap((n) => rd(path.join(W, n))).map((r) => [`${r.id}|${r.flow}|${r.round}`, r]));
  const exp = (id, f) => [1, 2].map((rnd) => {
    const r = rep.get(`${id}|${f}|${rnd}`), o = outs.get(`${id}|${f}|${rnd}`);
    if (!r || !o) return null;
    return `${rnd === 1 ? '첫 상황' : '다음 상황'}(${r.scenario}): 누른 순서 ${o.actions.join(' → ') || '없음'} / 멈칫: ${o.stuck} / 부담: ${o.burden}`;
  }).filter(Boolean).join('\n');
  const key = {};
  const pass = (n) => picked.map((p) => {
    const order = n === 1 ? p.order.split('') : p.order.split('').reverse();
    key[`${p.id}|${n}`] = Object.fromEntries(order.map((f, i) => [LET[i], f]));
    const { order: _o, scenario1: _s, narrative: _n, ...persona } = p;
    const nr = narr.get(p.id);
    return { id: p.id, pass: n, persona, name: nr?.name, narrative: p.narrative === false ? undefined : nr?.narrative, versions: order.map((f, i) => ({ name: LET[i], screen: screen[f], experience: exp(p.id, f) })) };
  });
  for (const n of [1, 2]) fs.writeFileSync(path.join(W, `pref-${n}.jsonl`), pass(n).map((r) => JSON.stringify(r)).join('\n') + '\n');
  fs.writeFileSync(path.join(W, 'pref-key.json'), JSON.stringify(key));
  console.log(`pref: ${picked.length} people × 2 passes`);
}

function score() {
  const key = JSON.parse(fs.readFileSync(path.join(W, 'pref-key.json'), 'utf8'));
  const skel = new Map(rd(path.join(ROOT, 'personas-skeleton.jsonl')).map((p) => [p.id, p]));
  const byId = new Map();
  for (const n of [1, 2]) for (const r of rd(path.join(W, `out-pref-${n}.jsonl`))) {
    const map = key[`${r.id}|${n}`]; if (!map || !Array.isArray(r.rank)) continue;
    (byId.get(r.id) ?? byId.set(r.id, {}).get(r.id))[n] = r.rank.map((l) => map[l]);
  }
  const res = { P: { X: 0, Y: 0, Z: 0, 불명: 0, n: 0 }, 보통: { X: 0, Y: 0, Z: 0, 불명: 0, n: 0 } };
  const borda = { P: { X: 0, Y: 0, Z: 0 }, 보통: { X: 0, Y: 0, Z: 0 } };
  for (const [id, r] of byId) {
    const g = skel.get(id)?.group; if (!g || !r[1] || !r[2]) continue;
    res[g].n++;
    if (r[1][0] === r[2][0]) res[g][r[1][0]]++; else res[g].불명++;
    for (const rk of [r[1], r[2]]) rk.forEach((f, i) => (borda[g][f] += 2 - i));
  }
  console.log('| 집단 | n | 1등 X(B 담고 나중에) | 1등 Y(A 지금 앱) | 1등 Z(C 날짜 없음) | 선호 불명(두 번 다름) | 보르다 X / Y / Z |');
  console.log('|---|---|---|---|---|---|---|');
  for (const g of ['P', '보통']) { const s = res[g]; const p = (k) => `${s[k]} (${((s[k] / s.n) * 100).toFixed(0)}%)`; console.log(`| ${g} | ${s.n} | ${p('X')} | ${p('Y')} | ${p('Z')} | ${p('불명')} | ${borda[g].X} / ${borda[g].Y} / ${borda[g].Z} |`); }
}

const cmd = process.argv[2];
if (cmd === 'build') build(); else if (cmd === 'score') score(); else console.error('사용: node sim/prefer.mjs build|score');
