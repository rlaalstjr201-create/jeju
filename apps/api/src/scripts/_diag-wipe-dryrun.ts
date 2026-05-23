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
  SELECT COUNT(*) AS visitjeju_total_to_delete
  FROM curation_candidates
  WHERE sourced_from = 'visitjeju'
`);
process.stdout.write('## Q1: 삭제 대상 (sourced_from=visitjeju)\n\n');
process.stdout.write('| visitjeju_total_to_delete |\n|---|\n');
process.stdout.write(`| ${q1.rows[0]!.visitjeju_total_to_delete} |\n\n`);

const q2 = await pool.query(`
  SELECT sourced_from, tier, COUNT(*) AS cnt
  FROM curation_candidates
  WHERE sourced_from != 'visitjeju'
  GROUP BY sourced_from, tier
  ORDER BY cnt DESC
`);
process.stdout.write('## Q2: 보존 대상 (sourced_from != visitjeju)\n\n');
process.stdout.write('| sourced_from | tier | cnt |\n|---|---|---|\n');
for (const r of q2.rows) {
  process.stdout.write(`| ${r.sourced_from} | ${r.tier} | ${r.cnt} |\n`);
}
if (q2.rows.length === 0) process.stdout.write('| (없음) | — | 0 |\n');
process.stdout.write('\n');

const q3 = await pool.query(`
  SELECT COUNT(*) AS contaminated
  FROM curation_candidates
  WHERE sourced_from != 'visitjeju'
    AND visitjeju_content_id IS NOT NULL
`);
const contaminated = parseInt(q3.rows[0]!.contaminated, 10);
process.stdout.write('## Q3: 보존 대상 중 visitjeju_content_id 오염 검출\n\n');
process.stdout.write('| contaminated |\n|---|\n');
process.stdout.write(`| ${contaminated} |\n\n`);
process.stdout.write(contaminated === 0
  ? '> ✅ 오염 없음 — DELETE 안전\n'
  : `> ⚠️ 오염 ${contaminated}건 — 추가 분석 필요\n`);

await pool.end();
