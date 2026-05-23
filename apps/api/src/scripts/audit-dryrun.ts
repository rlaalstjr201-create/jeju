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
  // Find cutoff: what's the latest discovered_at before the 20dryrun run?
  // The previous mini-dryrun ran on 2026-05-18. We want records from today.
  // Use direct date filter.
  const cutoff = '2026-05-19';

  const pending = await client.query(`
    SELECT name, category, region, authenticity_score, ordinariness_score, verified_by, discovered_at
    FROM curation_candidates
    WHERE source_type = 'naver' AND status = 'pending'
      AND discovered_at::date >= $1
    ORDER BY authenticity_score DESC NULLS LAST
  `, [cutoff]);
  console.log('=== PENDING (since ' + cutoff + '): ' + pending.rowCount + ' records ===');
  for (const r of pending.rows) {
    const auth = r.authenticity_score != null ? Number(r.authenticity_score).toFixed(2) : 'null';
    const ord = r.ordinariness_score != null ? Number(r.ordinariness_score).toFixed(2) : 'null';
    console.log('  [' + r.verified_by + '] ' + r.name + ' | cat=' + r.category + ' | auth=' + auth + ' | ord=' + ord);
  }

  const autoRejTotal = await client.query(`
    SELECT COUNT(*) as cnt FROM curation_candidates
    WHERE source_type = 'naver' AND status = 'auto_rejected'
      AND discovered_at::date >= $1
  `, [cutoff]);
  console.log('\n=== AUTO_REJECTED total (since ' + cutoff + '): ' + autoRejTotal.rows[0].cnt + ' ===');

  const autoRej = await client.query(`
    SELECT name, category, authenticity_score
    FROM curation_candidates
    WHERE source_type = 'naver' AND status = 'auto_rejected'
      AND discovered_at::date >= $1
    ORDER BY name
    LIMIT 30
  `, [cutoff]);
  console.log('Sample (up to 30):');
  for (const r of autoRej.rows) {
    const auth = r.authenticity_score != null ? Number(r.authenticity_score).toFixed(2) : 'null';
    console.log('  ' + r.name + ' | cat=' + r.category + ' | auth=' + auth);
  }

  // Auth score distribution of pending
  const authDist = await client.query(`
    SELECT
      COUNT(*) FILTER (WHERE authenticity_score >= 0.7) as high_auth,
      COUNT(*) FILTER (WHERE authenticity_score >= 0.4 AND authenticity_score < 0.7) as mid_auth,
      COUNT(*) FILTER (WHERE authenticity_score < 0.4) as low_auth,
      COUNT(*) FILTER (WHERE authenticity_score IS NULL) as no_auth
    FROM curation_candidates
    WHERE source_type = 'naver' AND status = 'pending'
      AND discovered_at::date >= $1
  `, [cutoff]);
  const d = authDist.rows[0];
  console.log('\n=== AUTH SCORE DISTRIBUTION (pending, since ' + cutoff + ') ===');
  console.log('  high (>=0.7): ' + d.high_auth);
  console.log('  mid  (0.4-0.7): ' + d.mid_auth);
  console.log('  low  (<0.4): ' + d.low_auth);
  console.log('  null: ' + d.no_auth);

  // verified_by breakdown
  const vByDist = await client.query(`
    SELECT verified_by, COUNT(*) as cnt
    FROM curation_candidates
    WHERE source_type = 'naver' AND status = 'pending'
      AND discovered_at::date >= $1
    GROUP BY verified_by
  `, [cutoff]);
  console.log('\n=== VERIFIED_BY breakdown (pending, since ' + cutoff + ') ===');
  for (const r of vByDist.rows) {
    console.log('  ' + r.verified_by + ': ' + r.cnt);
  }
} finally {
  client.release();
  await pool.end();
}
