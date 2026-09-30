#!/usr/bin/env tsx
/**
 * Phase F: batch-buzz-60-2026-05-27.md 큐레이터 판정 DB 반영
 *
 * 단계:
 *   1. REJECT(3)   — flag='rejected' + needs_fix_memo 사유
 *   2. EDIT(16)    — flag='approved' + curator_comment 교체
 *   3. APPROVE(41) — flag='approved' + comment_draft.comment → curator_comment
 *   4. 창흥식당 region 확인 및 서귀포시 정정
 *   5. enriched_at 백필 (approved 57건)
 *   6. ApproveCandidateUseCase → spots 삽입
 *   7. 검증
 *
 * 실행: npx tsx src/scripts/phase-f/apply-batch-buzz.ts [--dry-run]
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

// ── [1] REJECT 3건 ─────────────────────────────────────────────────────────────

const REJECTS: Array<{ id: string; memo: string; label: string }> = [
  {
    id: 'b6c61c15-2c6b-4bf9-bb19-c78240f08fd4',
    label: '서귀포해안',
    memo: '일반명사로 단일 장소 아님, 핀 찍을 위치 없음',
  },
  {
    id: 'd1c23fff-fac7-46ff-8f08-6400bfeeff82',
    label: '제주성지',
    memo: '성 이시돌 센터와 혼동된 사실 오류 (실제는 제주 읍성터)',
  },
  {
    id: '7c460870-5b90-4ad4-b6f2-ffb14e9f5199',
    label: '햇살나무바다아래 왓추 테라피센터',
    memo: '회원제 멤버십(연 10명) 운영, 일반 방문 불가',
  },
];

// ── [2] EDIT 16건 ──────────────────────────────────────────────────────────────

const EDITS: Array<{ id: string; label: string; comment: string }> = [
  {
    id: '3cdbbae5-6df0-4fad-aa51-b291e09393a1',
    label: '문게야',
    comment: '문어 전문점으로 횟감 퀄리티가 좋은 곳이에요. 제주시청 근처에 있어 현지인들이 자주 찾습니다.',
  },
  {
    id: '4f99791a-cc3e-47b6-bd62-a611348ae8b3',
    label: '카페오늘의바다',
    comment: '서귀포 법환 지역의 오션뷰 카페로, 법환포구 앞 바다를 보며 쉬어가기 좋은 곳입니다.',
  },
  {
    id: '69002e77-c9c4-4d00-a8e4-b74e1c66a04e',
    label: '바다가는길',
    comment: '서귀포 서홍동 새연교·서귀포항 근처의 카페로, 항구와 바다를 함께 감상할 수 있는 곳입니다.',
  },
  {
    id: '5f110ba9-ba0c-4f9b-b1a4-849af7e29f25',
    label: '흑돼지거리',
    comment: '제주 원도심 관덕정 일대에 흑돼지 전문점들이 모여 있는 거리예요. 도민들도 자주 찾는 맛집이 여러 곳 있습니다.',
  },
  {
    id: '29fef347-0df4-46d0-9c38-a0811054d50d',
    label: '연동길',
    comment: '담백한 옥돔뭇국과 흑돼지불백, 넉넉한 상차림으로 알려진 연동의 한식당이에요. 월요일은 휴무입니다.',
  },
  {
    id: '30ee33b9-6e2c-41e3-ba2f-fc9d9cd46b4c',
    label: '제주해물밥',
    comment: '돌솥에 해초·전복·성게가 올라간 해물밥이 시그니처예요. 오션뷰와 함께 제주 해물 맛을 즐길 수 있습니다.',
  },
  {
    id: '1039ce7f-3436-4ae5-9a3d-a9e48aa862fc',
    label: '바다의집',
    comment: '성산 오조리의 가정식 식당으로, 재료 소진 시 조기 마감합니다. 바다가 보이는 곳에서 한끼를 즐길 수 있어요.',
  },
  {
    id: '49448ca2-23a7-4ea9-ab42-3675f631e341',
    label: '제주회포장',
    comment: '동문시장 인근의 회포장 전문점이에요. 시장에서 도보 10분 거리에 있습니다.',
  },
  {
    id: '5b339231-adb4-4703-9a34-871bccf56ffa',
    label: '모르는곳 제주 혼술바',
    comment: '내향적인 사람도 편하게 들를 수 있는 사계해변 뷰 혼술바예요. 조용한 1인 바 콘셉트입니다.',
  },
  {
    id: 'cc7548cf-5a64-407a-aeb7-3be39ff9810b',
    label: '제주베이',
    comment: '외도 연대포구 근처의 통갈치구이·갈치조림 전문점이에요. 정식 가게명은 \'제주베이통갈치구이\'입니다.',
  },
  {
    id: '91e6ff04-c95c-436c-b851-d4c4af9a5a75',
    label: '전복마시문어마시',
    comment: '성산권 온평리의 해산물 맛집이에요. 토속 건물 스타일에서 해산물 요리를 맛볼 수 있습니다.',
  },
  {
    id: 'd50d7748-4c16-4a47-ba11-bfea8da14508',
    label: '흑돼지구이집 하영',
    comment: '중문관광단지 내 제주 흑돼지 전문점으로, 흑돼지 구이와 함께 전복뚝배기·흑돼지김치찌개·후식 손냉면을 즐길 수 있어요.',
  },
  {
    id: 'a97a4b77-fa00-407d-aba0-ac156d0dfb05',
    label: '제주해양레저파크',
    comment: '협재해수욕장 근처에서 패러세일링을 포함한 다양한 수상레저 체험을 즐길 수 있는 곳이에요.',
  },
  {
    id: '38b8e236-f5d1-44d2-8238-5dee33734058',
    label: '창흥식당',
    comment: '서귀포 표선해수욕장 근처의 로컬 맛집으로, 제주 토속음식 \'접짝뼈국\'이 유명합니다.',
  },
  {
    id: 'cd187752-6955-483f-b92e-053f37b83174',
    label: '카페소금',
    comment: '애월 구엄리의 소금빵 맛집이에요.',
  },
  {
    id: '9719bb24-469f-4c72-833e-2c1ee52d3c88',
    label: '제주빵집',
    comment: '애월 상가목장길의 빵집으로, 선물용 포장이 깔끔해 여럿이 들러 골라가기 좋은 곳입니다.',
  },
];

// ── [3] APPROVE 41건 (전체 60 − reject 3 − edit 16) ───────────────────────────

const APPROVE_IDS: string[] = [
  '720a9d0e-f849-42d6-ab96-87cbd01f2545', // 1  바람과바다
  '4f3e0c63-0659-417b-9416-1977ec005a90', // 2  제주국제예술센터
  '2511da22-04b5-48b3-92dd-b014c6bedcf5', // 3  바람카페
  '5769b133-d3b7-4019-bc5d-3ad1b2fdcc99', // 4  숙성도
  '5cbf8b29-f19a-40a7-92f8-4683810d4e77', // 5  제주여행가야밀면
  '22d7785a-d579-4da6-a329-5fa992b30184', // 7  뷰 제주하늘
  '8e1a7bce-28c4-4970-89f5-68a645b7d065', // 8  제주여행자정보센터
  'dfcc877f-90c3-461b-a79d-be74ae2ad673', // 9  카페나모나모베이커리
  'e73ab790-19f1-49a3-ab0b-79e0e638d66e', // 10 제주올레 7-1코스
  'ef51516d-244c-4b34-bf36-88f65e6f809b', // 12 제주도 고기국수 만세국수
  '6a6eea2e-fbe6-499a-bd65-ca9eab339615', // 13 제주 서핑도
  '1ff0ac51-2d26-4749-a6b2-22a678b57d02', // 15 애월해안도로
  '01a6c37e-1029-4072-ba33-13fdeb951c00', // 16 갈치바다
  '1e162b0f-4427-40dd-842a-113a89f91465', // 18 가든이다
  '0b7fe73d-482c-489a-be96-e9ba6290b61c', // 20 오래물
  '516dd7c4-6766-409c-a9bf-8d335df526fe', // 21 제주국제평화센터
  '81176981-cf71-4ccf-96a0-e82f0ace9cce', // 23 제주운정이네
  'f66e5058-1179-498f-b44c-1f6a18061d11', // 24 바다는안보여요
  'c709cba1-001d-48f4-99ec-b6140eaa5f59', // 25 그계절
  'b097b68b-515a-44af-9457-2382b60fac39', // 26 더힐하우스스파
  '8743f795-55b8-4280-b44c-05a91af3b8d9', // 27 인카페온더비치
  '6cf22555-b2f1-40e6-812b-5c71567733fa', // 28 제주그림카페
  '7ba28db8-cc08-41e7-8517-252ee6f70fdc', // 29 카페한라산
  '59c25579-c176-4845-a8cb-89f50a20c604', // 30 산도위치제주본점
  'f93a6095-1734-4ba8-b5e5-226da1fc34bd', // 34 안전식당
  '5f321d64-fc0b-41ec-baec-9224b18fb2da', // 36 보말이네
  '562804f8-de42-47d5-a97f-540ada0a3409', // 38 제주평화박물관
  '2865865d-d86f-4db7-b9b6-a95cfec53486', // 40 냠냠제주
  '0b9cf2d7-54ea-45c6-91c1-fcf1cb8e743a', // 42 한라산아래첫마을 영농조합법인
  '20ce1b10-8c85-4abf-9f84-8e4f04548ca9', // 44 제주정지
  '578db631-d85b-4062-99d6-2602d4ac504e', // 45 행복맛집
  '8b7fa93a-6408-4a4a-b16e-2ab29cfce3d4', // 48 문화공간 양
  '8b5a2c33-3431-4c34-bc0d-091b85a0251f', // 49 대한목장
  '34f29828-a6e2-4c2b-9fce-ba1992ecf2ab', // 52 테우닷
  'df56251b-f17d-4788-84fd-3002d539ad91', // 53 광어다
  '973cd40f-73e9-465e-a442-e498cf07630d', // 54 제주해양레저타운
  'a6ce3e86-cffc-4a59-84d9-26ce2cb552bf', // 55 그초록
  '84faaea2-cbbf-4035-82d6-53818681e87e', // 56 제주 중문흑돼지 초풍
  'dc5ca91b-3238-4669-93a1-8fd7466e12c1', // 57 제주교육박물관
  'b2d8e026-010f-4b5c-96ee-5554153d52c4', // 58 용두암
  '20df8d1b-64b0-494f-830f-e1056147f9d1', // 59 제주통큰장어
];

// ── 검증 (ID 중복·합계) ────────────────────────────────────────────────────────

const REJECT_IDS = REJECTS.map(r => r.id);
const EDIT_IDS   = EDITS.map(e => e.id);
const ALL_IDS    = [...REJECT_IDS, ...EDIT_IDS, ...APPROVE_IDS];
const TOTAL      = 60;

if (ALL_IDS.length !== TOTAL) throw new Error(`합계 ${ALL_IDS.length} ≠ ${TOTAL}`);
if (new Set(ALL_IDS).size !== TOTAL) throw new Error('중복 ID 존재');

console.log(`\n=== 판정 집계 ===`);
console.log(`  REJECT   : ${REJECT_IDS.length}건`);
console.log(`  EDIT     : ${EDIT_IDS.length}건`);
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

console.log(`\n[1] REJECT ${REJECTS.length}건`);
for (const r of REJECTS) {
  await pool.query(
    `UPDATE curation_candidates
       SET comment_warning_flag = 'rejected',
           needs_fix_memo       = $2
     WHERE id = $1`,
    [r.id, r.memo],
  );
  console.log(`    [OK] ${r.label} — ${r.memo}`);
}

// ── Step 2: EDIT ──────────────────────────────────────────────────────────────

console.log(`\n[2] EDIT ${EDITS.length}건`);
for (const e of EDITS) {
  await pool.query(
    `UPDATE curation_candidates
       SET comment_warning_flag = 'approved',
           curator_comment      = $2
     WHERE id = $1`,
    [e.id, e.comment],
  );
  console.log(`    [OK] ${e.label}: "${e.comment.slice(0, 50)}…"`);
}

// ── Step 3: APPROVE — comment_draft.comment → curator_comment ────────────────

console.log(`\n[3] APPROVE ${APPROVE_IDS.length}건`);
const { rowCount: approveSetCount } = await pool.query(
  `UPDATE curation_candidates
     SET comment_warning_flag = 'approved',
         curator_comment      = comment_draft->>'comment'
   WHERE id = ANY($1)`,
  [APPROVE_IDS],
);
console.log(`    완료 (${approveSetCount ?? 0}행 갱신)`);

const { rows: nullComments } = await pool.query<{ name: string }>(
  `SELECT name FROM curation_candidates WHERE id = ANY($1) AND curator_comment IS NULL`,
  [APPROVE_IDS],
);
if (nullComments.length > 0) {
  console.warn(`    ⚠ curator_comment NULL ${nullComments.length}건: ${nullComments.map(r => r.name).join(', ')}`);
}

// ── Step 4: 창흥식당 region 확인 및 정정 ─────────────────────────────────────

const CHANGEUNG_ID = '38b8e236-f5d1-44d2-8238-5dee33734058';
console.log(`\n[4] 창흥식당 region 확인`);
const { rows: [changeung] } = await pool.query<{ name: string; region: string }>(
  `SELECT name, region FROM curation_candidates WHERE id = $1`,
  [CHANGEUNG_ID],
);
console.log(`    현재 region: ${changeung!.region}`);

if (changeung!.region === 'jeju-city') {
  await pool.query(
    `UPDATE curation_candidates SET region = 'seogwipo' WHERE id = $1`,
    [CHANGEUNG_ID],
  );
  console.log(`    → 'jeju-city' → 'seogwipo' 정정 완료`);
} else {
  console.log(`    → 정정 불필요 (이미 ${changeung!.region})`);
}

// ── Step 5: enriched_at 백필 (approved 57건) ──────────────────────────────────

const approvedIds = [...EDIT_IDS, ...APPROVE_IDS];
console.log(`\n[5] enriched_at 백필 (approved ${approvedIds.length}건)`);
const { rowCount: enrichedCount } = await pool.query(
  `UPDATE curation_candidates
     SET enriched_at = NOW()
   WHERE id = ANY($1)
     AND enriched_at IS NULL
     AND lat IS NOT NULL
     AND lng IS NOT NULL
     AND thumbnail_url IS NOT NULL`,
  [approvedIds],
);
console.log(`    ${enrichedCount ?? 0}건 enriched_at 설정`);

// ── Step 6: ApproveCandidateUseCase → spots 삽입 ──────────────────────────────

console.log(`\n[6] spots 삽입 (approved ${approvedIds.length}건)`);

const candidateRepo = new PostgresCurationCandidateRepository(pool);
const spotRepo      = new PostgresSpotRepository(pool);
const txManager     = new PostgresTransactionManager(pool);
const useCase       = new ApproveCandidateUseCase(candidateRepo, spotRepo, txManager);

const { rows: toApprove } = await pool.query<{
  id: string; name: string; final_score: number | null; ai_estimated_score: number | null;
}>(`
  SELECT id, name, final_score, ai_estimated_score
  FROM curation_candidates
  WHERE id = ANY($1)
    AND comment_warning_flag = 'approved'
    AND status IN ('pending', 'kakao_unverified')
  ORDER BY name
`, [approvedIds]);

console.log(`    대상: ${toApprove.length}건`);
const stats = { ok: 0, skipped: 0, error: 0 };
const skippedNames: string[] = [];

for (const row of toApprove) {
  const curationScore = Math.round(row.final_score ?? row.ai_estimated_score ?? 70);
  try {
    const { spotId } = await useCase.execute({ candidateId: row.id, curationScore });
    console.log(`    [OK] ${row.name} → ${spotId.slice(0, 8)}…`);
    stats.ok++;
  } catch (err) {
    if (err instanceof ApproveError || err instanceof ApproveBlockedError || err instanceof InvalidStatusError) {
      console.warn(`    [SKIP] ${row.name}: ${(err as Error).message}`);
      skippedNames.push(row.name);
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

const { rows: flagCounts } = await pool.query<{ flag: string; cnt: string }>(`
  SELECT comment_warning_flag AS flag, COUNT(*) AS cnt
  FROM curation_candidates
  WHERE id = ANY($1)
  GROUP BY flag ORDER BY flag
`, [ALL_IDS]);

console.log(`\n  flag 분포 (배치 60건):`);
let flagTotal = 0;
for (const r of flagCounts) {
  console.log(`    ${String(r.flag ?? 'NULL').padEnd(12)}: ${r.cnt}건`);
  flagTotal += parseInt(r.cnt, 10);
}
console.log(`    합계        : ${flagTotal}건 ${flagTotal === TOTAL ? '✓' : '⚠ 불일치'}`);

// edit 16건 curator_comment 샘플 확인
console.log(`\n  EDIT curator_comment 확인 (5건 샘플):`);
const { rows: editCheck } = await pool.query<{ name: string; comment: string }>(
  `SELECT name, curator_comment AS comment FROM curation_candidates WHERE id = ANY($1) ORDER BY name LIMIT 5`,
  [EDIT_IDS],
);
for (const r of editCheck) {
  console.log(`    ${r.name}: "${r.comment?.slice(0, 60)}"`);
}

// 창흥식당 최종 region
const { rows: [changeungFinal] } = await pool.query<{ region: string }>(
  `SELECT region FROM curation_candidates WHERE id = $1`,
  [CHANGEUNG_ID],
);
console.log(`\n  창흥식당 region: ${changeungFinal!.region}`);

// spots 총수
const { rows: [spotTotal] } = await pool.query<{ cnt: string }>(`SELECT COUNT(*) AS cnt FROM spots`);
console.log(`\n  spots 테이블 총: ${spotTotal!.cnt}건`);
console.log(`  이번 배치 삽입 : ${stats.ok}건`);

// 좌표·썸네일 누락으로 삽입 못 한 건 상세
if (skippedNames.length > 0) {
  console.log(`\n  ⚠ 삽입 실패 (enriched_at·좌표·썸네일 미비):`);
  const { rows: skippedDetail } = await pool.query<{
    name: string; enriched_at: string | null; lat: number | null; lng: number | null; thumbnail_url: string | null;
  }>(
    `SELECT name, enriched_at::text, lat, lng, thumbnail_url
     FROM curation_candidates
     WHERE id = ANY($1) AND status IN ('pending', 'kakao_unverified')`,
    [approvedIds],
  );
  for (const r of skippedDetail.filter(r => !r.enriched_at || !r.lat || !r.lng || !r.thumbnail_url)) {
    console.log(`    - ${r.name}: enriched_at=${r.enriched_at ?? 'NULL'} lat=${r.lat ?? 'NULL'} thumbnail=${r.thumbnail_url ? '있음' : 'NULL'}`);
  }
}

await pool.end();
