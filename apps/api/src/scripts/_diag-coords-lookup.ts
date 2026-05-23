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

// Famous spot approximate coords from VisitJeju
const targets = [
  { name: '천지연폭포', lat: 33.2515, lng: 126.5195, cid: 'CONT_000000000500618' },
  { name: '용두암', lat: 33.5159, lng: 126.4970, cid: 'CONT_000000000500469' },
  { name: '성산일출봉', lat: 33.4591, lng: 126.9405, cid: 'CONT_000000000500349' },
  { name: '협재해수욕장', lat: 33.3941, lng: 126.2393, cid: 'CONT_000000000500697' },
  { name: '카멜리아힐', lat: 33.2546, lng: 126.3614, cid: 'CNTS_000000000001195' },
  { name: '만장굴', lat: 33.5282, lng: 126.7714, cid: 'CONT_000000000500182' },
  { name: '주상절리대', lat: 33.2408, lng: 126.4233, cid: 'CNTS_000000000020476' },
  { name: '비자림', lat: 33.4846, lng: 126.7284, cid: 'CONT_000000000500270' },
];

process.stdout.write('=== reference-tier entries within 500m of famous spots ===\n\n');

for (const t of targets) {
  // 0.005° ≈ 500m
  const res = await pool.query(`
    SELECT name, tier, visitjeju_content_id, lat, lng,
      ROUND(
        111320 * SQRT(
          POWER(lat - $1, 2) + POWER((lng - $2) * COS(RADIANS($1)), 2)
        )
      ) as dist_m
    FROM curation_candidates
    WHERE ABS(lat - $1) < 0.005 AND ABS(lng - $2) < 0.005
    ORDER BY dist_m
    LIMIT 5
  `, [t.lat, t.lng]);

  process.stdout.write(`[${t.name}] (expected cid=${t.cid})\n`);
  if (res.rows.length === 0) {
    process.stdout.write('  → no entries within ~500m\n');
  } else {
    for (const r of res.rows) {
      process.stdout.write(`  ${r.dist_m}m  ${r.name.padEnd(30)} tier=${String(r.tier).padEnd(12)} ${r.visitjeju_content_id ?? 'NULL'}\n`);
    }
  }
  process.stdout.write('\n');
}

await pool.end();
