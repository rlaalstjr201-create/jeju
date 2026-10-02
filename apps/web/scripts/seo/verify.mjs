#!/usr/bin/env node
// 검증 루프 — 「고쳤다는 것이 실제로 고쳐졌나」와 「예측이 맞았나」를 본다.
// (seoulist scripts/seo-verify.mjs를 옮김. 배포 전에는 GSC가 없으므로 오프라인 두 갈래가 본체다.)
//
//   ① 큐 채점: data/seo/queue.json 항목 중 check(감사 id)가 있는 것은 지금 빌드를 감사해 그 id가 사라졌는지 본다.
//      사라졌으면 「해소」, 남았으면 「열림」. 해소율이 곧 실행률이다 — 다음 진단의 개입 수 상한을 정한다.
//   ② keywords.json 게이트 검증: 기록된 verdict가 규칙 판정과 같은가.
//   ③ 예측 채점: data/seo/forecasts/*.json 중 지평이 지난 것. GSC 연결 전에는 「채점 불가」로 남긴다(TODO-after-deploy).
//
// 사용 (apps/web에서):
//   npm run seo:verify                 보고만 (exit 0)
//   npm run seo:verify -- --strict     P0 감사 발견·게이트 오류가 있으면 exit 1 (배포 전 점검용)
//   npm run seo:verify -- --json

import fs from 'node:fs';
import path from 'node:path';
import { auditSite } from './audit-rules.mjs';
import { validateKeywords } from './keyword-gate.mjs';
import { sourcesStatus, gscLayerStats } from './gsc.mjs';
import { APP, DATA, argOf, originOf, loadDist, localDay } from './load-dist.mjs';

const { has, val } = argOf(process.argv.slice(2));
const JSON_OUT = has('--json');
const DIST = path.resolve(APP, val('--dist', 'dist'));
const ORIGIN = originOf(val('--site'));
const today = localDay();
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };

const site = loadDist(DIST, ORIGIN);
if (!site) { console.log(`빌드 결과가 없다: ${DIST}\n먼저 npm run build`); process.exit(0); }
const findings = auditSite({ ...site, origin: ORIGIN });
const ids = new Set(findings.map((f) => f.id));

// ① 큐
const queue = readJson(path.join(DATA, 'queue.json'));
const qItems = (queue?.items || []).map((it) => ({
  rank: it.rank, title: it.title, check: it.check,
  state: !it.check ? '사람 채점' : ids.has(it.check) ? '열림' : '해소',
}));
const auto = qItems.filter((i) => i.state !== '사람 채점');
const closure = auto.length ? auto.filter((i) => i.state === '해소').length / auto.length : null;

// ② 게이트
const kw = readJson(path.join(DATA, 'keywords.json'));
const gate = kw ? validateKeywords(kw) : { errors: ['data/seo/keywords.json 없음'], warns: [] };

// ③ 예측
const fdir = path.join(DATA, 'forecasts');
const sources = sourcesStatus();
const gsc = sources.find((s) => s.name === 'gsc');
const forecasts = [];
for (const f of (fs.existsSync(fdir) ? fs.readdirSync(fdir).filter((x) => x.endsWith('.json')).sort() : [])) {
  const fc = readJson(path.join(fdir, f));
  if (!fc) { forecasts.push({ file: f, state: 'JSON 파싱 실패' }); continue; }
  if (fc.horizon > today) { forecasts.push({ file: f, state: `지평 ${fc.horizon} 미도래` }); continue; }
  if (fc.scored) { forecasts.push({ file: f, state: `채점됨 — ${fc.scored.verdict}` }); continue; }
  const act = gsc.connected ? await gscLayerStats() : null;
  // 실측이 없으면 채점하지 않는다 — 「0」으로 채점하면 거짓 기록이 남는다.
  forecasts.push({ file: f, state: act ? '채점 대상(TODO-after-deploy: scoreRows 배선)' : `채점 불가 — ${gsc.why}` });
}

const p0 = findings.filter((f) => f.severity === 'P0');
const out = { today, origin: ORIGIN || null, findings_n: findings.length, p0: p0.map((f) => f.id), queue: { from_run: queue?.from_run ?? null, items: qItems, closure }, gate, forecasts, sources };
if (JSON_OUT) console.log(JSON.stringify(out, null, 2));
else {
  console.log(`\n■ 검증 — ${today} · origin ${ORIGIN || '(없음)'}`);
  console.log(`\n① 큐 채점 (${queue ? `from ${queue.from_run}` : 'data/seo/queue.json 없음 — npm run seo:report -- --queue'})`);
  for (const i of qItems) console.log(`   ${i.state.padEnd(5)} ${i.rank}. ${i.title}${i.check ? `  [${i.check}]` : ''}`);
  if (queue?.generated === today) console.log('   ⏳ 큐가 오늘 만들어졌다 — 아직 아무것도 고칠 시간이 없었다. 해소율을 실행률로 읽지 않는다.');
  else if (closure !== null) console.log(`   해소율 ${(closure * 100).toFixed(0)}% (${auto.filter((i) => i.state === '해소').length}/${auto.length}) — 다음 진단 개입 상한: ≥50% → 5 · 30~50% → 3 · <30% → 2`);
  console.log(`\n② keyword gate — 오류 ${gate.errors.length} · 주의 ${gate.warns.length}`);
  for (const m of gate.errors) console.log(`   [오류] ${m}`);
  for (const m of gate.warns) console.log(`   [주의] ${m}`);
  console.log(`\n③ 예측 ${forecasts.length}건`);
  for (const f of forecasts) console.log(`   ${f.file} — ${f.state}`);
  console.log('\n   외부 소스');
  for (const s of sources) console.log(`   ${s.connected ? '✔' : '○'} ${s.name}${s.connected ? '' : ` — ${s.why}`}`);
  console.log(`\n감사 P0 ${p0.length}건${p0.length ? `: ${p0.map((f) => f.id).join(', ')}` : ''}\n`);
}
process.exit(has('--strict') && (p0.length || gate.errors.length) ? 1 : 0);
