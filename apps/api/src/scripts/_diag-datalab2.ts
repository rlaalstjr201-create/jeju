#!/usr/bin/env tsx
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
function loadEnv(): void {
  try {
    const lines = readFileSync('../../.env', 'utf-8').split('\n');
    for (const line of lines) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq < 0) continue;
      const k = t.slice(0, eq).trim(), v = t.slice(eq + 1).trim();
      if (k && !(k in process.env)) process.env[k] = v;
    }
  } catch { /* */ }
}
loadEnv();
const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });

// external_buzz_count / external_buzz_score
const { rows: [bz] } = await pool.query<Record<string, string>>(`
  SELECT
    COUNT(*) FILTER (WHERE external_buzz_count IS NOT NULL) AS bc_nn,
    COUNT(*) FILTER (WHERE external_buzz_count IS NULL)     AS bc_null,
    MIN(external_buzz_count)::text   AS bc_min,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY external_buzz_count)::text AS bc_med,
    MAX(external_buzz_count)::text   AS bc_max,
    COUNT(*) FILTER (WHERE external_buzz_score IS NOT NULL) AS bs_nn,
    COUNT(*) FILTER (WHERE external_buzz_score IS NULL)     AS bs_null,
    MIN(external_buzz_score)::text   AS bs_min,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY external_buzz_score)::text AS bs_med,
    MAX(external_buzz_score)::text   AS bs_max
  FROM curation_candidates
  WHERE comment_draft IS NOT NULL
    AND comment_warning_flag IS NULL
    AND status NOT IN ('approved')
`);
console.log('external_buzz_count: NOT NULL=' + bz!['bc_nn'] + '건  NULL=' + bz!['bc_null'] + '건');
if (parseInt(bz!['bc_nn']) > 0) {
  console.log('  min=' + bz!['bc_min'] + '  median=' + bz!['bc_med'] + '  max=' + bz!['bc_max']);
}
console.log('external_buzz_score: NOT NULL=' + bz!['bs_nn'] + '건  NULL=' + bz!['bs_null'] + '건');
if (parseInt(bz!['bs_nn']) > 0) {
  console.log('  min=' + bz!['bs_min'] + '  median=' + bz!['bs_med'] + '  max=' + bz!['bs_max']);
}

// 4분류 top-20 by final_score DESC
for (const cat of ['rising', 'steady', 'new', 'seasonal'] as const) {
  const { rows } = await pool.query<{ name: string; fs: string | null }>(`
    SELECT name, final_score::text AS fs
    FROM curation_candidates
    WHERE comment_draft IS NOT NULL
      AND comment_warning_flag IS NULL
      AND status NOT IN ('approved')
      AND trend_category = $1
    ORDER BY final_score DESC NULLS LAST
    LIMIT 20
  `, [cat]);
  console.log('\n[' + cat + '] top-' + rows.length + ' (final_score 내림차순):');
  for (const r of rows) {
    console.log('  ' + String(r.fs ?? 'NULL').padEnd(7) + r.name);
  }
}

await pool.end();
