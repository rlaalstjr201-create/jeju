// 사전등록(00-prereg.md + 수정 1) 판정을 그대로 계산한다. 결과를 보기 전에 쓴 코드다.
//   node sim/analyze.mjs > ../30-results.md
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const W = path.join(ROOT, 'work');
const rd = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l)) : []);
const KEY = { X: 'B 담고 나중에 나누기', Y: 'A 지금 앱', Z: 'C 날짜 없음' };

const skel = new Map(rd(path.join(ROOT, 'personas-skeleton.jsonl')).map((p) => [p.id, p]));
const r1 = rd(path.join(W, 'replay-r1.jsonl'));
const r2 = rd(path.join(W, 'replay-r2.jsonl'));
const rows = [...r1, ...r2];

// --- 부담(bound) 코드: 자유 문장을 규칙 사전으로(R4). 「없음」류면 부담 없음.
const NONE = /^(없음|없다|없어요|딱히 없|특별히 없|-)?\s*$/;
const CODES = [
  ['날짜 정하기', /날짜|언제|내일로|오늘로|며칠|날을 (정|고르)/],
  ['순서 정하기', /순서|위로|아래로|동선|차례/],
  ['목록 관리', /정리|관리|목록|숙제|일일이|쌓/],
  ['정해야 하는 압박', /정해야|골라야|결정|확정|미리 정/],
  ['못 찾음', /못 찾|어디 갔|안 보|사라|접혀|지난 날/],
];
const boundCodes = (t) => { const s = String(t ?? '').trim(); if (NONE.test(s) || /^없/.test(s)) return []; const c = CODES.filter(([, re]) => re.test(s)).map(([k]) => k); return c.length ? c : ['기타']; };
const confused = (r) => r.invalid?.length > 0 || !/^(없음|없다|없어요|-)?\s*$/.test(String(r.stuck ?? '').trim()) && !/^없/.test(String(r.stuck ?? '').trim());
for (const r of rows) { r.bound = boundCodes(r.burden).length > 0; r.boundCodes = boundCodes(r.burden); r.confusion = confused(r); r.group = skel.get(r.id)?.group; }

const pct = (n, d) => (d ? (n / d) * 100 : NaN);
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '—');
const rate = (xs, k) => pct(xs.filter((r) => r[k]).length, xs.length);
const sel = (o) => rows.filter((r) => Object.entries(o).every(([k, v]) => v === undefined || r[k] === v));

// 사람 단위 부트스트랩 95% 구간(그 사람의 모든 실행을 함께 뽑는다)
function boot(xs, k, B = 1000) {
  const by = new Map(); for (const r of xs) (by.get(r.id) ?? by.set(r.id, []).get(r.id)).push(r);
  const ids = [...by.keys()]; if (!ids.length) return [NaN, NaN];
  let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
  const vals = [];
  for (let b = 0; b < B; b++) { let n = 0, d = 0; for (let i = 0; i < ids.length; i++) { const g = by.get(ids[Math.floor(rnd() * ids.length)]); d += g.length; n += g.filter((r) => r[k]).length; } vals.push(pct(n, d)); }
  vals.sort((a, b) => a - b); return [vals[Math.floor(B * 0.025)], vals[Math.floor(B * 0.975)]];
}
// 같은 사람·같은 라운드 짝 McNemar(연속성 보정)
function mcnemar(fa, fb, k, filt = {}) {
  const a = new Map(sel({ ...filt, flow: fa }).map((r) => [`${r.id}|${r.round}`, r[k]]));
  let b01 = 0, b10 = 0, n = 0;
  for (const r of sel({ ...filt, flow: fb })) { const x = a.get(`${r.id}|${r.round}`); if (x === undefined) continue; n++; if (x && !r[k]) b10++; if (!x && r[k]) b01++; }
  const chi = b01 + b10 ? (Math.abs(b10 - b01) - 1) ** 2 / (b10 + b01) : 0;
  return { n, aOnly: b10, bOnly: b01, chi: chi.toFixed(2), p: chi > 6.63 ? '<0.01' : chi > 3.84 ? '<0.05' : '≥0.05' };
}

const out = [];
const P = (s) => out.push(s);
P('# 결과 — 가상 여행자 1000명 UX 시뮬레이션\n');
P(`> 이 결과는 LLM이 연기한 가상 여행자 1,000명의 반응이며 실제 사용자 조사가 아니다. 선행 연구에서 LLM 가상 인물은 집단 평균의 방향은 일부 맞히지만 개인 행동 예측 정확도는 낮고(실제 쇼핑 행동 재현 약 12%), 응답 분산을 실제보다 작게, 집단 간 차이를 실제보다 크게(2~4배) 그리는 경향이 보고되었다. 에이전트는 사람보다 덜 헤매므로 헤맴·놓침 수치는 흐름 간 상대 비교로만 해석해야 한다. P 여행자 비율 등 일부 페르소나 분포는 통계가 아닌 추정에 기반한다. 결과는 사용 기록과 실제 사용자 시험으로 확인하기 전까지 가설로 취급한다.\n`);
P(`실행 수: 라운드1 ${r1.length}, 라운드2 ${r2.length} (기대 각 3000)\n`);

P('## 1. 흐름별 핵심 지표 (전체 실행, 사람 단위 95% 구간)\n');
P('| 집단 | 흐름 | n | done % | bound % | confusion % | 평균 탭 | again 평균 |');
P('|---|---|---|---|---|---|---|---|');
const summary = {};
for (const g of ['P', '보통', undefined]) for (const f of ['Y', 'X', 'Z']) {
  const xs = sel({ group: g, flow: f });
  const [lo, hi] = boot(xs, 'done');
  const s = { n: xs.length, done: rate(xs, 'done'), bound: rate(xs, 'bound'), conf: rate(xs, 'confusion') };
  summary[`${g ?? '전체'}|${f}`] = s;
  P(`| ${g ?? '전체'} | ${f} ${KEY[f]} | ${xs.length} | ${f1(s.done)} (${f1(lo)}~${f1(hi)}) | ${f1(s.bound)} | ${f1(s.conf)} | ${f1(xs.reduce((a, r) => a + r.taps, 0) / xs.length)} | ${f1(xs.reduce((a, r) => a + (Number(r.again) || 0), 0) / xs.length)} |`);
}

P('\n## 2. 상황별 done %\n');
P('| 상황 | Y 지금 앱 | X 담고 나중에 | Z 날짜 없음 |');
P('|---|---|---|---|');
for (const sc of ['S1', 'S2', 'S3', 'S4', 'S5']) P(`| ${sc} (n=${sel({ scenario: sc, flow: 'Y' }).length}) | ${['Y', 'X', 'Z'].map((f) => f1(rate(sel({ scenario: sc, flow: f }), 'done'))).join(' | ')} |`);

P('\n## 3. 짝 비교 (같은 사람·같은 라운드, McNemar)\n');
P('| 집단 | 지표 | 비교 | 짝 n | 앞만 성공 | 뒤만 성공 | χ² | p |');
P('|---|---|---|---|---|---|---|---|');
for (const g of ['P', '보통']) for (const k of ['done', 'bound']) for (const [a, b] of [['Y', 'X'], ['X', 'Z']]) {
  const m = mcnemar(a, b, k, { group: g });
  P(`| ${g} | ${k} | ${a} vs ${b} | ${m.n} | ${m.aOnly} | ${m.bOnly} | ${m.chi} | ${m.p} |`);
}

P('\n## 4. 부담 코드 분포 (bound 실행 안에서)\n');
P('| 흐름 | 날짜 정하기 | 순서 정하기 | 목록 관리 | 정해야 하는 압박 | 못 찾음 | 기타 |');
P('|---|---|---|---|---|---|---|');
for (const f of ['Y', 'X', 'Z']) { const xs = sel({ flow: f }).filter((r) => r.bound); const c = (k) => xs.filter((r) => r.boundCodes.includes(k)).length; P(`| ${f} | ${['날짜 정하기', '순서 정하기', '목록 관리', '정해야 하는 압박', '못 찾음', '기타'].map(c).join(' | ')} |`); }

P('\n## 5. 지금 앱(Y)의 「지난 날 접힘」\n');
const y5 = sel({ flow: 'Y', scenario: 'S5' });
P(`Y의 S5 ${y5.length}건 중 접힌 지난 날 때문에 막힌 경우 ${y5.filter((r) => r.pastHidden).length}건, 펼치기를 눌러 찾은 경우 ${y5.filter((r) => r.done && r.taps >= 3).length}건(대략). S1 밤에 「내일」을 고르고 담은 비율: ${f1(pct(r1.filter((r) => r.flow === 'Y' && r.scenario === 'S1' && (r.savedAfter ?? []).some((s) => s.day >= 1)).length, r1.filter((r) => r.flow === 'Y' && r.scenario === 'S1' && r.hearts > 0).length))}% (하트 누른 사람 중)`);

P('\n## 6. 판정 (사전등록 규칙)\n');
const Pd = (f) => summary[`P|${f}`], Gd = (f) => summary[`보통|${f}`];
const rule1 = Pd('X').done >= Pd('Y').done - 2 && Pd('X').bound <= Pd('Y').bound && Pd('X').conf <= Pd('Y').conf + 2 && Gd('X').done >= Gd('Y').done - 5;
P(`- 규칙 1 (B=X가 A=Y를 대신): P done ${f1(Pd('X').done)} vs ${f1(Pd('Y').done)} · bound ${f1(Pd('X').bound)} vs ${f1(Pd('Y').bound)} · confusion ${f1(Pd('X').conf)} vs ${f1(Pd('Y').conf)} · 보통 done ${f1(Gd('X').done)} vs ${f1(Gd('Y').done)} → **${rule1 ? '성립' : '불성립'}**`);
const s5 = (f) => rate(sel({ group: 'P', flow: f, scenario: 'S5' }), 'done');
const rule2 = rule1 && Pd('Z').done >= Pd('X').done - 2 && s5('Z') >= s5('X') - 5;
P(`- 규칙 2 (날짜 정리 자체를 뺄지, C=Z): P done ${f1(Pd('Z').done)} vs ${f1(Pd('X').done)} · P S5 ${f1(s5('Z'))} vs ${f1(s5('X'))} → **${rule1 ? (rule2 ? '성립 — 날짜 정리 불필요' : '불성립 — B 유지') : '규칙 1 불성립이라 해당 없음'}**`);
if (!rule1) {
  const yb = sel({ flow: 'Y' }).filter((r) => r.bound).flatMap((r) => r.boundCodes);
  const top = Object.entries(yb.reduce((a, k) => ((a[k] = (a[k] ?? 0) + 1), a), {})).sort((a, b) => b[1] - a[1]).slice(0, 3);
  P(`- 규칙 3: 지금 흐름 유지, Y의 부담 상위 3: ${top.map(([k, c]) => `${k}(${c})`).join(', ')}`);
}

P('\n## 7. 신뢰 점검\n');
const noise = rd(path.join(W, 'replay-noise.jsonl'));
if (noise.length) {
  const main = new Map(r1.filter((r) => r.flow === 'Y').map((r) => [r.id, r]));
  const pairs = noise.map((r) => [r, main.get(r.id)]).filter(([, m]) => m);
  const agree = pairs.filter(([a, b]) => a.done === b.done).length;
  const diff = Math.abs(pct(pairs.filter(([a]) => a.done).length, pairs.length) - pct(pairs.filter(([, b]) => b.done).length, pairs.length));
  P(`- 잡음 폭(R9): 같은 100명 × Y × 라운드1 재실행 — done 일치 ${f1(pct(agree, pairs.length))}%, 비율 차이 ${f1(diff)}%p → ${diff > 2 ? '**2%p 초과 — 규칙 1·2의 2%p 경계는 판정 불가 구간**' : '2%p 이내'}`);
} else P('- 잡음 폭: 데이터 없음');
for (const rd2 of ['r1', 'r2']) {
  const cross = rd(path.join(W, `replay-cross-${rd2}.jsonl`));
  if (!cross.length) { P(`- 교차 확인 ${rd2}: 데이터 없음`); continue; }
  const main = new Map((rd2 === 'r1' ? r1 : r2).map((r) => [`${r.id}|${r.flow}`, r]));
  const pairs = cross.map((r) => { r.bound = boundCodes(r.burden).length > 0; return [r, main.get(`${r.id}|${r.flow}`)]; }).filter(([, m]) => m);
  const ag = (k) => f1(pct(pairs.filter(([a, b]) => a[k] === b[k]).length, pairs.length));
  const dir = ['Y', 'X', 'Z'].map((f) => `${f} ${f1(rate(cross.filter((r) => r.flow === f), 'done'))}`).join(' / ');
  P(`- 교차 확인 ${rd2} (Haiku vs Opus, 50명 × 3흐름): done 일치 ${ag('done')}%, bound 일치 ${ag('bound')}% · Haiku done ${dir}`);
}

P('\n## 8. 민감도 — P 비율 재가중(R1)\n');
P('| P 비중 | Y done | X done | Z done | 규칙 1 방향 |');
P('|---|---|---|---|---|');
for (const w of [0.325, 0.65, 0.975]) {
  const d = (f) => w * Pd(f).done + (1 - w) * Gd(f).done;
  P(`| ${(w * 100).toFixed(1)}% | ${f1(d('Y'))} | ${f1(d('X'))} | ${f1(d('Z'))} | X ${d('X') >= d('Y') - 2 ? '≥' : '<'} Y−2 |`);
}

P('\n## 9. 서사 없음 대조군(R2)\n');
const noNarr = new Set([...skel.values()].filter((p) => p.narrative === false).map((p) => p.id));
for (const f of ['Y', 'X', 'Z']) P(`- ${f}: 서사 있음 done ${f1(rate(rows.filter((r) => r.flow === f && !noNarr.has(r.id)), 'done'))}% / 서사 없음 ${f1(rate(rows.filter((r) => r.flow === f && noNarr.has(r.id)), 'done'))}%`);

console.log(out.join('\n'));
