#!/usr/bin/env tsx
/**
 * Phase F Alpha-50 최종 확정
 *
 * [즉시 적용]
 *   1. 대체 2건 enrichment 자격 검증
 *   2. B 3건 코멘트 수정
 *   3. C 2건 reject
 *   4. 최종 50건 comment_warning_flag = 'approved'
 *   5. 상태 검증 보고
 *
 * 실행: npx tsx src/scripts/phase-f/finalize-alpha-50.ts [--dry-run]
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

// ── 최종 결정 데이터 ────────────────────────────────────────────────────────

const C_REJECTS = [
  { id: '5e5b0a14-85a5-4d41-a94c-56a9673f2dff', name: '용두암 바당회국수 (C30)' },
  { id: '078f0fc8-dd9e-441d-9798-ecbce2543e80', name: '제주용암수 홍보관 (C37)' },
];

const B_COMMENT_FIXES = [
  {
    id: 'f6a93835-fc7b-4c4e-be6a-fa478033ed29',
    name: 'B25 대윤흑돼지 서귀포올레시장점',
    comment: '100% 제주산 흑돼지를 사용하는 올레시장 근처 구이 식당입니다.',
  },
  {
    id: '2a4d3ca4-56b0-4ffa-b6ca-7a616d01ffc5',
    name: 'B28 협재해녀의집',
    comment: '협재 본점에서 해물라면·해물죽·해산물회로 알려진 제주 바다 식재료 중심의 해녀 식당입니다.',
  },
  {
    id: 'ae02eeb8-d79f-4a6c-ac15-e93b92434297',
    name: 'B50 카페인우도',
    comment: '우도 땅콩을 사용한 아이스크림이 대표 메뉴인 우도의 카페예요. 카페인이 과하지 않아 저녁에도 편합니다.',
  },
];

const REPLACEMENTS = [
  { id: '0868a398-4797-4b06-b45f-504f10a375cb', name: '월정리갈비밥', category: 'restaurant' },
  { id: 'b2b83c5f-d064-44d2-81e8-a6dbe984280d', name: '쇠소깍 산물 관광농원', category: 'cultural_space' },
];

// Original 50 minus C30/C37
const ORIGINAL_48_IDS = [
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
  '4dfb41a1-c785-442c-aa49-90366683d85c',
  // C30 (5e5b0a14) OMITTED
  '19403e0f-6c13-4da9-b666-48b1180a313f', '0da6d6f5-8bf0-4b97-acc6-b30fb7d266f8',
  '472f37f1-dccb-48e3-ba3f-df64fa53dd35', '62312ba0-7608-4bb4-87b2-1a1169f7804a',
  '39c78adf-29e5-4ca4-8b56-1bb7015ccfed', 'a01f0b63-31ac-4898-8286-da9686bf8895',
  // C37 (078f0fc8) OMITTED
  'f52e4075-bfb0-47e9-9fa0-2256195ce2f7', 'c69285fd-24d2-45e2-9d99-9d64188b9cf0',
  '2b8496d0-0d6b-465e-bc6d-7a159c3ed196', 'eaeccd4a-ed24-45fd-a8f7-1190b104f574',
  '7ca599fe-26e8-4a5f-8dd6-3344ab6b6643', 'fdf89224-a74a-4768-976c-7b6d8913d829',
  'a6b736a7-948d-43dd-a198-754a7b9c2c89', '3a5d8c49-d769-44fb-bd19-26871a11c1f8',
  '891853fd-b2f8-4e9e-be22-e50626acd274', 'a0f10e27-111c-4f23-b7dc-7c42e9fdab72',
  'd5cbbc7e-5278-4ccf-8d68-56deb2838f1c', 'e5bca46f-483b-4498-9cdc-3d4e146b6ecd',
  'ae02eeb8-d79f-4a6c-ac15-e93b92434297',
];

const FINAL_50_IDS = [
  ...ORIGINAL_48_IDS,
  ...REPLACEMENTS.map(r => r.id),
];

function hr(len = 60) { return '─'.repeat(len); }

// ── Main ──────────────────────────────────────────────────────────────────────

loadEnv();
const isDryRun = process.argv.includes('--dry-run');
const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });

console.log(`\n${'='.repeat(60)}`);
console.log(`Phase F Alpha-50 최종 확정${isDryRun ? '  [dry-run]' : ''}`);
console.log('='.repeat(60));

// ── Step 1: 대체 스팟 enrichment 자격 검증 ────────────────────────────────────
console.log(`\n${hr()}`);
console.log('Step 1. 대체 스팟 enrichment 자격 검증');
console.log(hr());

interface EnrichRow {
  id: string; name: string; status: string; category: string;
  enriched_at: string | null; lat: number | null; lng: number | null;
  thumbnail_url: string | null; curator_comment: string | null;
  final_score: number | null; ai_estimated_score: number | null;
}

const { rows: enrichRows } = await pool.query<EnrichRow>(`
  SELECT id, name, status, category, enriched_at, lat, lng, thumbnail_url,
         curator_comment, final_score, ai_estimated_score
  FROM curation_candidates
  WHERE id = ANY($1)
`, [REPLACEMENTS.map(r => r.id)]);

const enrichPatchIds: string[] = [];
for (const r of enrichRows) {
  const hasData = r.lat !== null && r.lng !== null && r.thumbnail_url !== null;
  const needsTimestamp = r.enriched_at === null && hasData;
  const ok = r.enriched_at !== null && hasData;
  const flag = ok ? '✅' : needsTimestamp ? '🔧 backfill' : '❌ BLOCKED';
  console.log(`  ${flag} ${r.name} (${r.category})`);
  console.log(`     status=${r.status} enriched=${r.enriched_at ? 'YES' : 'NULL'} lat=${r.lat ?? 'NULL'} thumbnail=${r.thumbnail_url ? 'YES' : 'NULL'}`);
  console.log(`     curator_comment=${r.curator_comment ? `"${r.curator_comment.slice(0, 60)}…"` : 'NULL'}`);
  if (needsTimestamp) {
    enrichPatchIds.push(r.id);
    console.log(`     → lat/lng/thumbnail 완비, enriched_at만 NULL → backfill 예정`);
  } else if (!ok) {
    console.log(`     → approve 불가: lat=${r.lat} lng=${r.lng} thumbnail=${r.thumbnail_url}`);
  }
}

// Backfill enriched_at for spots that have all required data but missing timestamp
if (enrichPatchIds.length > 0) {
  console.log(`\n  enriched_at backfill (${enrichPatchIds.length}건):`);
  if (isDryRun) {
    console.log(`  [dry] ${enrichPatchIds.length}건 enriched_at = NOW() 건너뜀`);
  } else {
    const { rowCount } = await pool.query(
      `UPDATE curation_candidates SET enriched_at = NOW() WHERE id = ANY($1)`,
      [enrichPatchIds],
    );
    console.log(`  [OK] ${rowCount}건 enriched_at backfill 완료`);
  }
}

// ── Step 2: B 코멘트 수정 ─────────────────────────────────────────────────────
console.log(`\n${hr()}`);
console.log('Step 2. B 3건 코멘트 수정');
console.log(hr());

for (const fix of B_COMMENT_FIXES) {
  if (isDryRun) {
    console.log(`  [dry] ${fix.name}`);
    console.log(`        → "${fix.comment.slice(0, 70)}…"`);
  } else {
    const { rowCount } = await pool.query(
      `UPDATE curation_candidates SET curator_comment = $1 WHERE id = $2`,
      [fix.comment, fix.id],
    );
    console.log(`  [${rowCount === 1 ? 'OK' : 'MISS'}] ${fix.name}`);
    console.log(`        → "${fix.comment.slice(0, 70)}"`);
  }
}

// ── Step 3: C reject ─────────────────────────────────────────────────────────
console.log(`\n${hr()}`);
console.log('Step 3. C 2건 reject');
console.log(hr());

for (const c of C_REJECTS) {
  if (isDryRun) {
    console.log(`  [dry] reject: ${c.name}`);
  } else {
    const { rowCount } = await pool.query(
      `UPDATE curation_candidates SET comment_warning_flag = 'rejected' WHERE id = $1`,
      [c.id],
    );
    console.log(`  [${rowCount === 1 ? 'OK' : 'MISS'}] reject: ${c.name}`);
  }
}

// ── Step 4: 최종 50건 approved ────────────────────────────────────────────────
console.log(`\n${hr()}`);
console.log(`Step 4. 최종 ${FINAL_50_IDS.length}건 → comment_warning_flag = 'approved'`);
console.log(hr());

if (isDryRun) {
  console.log(`  [dry] ${FINAL_50_IDS.length}건 approved 설정 건너뜀`);
} else {
  const { rowCount } = await pool.query(
    `UPDATE curation_candidates
       SET comment_warning_flag = 'approved'
     WHERE id = ANY($1)
       AND (comment_warning_flag IS NULL OR comment_warning_flag != 'rejected')`,
    [FINAL_50_IDS],
  );
  console.log(`  [OK] ${rowCount}건 approved 설정 완료`);
}

// ── Step 5: 상태 검증 ─────────────────────────────────────────────────────────
console.log(`\n${hr()}`);
console.log('Step 5. 상태 검증');
console.log(hr());

interface StatusRow {
  comment_warning_flag: string | null;
  cnt: string;
}
const { rows: statusRows } = await pool.query<StatusRow>(`
  SELECT comment_warning_flag, COUNT(*) AS cnt
  FROM curation_candidates
  WHERE id = ANY($1)
  GROUP BY comment_warning_flag
  ORDER BY comment_warning_flag
`, [FINAL_50_IDS]);

console.log('  최종 50건 flag 분포:');
for (const r of statusRows) {
  console.log(`    ${(r.comment_warning_flag ?? 'NULL').padEnd(10)} ${r.cnt}건`);
}

// Enrichment gate check for all 50
interface GateRow {
  id: string; name: string; enriched_at: string | null;
  lat: number | null; lng: number | null; thumbnail_url: string | null;
}
const { rows: gateRows } = await pool.query<GateRow>(`
  SELECT id, name, enriched_at, lat, lng, thumbnail_url
  FROM curation_candidates
  WHERE id = ANY($1) AND comment_warning_flag = 'approved'
    AND (enriched_at IS NULL OR lat IS NULL OR lng IS NULL OR thumbnail_url IS NULL)
`, [FINAL_50_IDS]);

if (gateRows.length === 0) {
  console.log('\n  ✅ 모든 approved 스팟 enrichment 완료 — pipeline 바로 실행 가능');
} else {
  console.log(`\n  ⚠️  ${gateRows.length}건 enrichment 미완료 (pipeline에서 skip됨):`);
  for (const r of gateRows) {
    console.log(`    - ${r.name}: enriched=${r.enriched_at ? 'OK' : 'NULL'} lat=${r.lat ?? 'NULL'} thumb=${r.thumbnail_url ? 'OK' : 'NULL'}`);
  }
}

// Category distribution
interface CatRow { category: string; cnt: string; }
const { rows: catRows } = await pool.query<CatRow>(`
  SELECT category, COUNT(*) AS cnt
  FROM curation_candidates
  WHERE id = ANY($1)
  GROUP BY category
  ORDER BY cnt DESC
`, [FINAL_50_IDS]);

console.log('\n  최종 카테고리 배분:');
const quotas: Record<string, number> = {
  sightseeing: 15, restaurant: 15, cultural_space: 10, experience: 6, cafe: 4,
};
for (const r of catRows) {
  const quota = quotas[r.category] ?? '?';
  const cnt = parseInt(r.cnt, 10);
  const flag = typeof quota === 'number' && cnt !== quota ? ' ⚠️' : '';
  console.log(`    ${r.category.padEnd(16)} ${cnt.toString().padStart(2)}건 (quota ${quota})${flag}`);
}

await pool.end();

console.log(`\n${'='.repeat(60)}`);
console.log('확정 완료. 다음 단계:');
console.log('  npx tsx src/scripts/phase-f/run-approve-pipeline.ts');
console.log('='.repeat(60));
