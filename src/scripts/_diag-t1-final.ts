#!/usr/bin/env tsx
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';

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

loadEnv();
const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });

const r1 = await pool.query(`
  SELECT
    COUNT(*) FILTER (WHERE external_links ? 'kakao') AS kakao_total,
    COUNT(*) AS total
  FROM curation_candidates WHERE sourced_from='visitjeju'
`);
const { kakao_total, total } = r1.rows[0] as Record<string, string>;
console.log('=== T1 최종 매칭률 ===');
console.log(`kakao 매칭: ${kakao_total}/${total} = ${(Number(kakao_total)/Number(total)*100).toFixed(1)}%`);
console.log(`  2366건(67.1%) → +131건(Option-A) → ${kakao_total}건`);

const r2 = await pool.query(`
  SELECT category,
    COUNT(*) AS total_cat,
    COUNT(*) FILTER (WHERE external_links ? 'kakao') AS matched
  FROM curation_candidates WHERE sourced_from='visitjeju'
  GROUP BY category ORDER BY total_cat DESC
`);
console.log('\n카테고리별 최종 매칭률:');
for (const r of r2.rows as Array<Record<string, string>>) {
  const pct = (Number(r['matched'])/Number(r['total_cat'])*100).toFixed(1);
  console.log(`  ${r['category']}: ${r['matched']}/${r['total_cat']} (${pct}%)`);
}

const r3 = await pool.query(`
  SELECT category, COUNT(*) AS cnt
  FROM curation_candidates
  WHERE sourced_from='visitjeju' AND NOT (external_links ? 'kakao')
  GROUP BY category ORDER BY cnt DESC
`);
console.log('\n잔여 NO_MATCH 카테고리 분포:');
for (const r of r3.rows as Array<Record<string, string>>) {
  console.log(`  ${r['category']}: ${r['cnt']}`);
}

const r4 = await pool.query(`
  SELECT COUNT(*) AS cnt
  FROM curation_candidates
  WHERE sourced_from='visitjeju' AND NOT (external_links ? 'kakao')
`);
console.log(`\n잔여 NO_MATCH 총계: ${(r4.rows[0] as Record<string, string>)['cnt']}건`);

await pool.end();
