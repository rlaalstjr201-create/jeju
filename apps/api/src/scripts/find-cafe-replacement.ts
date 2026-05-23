#!/usr/bin/env tsx
/**
 * find-cafe-replacement.ts  (read-only)
 *
 * Finds a cafe replacement for few-shot example 2.
 * Criteria:
 *   - category = 'cafe', trend_category = 'steady'
 *   - At least 4 of the top-5 snippets contain cafe-related tokens
 *   - Excludes spots whose name risks ambiguity (카이로스, etc.)
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

const CAFE_TOKENS = /카페|커피|디저트|로스터리|에스프레소|라떼/;
const EXCLUDE_NAMES = ['카이로스'];

if (!process.env['VITEST']) await (async () => {
  loadEnv();
  const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });

  // Pull top 30 steady cafe candidates ordered by final_score desc
  const candidates = await pool.query<{
    id: string; name: string; region: string; final_score: number; trend_category: string;
  }>(
    `SELECT id, name, region, final_score, trend_category
     FROM curation_candidates
     WHERE category = 'cafe'
       AND trend_category = 'steady'
     ORDER BY final_score DESC
     LIMIT 30`,
  );

  for (const spot of candidates.rows) {
    if (EXCLUDE_NAMES.some(n => spot.name.includes(n))) continue;

    const snips = await pool.query<{ source_type: string; title: string | null; description: string | null }>(
      `SELECT source_type, title, description
       FROM spot_snippets
       WHERE spot_id = $1
       ORDER BY source_type, id
       LIMIT 5`,
      [spot.id],
    );

    if (snips.rows.length < 4) continue;

    const cafeHits = snips.rows.filter(s => {
      const text = (s.description ?? s.title ?? '');
      return CAFE_TOKENS.test(text);
    });

    if (cafeHits.length < 4) continue;

    // Found a suitable candidate — print and stop
    console.log(`\n✅ REPLACEMENT CANDIDATE`);
    console.log(`=== ${spot.name} (cafe, ${spot.region}) score=${spot.final_score} trend=${spot.trend_category} ===`);
    snips.rows.forEach((s, i) => {
      const text = (s.description ?? s.title ?? '').replace(/\s+/g, ' ').trim();
      const hit = CAFE_TOKENS.test(text) ? '✓' : '✗';
      console.log(`[${i + 1}] ${hit} (${s.source_type}) ${text.slice(0, 200)}`);
    });
    console.log(`\nCafe keyword hits: ${cafeHits.length}/5`);
    console.log('\n--- JSON template ---');
    console.log(JSON.stringify({
      spot_name: spot.name,
      category: 'cafe',
      region: spot.region,
      trend: spot.trend_category,
      hidden_gem_score: null,
      vibe_tags: [],
      one_line_summary: '',
      comment_ko: '',
    }, null, 2));
    await pool.end();
    return;
  }

  console.log('\n❌ No suitable replacement found in top 30 steady cafe candidates.');
  console.log('Try expanding the pool (increase LIMIT or relax trend filter).\n');
  await pool.end();
})();
