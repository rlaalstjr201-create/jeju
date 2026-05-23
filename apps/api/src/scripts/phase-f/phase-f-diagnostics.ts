#!/usr/bin/env tsx
/**
 * Phase F 큐레이터 검토 결과 진단·적용
 *
 * [즉시 적용]  A. 명칭 정정 4건  /  D. 카테고리 정정 1건
 * [진단 보고]  B. 사실 오류 snippet 재확인  /  C. 존재 의심 검증  /  E. 분점 탐지
 *
 * 실행: npx tsx src/scripts/phase-f/phase-f-diagnostics.ts [--dry-run]
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
  } catch { /* no .env */ }
}

// ── IDs ───────────────────────────────────────────────────────────────────────

const A_FIXES = [
  {
    label: '6. 우도봉 풍경 → 우도봉',
    id: '19ac84ab-e33e-4ddd-8104-5f5a368d964e',
    field: 'name' as const,
    value: '우도봉',
  },
  {
    label: '12. 제주올레 9코스 코멘트 명확화',
    id: '0e99a13b-8d88-4fb7-b11a-a165f0e5ba69',
    field: 'curator_comment' as const,
    value: '군산오름을 내려와 안덕 계곡으로 이어지는 올레길이에요. 코스에 포함된 안덕계곡은 "제주에서 가장 아름다운 계곡"이라 불립니다.',
  },
  {
    label: '18. 해월정 → 보말칼국수 해월정',
    id: '301287e4-4845-41b6-b095-65d4f0ff0f99',
    field: 'name' as const,
    value: '보말칼국수 해월정',
  },
  {
    label: '49. 바위소리 → 우도바위소리',
    id: 'e5bca46f-483b-4498-9cdc-3d4e146b6ecd',
    field: 'name' as const,
    value: '우도바위소리',
  },
];

const D_FIX = {
  label: '22. 구씨커피로스터스: restaurant → cafe',
  id: 'b631206d-e161-4b64-a0f4-2bb84d609983',
};

const B_IDS = {
  B25: { id: 'f6a93835-fc7b-4c4e-be6a-fa478033ed29', no: 25, name: '대윤흑돼지 서귀포올레시장점', issue: '활전복·새우 근거 없음 (흑돼지 전문)' },
  B28: { id: '2a4d3ca4-56b0-4ffa-b6ca-7a616d01ffc5', no: 28, name: '협재해녀의집', issue: '갈치조림 대표 아님 (해물라면·해산물회 중심)' },
  B50: { id: 'ae02eeb8-d79f-4a6c-ac15-e93b92434297', no: 50, name: '카페인우도', issue: '우도땅콩 밀크티 미확인' },
};

const C_IDS = {
  C30: { id: '5e5b0a14-85a5-4d41-a94c-56a9673f2dff', no: 30, name: '용두암 바당회국수', category: 'restaurant' },
  C37: { id: '078f0fc8-dd9e-441d-9798-ecbce2543e80', no: 37, name: '제주용암수 홍보관', category: 'cultural_space' },
};

const ALPHA_50_IDS = [
  'd5dca69f-de6e-4ba3-b73c-a9b9c68a7f35', '53f7d2f5-0f21-4a2c-a318-ee853c1bb993',
  'f2126c7f-da2c-406a-ad5f-4a0342770e1d', 'c6f4ad73-9b19-4fc4-bf44-24a40949803a',
  '2dc28492-d53d-493c-a228-d7ff1918fa3d', '19ac84ab-e33e-4ddd-8104-5f5a368d964e',
  '59586dd9-162a-4b0b-89cf-94da046bf808', '95625f5f-e5e1-4f45-a67e-9875df556608',
  '795176af-0a62-4713-9088-e63836799701', '0ebd2b3f-5608-4628-8ecc-eb905c8cc4ed',
  'fdd5f57a-0b5c-424d-a7b5-4d5035e80f27', '0e99a13b-8d88-4fb7-b11a-a165f0e5ba69',
  'b342b211-8203-4518-b96a-1f3aefd8be14', '6a39b3dd-423d-40d0-9d46-2ed37f87edc4',
  '7ad3c685-0f17-4dd3-8f88-c22ad5761a16', 'b50e641a-c8a9-4238-8c63-bbb400766a12',
  '570c3488-bb6d-4f46-9f12-c69bbaf0698b', '301287e4-4845-41b6-b095-65d4f0ff0f99',
  'ad9375fe-9247-4023-8712-ba7a2645f9b1', '95bbb63e-a3ca-452b-ad32-aa8e505f3e09',
  'acf8e99e-ae6a-4c05-9184-28d9db3236c0', 'b631206d-e161-4b64-a0f4-2bb84d609983',
  'e1525ebd-982d-4f16-89f5-52d081d89cf5', 'c7b2e961-8124-40d2-8f72-859c177efa62',
  'f6a93835-fc7b-4c4e-be6a-fa478033ed29', 'fc8683cc-e76f-43ce-b609-c7193d798ccd',
  'b3c8b328-0c82-442d-8d0a-2684c9d924ef', '2a4d3ca4-56b0-4ffa-b6ca-7a616d01ffc5',
  '4dfb41a1-c785-442c-aa49-90366683d85c', '5e5b0a14-85a5-4d41-a94c-56a9673f2dff',
  '19403e0f-6c13-4da9-b666-48b1180a313f', '0da6d6f5-8bf0-4b97-acc6-b30fb7d266f8',
  '472f37f1-dccb-48e3-ba3f-df64fa53dd35', '62312ba0-7608-4bb4-87b2-1a1169f7804a',
  '39c78adf-29e5-4ca4-8b56-1bb7015ccfed', 'a01f0b63-31ac-4898-8286-da9686bf8895',
  '078f0fc8-dd9e-441d-9798-ecbce2543e80', 'f52e4075-bfb0-47e9-9fa0-2256195ce2f7',
  'c69285fd-24d2-45e2-9d99-9d64188b9cf0', '2b8496d0-0d6b-465e-bc6d-7a159c3ed196',
  'eaeccd4a-ed24-45fd-a8f7-1190b104f574', '7ca599fe-26e8-4a5f-8dd6-3344ab6b6643',
  'fdf89224-a74a-4768-976c-7b6d8913d829', 'a6b736a7-948d-43dd-a198-754a7b9c2c89',
  '3a5d8c49-d769-44fb-bd19-26871a11c1f8', '891853fd-b2f8-4e9e-be22-e50626acd274',
  'a0f10e27-111c-4f23-b7dc-7c42e9fdab72', 'd5cbbc7e-5278-4ccf-8d68-56deb2838f1c',
  'e5bca46f-483b-4498-9cdc-3d4e146b6ecd', 'ae02eeb8-d79f-4a6c-ac15-e93b92434297',
];

// Brand prefixes to scan for branches (E)
const BRANCH_BRANDS = [
  '이춘옥', '뽈살집', '돌하르방식당', '안거리밖거리',
  '오조해녀', '협재해녀', '해월정', '월드컵흑돼지', '대윤흑돼지',
];

function hr(char = '─', len = 60): string { return char.repeat(len); }
function truncate(s: string | null, max: number): string {
  if (!s) return '(없음)';
  return s.length > max ? s.slice(0, max) + '…' : s;
}

// ── Main ──────────────────────────────────────────────────────────────────────

loadEnv();
const isDryRun = process.argv.includes('--dry-run');
const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });

console.log(`\n${'='.repeat(60)}`);
console.log(`Phase F 검토 결과 진단·적용${isDryRun ? '  [dry-run]' : ''}`);
console.log('='.repeat(60));

// ─────────────────────────────────────────────────────────────
// A: 명칭 정정 (즉시 적용)
// ─────────────────────────────────────────────────────────────
console.log(`\n${hr('─')}`);
console.log('[A] 명칭 정정 (즉시 적용)');
console.log(hr('─'));

for (const fix of A_FIXES) {
  if (isDryRun) {
    console.log(`  [dry] ${fix.label}`);
  } else {
    const sql = fix.field === 'name'
      ? `UPDATE curation_candidates SET name = $1 WHERE id = $2`
      : `UPDATE curation_candidates SET curator_comment = $1 WHERE id = $2`;
    const { rowCount } = await pool.query(sql, [fix.value, fix.id]);
    console.log(`  [${rowCount === 1 ? 'OK' : 'MISS'}] ${fix.label}`);
  }
}

// ─────────────────────────────────────────────────────────────
// D: 카테고리 정정 (즉시 적용)
// ─────────────────────────────────────────────────────────────
console.log(`\n${hr('─')}`);
console.log('[D] 카테고리 정정 (즉시 적용)');
console.log(hr('─'));

if (isDryRun) {
  console.log(`  [dry] ${D_FIX.label}`);
} else {
  const { rowCount } = await pool.query(
    `UPDATE curation_candidates SET category = 'cafe' WHERE id = $1`,
    [D_FIX.id],
  );
  console.log(`  [${rowCount === 1 ? 'OK' : 'MISS'}] ${D_FIX.label}`);
}

// D 배분 영향 확인 (alpha-50 기준 카테고리 재집계)
{
  const { rows: catRows } = await pool.query<{ category: string; cnt: string }>(`
    SELECT category, COUNT(*) AS cnt
    FROM curation_candidates
    WHERE id = ANY($1)
    GROUP BY category
    ORDER BY category
  `, [ALPHA_50_IDS]);
  console.log('\n  Alpha-50 카테고리 배분 (D 적용 후):');
  const quotas: Record<string, number> = {
    sightseeing: 15, restaurant: 15, cultural_space: 10, experience: 6, cafe: 4,
  };
  for (const r of catRows) {
    const quota = quotas[r.category] ?? '?';
    const cnt = parseInt(r.cnt, 10);
    const flag = cnt !== quota ? ' ⚠️' : '';
    console.log(`    ${r.category.padEnd(16)} ${cnt}건 (quota ${quota})${flag}`);
  }
  console.log('  → D 적용 결과: restaurant 14건(−1) / cafe 5건(+1). 사용자 결정 필요.');
}

// ─────────────────────────────────────────────────────────────
// B: 사실 오류 snippet 재확인 (진단만)
// ─────────────────────────────────────────────────────────────
console.log(`\n${hr('─')}`);
console.log('[B] 사실 오류 snippet 재확인 (진단만 — DB 미변경)');
console.log(hr('─'));

{
  interface BRow {
    id: string;
    name: string;
    naver_snippet: string | null;
    naver_source_url: string | null;
    evidence_quote: string | null;
    llm_tags: string[];
  }
  const { rows: bRows } = await pool.query<BRow>(`
    SELECT id, name, naver_snippet, naver_source_url,
           comment_draft::jsonb->>'evidence_quote' AS evidence_quote,
           llm_tags
    FROM curation_candidates
    WHERE id = ANY($1)
  `, [[B_IDS.B25.id, B_IDS.B28.id, B_IDS.B50.id]]);

  const bMap = new Map(bRows.map(r => [r.id, r]));

  for (const { id, no, name, issue } of Object.values(B_IDS)) {
    const r = bMap.get(id);
    console.log(`\n  B${no}. ${name}`);
    console.log(`  이슈: ${issue}`);
    if (!r) { console.log('  → DB 레코드 없음'); continue; }

    console.log(`  tags: ${r.llm_tags.join(', ')}`);
    console.log(`  evidence_quote: ${truncate(r.evidence_quote, 120)}`);
    console.log(`  source: ${r.naver_source_url ?? '(없음)'}`);
    console.log(`  snippet (전문):`);
    if (r.naver_snippet) {
      // Show full snippet broken into lines
      const lines = r.naver_snippet.replace(/\\n/g, '\n').split('\n');
      for (const l of lines) {
        console.log(`    │ ${l}`);
      }
    } else {
      console.log('    │ (snippet 없음)');
    }
  }

  console.log('\n  ▶ B 수정안 (snippet 확인 후):');
  console.log('  B25 대윤흑돼지: evidence_quote에 "새우, 활전복" 포함됨.');
  console.log('     → snippet 원문 확인 필요. 원문에 있으면 코멘트 유지 가능.');
  console.log('       없으면: "100% 제주산 흑돼지를 사용하는 올레시장 근처 구이 식당입니다."');
  console.log('  B28 협재해녀의집: 태그(해물라면·해물뚝배기)와 코멘트(갈치조림) 불일치.');
  console.log('     → 수정안: "협재 본점에서 해물라면·해물죽·해산물회로 알려진');
  console.log('        제주 바다 식재료 중심의 해녀 식당입니다."');
  console.log('  B50 카페인우도: tags에 우도땅콩아이스크림 있음 (밀크티 없음).');
  console.log('     → 수정안: "우도 땅콩을 사용한 아이스크림이 대표 메뉴인');
  console.log('        우도의 카페예요. 카페인이 과하지 않아 저녁에도 편합니다."');
}

// ─────────────────────────────────────────────────────────────
// C: 존재 의심 검증 (진단만)
// ─────────────────────────────────────────────────────────────
console.log(`\n${hr('─')}`);
console.log('[C] 존재 의심 검증 (진단만 — reject 여부 사용자 결정)');
console.log(hr('─'));

{
  interface CRow {
    id: string;
    name: string;
    kakao_place_id: string | null;
    lat: number | null;
    lng: number | null;
    naver_source_url: string | null;
    naver_snippet: string | null;
    category: string;
    status: string;
  }
  const { rows: cRows } = await pool.query<CRow>(`
    SELECT id, name, kakao_place_id, lat, lng,
           naver_source_url, naver_snippet, category, status
    FROM curation_candidates
    WHERE id = ANY($1)
  `, [[C_IDS.C30.id, C_IDS.C37.id]]);

  const cMap = new Map(cRows.map(r => [r.id, r]));

  for (const { id, no, name, category } of Object.values(C_IDS)) {
    const r = cMap.get(id);
    console.log(`\n  C${no}. ${name}`);
    if (!r) { console.log('  → DB 레코드 없음'); continue; }

    const hasCoords = r.lat !== null && r.lng !== null;
    const hasKakao  = r.kakao_place_id !== null;
    const hasSource = r.naver_source_url !== null;

    console.log(`  kakao_place_id: ${r.kakao_place_id ?? '(없음)'}`);
    console.log(`  좌표: ${hasCoords ? `${r.lat}, ${r.lng}` : '(없음)'}`);
    console.log(`  naver_source: ${r.naver_source_url ?? '(없음)'}`);
    console.log(`  status: ${r.status}`);
    console.log(`  snippet: ${truncate(r.naver_snippet, 150)}`);

    const verdict = hasKakao
      ? '  → ✅ Kakao 매칭 있음 — 실존 가능성 높음'
      : hasSource
        ? '  → ⚠️  Kakao 미매칭, Naver URL 있음 — snippet 신뢰도 요주의'
        : '  → ❌ Kakao 미매칭, Naver URL 없음 — 존재 확인 불가';
    console.log(verdict);

    // Replacement candidates from pool (same category, not in alpha-50)
    interface ReplRow {
      id: string; name: string; region: string; trend_category: string | null;
      l2: number; ordinariness_score: number | null; curator_comment: string | null;
    }
    const { rows: replRows } = await pool.query<ReplRow>(`
      SELECT id, name, region, trend_category,
             (comment_verified::jsonb->>'l2_cosine')::float AS l2,
             ordinariness_score,
             curator_comment
      FROM curation_candidates
      WHERE selected_tier = 'reference'
        AND comment_draft IS NOT NULL
        AND comment_warning_flag IS NULL
        AND trend_category != 'declining'
        AND (comment_verified::jsonb->>'l2_cosine')::float >= 0.80
        AND category = $1
        AND id != ALL($2)
      ORDER BY
        CASE trend_category WHEN 'rising' THEN 0 WHEN 'new' THEN 1
          WHEN 'steady' THEN 2 WHEN 'seasonal' THEN 3 ELSE 99 END,
        ordinariness_score ASC NULLS LAST,
        (comment_verified::jsonb->>'l2_cosine')::float DESC
      LIMIT 3
    `, [category, ALPHA_50_IDS]);

    if (replRows.length > 0) {
      console.log(`  reject 시 대체 후보 (${category}, 사용자 재검토 필수):`);
      for (const rr of replRows) {
        console.log(`    • ${rr.name} (${rr.region}, ${rr.trend_category ?? '-'}, L2=${rr.l2.toFixed(3)})`);
        console.log(`      코멘트: ${truncate(rr.curator_comment, 80)}`);
        console.log(`      id: ${rr.id}`);
      }
    } else {
      console.log(`  대체 후보 없음 (${category} 풀 소진)`);
    }
  }
}

// ─────────────────────────────────────────────────────────────
// E: 분점 탐지
// ─────────────────────────────────────────────────────────────
console.log(`\n${hr('─')}`);
console.log('[E] 분점 탐지 (진단만)');
console.log(hr('─'));

{
  interface ERow {
    id: string; name: string; kakao_place_id: string | null;
    lat: number | null; lng: number | null; region: string; status: string;
  }

  for (const brand of BRANCH_BRANDS) {
    const { rows: eRows } = await pool.query<ERow>(`
      SELECT id, name, kakao_place_id, lat, lng, region, status
      FROM curation_candidates
      WHERE name ILIKE $1
      ORDER BY status, name
    `, [`%${brand}%`]);

    if (eRows.length <= 1) continue; // Only report if multiple records

    console.log(`\n  [${brand}] ${eRows.length}건 탐지:`);
    for (const r of eRows) {
      const inAlpha = ALPHA_50_IDS.includes(r.id) ? ' ★alpha' : '';
      const hasCoords = r.lat !== null && r.lng !== null;
      const coordStr = hasCoords ? `(${r.lat?.toFixed(4)}, ${r.lng?.toFixed(4)})` : '좌표없음';
      const kakaoStr = r.kakao_place_id ? `kakao:${r.kakao_place_id}` : 'kakao:none';
      console.log(`    - ${r.name}${inAlpha}`);
      console.log(`      ${r.region} | ${coordStr} | ${kakaoStr} | ${r.status}`);
    }

    // Verdict: are all alpha-50 instances coordinate-disambiguated?
    const alphaInstances = eRows.filter(r => ALPHA_50_IDS.includes(r.id));
    const allCoords = alphaInstances.every(r => r.lat !== null && r.lng !== null);
    if (alphaInstances.length > 0) {
      console.log(`    → alpha-50 포함 ${alphaInstances.length}건, 좌표 구분: ${allCoords ? '✅ 가능' : '⚠️ 불완전'}`);
    }
  }

  // Also check if any two alpha-50 spots share a brand (same name prefix)
  const { rows: dupRows } = await pool.query<{ brand: string; cnt: string }>(`
    SELECT SPLIT_PART(name, ' ', 1) AS brand, COUNT(*) AS cnt
    FROM curation_candidates
    WHERE id = ANY($1)
    GROUP BY brand
    HAVING COUNT(*) > 1
    ORDER BY cnt DESC
  `, [ALPHA_50_IDS]);

  if (dupRows.length > 0) {
    console.log('\n  Alpha-50 내 동일 브랜드 첫 단어 중복:');
    for (const r of dupRows) console.log(`    "${r.brand}" ${r.cnt}건`);
  } else {
    console.log('\n  Alpha-50 내 동일 브랜드 첫 단어 중복: 없음');
  }
}

// ─────────────────────────────────────────────────────────────
// 최종 상태표
// ─────────────────────────────────────────────────────────────
console.log(`\n${'='.repeat(60)}`);
console.log('최종 50건 상태표');
console.log('='.repeat(60));
console.log('  approve 대기 (A/D 수정 포함): 36건  ← 다음 단계 approve 파이프라인 대상');
console.log('  B 수정 대기 (사용자 확인 후):  3건  (25·28·50)');
console.log('  C reject 후보 (사용자 확인 후): 2건  (30·37)');
console.log('  E 분점: 좌표 구분 가능하면 현행 유지 / 불완전하면 백로그');
console.log('');
console.log('다음 단계:');
console.log('  1. B 수정안 확인 → approve 또는 edit 결정');
console.log('  2. C reject 여부 → reject 시 대체 후보 재검토');
console.log('  3. D 배분(restaurant−1 / cafe+1) → 허용 또는 restaurant 1건 보충');
console.log('  4. 확정 후: apply-alpha-decisions.ts → run-approve-pipeline.ts');

await pool.end();
