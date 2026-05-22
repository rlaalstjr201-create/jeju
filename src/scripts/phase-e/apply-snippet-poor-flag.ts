#!/usr/bin/env tsx
/**
 * apply-snippet-poor-flag.ts
 * Phase E 풀런 전 사전 플래그: snippet 부족(< 2건) spot에 comment_warning_flag='snippet_poor' 설정.
 * generate-comments-v2.ts 런타임과 동일한 sharedUrl 필터 로직 사용.
 *
 * 실행:
 *   npx tsx src/scripts/phase-e/apply-snippet-poor-flag.ts           # dry-run
 *   npx tsx src/scripts/phase-e/apply-snippet-poor-flag.ts --apply   # 실제 UPDATE
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

interface SpotRow { id: string; name: string; category: string; region: string; }

if (!process.env['VITEST']) await (async () => {
  loadEnv();
  const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });
  const isApply = process.argv.includes('--apply');

  console.log(`[snippet-poor] mode: ${isApply ? 'APPLY' : 'dry-run'}\n`);

  // generate-comments-v2와 동일한 sharedUrl 기준
  const { rows: sharedRows } = await pool.query<{ source_url: string }>(
    `SELECT source_url FROM spot_snippets GROUP BY source_url HAVING COUNT(DISTINCT spot_id) >= 5`,
  );
  const sharedUrls = new Set(sharedRows.map(r => r.source_url));

  const { rows: spots } = await pool.query<SpotRow>(
    `SELECT id, name, category, region
     FROM curation_candidates
     WHERE selected_tier = 'reference'
       AND comment_warning_flag IS NULL
     ORDER BY category, name`,
  );

  console.log(`[snippet-poor] 점검 대상: ${spots.length}건 (comment_warning_flag IS NULL)`);
  console.log(`[snippet-poor] 공유 URL 제외 기준: ${sharedUrls.size}건\n`);

  const poorSpots: SpotRow[] = [];

  for (const spot of spots) {
    const { rows: snips } = await pool.query<{ source_url: string }>(
      `SELECT source_url FROM spot_snippets WHERE spot_id = $1`,
      [spot.id],
    );
    const uniqueCount = snips.filter(s => !sharedUrls.has(s.source_url)).length;
    if (uniqueCount < 2) {
      poorSpots.push(spot);
      console.log(`  [poor] ${spot.name} (${spot.category}, ${spot.region}) — unique snippets: ${uniqueCount}`);
    }
  }

  console.log(`\n합계 snippet_poor: ${poorSpots.length}건`);

  if (!isApply) {
    console.log('\n(dry-run: DB 변경 없음. --apply 플래그로 실제 적용)');
    await pool.end();
    return;
  }

  if (poorSpots.length > 0) {
    const ids = poorSpots.map(s => s.id);
    const { rowCount } = await pool.query(
      `UPDATE curation_candidates
       SET comment_warning_flag = 'snippet_poor'
       WHERE id = ANY($1)`,
      [ids],
    );
    console.log(`[apply] snippet_poor 플래그 설정: ${rowCount}건`);
  } else {
    console.log('[apply] snippet_poor 대상 없음');
  }

  // 최종 카운트
  const { rows: summary } = await pool.query<{ flag: string | null; cnt: string }>(
    `SELECT comment_warning_flag AS flag, COUNT(*) AS cnt
     FROM curation_candidates WHERE selected_tier = 'reference'
     GROUP BY comment_warning_flag ORDER BY flag NULLS FIRST`,
  );
  console.log('\n현재 comment_warning_flag 분포:');
  for (const r of summary) {
    const label = r.flag ?? '(null)';
    console.log(`  ${label.padEnd(18)}: ${r.cnt}건`);
  }

  await pool.end();
})();
