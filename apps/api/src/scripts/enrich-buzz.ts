#!/usr/bin/env tsx
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';

interface NaverTotalResponse {
  total: number;
}

export function buildBuzzQuery(name: string): string {
  return `${name} 제주`;
}

function median(arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  }
  return sorted[mid] ?? 0;
}

export function computeStats(counts: number[]): { min: number; max: number; median: number; p95: number } {
  if (counts.length === 0) return { min: 0, max: 0, median: 0, p95: 0 };
  const sorted = [...counts].sort((a, b) => a - b);
  const p95Index = Math.ceil(0.95 * sorted.length) - 1;
  return {
    min: sorted[0] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
    median: median(counts),
    p95: sorted[p95Index] ?? 0,
  };
}

async function fetchNaverTotal(endpoint: string, query: string, headers: Record<string, string>): Promise<number | null> {
  const url = `${endpoint}?query=${encodeURIComponent(query)}&display=1`;
  let delay = 1000;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers });
      if (res.status === 429) {
        await new Promise(r => setTimeout(r, delay));
        delay *= 2;
        continue;
      }
      if (!res.ok) return null;
      const data = await res.json() as NaverTotalResponse;
      return data.total;
    } catch {
      return null;
    }
  }
  return null;
}

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

if (!process.env['VITEST']) await (async () => {
  loadEnv();

  const isDryRun = process.argv.includes('--dry-run');

  const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });

  const clientId = process.env['NAVER_CLIENT_ID'] ?? '';
  const clientSecret = process.env['NAVER_CLIENT_SECRET'] ?? '';
  const naverHeaders: Record<string, string> = {
    'X-Naver-Client-Id': clientId,
    'X-Naver-Client-Secret': clientSecret,
  };

  const BLOG_ENDPOINT = 'https://openapi.naver.com/v1/search/blog';
  const CAFE_ENDPOINT = 'https://openapi.naver.com/v1/search/cafearticle';

  const limitClause = isDryRun ? 'LIMIT 10' : '';
  const { rows } = await pool.query<{ id: number; name: string; category: string }>(
    `SELECT id, name, category FROM curation_candidates WHERE sourced_from = 'visitjeju' ORDER BY id ${limitClause}`,
  );

  const successCounts: number[] = [];
  const categoryMap = new Map<string, number[]>();
  let nullCount = 0;

  for (const row of rows) {
    const query = buildBuzzQuery(row.name);

    const [blogTotal, cafeTotal] = await Promise.all([
      fetchNaverTotal(BLOG_ENDPOINT, query, naverHeaders),
      fetchNaverTotal(CAFE_ENDPOINT, query, naverHeaders),
    ]);

    if (blogTotal === null || cafeTotal === null) {
      if (isDryRun) {
        console.log(`${row.name} → ERROR`);
      } else {
        console.error(`SKIP (null) id=${row.id} name=${row.name}`);
      }
      nullCount++;
      await new Promise(r => setTimeout(r, 100));
      continue;
    }

    const total = blogTotal + cafeTotal;

    if (isDryRun) {
      console.log(`${row.name} → blog=${blogTotal}, cafe=${cafeTotal}, total=${total}`);
    } else {
      await pool.query(
        'UPDATE curation_candidates SET external_buzz_count = $1 WHERE id = $2',
        [total, row.id],
      );
    }

    successCounts.push(total);
    const cat = row.category;
    if (!categoryMap.has(cat)) categoryMap.set(cat, []);
    categoryMap.get(cat)!.push(total);

    await new Promise(r => setTimeout(r, 100));
  }

  const total = rows.length;

  if (isDryRun) {
    const stats = computeStats(successCounts);
    console.log(`\n=== T3 Buzz DRY-RUN 통계 (${total}건) ===`);
    console.log(`  min=${stats.min}, max=${stats.max}, median=${stats.median}`);
    console.log(`  NULL: ${nullCount}건`);
  } else {
    const stats = computeStats(successCounts);
    const outliers = successCounts.filter(c => c > 10000).length;
    console.log(`\n=== T3 Buzz 통계 ===`);
    console.log(`  총 처리: ${total}건`);
    console.log(`  성공: ${successCounts.length}건`);
    console.log(`  NULL (실패): ${nullCount}건`);
    console.log(`  min=${stats.min}, max=${stats.max}, median=${stats.median}, p95=${stats.p95}`);
    console.log(`  >10000 (이상치): ${outliers}건`);
    console.log(`  카테고리별 median:`);
    for (const cat of ['restaurant', 'cafe', 'sightseeing', 'experience', 'cultural_space']) {
      const counts = categoryMap.get(cat) ?? [];
      const med = counts.length > 0 ? median(counts) : 0;
      console.log(`    ${cat}: ${med}`);
    }
  }

  await pool.end();
})();
