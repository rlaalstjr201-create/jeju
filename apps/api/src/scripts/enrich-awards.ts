#!/usr/bin/env tsx
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { NaverSearchAdapter } from '../infrastructure/naver/NaverSearchAdapter.js';

// ── Award patterns ──────────────────────────────────────────────────

const AWARD_PATTERNS = [
  { pattern: /블루리본/, code: 'blue_ribbon' },
  { pattern: /[1-3]리본/, code: 'blue_ribbon_star' },
  { pattern: /미쉐린|미슐랭/, code: 'michelin' },
  { pattern: /미쉐린\s*스타|미슐랭\s*스타/, code: 'michelin_star' },
  { pattern: /빕\s*그루망|Bib\s*Gourmand/i, code: 'bib_gourmand' },
  { pattern: /백년가게/, code: 'baeknyeon_gaje' },
  { pattern: /한국관광\s*100선/, code: 'korea_top100' },
] as const;

const MICHELIN_FALSE_POSITIVE = /타이어|자동차|차량|바퀴|정비/;
const MICHELIN_CODES = new Set(['michelin', 'michelin_star']);

// ── Pure exported functions ─────────────────────────────────────────

export function extractAwards(text: string): string[] {
  const found = new Set<string>();

  for (const { pattern, code } of AWARD_PATTERNS) {
    const match = pattern.exec(text);
    if (!match) continue;

    if (MICHELIN_CODES.has(code)) {
      const start = Math.max(0, match.index - 30);
      const end = Math.min(text.length, match.index + match[0].length + 30);
      const context = text.slice(start, end);
      if (MICHELIN_FALSE_POSITIVE.test(context)) continue;
    }

    found.add(code);
  }

  return [...found];
}

export function mergeAwards(existing: string[], newAwards: string[]): string[] {
  return [...new Set([...existing, ...newAwards])];
}

// ── Env loader ──────────────────────────────────────────────────────

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

// ── Retry wrapper ───────────────────────────────────────────────────

async function searchBlogWithRetry(
  naver: NaverSearchAdapter,
  query: string,
  display: number,
): ReturnType<NaverSearchAdapter['searchBlog']> {
  let delay = 1000;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await naver.searchBlog(query, display);
    } catch (err) {
      const is429 = err instanceof Error && err.message.includes('429');
      if (!is429 || attempt === 2) throw err;
      await new Promise(r => setTimeout(r, delay));
      delay *= 2;
    }
  }
  throw new Error('unreachable');
}

// ── Main ────────────────────────────────────────────────────────────

if (!process.env['VITEST']) await (async () => {
  loadEnv();

  const dryRun = process.argv.includes('--dry-run');

  const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });

  const naver = new NaverSearchAdapter({
    clientId: process.env['NAVER_CLIENT_ID']!,
    clientSecret: process.env['NAVER_CLIENT_SECRET']!,
  });

  const SANITY_NAMES = new Set(['올레국수', '협재수우동']);

  const baseWhere = `WHERE sourced_from = 'visitjeju'`;
  const limitedQuery = dryRun
    ? `SELECT id, name, category, awards_hint FROM curation_candidates ${baseWhere} ORDER BY id LIMIT 10`
    : `SELECT id, name, category, awards_hint FROM curation_candidates ${baseWhere} ORDER BY id`;

  const { rows } = await pool.query<{
    id: string; name: string; category: string; awards_hint: string[] | null;
  }>(limitedQuery);

  let totalProcessed = 0;
  let totalWithAwards = 0;
  let totalErrors = 0;
  const patternCounts: Record<string, number> = {};
  const catAwardCounts: Record<string, number> = {};

  // FP sample: collect matched snippets for manual inspection
  const fpSamples: Array<{
    name: string; category: string; awards: string[]; snippet: string;
  }> = [];

  // Sanity check tracking
  const sanityResults: Record<string, string[]> = {};

  for (const row of rows) {
    totalProcessed++;

    try {
      const result = await searchBlogWithRetry(naver, `${row.name} 제주`, 5);

      const combinedText = result.items
        .map((item) => `${item.title} ${item.description}`)
        .join(' ');

      const newAwards = extractAwards(combinedText);
      const existing = row.awards_hint ?? [];
      const merged = mergeAwards(existing, newAwards);

      for (const code of newAwards) {
        patternCounts[code] = (patternCounts[code] ?? 0) + 1;
      }

      if (merged.length > 0) {
        catAwardCounts[row.category] = (catAwardCounts[row.category] ?? 0) + 1;

        // Collect snippet context for first matched pattern
        const firstPattern = AWARD_PATTERNS.find(({ pattern }) => pattern.test(combinedText));
        if (firstPattern) {
          const match = firstPattern.pattern.exec(combinedText)!;
          const start = Math.max(0, match.index - 30);
          const end = Math.min(combinedText.length, match.index + match[0].length + 30);
          fpSamples.push({
            name: row.name,
            category: row.category,
            awards: merged,
            snippet: `…${combinedText.slice(start, end)}…`,
          });
        }
      }

      if (SANITY_NAMES.has(row.name)) {
        sanityResults[row.name] = merged;
      }

      if (dryRun) {
        if (merged.length > 0) {
          console.log(`${row.name} → awards: [${merged.join(', ')}]`);
        } else {
          console.log(`${row.name} → (no awards)`);
        }
      } else if (merged.length > 0) {
        await pool.query(
          `UPDATE curation_candidates SET awards_hint = $1::text[] WHERE id = $2`,
          [merged, row.id],
        );
      }

      if (merged.length > 0) totalWithAwards++;
    } catch (err) {
      totalErrors++;
      console.error(`ERROR processing ${row.name}:`, err);
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  // Final DB stats (full-run only)
  let dbAwardsCount = 0;
  let dbTotal = 0;
  if (!dryRun) {
    const { rows: dbStats } = await pool.query<{ awards_count: string; total: string }>(`
      SELECT
        COUNT(*) FILTER (WHERE awards_hint IS NOT NULL AND array_length(awards_hint,1) > 0) AS awards_count,
        COUNT(*) AS total
      FROM curation_candidates WHERE sourced_from = 'visitjeju'
    `);
    dbAwardsCount = Number(dbStats[0]!.awards_count);
    dbTotal = Number(dbStats[0]!.total);
  }

  await pool.end();

  console.log('\n=== T2 Awards 통계 ===');
  console.log(`  총 처리: ${totalProcessed}건`);
  console.log(`  awards 있는 건: ${totalWithAwards}건 (${(totalWithAwards / totalProcessed * 100).toFixed(1)}%)`);
  if (!dryRun) {
    console.log(`  DB 저장 후 awards_hint 보유: ${dbAwardsCount}/${dbTotal} (${(dbAwardsCount / dbTotal * 100).toFixed(1)}%)`);
  }

  console.log('\n  패턴별 매칭:');
  for (const { code } of AWARD_PATTERNS) {
    console.log(`    ${code}: ${patternCounts[code] ?? 0}건`);
  }
  console.log(`  ERROR: ${totalErrors}건`);

  console.log('\n  카테고리별 awards 매칭:');
  for (const [cat, cnt] of Object.entries(catAwardCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${cat}: ${cnt}건`);
  }

  // FP sample: first 10 (already ordered by processing — representative sample)
  console.log('\n=== False Positive 의심 샘플 (최대 10건, snippet ±30자) ===');
  for (const s of fpSamples.slice(0, 10)) {
    console.log(`  [${s.category}] "${s.name}" → [${s.awards.join(', ')}]`);
    console.log(`    "${s.snippet}"`);
  }

  console.log('\n=== Sanity Check ===');
  for (const name of SANITY_NAMES) {
    const result = sanityResults[name];
    if (result === undefined) {
      console.log(`  ${name}: 미처리 (쿼리 범위 밖 또는 dry-run LIMIT)`);
    } else if (result.length > 0) {
      console.log(`  ${name}: ✅ [${result.join(', ')}]`);
    } else {
      console.log(`  ${name}: ❌ awards 없음`);
    }
  }
})();
