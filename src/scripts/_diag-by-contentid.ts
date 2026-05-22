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

const cids = [
  'CONT_000000000500182', // 만장굴
  'CNTS_000000000020476', // 주상절리대
  'CONT_000000000500618', // 천지연폭포
  'CONT_000000000500469', // 용두암
  'CONT_000000000500270', // 비자림
  'CONT_000000000500697', // 협재해수욕장
  'CNTS_000000000001195', // 카멜리아힐
  'CONT_000000000500349', // 성산일출봉
];

process.stdout.write('=== by visitjeju_content_id ===\n');
const r1 = await pool.query(
  `SELECT name, tier, visitjeju_content_id, lat, lng FROM curation_candidates WHERE visitjeju_content_id = ANY($1) ORDER BY name`,
  [cids],
);
for (const r of r1.rows) {
  process.stdout.write(`  ${r.name.padEnd(28)} tier=${String(r.tier).padEnd(12)} ${r.visitjeju_content_id}\n`);
}
process.stdout.write(`Found: ${r1.rows.length}/${cids.length}\n`);

const foundCids = new Set(r1.rows.map((r) => r.visitjeju_content_id));
const missingCids = cids.filter((c) => !foundCids.has(c));
if (missingCids.length) process.stdout.write(`Missing contentids: ${missingCids.join(', ')}\n`);

process.stdout.write('\n=== fuzzy name search (만장굴/주상절리/천지연/협재/카멜리아) ===\n');
const r2 = await pool.query(`
  SELECT name, tier, visitjeju_content_id FROM curation_candidates
  WHERE name ILIKE '%만장굴%' OR name ILIKE '%주상절리%'
     OR name ILIKE '%천지연%' OR name ILIKE '%협재%' OR name ILIKE '%카멜리아%'
  ORDER BY tier, name
`);
for (const r of r2.rows) {
  process.stdout.write(`  ${r.name.padEnd(32)} tier=${String(r.tier).padEnd(12)} ${r.visitjeju_content_id ?? 'NULL'}\n`);
}

await pool.end();
