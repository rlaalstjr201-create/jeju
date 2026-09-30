#!/usr/bin/env tsx
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
function loadEnv(): void {
  try {
    const lines = readFileSync('../../.env', 'utf-8').split('\n');
    for (const line of lines) {
      const t = line.trim(); if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('='); if (eq < 0) continue;
      const k = t.slice(0, eq).trim(), v = t.slice(eq + 1).trim();
      if (k && !(k in process.env)) process.env[k] = v;
    }
  } catch { /* */ }
}
loadEnv();
const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });

// ── Top 60 by buzz_count ──────────────────────────────────────────────────────
const { rows: top60 } = await pool.query<{
  rank: string;
  name: string;
  category: string;
  trend_category: string | null;
  buzz: string;
  final_score: string | null;
  has_kakao: boolean;
}>(`
  SELECT
    ROW_NUMBER() OVER (ORDER BY external_buzz_count DESC) AS rank,
    name,
    category,
    trend_category,
    external_buzz_count::text AS buzz,
    final_score::text,
    (external_links::jsonb->'kakao'->>'place_id' IS NOT NULL) AS has_kakao
  FROM curation_candidates
  WHERE comment_draft IS NOT NULL
    AND comment_warning_flag IS NULL
    AND status NOT IN ('approved')
  ORDER BY external_buzz_count DESC
  LIMIT 60
`);

console.log('순위  buzz_count  final  kakao  trend_category  category  spot_name');
console.log('----  ----------  -----  -----  --------------  --------  ---------');
for (const r of top60) {
  console.log(
    String(r.rank).padEnd(5) +
    String(r.buzz).padEnd(12) +
    String(r.final_score ?? '-').padEnd(7) +
    (r.has_kakao ? 'Y' : 'N').padEnd(7) +
    String(r.trend_category ?? 'NULL').padEnd(16) +
    r.category.padEnd(18) +
    r.name,
  );
}

// ── 히스토그램 ──────────────────────────────────────────────────────────────────
const { rows: hist } = await pool.query<{ bucket: string; cnt: string }>(`
  SELECT
    CASE
      WHEN external_buzz_count >= 100000 THEN '10만+'
      WHEN external_buzz_count >=  50000 THEN '5만+'
      WHEN external_buzz_count >=  10000 THEN '1만+'
      ELSE                                    '1만 미만'
    END AS bucket,
    COUNT(*) AS cnt
  FROM curation_candidates
  WHERE comment_draft IS NOT NULL
    AND comment_warning_flag IS NULL
    AND status NOT IN ('approved')
  GROUP BY bucket
  ORDER BY MIN(external_buzz_count) DESC
`);

console.log('\n=== buzz_count 히스토그램 (전체 577건) ===');
for (const r of hist) {
  console.log('  ' + r.bucket.padEnd(12) + ': ' + r.cnt + '건');
}

// ── 상위 60건 카테고리 분포 ────────────────────────────────────────────────────
const catMap: Record<string, number> = {};
for (const r of top60) {
  catMap[r.category] = (catMap[r.category] ?? 0) + 1;
}
console.log('\n=== 상위 60건 카테고리 분포 ===');
for (const [cat, cnt] of Object.entries(catMap).sort((a, b) => b[1] - a[1])) {
  console.log('  ' + cat.padEnd(20) + ': ' + cnt + '건');
}

await pool.end();
