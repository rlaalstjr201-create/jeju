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
      const k = t.slice(0, eq).trim(), v = t.slice(eq + 1).trim();
      if (k && !(k in process.env)) process.env[k] = v;
    }
  } catch { /* no .env */ }
}
loadEnv();

async function main() {
  const pool = new Pool({ connectionString: process.env['DATABASE_URL'] ?? '' });
  // Cutoff = when the full run started (approx 18:28 KST = 09:28 UTC)
  const cutoff = '2026-05-19 09:28:00';

  try {
    // 1. HTML entity traces in spot name field
    const entityInName = await pool.query(`
      SELECT COUNT(*) as cnt FROM curation_candidates
      WHERE source_type='naver' AND created_at > $1
        AND (name LIKE '%&amp;%' OR name LIKE '%&lt;%' OR name LIKE '%&gt;%'
             OR name LIKE '%&quot;%' OR name LIKE '%&#%')
    `, [cutoff]);
    console.log('1. HTML entity traces in name:', entityInName.rows[0].cnt, 'rows');

    // 2. HTML entity in naver_snippet (sent to LLM — impact check)
    const entityInSnippet = await pool.query(`
      SELECT COUNT(*) as cnt FROM curation_candidates
      WHERE source_type='naver' AND created_at > $1
        AND (naver_snippet LIKE '%&amp;%' OR naver_snippet LIKE '%&lt;%'
             OR naver_snippet LIKE '%&quot;%')
    `, [cutoff]);
    console.log('2. HTML entity in snippet (LLM input):',
      entityInSnippet.rows[0].cnt, 'rows (out of new records)');

    // 3. Total new records breakdown
    const newTotals = await pool.query(`
      SELECT
        COUNT(*) as total_new,
        COUNT(*) FILTER(WHERE verified_by IS NOT NULL) as verified,
        COUNT(*) FILTER(WHERE name='null') as null_names,
        COUNT(*) FILTER(WHERE name!='null' AND verified_by IS NULL) as unverified_with_name
      FROM curation_candidates
      WHERE source_type='naver' AND created_at > $1
    `, [cutoff]);
    const t = newTotals.rows[0];
    console.log('3. New records total:', t.total_new);
    console.log('   verified:', t.verified, '| null_names:', t.null_names, '| unverified_with_name:', t.unverified_with_name);

    // 4. verified_by breakdown for new records
    const verBreak = await pool.query(`
      SELECT verified_by, COUNT(*) as cnt FROM curation_candidates
      WHERE source_type='naver' AND created_at > $1 AND verified_by IS NOT NULL
      GROUP BY verified_by ORDER BY cnt DESC
    `, [cutoff]);
    console.log('4. Verified_by breakdown (new):');
    verBreak.rows.forEach(r => console.log('  ', r.verified_by ?? 'null', ':', r.cnt));

    // 5. Hallucination suspect: name != null AND verified_by IS NULL (saved but unverified)
    // These should NOT be in the queue (export filters them) but let's see
    const halluSusp = await pool.query(`
      SELECT name, naver_snippet FROM curation_candidates
      WHERE source_type='naver' AND created_at > $1
        AND name != 'null' AND verified_by IS NULL
      ORDER BY RANDOM() LIMIT 3
    `, [cutoff]);
    console.log('5. Unverified-with-name (hallucination risk, NOT in queue):');
    halluSusp.rows.forEach(r =>
      console.log(`  name=${r.name} | snippet=${r.naver_snippet?.slice(0, 80)}`));

    // 6. Random 5 spot names from verified new records
    const sample5 = await pool.query(`
      SELECT name, verified_by, naver_snippet FROM curation_candidates
      WHERE source_type='naver' AND created_at > $1
        AND name != 'null' AND verified_by IS NOT NULL
      ORDER BY RANDOM() LIMIT 5
    `, [cutoff]);
    console.log('6. Random 5 verified spot names (new):');
    sample5.rows.forEach((r, i) =>
      console.log(`  [${i+1}] ${r.name} | ${r.verified_by} | ${r.naver_snippet?.slice(0, 70)}`));

  } finally {
    await pool.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
