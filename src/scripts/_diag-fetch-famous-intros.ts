#!/usr/bin/env tsx
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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

const FAMOUS: Record<string, string> = {
  'CONT_000000000500618': '천지연폭포',
  'CONT_000000000500469': '용두암',
  'CONT_000000000500685': '한라산국립공원',
  'CONT_000000000500477': '우도(해양도립공원)',
  'CONT_000000000500349': '성산일출봉',
  'CONT_000000000500143': '도두봉',
  'CONT_000000000500270': '비자림',
  'CONT_000000000500697': '협재해수욕장',
  'CNTS_000000000001195': '카멜리아힐',
  'CONT_000000000500182': '만장굴',
  'CNTS_000000000020476': '주상절리대',
};

const adapter = new VisitjejuAdapter({ apiKey: process.env['VISITJEJU_API_KEY']! });

const results = new Map<string, { title: string; introLen: number; hasCoords: boolean }>();

process.stdout.write('Scanning c1 spots for famous IDs...\n');
let c1Count = 0;
for await (const spot of adapter.fetchAll({ category: 'c1', pageSize: 100 })) {
  c1Count++;
  if (FAMOUS[spot.contentsid]) {
    results.set(spot.contentsid, {
      title: spot.title,
      introLen: (spot.introduction ?? '').length,
      hasCoords: !!(spot.latitude && spot.longitude && !isNaN(parseFloat(spot.latitude)) && !isNaN(parseFloat(spot.longitude))),
    });
  }
}
process.stdout.write(`c1 done: ${c1Count} spots scanned\n`);

process.stdout.write('Scanning c4 spots for famous IDs...\n');
let c4Count = 0;
for await (const spot of adapter.fetchAll({ category: 'c4', pageSize: 100 })) {
  c4Count++;
  if (FAMOUS[spot.contentsid]) {
    results.set(spot.contentsid, {
      title: spot.title,
      introLen: (spot.introduction ?? '').length,
      hasCoords: !!(spot.latitude && spot.longitude && !isNaN(parseFloat(spot.latitude)) && !isNaN(parseFloat(spot.longitude))),
    });
  }
}
process.stdout.write(`c4 done: ${c4Count} spots scanned\n\n`);

process.stdout.write('=== Famous spot intro lengths (threshold=30) ===\n');
for (const [cid, name] of Object.entries(FAMOUS)) {
  const r = results.get(cid);
  if (!r) {
    process.stdout.write(`  ${name.padEnd(20)} ${cid}  NOT FOUND in API\n`);
  } else {
    const status = !r.hasCoords ? 'NO_COORDS' : r.introLen >= 30 ? 'PASS' : 'FILTERED (needs whitelist)';
    process.stdout.write(`  ${name.padEnd(20)} intro=${String(r.introLen).padEnd(4)} coords=${r.hasCoords}  → ${status}\n`);
  }
}
