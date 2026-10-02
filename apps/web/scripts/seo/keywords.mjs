#!/usr/bin/env node
// 검색어 게이트 표 — data/seo/keywords.json을 규칙(keyword-gate.mjs)으로 다시 판정해 보여 주고 검증한다.
//
// 사용 (apps/web에서):
//   npm run seo:keywords                          판정표 + 검증 (외부 호출 0건)
//   npm run seo:keywords -- --strict              검증 오류가 있으면 exit 1
//   npm run seo:keywords -- --track               target의 순위 추적 판정(pivotOf) — 배포 후 track이 채워지면 의미가 있다
//   npm run seo:keywords -- --suggest "제주 무계획,애월 갈만한곳"
//        네이버·구글 자동완성을 조회한다(키 불필요·무료). 수요 「존재」 신호일 뿐 검색량이 아니다.
//        ⚠ 네트워크 호출이다. 후보를 새로 넣을 때만 쓰고 반복 조회하지 않는다. 결과는 출력만 한다(파일을 쓰지 않는다).

import fs from 'node:fs';
import path from 'node:path';
import { judge, validateKeywords, pivotOf } from './keyword-gate.mjs';
import { DATA, argOf, localDay } from './load-dist.mjs';

const { has, val } = argOf(process.argv.slice(2));

if (has('--suggest')) {
  const qs = String(val('--suggest', '')).split(',').map((s) => s.trim()).filter(Boolean);
  for (const q of qs) {
    const e = encodeURIComponent(q);
    const get = async (url, pick) => {
      try { const r = await fetch(url, { signal: AbortSignal.timeout(8000) }); return pick(await r.json()); } catch (err) { return `조회 실패(${err.message})`; }
    };
    const naver = await get(`https://ac.search.naver.com/nx/ac?q=${e}&con=0&frm=nv&ans=2&r_format=json&r_enc=UTF-8&r_unicode=0&t_koreng=1&run=2&rev=4&q_enc=UTF-8&st=100`,
      (j) => (j.items?.[0] || []).map((x) => x[0]));
    const google = await get(`https://suggestqueries.google.com/complete/search?client=firefox&hl=ko&gl=kr&q=${e}`, (j) => j[1] || []);
    console.log(`\n「${q}」\n  네이버: ${Array.isArray(naver) ? naver.join(' | ') || '(없음)' : naver}\n  구글:   ${Array.isArray(google) ? google.join(' | ') || '(없음)' : google}`);
  }
  console.log('');
  process.exit(0);
}

const file = path.join(DATA, 'keywords.json');
if (!fs.existsSync(file)) { console.log('data/seo/keywords.json이 없다.'); process.exit(0); }
const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
const { errors, warns } = validateKeywords(doc);

console.log(`\n■ keyword gate — rubric v${doc.rubric_version} · 후보 ${doc.candidates.length}\n`);
const order = { target: 0, brand: 1, watch: 2, kill: 3, invalid: 4 };
const rows = doc.candidates.map((c) => ({ c, j: judge(c) })).sort((a, b) => order[a.j.verdict] - order[b.j.verdict] || (b.j.total ?? 0) - (a.j.total ?? 0));
for (const { c, j } of rows) {
  console.log(`  ${j.verdict.padEnd(6)} ${String(j.total ?? '-').padStart(2)}/10  ${c.query}${c.landing ? `  → ${c.landing}` : ''}`);
  console.log(`         ${j.why}`);
}
if (has('--track')) {
  console.log('\n■ 순위 추적 판정');
  for (const c of doc.candidates.filter((x) => x.verdict === 'target')) {
    const p = pivotOf(c, localDay());
    console.log(`  ${p.action.padEnd(5)} ${c.query} — ${p.why}`);
  }
}
console.log(`\n검증 — 오류 ${errors.length} · 주의 ${warns.length}`);
for (const m of errors) console.log(`  [오류] ${m}`);
for (const m of warns) console.log(`  [주의] ${m}`);
console.log('');
process.exit(has('--strict') && errors.length ? 1 : 0);
