#!/usr/bin/env tsx
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';

function loadEnv(): void {
  try {
    const lines = readFileSync(resolve(process.cwd(), '.env'), 'utf-8').split('\n');
    for (const line of lines) {
      const t = line.trim(); if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('='); if (eq === -1) continue;
      const key = t.slice(0, eq).trim(); const val = t.slice(eq + 1).trim();
      if (key && !(key in process.env)) process.env[key] = val;
    }
  } catch { /* no .env */ }
}
loadEnv();

const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });

const q1 = await pool.query(`
  SELECT
    tier,
    status,
    CASE
      WHEN created_at >= '2026-05-20 17:00:00+09' THEN 'new_insert'
      ELSE 'pre_existing_updated'
    END AS row_origin,
    COUNT(*) AS cnt
  FROM curation_candidates
  WHERE sourced_from='visitjeju'
    AND visitjeju_content_id IS NOT NULL
    AND updated_at >= '2026-05-20 17:00:00+09'
  GROUP BY tier, status, row_origin
  ORDER BY cnt DESC
`);

process.stdout.write('## Query 1: 2026-05-20 17:00 이후 1,252건 정밀 분석\n\n');
process.stdout.write('| tier | status | row_origin | cnt |\n|---|---|---|---|\n');
for (const r of q1.rows) {
  process.stdout.write(`| ${r.tier} | ${r.status} | ${r.row_origin} | ${r.cnt} |\n`);
}

const q2 = await pool.query(`
  SELECT tier, status, COUNT(*)
  FROM curation_candidates
  WHERE sourced_from='visitjeju'
    AND visitjeju_content_id IS NOT NULL
    AND updated_at < '2026-05-20 17:00:00+09'
  GROUP BY tier, status
  ORDER BY COUNT(*) DESC
`);

process.stdout.write('\n## Query 2: 본 실행 직전 (5-19 적재분, 2,494건)\n\n');
process.stdout.write('| tier | status | count |\n|---|---|---|\n');
for (const r of q2.rows) {
  process.stdout.write(`| ${r.tier} | ${r.status} | ${r.count} |\n`);
}

await pool.end();
