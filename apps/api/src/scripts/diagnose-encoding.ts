/**
 * diagnose-encoding.ts — Task 2: Encoding/typo diagnosis on naver_snippet.
 *
 * Checks for HTML entities, mojibake, and other artifacts in stored snippets.
 * For 3 sample cases with issues, fetches source URL to determine if it's
 * a raw Naver issue or introduced by the adapter.
 */
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
  try {
    // 1. Schema introspection
    const schema = await pool.query(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_name='curation_candidates' ORDER BY ordinal_position"
    );
    console.log('=== curation_candidates columns ===');
    schema.rows.forEach((r) => console.log(' ', r.column_name, ':', r.data_type));

    // 2. Total rows and source breakdown
    const total = await pool.query('SELECT COUNT(*) FROM curation_candidates');
    const bySource = await pool.query("SELECT source_type, COUNT(*) FROM curation_candidates GROUP BY source_type ORDER BY COUNT(*) DESC");
    console.log('\n=== Record counts ===');
    console.log('Total:', total.rows[0].count);
    bySource.rows.forEach((r) => console.log(' ', r.source_type ?? 'null', ':', r.count));

    // 3. Detect column names for snippet and url fields
    const cols = schema.rows.map((r: { column_name: string }) => r.column_name);
    const snippetCol = cols.find((c: string) => c.includes('snippet') || c === 'naver_snippet');
    const urlCol = cols.find((c: string) => c.includes('source_url') || c.includes('url'));
    const idCol = cols.find((c: string) => c === 'id' || c === 'candidate_id');
    console.log('\n=== Key columns ===');
    console.log('snippet:', snippetCol, '| url:', urlCol, '| id:', idCol);

    if (!snippetCol) {
      console.log('No snippet column found — checking all text columns...');
      const textCols = await pool.query(
        "SELECT column_name FROM information_schema.columns WHERE table_name='curation_candidates' AND data_type IN ('text','character varying') ORDER BY ordinal_position"
      );
      textCols.rows.forEach((r: { column_name: string }) => console.log(' ', r.column_name));
      return;
    }

    // 4. Check for HTML entities (primary encoding artifact from Naver API)
    const htmlEntityPatterns = [
      { name: '&amp;', sql: `${snippetCol} LIKE '%&amp;%'` },
      { name: '&lt; / &gt;', sql: `${snippetCol} LIKE '%&lt;%' OR ${snippetCol} LIKE '%&gt;%'` },
      { name: '&quot;', sql: `${snippetCol} LIKE '%&quot;%'` },
      { name: '&nbsp;', sql: `${snippetCol} LIKE '%&nbsp;%'` },
      { name: '<b> tag', sql: `${snippetCol} LIKE '%<b>%' OR ${snippetCol} LIKE '%</b>%'` },
    ];

    console.log('\n=== HTML entity / tag artifacts in naver snippets ===');
    for (const p of htmlEntityPatterns) {
      const r = await pool.query(
        `SELECT COUNT(*) FROM curation_candidates WHERE source_type='naver' AND (${p.sql})`
      );
      console.log(` "${p.name}": ${r.rows[0].count} rows`);
    }

    // 5. Check for common Korean encoding artifacts
    // 흨 is sometimes seen in Naver titles when adjacent chars are garbled
    const koreanArtifacts = [
      { name: '흨 (garbled?)', sql: `${snippetCol} LIKE '%흨%'` },
      { name: '뢈 (garbled?)', sql: `${snippetCol} LIKE '%뢈%'` },
    ];

    console.log('\n=== Korean encoding artifacts ===');
    for (const p of koreanArtifacts) {
      const r = await pool.query(
        `SELECT COUNT(*) FROM curation_candidates WHERE source_type='naver' AND (${p.sql})`
      );
      console.log(` "${p.name}": ${r.rows[0].count} rows`);
    }

    // 6. Fetch 3 sample cases with HTML entity issues to compare with source
    const entityCol = `${snippetCol} LIKE '%&amp;%' OR ${snippetCol} LIKE '%&lt;%' OR ${snippetCol} LIKE '%&gt;%' OR ${snippetCol} LIKE '%&quot;%'`;
    const sampleCols = [idCol, snippetCol, 'naver_source_url'].filter(Boolean).join(', ');
    const samples = await pool.query(
      `SELECT ${sampleCols} FROM curation_candidates WHERE source_type='naver' AND (${entityCol}) LIMIT 3`
    );

    if (samples.rows.length === 0) {
      console.log('\n=== No HTML-entity samples found — trying random naver snippet sample ===');
      const rand = await pool.query(
        `SELECT ${sampleCols} FROM curation_candidates WHERE source_type='naver' AND ${snippetCol} IS NOT NULL ORDER BY RANDOM() LIMIT 3`
      );
      console.log('Sample snippets:');
      rand.rows.forEach((r, i) => {
        const snippet = r[snippetCol!] as string;
        console.log(`\n[${i + 1}] id=${r[idCol!]}`);
        console.log('  Snippet:', snippet?.slice(0, 200));
        console.log('  URL:', r[urlCol!]);
      });
    } else {
      console.log(`\n=== ${samples.rows.length} HTML-entity samples — fetching source URLs ===`);
      for (const [i, row] of samples.rows.entries()) {
        const snippet = row[snippetCol!] as string;
        const url = row['naver_source_url'] as string;
        console.log(`\n[${i + 1}] id=${row[idCol!]}`);
        console.log('  Stored snippet:', snippet?.slice(0, 200));
        console.log('  Source URL:', url);

        if (url) {
          try {
            const res = await fetch(url, {
              headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JejuBot/1.0)' },
              signal: AbortSignal.timeout(8000),
            });
            const text = await res.text();
            // Look for the snippet text in the raw HTML (first 200 chars around it)
            const snippetStart = snippet?.slice(0, 20).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
            const idx = snippetStart ? text.indexOf(snippetStart) : -1;
            if (idx >= 0) {
              console.log('  Raw HTML context:', text.slice(Math.max(0, idx - 20), idx + 150).replace(/\n/g, ' '));
              console.log('  VERDICT: artifact likely introduced by our adapter (HTML entities in raw HTML)');
            } else {
              console.log('  Snippet not found in raw HTML (JS-rendered or blocked)');
              console.log('  Status:', res.status, 'Content-type:', res.headers.get('content-type')?.slice(0, 40));
            }
          } catch (err) {
            console.log('  Fetch failed:', (err as Error).message);
          }
        }
      }
    }

  } finally {
    await pool.end();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
