#!/usr/bin/env tsx
/**
 * get-snippet-metadata.ts
 * spot 이름으로 snippet 메타 조회.
 * 수집 일시(collected_at) 기준 정렬, 날짜 패턴 추출.
 *
 * 실행: npx tsx src/scripts/diagnostics/get-snippet-metadata.ts <spot명> [--limit N]
 */
import { Pool } from 'pg';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnv(): void {
  try {
    const lines = readFileSync(resolve(process.cwd(), '.env'), 'utf-8').split('\n');
    for (const line of lines) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq === -1) continue;
      const key = t.slice(0, eq).trim();
      const val = t.slice(eq + 1).trim();
      if (key && !(key in process.env)) process.env[key] = val;
    }
  } catch { /* no .env */ }
}

// 한국어 날짜 패턴 추출
function extractDatePatterns(text: string): string[] {
  const patterns = [
    /\d{4}년\s*\d{1,2}월(?:\s*\d{1,2}일)?/g,  // 2025년 8월 / 2025년 8월 15일
    /\d{1,2}월\s*\d{1,2}일/g,                   // 5월 30일
    /\d{4}[-./]\d{1,2}[-./]\d{1,2}/g,           // 2025-08-15
    /\d{4}년\s*\d{1,2}월\s*부터/g,              // 2025년 8월부터
    /최근\s*\d+[일주개월년]/g,                   // 최근 3개월
    /지난\s*\d+[일주개월년]/g,                   // 지난 1년
  ];
  const found: string[] = [];
  for (const re of patterns) {
    const matches = text.match(re);
    if (matches) found.push(...matches);
  }
  return [...new Set(found)];
}

if (!process.env['VITEST']) await (async () => {
  loadEnv();

  const args = process.argv.slice(2);
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1] ?? '5', 10) : 5;
  const excludeIdx = limitIdx !== -1 ? new Set([limitIdx, limitIdx + 1]) : new Set<number>();
  const spotName = args.filter((_, i) => !excludeIdx.has(i)).join(' ');

  if (!spotName) {
    console.error('사용법: npx tsx get-snippet-metadata.ts <spot명> [--limit N]');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });

  // spot 조회
  const { rows: spotRows } = await pool.query<{
    id: string; name: string; category: string; region: string;
  }>(
    `SELECT id, name, category, region
     FROM curation_candidates
     WHERE name ILIKE $1
     ORDER BY selected_tier = 'reference' DESC, name
     LIMIT 5`,
    [`%${spotName}%`],
  );

  if (spotRows.length === 0) {
    console.error(`[error] '${spotName}' — curation_candidates에서 찾을 수 없음`);
    await pool.end();
    process.exit(1);
  }

  const spot = spotRows[0]!;
  if (spotRows.length > 1) {
    console.log(`[warn] 복수 매칭 — 첫 번째 사용: ${spot.name} (${spot.id})`);
    for (const r of spotRows) console.log(`  ${r.name} (${r.id}, ${r.region})`);
    console.log('');
  }

  console.log(`=== ${spot.name} (${spot.category}, ${spot.region}) ===`);
  console.log(`spot_id: ${spot.id}\n`);

  // snippet 조회 — collected_at 기준 정렬
  const { rows: snippets } = await pool.query<{
    id: string;
    source_type: string;
    source_url: string;
    title: string | null;
    description: string | null;
    collected_at: Date | null;
  }>(
    `SELECT id, source_type, source_url, title, description, collected_at
     FROM spot_snippets
     WHERE spot_id = $1
     ORDER BY collected_at DESC NULLS LAST
     LIMIT $2`,
    [spot.id, limit],
  );

  if (snippets.length === 0) {
    console.log('snippet 없음');
    await pool.end();
    return;
  }

  console.log(`snippet ${snippets.length}건 (collected_at DESC):\n`);

  for (let i = 0; i < snippets.length; i++) {
    const s = snippets[i]!;
    const desc = s.description ?? s.title ?? '';
    const preview = desc.slice(0, 50).replace(/\n/g, ' ');
    const datePatterns = extractDatePatterns(desc);

    console.log(`[${i + 1}] snippet_id: ${s.id}`);
    console.log(`    collected_at : ${s.collected_at?.toISOString() ?? '(null)'}`);
    console.log(`    source_type  : ${s.source_type}`);
    console.log(`    source_url   : ${s.source_url}`);
    console.log(`    description  : ${preview}${desc.length > 50 ? '…' : ''}`);
    console.log(`    날짜 패턴    : ${datePatterns.length > 0 ? datePatterns.join(', ') : '(없음)'}`);
    console.log('');
  }

  // 가장 최신 snippet의 full description 출력 (상태 판단용)
  const latest = snippets[0]!;
  const latestDesc = latest.description ?? latest.title ?? '';
  console.log('─'.repeat(60));
  console.log('최신 snippet full description:');
  console.log(latestDesc);

  await pool.end();
})();
