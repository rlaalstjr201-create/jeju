/**
 * 제주 bbox 밖 좌표를 가진 naver/visitjeju 후보를 rejected로 처리합니다.
 * 좌표 범위: lat 33.0~33.6, lng 126.0~127.0
 *
 * 실행: npx tsx src/scripts/fix-out-of-bbox.ts
 */
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
    await client.query('BEGIN');

    // 1. bbox 밖 후보 조회 (NaN 제외: lat::text != 'NaN')
    // PostgreSQL에서 NaN > 33.6 = true이므로 명시적으로 NaN 제외 필요
    const found = await client.query<{ id: string; name: string; lat: number; lng: number; status: string }>(`
      SELECT id, name, lat, lng, status
      FROM curation_candidates
      WHERE lat IS NOT NULL
        AND lat::text != 'NaN'
        AND lng::text != 'NaN'
        AND NOT (lat BETWEEN 33.0 AND 33.6 AND lng BETWEEN 126.0 AND 127.0)
        AND status != 'rejected'
    `);

    if (found.rows.length === 0) {
      console.log('bbox 밖 후보 없음 — 이미 정상.');
      await client.query('ROLLBACK');
      return;
    }

    console.log(`bbox 밖 후보 ${found.rows.length}건 발견:`);
    for (const r of found.rows) {
      console.log(`  ${r.name} | lat=${r.lat}, lng=${r.lng} | status=${r.status}`);
    }

    // 2. status → rejected 업데이트
    const ids = found.rows.map((r) => r.id);
    await client.query(
      `UPDATE curation_candidates SET status = 'rejected', updated_at = now() WHERE id = ANY($1)`,
      [ids],
    );

    // 3. curation_decisions 기록 (auto-rejection 감사 추적)
    for (const r of found.rows) {
      await client.query(
        `INSERT INTO curation_decisions
           (id, candidate_id, decided_at, decided_by, decision, rejection_reason_enum, rejection_reason_text, free_memo, created_at)
         VALUES
           (gen_random_uuid(), $1, now(), 'system:coord-filter', 'reject', NULL,
            '제주 bbox 외부 좌표', '좌표 오매칭 (자동) lat=' || $2 || ' lng=' || $3, now())`,
        [r.id, r.lat, r.lng],
      );
    }

    await client.query('COMMIT');
    console.log(`\n${found.rows.length}건 rejected 처리 완료.`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
