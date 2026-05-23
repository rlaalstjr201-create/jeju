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
    SELECT status, source_type, COUNT(*) AS cnt
    FROM curation_candidates
    WHERE source_type = 'naver'
    GROUP BY status, source_type
    ORDER BY cnt DESC
  `);
  console.log('naver candidate status distribution:');
  for (const row of r.rows) {
    console.log(`  ${row.source_type} | ${row.status}: ${row.cnt}`);
  }
} finally {
  client.release();
  await pool.end();
}
