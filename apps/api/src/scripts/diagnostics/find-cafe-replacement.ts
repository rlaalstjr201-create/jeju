#!/usr/bin/env tsx
/**
 * few-shot 예시 2 (카이로스) 교체 후보 탐색.
 * cafe + trend=steady + 키워드 4건 이상 + 명확한 spot명
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

const CAFE_KWS = ['카페', '커피', '디저트', '로스터리', '에스프레소', '라떼', '아메리카노', '베이커리'];

function matchCount(texts: string[]): number {
  return texts.filter(t => CAFE_KWS.some(kw => t.includes(kw))).length;
}

if (!process.env['VITEST']) await (async () => {
  loadEnv();
  const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });

  const { rows: spots } = await pool.query<{ id: string; name: string; region: string; final_score: number }>(
    `SELECT id, name, region, final_score
     FROM curation_candidates
     WHERE selected_tier = 'reference'
       AND category = 'cafe'
       AND trend_category = 'steady'
     ORDER BY final_score DESC`,
  );

  console.log(`[find-cafe] cafe+steady 후보: ${spots.length}건\n`);

  const results: Array<{ name: string; region: string; score: number; matchCount: number; snippets: string[] }> = [];

  for (const spot of spots) {
    const { rows: snips } = await pool.query<{ description: string | null; title: string | null }>(
      `SELECT description, title FROM spot_snippets WHERE spot_id = $1 ORDER BY id LIMIT 5`,
      [spot.id],
    );
    const texts = snips.map(s => s.description ?? s.title ?? '');
    const mc = matchCount(texts);
    if (mc >= 4) {
      results.push({ name: spot.name, region: spot.region, score: spot.final_score, matchCount: mc, snippets: texts });
    }
  }

  console.log(`[find-cafe] 4건 이상 매칭: ${results.length}건\n`);
  for (const r of results) {
    console.log(`[${r.matchCount}매칭] ${r.name} (${r.region}) score=${r.score}`);
    r.snippets.slice(0, 5).forEach((t, i) => {
      console.log(`  [${i + 1}] ${t.replace(/\s+/g, ' ').trim().slice(0, 150)}`);
    });
    console.log('');
  }

  await pool.end();
})();
