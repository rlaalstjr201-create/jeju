/**
 * dump-curator-sample.ts — Task 4: 큐레이터 검증 샘플 10건 dump.
 *
 * 출력:
 * 1. 환각 차단 검증 (반빛당류: spot_name=null인데 name이 null인 rows)
 * 2. 부분 추출 정제 (금능해수욕장류: verified_kakao/verified_naver rows)
 * 3. 일반 명사 차단 (시골집·중문 등이 포함되지 않은 것 확인)
 * 4. 상위 10건 큐레이터 검증용 샘플
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
    // 1. Queue size overview
    const overview = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE source_type='naver') AS naver_total,
        COUNT(*) FILTER (WHERE source_type='naver' AND verified_by IS NOT NULL) AS queue_size,
        COUNT(*) FILTER (WHERE source_type='naver' AND review_excluded=true) AS auto_rejected,
        COUNT(*) FILTER (WHERE source_type='naver' AND name='null') AS null_names,
        COUNT(*) FILTER (WHERE source_type='naver' AND verified_by='kakao') AS verified_kakao,
        COUNT(*) FILTER (WHERE source_type='naver' AND verified_by='naver') AS verified_naver
      FROM curation_candidates
    `);
    console.log('=== Queue overview ===');
    const ov = overview.rows[0]!;
    console.log(`Naver total:    ${ov.naver_total}`);
    console.log(`Queue size:     ${ov.queue_size} (verified_by IS NOT NULL)`);
    console.log(`Auto-rejected:  ${ov.auto_rejected}`);
    console.log(`Null names:     ${ov.null_names}`);
    console.log(`Verified Kakao: ${ov.verified_kakao}`);
    console.log(`Verified Naver: ${ov.verified_naver}`);

    // 2. Hallucination check: names like 반빛당 that appeared in v6 but should be null
    const hallucTest = await pool.query(`
      SELECT name, naver_snippet, verified_by, status
      FROM curation_candidates
      WHERE source_type='naver'
        AND name ILIKE ANY(ARRAY['%반빛당%', '%체험단%', '%선흌곶%'])
      LIMIT 5
    `);
    console.log('\n=== 환각 차단 검증 (반빛당·체험단·선흌곶 쿼리) ===');
    if (hallucTest.rows.length === 0) {
      console.log('✓ 0건 — 환각 차단 정상 동작');
    } else {
      console.log(`⚠ ${hallucTest.rows.length}건 발견:`);
      hallucTest.rows.forEach((r) => console.log(` name=${r.name} verified_by=${r.verified_by} status=${r.status}`));
    }

    // 3. Official name normalization: 금능해수욕장류
    const normalTest = await pool.query(`
      SELECT name, verified_by, naver_snippet
      FROM curation_candidates
      WHERE source_type='naver'
        AND name ILIKE '%해수욕장%'
        AND verified_by IS NOT NULL
      LIMIT 5
    `);
    console.log('\n=== 공식명 정규화 (해수욕장류 verified) ===');
    if (normalTest.rows.length === 0) {
      console.log('0건');
    } else {
      normalTest.rows.forEach((r) => console.log(` name=${r.name} verified_by=${r.verified_by}`));
    }

    // 4. Generic noun check: 시골집, 중문 등이 name에 없는지
    const genericTest = await pool.query(`
      SELECT name, naver_snippet, verified_by
      FROM curation_candidates
      WHERE source_type='naver'
        AND name ILIKE ANY(ARRAY['%시골집%', '%중문%', '%해변%', '%오름%'])
        AND verified_by IS NOT NULL
      LIMIT 5
    `);
    console.log('\n=== 일반 명사 차단 검증 (시골집·중문·해변·오름 IN verified queue) ===');
    if (genericTest.rows.length === 0) {
      console.log('✓ 0건 — 일반 명사 차단 정상');
    } else {
      console.log(`⚠ ${genericTest.rows.length}건 (아래 건 수동 검증 필요):`);
      genericTest.rows.forEach((r) => console.log(` name=${r.name} verified_by=${r.verified_by}`));
    }

    // 5. Top 10 curator queue sample
    const top10 = await pool.query(`
      SELECT
        id, name, region, category, status,
        authenticity_score, ordinariness_score,
        verified_by, naver_source_url, naver_snippet
      FROM curation_candidates
      WHERE source_type='naver'
        AND review_excluded=false
        AND status IN ('pending','kakao_unverified')
        AND name != 'null'
        AND verified_by IS NOT NULL
      ORDER BY
        ordinariness_score ASC NULLS LAST,
        authenticity_score DESC NULLS LAST
      LIMIT 10
    `);
    console.log('\n=== Top 10 큐레이터 검증 샘플 ===');
    top10.rows.forEach((r, i) => {
      console.log(`\n[${i+1}] ${r.name}`);
      console.log(`  region=${r.region} category=${r.category} status=${r.status}`);
      console.log(`  auth=${r.authenticity_score?.toFixed(2)??'null'} ord=${r.ordinariness_score?.toFixed(2)??'null'}`);
      console.log(`  verified_by=${r.verified_by}`);
      console.log(`  url=${r.naver_source_url}`);
      console.log(`  snippet=${r.naver_snippet?.slice(0, 120) ?? 'null'}`);
    });

  } finally {
    await pool.end();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
