#!/usr/bin/env node
// 주간 순위 가져오기(ADR-0079 1) — GSC 실적 화면을 옮긴 파일 + rank-naver 결과 → keywords.json target의 track[] 한 줄.
//
// 사용 (apps/web에서):
//   node scripts/seo/gsc-import.mjs --gsc data/seo/gsc/2026-10-05.json [--naver data/seo/rank/naver-2026-10-05.json] [--week 2026-10-05] [--dry]
//   --gsc 없이 돌리면 구글 칸은 「확인 실패」(gsc: 'check_failed')로 남는다 — 0으로 채우지 않는다.
//   --naver를 안 주면 같은 날짜의 data/seo/rank/naver-<week>.json을 찾는다. 없으면 네이버 칸을 비운다.
//   --dry: 검증과 넣을 줄만 보여 주고 파일을 쓰지 않는다.
// 다음: 줄을 넣은 뒤 seo:keywords --track 판정(pivotOf)을 그대로 돌리고, 「밀림」 경보(dropsOf)를 출력한다.
// 출력 파일 형식: GSC 파일 { date_range: {start, end}, rows: [{ query, clicks, impressions, ctr, position }] }

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DATA, APP, argOf, localDay } from './load-dist.mjs';
import { validateGscExport, trackLinesOf, appendTrack, dropsOf } from './rank-ops.mjs';

const { has, val } = argOf(process.argv.slice(2));
const readJson = (f) => JSON.parse(fs.readFileSync(path.resolve(APP, f), 'utf8'));

const gscFile = val('--gsc', null);
let gscRows = null, gscDoc = null;
if (gscFile) {
  gscDoc = readJson(gscFile);
  const { errors, rows } = validateGscExport(gscDoc);
  if (errors.length) {
    console.error(`GSC 파일 검증 실패 — ${gscFile}\n${errors.map((e) => `  [오류] ${e}`).join('\n')}`);
    process.exit(1);
  }
  gscRows = rows;
}
const week = val('--week', null) || (gscFile && path.basename(gscFile).match(/\d{4}-\d{2}-\d{2}/)?.[0]) || localDay();

let naverFile = val('--naver', null);
if (!naverFile && fs.existsSync(path.join(DATA, 'rank', `naver-${week}.json`))) naverFile = path.join(DATA, 'rank', `naver-${week}.json`);
const naver = naverFile ? readJson(naverFile) : null;

const kwFile = path.join(DATA, 'keywords.json');
const raw = fs.readFileSync(kwFile, 'utf8');
const doc = JSON.parse(raw);
const lines = trackLinesOf(doc.candidates, week, gscRows, naver);

console.log(`\n■ 주간 순위 가져오기 — week ${week}`);
console.log(`  GSC: ${gscFile ? `${gscFile} (${gscDoc.date_range.start}~${gscDoc.date_range.end}, ${gscRows.length}행)` : '없음 → 확인 실패'}`);
console.log(`  네이버: ${naverFile || '없음 → 비움'}`);
for (const { query, line } of lines) {
  const g = typeof line.google_pos === 'number' ? `구글 ${line.google_pos}위 · 노출 ${line.impressions} · 클릭 ${line.clicks}` : `구글 ${line.gsc}`;
  const n = line.naver === 'found' ? `네이버 ${line.naver_block} ${line.naver_pos}위` : line.naver ? `네이버 ${line.naver}` : '네이버 -';
  console.log(`  ${query} — ${g} · ${n}`);
}

if (has('--dry')) { console.log('\n(--dry: keywords.json을 쓰지 않았다)\n'); process.exit(0); }

const byQuery = new Map(lines.map((l) => [l.query, l.line]));
doc.candidates = doc.candidates.map((c) => (byQuery.has(c.query) ? appendTrack(c, byQuery.get(c.query)) : c));
const eol = raw.includes('\r\n') ? '\r\n' : '\n';
fs.writeFileSync(kwFile, JSON.stringify(doc, null, 1).replace(/\n/g, eol) + eol);
console.log(`  keywords.json track ${lines.length}줄 반영`);

// 판정은 기존 규칙 그대로(seo:keywords --track).
const kw = path.join(path.dirname(fileURLToPath(import.meta.url)), 'keywords.mjs');
const r = spawnSync(process.execPath, [kw, '--track'], { cwd: APP, encoding: 'utf8' });
const out = r.stdout || '';
const i = out.indexOf('■ 순위 추적 판정');
process.stdout.write(i >= 0 ? `\n${out.slice(i)}` : out);

const { flagged, suppressed } = dropsOf(doc.candidates, localDay());
console.log(`■ 밀림 경보 — ${flagged.length}건${suppressed.length ? ` (판정 보류 ${suppressed.length})` : ''}`);
for (const f of flagged) console.log(`  [밀림] ${f.query} · ${f.engine} — ${f.why} → push/meta 후보`);
for (const s of suppressed) console.log(`  [보류] ${s.query} — ${s.why}`);
console.log('');
