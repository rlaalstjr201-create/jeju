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
  SELECT MIN(updated_at) AS earliest, MAX(updated_at) AS latest, COUNT(*)
  FROM curation_candidates
  WHERE sourced_from='visitjeju' AND visitjeju_content_id IS NOT NULL
`);

process.stdout.write('## Query 1: sourced_from=visitjeju AND content_id IS NOT NULL\n\n');
process.stdout.write('| earliest | latest | count |\n|---|---|---|\n');
const r = q1.rows[0]!;
process.stdout.write(`| ${r.earliest} | ${r.latest} | ${r.count} |\n\n`);

const q2 = await pool.query(`
  SELECT DATE_TRUNC('hour', updated_at) AS hour_bucket, COUNT(*)
  FROM curation_candidates
  WHERE sourced_from='visitjeju' AND visitjeju_content_id IS NOT NULL
  GROUP BY hour_bucket
  ORDER BY hour_bucket DESC
  LIMIT 20
`);

process.stdout.write('## Query 2: 시간대별 버킷 (최근 20)\n\n');
process.stdout.write('| hour_bucket | count |\n|---|---|\n');
for (const row of q2.rows) {
  process.stdout.write(`| ${row.hour_bucket} | ${row.count} |\n`);
}

await pool.end();
