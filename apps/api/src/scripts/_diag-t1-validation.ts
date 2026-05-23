#!/usr/bin/env tsx
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';

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

loadEnv();
const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });

const r1 = await pool.query(`
  SELECT
    COUNT(*) FILTER (WHERE external_links ? 'kakao') AS kakao_matched,
    COUNT(*) AS total,
    COUNT(*) FILTER (WHERE (external_links->'kakao'->>'unverified')::boolean = true) AS unverified
  FROM curation_candidates WHERE sourced_from = 'visitjeju'
`);
const { kakao_matched, total, unverified } = r1.rows[0] as Record<string, string>;
console.log('=== T1 DB 검증 ===');
console.log(`kakao 매칭: ${kakao_matched}/${total} = ${(Number(kakao_matched) / Number(total) * 100).toFixed(1)}%`);
console.log(`kakao_unverified (review_excluded 행): ${unverified}`);
console.log(`coord_restore_candidate: 스크립트 보고 52건`);

const r2 = await pool.query(`
  SELECT name, category, region, subregion, review_excluded,
         lat IS NOT NULL AS has_lat
  FROM curation_candidates
  WHERE sourced_from = 'visitjeju'
    AND NOT (external_links ? 'kakao')
  ORDER BY RANDOM()
  LIMIT 20
`);
console.log('\n=== NO_MATCH 샘플 20건 ===');
for (const r of r2.rows as Array<Record<string, unknown>>) {
  const loc = (r['subregion'] ?? r['region']) as string;
  const flags = [r['review_excluded'] ? 'RE' : '', !r['has_lat'] ? 'null좌표' : ''].filter(Boolean).join(',');
  console.log(` ${r['name']} [${r['category']}/${loc}${flags ? ' ' + flags : ''}]`);
}

const r3 = await pool.query(`
  SELECT category, COUNT(*) AS cnt
  FROM curation_candidates
  WHERE sourced_from = 'visitjeju' AND NOT (external_links ? 'kakao')
  GROUP BY category ORDER BY cnt DESC
`);
console.log('\n=== NO_MATCH 카테고리 분포 ===');
for (const r of r3.rows as Array<Record<string, string>>) console.log(` ${r['category']}: ${r['cnt']}`);

const r4 = await pool.query(`
  SELECT
    COUNT(*) FILTER (WHERE external_links ? 'kakao') AS re_matched,
    COUNT(*) AS re_total
  FROM curation_candidates
  WHERE sourced_from = 'visitjeju' AND review_excluded = true
`);
const { re_matched, re_total } = r4.rows[0] as Record<string, string>;
console.log('\n=== review_excluded 91건 중 ===');
console.log(`Kakao 매칭: ${re_matched}/${re_total} (${(Number(re_matched) / Number(re_total) * 100).toFixed(1)}%)`);

await pool.end();
