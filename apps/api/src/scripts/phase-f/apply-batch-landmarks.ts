#!/usr/bin/env tsx
/**
 * Phase F: batch-landmarks-2026-05-26.md 큐레이터 판정 DB 반영
 *
 * 단계:
 *   1. REJECT(23) — flag='rejected'
 *   2. NEEDS_FIX(13) — flag='needs_fix', memo='코멘트 작성 대기(다음 통합작업)'
 *   3. EDIT(1) — curator_comment 교체 + flag='approved'
 *   4. APPROVE(17) — comment_draft.comment → curator_comment + flag='approved'
 *   5. enriched_at 백필 (approve+edit 18건)
 *   6. ApproveCandidateUseCase → spots 삽입
 *   7. flag 분포·spots 총수 검증
 *
 * 실행: npx tsx src/scripts/phase-f/apply-batch-landmarks.ts [--dry-run]
 */
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { PostgresCurationCandidateRepository } from '../../infrastructure/persistence/PostgresCurationCandidateRepository.js';
import { PostgresSpotRepository } from '../../infrastructure/persistence/PostgresSpotRepository.js';
import { PostgresTransactionManager } from '../../infrastructure/persistence/PostgresTransactionManager.js';
import {
  ApproveCandidateUseCase,
  ApproveError,
  ApproveBlockedError,
  InvalidStatusError,
} from '../../application/curation/ApproveCandidateUseCase.js';

function loadEnv(): void {
  try {
    const lines = readFileSync('../../.env', 'utf-8').split('\n');
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

// ── 판정 데이터 ───────────────────────────────────────────────────────────────

// [1] REJECT 23건
const REJECT_IDS: string[] = [
  '91e953b7-346b-47a8-9340-332d910ffab9', // 3  한라산소주공장
  '276cd2de-9809-4ab0-b08c-a44c497f1560', // 4  한라산영실코스
  '8da1ac10-faaf-47f0-b735-5f8cb4d408fa', // 5  한라산어리목코스
  '5391495c-788f-4461-9420-eb6149351c24', // 9  천제연폭포 & 제주4.3중문면희생자위령비
  '5fcff9e1-ecf9-4c31-8132-29f34c55c3b0', // 16 비자림농원
  '51b339d5-758d-4de0-9cf6-8f9fb5e1d2d2', // 20 사계 용머리해안
  '8f2a9c99-da27-4f87-97ff-c5c02ef5f3c6', // 21 산방산 용머리해안 지질트레일
  '853f0b4a-e347-4330-8991-707c48b3bcac', // 23 산방산둘레길
  '41d1e98c-4113-4ceb-87dd-f128e6b24b12', // 24 산방산 수국
  '795176af-0a62-4713-9088-e63836799701', // 25 산방산유람선
  '4c92b3bb-6ebf-49a2-9641-1b30040f055b', // 26 산방산탄산온천
  '6efe2fea-ac02-49c4-86b0-a939cd767782', // 27 산방산 랜드
  '61de0b29-5c47-4d26-ae28-9fc6d9a28231', // 28 마라도가는여객선
  '895a324c-5950-4aab-a00c-ed1d854a7e2e', // 29 대한민국최남단기념비/마라도 기념비
  'c33d01ef-7a9e-451f-8d92-3a2ca49ae073', // 32 마라도관광쉼터
  '47f0df8e-4709-4fc5-94fa-eb8b97cbe34b', // 33 마라도기원정사
  '60dfc121-2023-47d7-b7ad-91fa234d9d5e', // 34 마라도 섬투어
  'e8a43c1b-cd61-4495-a749-0c6dbe7f3d21', // 35 가파도 마라도 정기여객선
  '6437d680-bb0b-421b-9bc5-c24ee0626ef9', // 40 쌍용굴(한림공원)
  'a5e0bbe9-a2f0-4da2-89f9-99f0097757bf', // 41 협재굴(한림공원)
  'fcc9c61e-23f7-44c0-b2b7-77b0ea229639', // 42 황금굴(한림공원)
  '200b0e60-d6d2-4261-b5b5-610b0ff00883', // 45 쇠소깍 전통 조각배 체험
  'b2b83c5f-d064-44d2-81e8-a6dbe984280d', // 46 쇠소깍 산물 관광농원
];

// [2] NEEDS_FIX 13건
const NEEDS_FIX_IDS: string[] = [
  '266b5174-b1be-4c92-90cc-7234f9665360', // 11 금능해수욕장
  '404d483c-af53-492f-8b6e-17d7da5d2f59', // 13 월정리해수욕장
  '40944a03-6872-409e-9a3e-e393102d15d1', // 30 마라도등대
  '5ed54e15-736d-4267-8880-642785322e91', // 31 마라도성당
  '30e6fe8f-04c1-4d49-8670-045a2a5e5c28', // 36 마라도(마라해양도립공원)
  '81c0c982-4f3c-4919-bc17-21b6c921af8e', // 38 에코랜드 테마파크
  '6164fbb3-ff55-4d8b-8473-37d04dc660a3', // 39 한림공원(협재굴, 쌍용굴)
  '39ba0526-302b-4bfe-af00-a87b4cd205fe', // 43 오설록티뮤지엄
  '04627f64-83e9-47d9-a934-59a2ce5491b7', // 47 쇠소깍해변
  '084bd937-a53a-4b39-b296-019a274628f9', // 48 쇠소깍해양레저타운
  'edc4b66e-5bdc-4aa0-b3de-c585b181d7a6', // 50 천왕사
  '6d809a73-4727-412b-a7dc-e09e5db94c89', // 52 거문오름(UNESCO 세계자연유산)
  '4a11c95f-1abd-4923-80f1-5c13e611263b', // 54 따라비오름
];
const NEEDS_FIX_MEMO = '코멘트 작성 대기(다음 통합작업)';

// [3] EDIT 1건
const EDIT_ITEM = {
  id: '08201fa6-0c8c-4ceb-8cd6-adbe3a4b4279', // 8 천제연폭포
  comment: '제주 3대 폭포 중 하나로, 3단 폭포가 이어지는 서귀포의 대표 자연 명소예요. 상류에는 칠선녀 전설이 깃든 천제연이 자리합니다.',
};

// [4] APPROVE 17건 — comment_draft.comment → curator_comment
const APPROVE_IDS: string[] = [
  'fe1b28ac-5e8a-46f9-bcfd-e88526e9bd66', // 1  성산일출봉
  'c1e2e029-002d-470c-a91d-24180021642c', // 2  한라산국립공원
  '294a8e01-2cd0-4db9-9a59-3ad9960fd9a7', // 6  만장굴
  '7778ce51-3ab4-4dda-8bc4-33a5771ca93d', // 7  천지연폭포
  'be182347-0b41-400b-90cf-8f2b206dcde3', // 10 협재해수욕장
  'a521dab6-c3de-4bc9-b3a9-9ac16aeb229b', // 12 함덕해수욕장
  '73de633e-0aee-4992-8d12-89a7ced2802d', // 14 카멜리아힐
  '03bf20c8-33cd-4c90-b78d-9cd74c00cd1b', // 15 비자림
  '711d20d5-f5af-4d1c-8923-e11ca0ec20ba', // 17 섭지코지
  'bfbcf699-2600-4099-8249-9edd42b7f227', // 18 주상절리대
  '86c52200-4904-48c7-aab0-102942c6c725', // 19 용머리해안
  '6e3415b3-691d-48e9-a311-18c2ea15599e', // 22 산방산
  '8a5c2190-3416-4a8c-abc9-7908df6dd520', // 37 사려니숲길
  '056167bb-a013-49eb-894a-cefa6592257b', // 44 쇠소깍
  'c1cb24d5-c7f1-40ac-9f30-1ffbf5395763', // 49 외돌개
  'a1d27cac-21c6-4fb9-8b32-074fb683f15a', // 51 제주절물자연휴양림
  'ee3eef35-650a-451f-b0b1-ed4e9419755f', // 53 새별오름
];

// ── 검증 ──────────────────────────────────────────────────────────────────────

const ALL_IDS = [...REJECT_IDS, ...NEEDS_FIX_IDS, EDIT_ITEM.id, ...APPROVE_IDS];
const TOTAL = 54;

if (ALL_IDS.length !== TOTAL) {
  throw new Error(`ID 합계 ${ALL_IDS.length} ≠ ${TOTAL} — 중복/누락 확인`);
}
const uniqueCount = new Set(ALL_IDS).size;
if (uniqueCount !== TOTAL) {
  throw new Error(`중복 ID 존재: ${TOTAL - uniqueCount}건`);
}

console.log(`\n=== 판정 집계 ===`);
console.log(`  REJECT   : ${REJECT_IDS.length}건`);
console.log(`  NEEDS_FIX: ${NEEDS_FIX_IDS.length}건`);
console.log(`  EDIT     : 1건`);
console.log(`  APPROVE  : ${APPROVE_IDS.length}건`);
console.log(`  합계     : ${ALL_IDS.length}건 ${ALL_IDS.length === TOTAL ? '✓' : '⚠'}`);

// ── Main ──────────────────────────────────────────────────────────────────────

loadEnv();
const isDryRun = process.argv.includes('--dry-run');

if (isDryRun) {
  console.log('\n[dry-run] DB 업데이트 건너뜀.');
  process.exit(0);
}

const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });

// ── Step 1: REJECT ────────────────────────────────────────────────────────────

console.log(`\n[1] REJECT ${REJECT_IDS.length}건`);
const { rowCount: rejectCount } = await pool.query(
  `UPDATE curation_candidates SET comment_warning_flag = 'rejected' WHERE id = ANY($1)`,
  [REJECT_IDS],
);
console.log(`    완료 (${rejectCount ?? 0}행 갱신)`);

// ── Step 2: NEEDS_FIX ─────────────────────────────────────────────────────────

console.log(`\n[2] NEEDS_FIX ${NEEDS_FIX_IDS.length}건`);
const { rowCount: needsFixCount } = await pool.query(
  `UPDATE curation_candidates
     SET comment_warning_flag = 'needs_fix',
         needs_fix_memo       = $2
   WHERE id = ANY($1)`,
  [NEEDS_FIX_IDS, NEEDS_FIX_MEMO],
);
console.log(`    완료 (${needsFixCount ?? 0}행 갱신)`);

// ── Step 3: EDIT ──────────────────────────────────────────────────────────────

console.log(`\n[3] EDIT 1건 (천제연폭포)`);
await pool.query(
  `UPDATE curation_candidates
     SET comment_warning_flag = 'approved',
         curator_comment      = $2
   WHERE id = $1`,
  [EDIT_ITEM.id, EDIT_ITEM.comment],
);
const { rows: [editRow] } = await pool.query<{ name: string; comment: string }>(
  `SELECT name, curator_comment AS comment FROM curation_candidates WHERE id = $1`,
  [EDIT_ITEM.id],
);
console.log(`    [OK] ${editRow!.name}: "${editRow!.comment?.slice(0, 60)}"`);

// ── Step 4: APPROVE — comment_draft.comment → curator_comment ────────────────

console.log(`\n[4] APPROVE ${APPROVE_IDS.length}건 (comment_draft → curator_comment)`);
const { rowCount: approveSetCount } = await pool.query(
  `UPDATE curation_candidates
     SET comment_warning_flag = 'approved',
         curator_comment      = comment_draft->>'comment'
   WHERE id = ANY($1)`,
  [APPROVE_IDS],
);
console.log(`    완료 (${approveSetCount ?? 0}행 갱신)`);

// 댓글 복사 확인 (NULL 남아있으면 경고)
const { rows: nullComments } = await pool.query<{ id: string; name: string }>(
  `SELECT id, name FROM curation_candidates
   WHERE id = ANY($1) AND curator_comment IS NULL`,
  [APPROVE_IDS],
);
if (nullComments.length > 0) {
  console.warn(`    ⚠ curator_comment NULL 잔여 ${nullComments.length}건:`);
  for (const r of nullComments) console.warn(`      - ${r.name} (${r.id.slice(0, 8)})`);
}

// ── Step 5: enriched_at 백필 (approve+edit 18건) ─────────────────────────────

const spotCandidateIds = [...APPROVE_IDS, EDIT_ITEM.id];
console.log(`\n[5] enriched_at 백필 (approve+edit 18건)`);
const { rowCount: enrichedCount } = await pool.query(
  `UPDATE curation_candidates
     SET enriched_at = NOW()
   WHERE id = ANY($1)
     AND enriched_at IS NULL
     AND lat IS NOT NULL
     AND lng IS NOT NULL
     AND thumbnail_url IS NOT NULL`,
  [spotCandidateIds],
);
console.log(`    ${enrichedCount ?? 0}건 enriched_at 설정`);

// ── Step 6: ApproveCandidateUseCase → spots 삽입 ──────────────────────────────

console.log(`\n[6] spots 삽입 (approve+edit 18건)`);

const candidateRepo = new PostgresCurationCandidateRepository(pool);
const spotRepo = new PostgresSpotRepository(pool);
const txManager = new PostgresTransactionManager(pool);
const useCase = new ApproveCandidateUseCase(candidateRepo, spotRepo, txManager);

const { rows: toApprove } = await pool.query<{
  id: string;
  name: string;
  final_score: number | null;
  ai_estimated_score: number | null;
}>(`
  SELECT id, name, final_score, ai_estimated_score
  FROM curation_candidates
  WHERE id = ANY($1)
    AND comment_warning_flag = 'approved'
    AND status IN ('pending', 'kakao_unverified')
  ORDER BY name
`, [spotCandidateIds]);

console.log(`    대상: ${toApprove.length}건 (status=pending/kakao_unverified)`);
const stats = { ok: 0, skipped: 0, error: 0 };

for (const row of toApprove) {
  const curationScore = Math.round(row.final_score ?? row.ai_estimated_score ?? 70);
  try {
    const { spotId } = await useCase.execute({ candidateId: row.id, curationScore });
    console.log(`    [OK] ${row.name} → ${spotId.slice(0, 8)}…`);
    stats.ok++;
  } catch (err) {
    if (err instanceof ApproveError || err instanceof ApproveBlockedError || err instanceof InvalidStatusError) {
      console.warn(`    [SKIP] ${row.name}: ${(err as Error).message}`);
      stats.skipped++;
    } else {
      console.error(`    [ERR] ${row.name}: ${err}`);
      stats.error++;
    }
  }
}
console.log(`\n    삽입=${stats.ok} 스킵=${stats.skipped} 오류=${stats.error}`);

// ── Step 7: 검증 ──────────────────────────────────────────────────────────────

console.log(`\n=== 최종 검증 ===`);

// flag 분포
const { rows: flagCounts } = await pool.query<{ flag: string; cnt: string }>(`
  SELECT comment_warning_flag AS flag, COUNT(*) AS cnt
  FROM curation_candidates
  WHERE id = ANY($1)
  GROUP BY comment_warning_flag ORDER BY flag
`, [ALL_IDS]);

console.log(`\n  flag 분포 (배치 54건):`);
let flagTotal = 0;
for (const r of flagCounts) {
  console.log(`    ${String(r.flag ?? 'NULL').padEnd(12)}: ${r.cnt}건`);
  flagTotal += parseInt(r.cnt, 10);
}
console.log(`    합계        : ${flagTotal}건 ${flagTotal === TOTAL ? '✓' : '⚠ 불일치'}`);

// 천제연폭포 curator_comment 확인
const { rows: [cheonjeyeon] } = await pool.query<{ name: string; comment: string }>(
  `SELECT name, curator_comment AS comment FROM curation_candidates WHERE id = $1`,
  [EDIT_ITEM.id],
);
console.log(`\n  천제연폭포 curator_comment: "${cheonjeyeon?.comment}"`);

// spots 총수
const { rows: [spotTotal] } = await pool.query<{ cnt: string }>(`SELECT COUNT(*) AS cnt FROM spots`);
console.log(`\n  spots 테이블 총: ${spotTotal!.cnt}건`);
console.log(`  이번 배치 삽입 : ${stats.ok}건`);

// approve+edit 중 spots 미삽입 (좌표 없음 등) 보고
if (stats.skipped > 0) {
  const { rows: skippedRows } = await pool.query<{ name: string; enriched_at: string | null; lat: number | null }>(
    `SELECT name, enriched_at, lat FROM curation_candidates
     WHERE id = ANY($1) AND status IN ('pending', 'kakao_unverified')`,
    [spotCandidateIds],
  );
  console.log(`\n  ⚠ spots 미삽입 후보 (좌표/enriched_at 미비 가능성):`);
  for (const r of skippedRows) {
    console.log(`    - ${r.name}: enriched_at=${r.enriched_at ?? 'NULL'}, lat=${r.lat ?? 'NULL'}`);
  }
}

await pool.end();
