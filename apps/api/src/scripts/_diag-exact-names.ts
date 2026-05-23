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

const targets = [
  '한라산국립공원', '우도(해양도립공원)', '협재해수욕장', '천지연폭포',
  '주상절리대', '카멜리아힐', '만장굴', '성산일출봉', '도두봉',
];

const res = await pool.query(
  `SELECT name, tier, visitjeju_content_id, lat, lng FROM curation_candidates WHERE name = ANY($1) ORDER BY name`,
  [targets],
);

process.stdout.write('=== exact name lookup (9 famous spots) ===\n');
for (const r of res.rows) {
  process.stdout.write(
    `  ${r.name.padEnd(24)} tier=${String(r.tier).padEnd(10)} contentid=${String(r.visitjeju_content_id ?? 'NULL').padEnd(30)} lat=${r.lat} lng=${r.lng}\n`,
  );
}
process.stdout.write(`\nFound: ${res.rows.length}/9\n`);

const missing = targets.filter((t) => !res.rows.find((r) => r.name === t));
if (missing.length) process.stdout.write(`Missing from DB entirely: ${missing.join(', ')}\n`);

const notRef = res.rows.filter((r) => r.tier !== 'reference');
if (notRef.length) {
  process.stdout.write(`\n[WARN] Not in reference tier:\n`);
  for (const r of notRef) process.stdout.write(`  ${r.name} → tier=${r.tier}\n`);
} else if (res.rows.length === 9) {
  process.stdout.write('\n[OK] All 9 spots confirmed in reference tier\n');
}

await pool.end();
