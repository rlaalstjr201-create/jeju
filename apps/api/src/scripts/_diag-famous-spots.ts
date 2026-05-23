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

// Check specific contentsids
const ids = [
  'CONT_000000000500697',  // 협재해수욕장
  'CNTS_000000000001195',  // 카멜리아힐
  'CONT_000000000500182',  // 만장굴
  'CNTS_000000000020476',  // 주상절리대
  'CONT_000000000500143',  // 도두봉
  'CONT_000000000500270',  // 비자림
  'CONT_000000000500685',  // 한라산
  'CONT_000000000500477',  // 우도
];

const res = await pool.query(`
  SELECT name, visitjeju_content_id, tier, sourced_from
  FROM curation_candidates
  WHERE visitjeju_content_id = ANY($1::text[])
  ORDER BY name
`, [ids]);

process.stdout.write('=== In DB ===\n');
const foundIds = new Set(res.rows.map((r) => r.visitjeju_content_id));
for (const r of res.rows) {
  process.stdout.write(`${r.name.padEnd(30)} ${r.visitjeju_content_id.padEnd(35)} tier=${r.tier}\n`);
}
process.stdout.write('\n=== Not in DB ===\n');
for (const id of ids) {
  if (!foundIds.has(id)) process.stdout.write(`${id}\n`);
}

await pool.end();
