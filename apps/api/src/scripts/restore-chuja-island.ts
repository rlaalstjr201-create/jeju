/**
 * 추자군도(lat 33.6~34.0) 레코드를 bbox 오류로 rejected 처리한 것을 복구합니다.
 *
 * 배경: ADR-0031 초안에서 bbox latMax=33.6으로 설정했으나 추자군도(lat~33.93~33.97)가
 * 제주특별자치도 소속임을 간과. latMax를 34.0으로 확장 후 해당 records 복원.
 *
 * 복구 기준:
 *   - decided_by = 'system:coord-filter'
 *   - lat BETWEEN 33.6 AND 34.0 (추자도 범위)
 *   - lng BETWEEN 126.0 AND 127.0
 *
 * 원래 status 결정:
 *   - kakaoPlaceId IS NOT NULL → pending (kakao 매칭됨)
 *   - kakaoPlaceId IS NULL     → kakao_unverified
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
    // 1. 추자도 범위 내 rejected 레코드 조회
    const chuja = await client.query<{
      id: string; name: string; lat: number; lng: number; kakao_place_id: string | null;
    }>(`
      SELECT cc.id, cc.name, cc.lat, cc.lng, cc.kakao_place_id
      FROM curation_candidates cc
      JOIN curation_decisions cd ON cd.candidate_id = cc.id
      WHERE cc.status = 'rejected'
        AND cd.decided_by = 'system:coord-filter'
        AND cc.lat BETWEEN 33.6 AND 34.0
        AND cc.lng BETWEEN 126.0 AND 127.0
    `);

    if (chuja.rows.length === 0) {
      console.log('추자도 범위 rejected 레코드 없음.');
      return;
    }

    console.log(`추자도 복구 대상: ${chuja.rows.length}건`);
    for (const r of chuja.rows) {
      const restoreStatus = r.kakao_place_id ? 'pending' : 'kakao_unverified';
      console.log(`  ${r.name} | lat=${r.lat} | → ${restoreStatus}`);
    }

    await client.query('BEGIN');

    const ids = chuja.rows.map((r) => r.id);

    // 2. status 복원 (kakaoPlaceId 있으면 pending, 없으면 kakao_unverified)
    await client.query(`
      UPDATE curation_candidates
      SET status = CASE
            WHEN kakao_place_id IS NOT NULL THEN 'pending'
            ELSE 'kakao_unverified'
          END,
          updated_at = now()
      WHERE id = ANY($1)
    `, [ids]);

    // 3. 잘못된 curation_decisions 삭제
    await client.query(
      `DELETE FROM curation_decisions WHERE candidate_id = ANY($1) AND decided_by = 'system:coord-filter'`,
      [ids],
    );

    await client.query('COMMIT');
    console.log(`\n${chuja.rows.length}건 복구 완료.`);
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
