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
    const bySource = await client.query<{ source_type: string; cnt: string }>(`
      SELECT source_type, COUNT(*) AS cnt
      FROM curation_candidates
      GROUP BY source_type
      ORDER BY cnt DESC
    `);
    console.log('=== source_type 분포 ===');
    for (const r of bySource.rows) console.log(` ${r.source_type}: ${r.cnt}`);

    const byStatus = await client.query<{ status: string; cnt: string }>(`
      SELECT status, COUNT(*) AS cnt
      FROM curation_candidates
      GROUP BY status
      ORDER BY cnt DESC
    `);
    console.log('\n=== status 분포 ===');
    for (const r of byStatus.rows) console.log(` ${r.status}: ${r.cnt}`);

    const samples = await client.query<{
      name: string;
      lat: number | null;
      lng: number | null;
      status: string;
      visitjeju_content_id: string | null;
      synthetic_id: string | null;
      kakao_place_id: string | null;
    }>(`
      SELECT name, lat, lng, status, visitjeju_content_id, synthetic_id, kakao_place_id
      FROM curation_candidates
      WHERE source_type = 'visitjeju'
      ORDER BY created_at DESC
      LIMIT 3
    `);
    console.log('\n=== 최근 저장된 visitjeju 샘플 3건 ===');
    for (const r of samples.rows) {
      console.log(` name: ${r.name}`);
      console.log(`   lat/lng: ${r.lat}, ${r.lng}`);
      console.log(`   status: ${r.status}`);
      console.log(`   visitjeju_content_id: ${r.visitjeju_content_id}`);
      console.log(`   kakao_place_id: ${r.kakao_place_id}`);
      console.log(`   synthetic_id: ${r.synthetic_id}`);
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
