#!/usr/bin/env node
// 진단 리포트 렌더 — seo-analyst가 남긴 JSON 기록을 마크다운으로 그린다. 형식의 단일 출처.
// (seoulist scripts/seo-report.mjs를 옮김.)
//
// 사용 (apps/web에서):
//   npm run seo:report                     가장 최근 기록을 그린다
//   npm run seo:report -- --run <run_id>
//   npm run seo:report -- --validate       전수 검증만 (렌더 안 함)
//   npm run seo:report -- --strict         문제가 있으면 exit 1
//   npm run seo:report -- --queue          최신 기록의 개입을 data/seo/queue.json으로 (파일을 쓴다)

import fs from 'node:fs';
import path from 'node:path';
import { validateRecord, renderRecord } from './diagnosis-record.mjs';
import { DATA, argOf, localDay } from './load-dist.mjs';

const { has, val } = argOf(process.argv.slice(2));
const dir = path.join(DATA, 'diagnoses');
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort() : [];
if (!files.length) { console.log('진단 기록이 없다. seo-analyst 가동 뒤에 생긴다.'); process.exit(0); }

const load = (f) => {
  try { return { rec: JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')), err: null }; } catch (e) { return { rec: null, err: e.message }; }
};

if (has('--validate')) {
  let bad = 0;
  console.log(`\n■ 진단 기록 검증 — ${files.length}건\n`);
  for (const f of files) {
    const { rec, err } = load(f);
    if (err) { console.log(`  ✘ ${f} — JSON 파싱 실패: ${err}`); bad++; continue; }
    const { errors, warns } = validateRecord(rec, { filename: f });
    console.log(`  ${errors.length ? '✘' : warns.length ? '○' : '✔'} ${f}`);
    for (const m of errors) console.log(`      [오류] ${m}`);
    for (const m of warns) console.log(`      [주의] ${m}`);
    bad += errors.length;
  }
  console.log('');
  process.exit(has('--strict') && bad ? 1 : 0);
}

const file = val('--run') ? `${val('--run')}.json` : files[files.length - 1];
if (!files.includes(file)) { console.log(`그런 기록이 없다: ${file}`); process.exit(1); }
const { rec, err } = load(file);
if (err) { console.error(`JSON 파싱 실패: ${err}`); process.exit(1); }

if (has('--queue')) {
  // 개입이 사람 기억에 걸리면 실행되지 않는다(seoulist 13건 중 8건 「이행 안 됨」). 큐로 떨어뜨리고
  // check(감사 id)가 있는 항목은 verify.mjs가 다음 빌드에서 자동으로 해소 여부를 본다.
  const items = (rec.interventions || []).map((x) => ({
    rank: x.rank, sort_id: x.sort_id, title: x.title, severity: x.severity, queue_kind: x.queue_kind || null,
    keyword: x.keyword || null, check: x.check || null, where: x.where || null, verify: x.verify, from_run: rec.run_id,
  }));
  const out = { _why: '최신 SEO 진단의 개입 큐. 작업자가 여기서 집어 들고, check가 있는 항목은 npm run seo:verify가 해소 여부를 본다.', generated: localDay(), from_run: rec.run_id, items };
  fs.writeFileSync(path.join(DATA, 'queue.json'), `${JSON.stringify(out, null, 1)}\n`);
  console.log(`■ SEO 개입 큐 — ${rec.run_id} · ${items.length}건 → data/seo/queue.json`);
  for (const it of items) console.log(`  ${it.rank}. [${it.severity}] ${it.title}${it.check ? `  (채점 ${it.check})` : ''}`);
  process.exit(0);
}

const { errors, warns } = validateRecord(rec, { filename: file });
if (errors.length || warns.length) {
  console.log('> ⚠ 이 기록에 문제가 있다:');
  for (const m of errors) console.log(`> - **오류** ${m}`);
  for (const m of warns) console.log(`> - 주의 ${m}`);
  console.log('');
}
console.log(renderRecord(rec));
process.exit(has('--strict') && errors.length ? 1 : 0);
