import { readFileSync } from 'node:fs';
import { Pool } from 'pg';

function loadEnv(): void {
  try {
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
  } catch { /* ignore */ }
}

loadEnv();
const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });

async function main() {
  const client = await pool.connect();
  try {
    // source_type + status 분포
    const dist = await client.query<{ source_type: string; status: string; cnt: string }>(`
      SELECT source_type, status, COUNT(*) AS cnt
      FROM curation_candidates
      GROUP BY source_type, status
      ORDER BY source_type, status
    `);
    console.log('=== source_type × status 분포 ===');
    for (const r of dist.rows) {
      console.log(` ${r.source_type} | ${r.status} | ${r.cnt}`);
    }

    // naver 후보 샘플 5건
    const samples = await client.query<{
      name: string;
      lat: number | null;
      lng: number | null;
      authenticity_score: number | null;
      ordinariness_score: number | null;
      status: string;
      naver_source_url: string | null;
      sourced_from: string;
    }>(`
      SELECT name, lat, lng, authenticity_score, ordinariness_score, status, naver_source_url, sourced_from
      FROM curation_candidates
      WHERE source_type = 'naver'
      ORDER BY created_at DESC
      LIMIT 5
    `);
    console.log('\n=== naver 후보 샘플 5건 ===');
    if (samples.rows.length === 0) {
      console.log('  (naver 후보 없음 — 아직 처리 중이거나 실패)');
    } else {
      for (const r of samples.rows) {
        console.log(` name: ${r.name}`);
        console.log(`   lat/lng: ${r.lat ?? 'null'}, ${r.lng ?? 'null'}`);
        console.log(`   authenticity: ${r.authenticity_score ?? 'null'} | ordinariness: ${r.ordinariness_score ?? 'null'}`);
        console.log(`   status: ${r.status}`);
        console.log(`   sourced_from: ${r.sourced_from}`);
        console.log(`   url: ${r.naver_source_url ?? 'null'}`);
      }
    }

    // 역신호 쿼리 ordinariness 비교
    const meta = await client.query<{
      query_type: string;
      avg_auth: number | null;
      avg_ord: number | null;
      cnt: string;
    }>(`
      SELECT
        CASE
          WHEN sourced_from LIKE '%비추천%' OR sourced_from LIKE '%실망%' THEN '역신호'
          ELSE '일반'
        END AS query_type,
        ROUND(AVG(authenticity_score)::numeric, 3) AS avg_auth,
        ROUND(AVG(ordinariness_score)::numeric, 3) AS avg_ord,
        COUNT(*) AS cnt
      FROM curation_candidates
      WHERE source_type = 'naver'
      GROUP BY query_type
    `);
    console.log('\n=== 역신호 vs 일반 쿼리 점수 비교 ===');
    if (meta.rows.length === 0) {
      console.log('  (데이터 없음)');
    } else {
      for (const r of meta.rows) {
        console.log(` ${r.query_type}: cnt=${r.cnt} | avg_auth=${r.avg_auth} | avg_ord=${r.avg_ord}`);
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
