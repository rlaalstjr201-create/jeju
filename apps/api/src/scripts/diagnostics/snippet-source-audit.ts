#!/usr/bin/env tsx
/**
 * snippet-source-audit.ts
 * 알파 1,000건 snippet 소스 품질 진단.
 *
 * 요청 1: source_type 분포 (건수 + 비율)
 * 요청 2: source_type='cafe' snippet 의 spot명 포함률 + 미포함 샘플 20건
 * 요청 3: source_type별 spot명 포함률
 *
 * 실행: npx tsx src/scripts/diagnostics/snippet-source-audit.ts
 */
import { Pool } from 'pg';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

interface SnippetRow {
  snippet_id: string;
  spot_id: string;
  spot_name: string;
  source_type: string;
  source_url: string;
  description: string | null;
  title: string | null;
}

if (!process.env['VITEST']) await (async () => {
  loadEnv();
  const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });

  // 알파 셋 전체 snippet JOIN
  const { rows } = await pool.query<SnippetRow>(`
    SELECT
      ss.id          AS snippet_id,
      ss.spot_id,
      cc.name        AS spot_name,
      ss.source_type,
      ss.source_url,
      ss.description,
      ss.title
    FROM spot_snippets ss
    JOIN curation_candidates cc
      ON cc.id = ss.spot_id
    WHERE cc.selected_tier = 'reference'
  `);

  await pool.end();

  const total = rows.length;
  console.log(`\n[snippet-source-audit] 전체 snippet: ${total}건\n`);

  // ── 요청 1: source_type 분포 ──────────────────────────────────

  const byType: Record<string, number> = {};
  for (const r of rows) {
    byType[r.source_type] = (byType[r.source_type] ?? 0) + 1;
  }

  console.log('=== 요청 1: source_type 분포 ===');
  const sorted = Object.entries(byType).sort((a, b) => b[1] - a[1]);
  for (const [type, cnt] of sorted) {
    const pct = ((cnt / total) * 100).toFixed(1);
    console.log(`  ${type.padEnd(10)}: ${String(cnt).padStart(5)}건  (${pct}%)`);
  }

  // ── 요청 2: cafe snippet 의 spot명 포함률 ──────────────────────

  const cafeRows = rows.filter(r => r.source_type === 'cafe');
  const cafeTotal = cafeRows.length;

  function containsSpotName(row: SnippetRow): boolean {
    const text = (row.description ?? '') + ' ' + (row.title ?? '');
    return text.includes(row.spot_name);
  }

  const cafeHit  = cafeRows.filter(r =>  containsSpotName(r));
  const cafeMiss = cafeRows.filter(r => !containsSpotName(r));

  const cafeHitPct = cafeTotal > 0 ? ((cafeHit.length / cafeTotal) * 100).toFixed(1) : 'N/A';

  console.log(`\n=== 요청 2: source_type='cafe' spot명 포함률 ===`);
  console.log(`  cafe 총 snippet  : ${cafeTotal}건`);
  console.log(`  spot명 포함 (hit): ${cafeHit.length}건  (${cafeHitPct}%)`);
  console.log(`  spot명 미포함    : ${cafeMiss.length}건`);

  const cafeMissSample = cafeMiss.slice(0, 20);
  if (cafeMissSample.length > 0) {
    console.log(`\n  미포함 샘플 (최대 20건):`);
    for (const r of cafeMissSample) {
      const preview = (r.description ?? r.title ?? '').slice(0, 60).replace(/\n/g, ' ');
      console.log(`    snippet=${r.snippet_id}  spot="${r.spot_name}"`);
      console.log(`      desc: ${preview}…`);
    }
  }

  // ── 요청 3: source_type별 spot명 포함률 ───────────────────────

  console.log('\n=== 요청 3: source_type별 spot명 포함률 ===');

  const typeStats: Record<string, { total: number; hit: number }> = {};
  for (const r of rows) {
    if (!typeStats[r.source_type]) typeStats[r.source_type] = { total: 0, hit: 0 };
    typeStats[r.source_type]!.total++;
    if (containsSpotName(r)) typeStats[r.source_type]!.hit++;
  }

  const sortedTypes = Object.entries(typeStats).sort((a, b) => b[1].total - a[1].total);
  console.log(`  ${'source_type'.padEnd(10)}  ${'total'.padStart(6)}  ${'hit'.padStart(5)}  ${'miss'.padStart(5)}  ${'포함률'.padStart(6)}`);
  console.log(`  ${'-'.repeat(46)}`);
  for (const [type, s] of sortedTypes) {
    const pct = ((s.hit / s.total) * 100).toFixed(1);
    const miss = s.total - s.hit;
    console.log(`  ${type.padEnd(10)}  ${String(s.total).padStart(6)}  ${String(s.hit).padStart(5)}  ${String(miss).padStart(5)}  ${pct.padStart(5)}%`);
  }

  // ── 요약 판정 ─────────────────────────────────────────────────

  console.log('\n=== 판정 기준: 포함률 < 50% → 제거 검토 ===');
  for (const [type, s] of sortedTypes) {
    const pct = (s.hit / s.total) * 100;
    if (pct < 50) {
      console.log(`  ⚠  ${type}: ${pct.toFixed(1)}% — 제거 검토 대상`);
    } else {
      console.log(`  OK  ${type}: ${pct.toFixed(1)}%`);
    }
  }
})();
