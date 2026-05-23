#!/usr/bin/env tsx
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { VisitjejuAdapter } from '../infrastructure/visitjeju/VisitjejuAdapter.js';

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
const adapter = new VisitjejuAdapter({ apiKey: process.env['VISITJEJU_API_KEY']! });

// Fetch actual VisitJeju coords for famous spots
const FAMOUS: Record<string, string> = {
  'CONT_000000000500618': '천지연폭포',
  'CONT_000000000500469': '용두암',
  'CONT_000000000500349': '성산일출봉',
  'CONT_000000000500697': '협재해수욕장',
  'CNTS_000000000001195': '카멜리아힐',
  'CONT_000000000500182': '만장굴',
  'CNTS_000000000020476': '주상절리대',
};

type FetchedSpot = { name: string; lat: number; lng: number };
const fetched = new Map<string, FetchedSpot>();

process.stdout.write('Fetching actual API coords for famous spots...\n');
for await (const spot of adapter.fetchAll({ category: 'c1', pageSize: 100 })) {
  if (FAMOUS[spot.contentsid]) {
    fetched.set(spot.contentsid, { name: FAMOUS[spot.contentsid]!, lat: parseFloat(spot.latitude), lng: parseFloat(spot.longitude) });
  }
}
for await (const spot of adapter.fetchAll({ category: 'c4', pageSize: 100 })) {
  if (FAMOUS[spot.contentsid]) {
    fetched.set(spot.contentsid, { name: FAMOUS[spot.contentsid]!, lat: parseFloat(spot.latitude), lng: parseFloat(spot.longitude) });
  }
}

process.stdout.write('\n=== DB entries within 150m of actual API coords ===\n\n');

for (const [cid, f] of fetched) {
  const res = await pool.query(`
    SELECT name, tier, visitjeju_content_id, lat, lng,
      ROUND(
        111320 * SQRT(
          POWER(lat - $1, 2) + POWER((lng - $2) * COS(RADIANS($1)), 2)
        )
      ) as dist_m
    FROM curation_candidates
    WHERE ABS(lat - $1) < 0.002 AND ABS(lng - $2) < 0.002
    ORDER BY dist_m
    LIMIT 5
  `, [f.lat, f.lng]);

  process.stdout.write(`[${f.name}] API coords=(${f.lat.toFixed(5)}, ${f.lng.toFixed(5)})\n`);
  if (res.rows.length === 0) {
    process.stdout.write('  → no entries within ~200m\n');
  } else {
    for (const r of res.rows) {
      process.stdout.write(`  ${r.dist_m}m  ${r.name.padEnd(30)} tier=${String(r.tier).padEnd(12)} cid=${r.visitjeju_content_id ?? 'NULL'}\n`);
    }
  }
  process.stdout.write('\n');
}

await pool.end();
