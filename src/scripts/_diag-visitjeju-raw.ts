#!/usr/bin/env tsx
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

const url = `https://api.visitjeju.net/vsjApi/contents/searchList?locale=kr&apiKey=${process.env['VISITJEJU_API_KEY']}&category=c1&pageSize=5&page=1`;
const res = await fetch(url);
const data = await res.json() as { totalCount: number; items: Record<string, unknown>[] };

process.stdout.write(`totalCount: ${data.totalCount}\n\n`);

for (let i = 0; i < data.items.length; i++) {
  const item = data.items[i]!;
  process.stdout.write(`=== item[${i}]: ${String(item['title'])} ===\n`);
  process.stdout.write(`  contentsid:   ${String(item['contentsid'])}\n`);
  process.stdout.write(`  contentscd:   ${JSON.stringify(item['contentscd'])}\n`);
  process.stdout.write(`  region1cd:    ${JSON.stringify(item['region1cd'])}\n`);
  process.stdout.write(`  latitude:     ${String(item['latitude'])}\n`);
  process.stdout.write(`  longitude:    ${String(item['longitude'])}\n`);
  const intro = item['introduction'] as string | undefined;
  process.stdout.write(`  introduction: [${intro?.length ?? 0}자] ${intro ? intro.slice(0, 80) : '(empty)'}\n`);
  process.stdout.write(`  tag:          ${String(item['tag'])}\n`);
  process.stdout.write(`  repPhoto raw: ${JSON.stringify(item['repPhoto']).slice(0, 200)}\n`);
  process.stdout.write('\n');
}

// 통계: introduction·repPhoto 빈도
const statsUrl = `https://api.visitjeju.net/vsjApi/contents/searchList?locale=kr&apiKey=${process.env['VISITJEJU_API_KEY']}&category=c1&pageSize=100&page=1`;
const statsRes = await fetch(statsUrl);
const statsData = await statsRes.json() as { items: Record<string, unknown>[] };

let hasIntro = 0, emptyIntro = 0, hasPhoto = 0, noPhoto = 0;
for (const item of statsData.items) {
  const intro = item['introduction'] as string | undefined;
  if (intro && intro.length > 0) hasIntro++; else emptyIntro++;
  const rp = item['repPhoto'] as { photoid?: unknown } | null;
  if (rp && rp.photoid) hasPhoto++; else noPhoto++;
}

process.stdout.write(`=== 첫 100건 통계 ===\n`);
process.stdout.write(`introduction 있음: ${hasIntro} / 없거나 빈 값: ${emptyIntro}\n`);
process.stdout.write(`repPhoto.photoid 있음: ${hasPhoto} / 없음: ${noPhoto}\n`);
