/**
 * fix-out-of-bbox.ts가 NaN 좌표 레코드를 잘못 rejected 처리한 것을 복구합니다.
 *
 * PostgreSQL의 NaN 비교 특이점:
 *   - NaN > finite = true  → bbox 필터 쿼리에 걸림
 *   - NaN = NaN = true     → "lat != lat" 방법 사용 불가
 *   → lat::text = 'NaN' 로 감지해야 함
 *
 * 복구 기준:
 *   - lat::text = 'NaN' OR lng::text = 'NaN' (좌표 없는 레코드)
 *   - decided_by = 'system:coord-filter' (이번 스크립트가 처리한 것)
 *
 * 유효 숫자 좌표 out-of-bbox (산방산 lat=34.86 등)은 그대로 유지.
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
    // 1. NaN 좌표 레코드 확인 (lat::text = 'NaN')
    const nanCount = await client.query<{ cnt: string }>(`
      SELECT COUNT(*) AS cnt
      FROM curation_candidates cc
      JOIN curation_decisions cd ON cd.candidate_id = cc.id
      WHERE cc.status = 'rejected'
        AND cd.decided_by = 'system:coord-filter'
        AND (cc.lat::text = 'NaN' OR cc.lng::text = 'NaN')
    `);
    console.log(`NaN 좌표 false-reject: ${nanCount.rows[0]?.cnt ?? 0}건`);

    // 2. 유효 숫자 out-of-bbox 확인
    const validOob = await client.query<{ id: string; name: string; lat: number; lng: number }>(`
      SELECT cc.id, cc.name, cc.lat, cc.lng
      FROM curation_candidates cc
      JOIN curation_decisions cd ON cd.candidate_id = cc.id
      WHERE cc.status = 'rejected'
        AND cd.decided_by = 'system:coord-filter'
        AND cc.lat::text != 'NaN'
        AND cc.lng::text != 'NaN'
      ORDER BY cc.lat DESC
    `);
    console.log(`유효 좌표 out-of-bbox (유지될 것): ${validOob.rows.length}건`);
    for (const r of validOob.rows) {
      console.log(`  ${r.name} | lat=${r.lat}, lng=${r.lng}`);
    }

    await client.query('BEGIN');

    // 3. NaN 레코드: kakao_unverified로 복원 + decisions 삭제
    const nanIds = await client.query<{ id: string }>(`
      SELECT DISTINCT cc.id
      FROM curation_candidates cc
      JOIN curation_decisions cd ON cd.candidate_id = cc.id
      WHERE cc.status = 'rejected'
        AND cd.decided_by = 'system:coord-filter'
        AND (cc.lat::text = 'NaN' OR cc.lng::text = 'NaN')
    `);

    if (nanIds.rows.length > 0) {
      const ids = nanIds.rows.map((r) => r.id);

      await client.query(
        `UPDATE curation_candidates SET status = 'kakao_unverified', updated_at = now() WHERE id = ANY($1)`,
        [ids],
      );
      await client.query(
        `DELETE FROM curation_decisions WHERE candidate_id = ANY($1) AND decided_by = 'system:coord-filter'`,
        [ids],
      );
      console.log(`\n${ids.length}건 kakao_unverified로 복원 완료.`);
    } else {
      console.log('\nNaN 레코드 없음 — 복원 불필요.');
    }

    await client.query('COMMIT');
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
