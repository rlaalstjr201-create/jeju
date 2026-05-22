import { readFileSync } from 'node:fs';
import { Pool } from 'pg';

const lines = readFileSync('.env', 'utf-8').split('\n');
for (const line of lines) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const eq = t.indexOf('=');
  if (eq === -1) continue;
  const k = t.slice(0, eq).trim();
  const v = t.slice(eq + 1).trim();
  if (k && !(k in process.env)) process.env[k] = v;
}

const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });
const client = await pool.connect();
try {
  const r = await client.query(`
    SELECT
      name,
      status,
      round(authenticity_score::numeric, 2) AS auth,
      round(ordinariness_score::numeric, 2) AS ord,
      verified_by,
      substring(sourced_from, 7) AS query,
      substring(naver_source_url, 1, 50) AS url_prefix,
      substring(naver_snippet, 1, 80) AS snippet_peek
    FROM curation_candidates
    WHERE source_type = 'naver'
      AND review_excluded = FALSE
      AND created_at > NOW() - INTERVAL '15 minutes'
    ORDER BY auth DESC NULLS LAST, ord ASC NULLS LAST
  `);
  console.log('count:', r.rows.length);
  for (const row of r.rows) {
    console.log(JSON.stringify(row));
  }
} finally {
  client.release();
  await pool.end();
}
