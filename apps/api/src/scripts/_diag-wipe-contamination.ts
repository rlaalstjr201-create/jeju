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

const res = await pool.query(`
  SELECT id, name, sourced_from, tier, status,
         visitjeju_content_id,
         created_at, updated_at
  FROM curation_candidates
  WHERE sourced_from != 'visitjeju'
    AND visitjeju_content_id IS NOT NULL
  ORDER BY updated_at DESC
`);

process.stdout.write('## 오염 9건 상세\n\n');
process.stdout.write('| name | sourced_from | tier | status | visitjeju_content_id | created_at | updated_at |\n');
process.stdout.write('|---|---|---|---|---|---|---|\n');
for (const r of res.rows) {
  process.stdout.write(`| ${r.name} | ${r.sourced_from} | ${r.tier} | ${r.status} | ${r.visitjeju_content_id} | ${String(r.created_at).slice(0,19)} | ${String(r.updated_at).slice(0,19)} |\n`);
}

await pool.end();
