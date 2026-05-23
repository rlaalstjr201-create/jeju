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

// Query 1: tier counts
const tiers = await pool.query(`SELECT tier, COUNT(*) as n FROM curation_candidates GROUP BY tier ORDER BY n DESC`);
process.stdout.write('=== tier counts ===\n');
for (const r of tiers.rows) process.stdout.write(`  ${String(r.tier ?? 'NULL').padEnd(12)} ${r.n}\n`);

// Query 2: famous spots — fuzzy name match, reference tier only
const fuzzyKeywords = [
  '천지연', '용두암', '한라산', '우도', '성산일출봉', '도두봉', '협재해수욕장', '카멜리아', '만장굴', '주상절리'
];
const conditions = fuzzyKeywords.map((k, i) => `name ILIKE $${i + 1}`).join(' OR ');
const res = await pool.query(`
  SELECT name, tier, visitjeju_content_id, category, lat, lng
  FROM curation_candidates
  WHERE (${conditions}) AND tier = 'reference'
  ORDER BY name
`, fuzzyKeywords.map((k) => `%${k}%`));

process.stdout.write('\n=== famous spots in reference tier (fuzzy name) ===\n');
for (const r of res.rows) {
  const contentid = r.visitjeju_content_id ?? 'no-contentid';
  process.stdout.write(`  ${r.name.padEnd(32)} ${String(contentid).padEnd(30)} cat=${r.category}\n`);
}
process.stdout.write(`\nTotal: ${res.rows.length} spots\n`);

// Query 3: total reference / hidden
process.stdout.write('\n=== reference category breakdown ===\n');
const cats = await pool.query(`SELECT category, COUNT(*) as n FROM curation_candidates WHERE tier='reference' GROUP BY category ORDER BY n DESC`);
for (const r of cats.rows) process.stdout.write(`  ${String(r.category).padEnd(20)} ${r.n}\n`);

// Query 4: invalid category check in reference tier
const invalid = await pool.query(`
  SELECT category, COUNT(*) as n FROM curation_candidates
  WHERE tier='reference' AND category NOT IN ('sightseeing','restaurant','cafe','experience','cultural_space','accommodation','shopping','other')
  GROUP BY category
`);
process.stdout.write(invalid.rows.length > 0
  ? `\n[WARNING] invalid categories in reference: ${JSON.stringify(invalid.rows)}\n`
  : '\n[OK] no invalid categories in reference tier\n');

await pool.end();
