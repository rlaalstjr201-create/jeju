#!/usr/bin/env tsx
/**
 * Phase F: batch-100-2026-05-25.md 큐레이터 판정 DB 반영
 *
 * 단계:
 *   1. 배치 마크다운에서 100건 ID 파싱
 *   2. REJECT(12) / EDIT(6) / NEEDS_FIX(9) / APPROVE(나머지) 적용
 *   3. approved 후보 → ApproveCandidateUseCase → spots 삽입
 *
 * 실행: npx tsx src/scripts/phase-f/apply-batch-100.ts [--dry-run]
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

// ── 큐레이터 판정 데이터 ──────────────────────────────────────────────────────

const REJECT_PREFIXES = [
  '597a4a7d', // 위미항활어회 (폐점)
  '38aab696', // 마마식당 (폐점)
  'ff7cf0e2', // 통일관
  'ba70dd38', // 한국야구명예전당
  '066932bf', // 예술공간이아
  '966a91a1', // 방일리공원
  '2a9382cf', // 무비랜드
  'a6684dc1', // 섬속의섬우도렌트
  '7e76e85c', // 세리월드 (노후)
  '1bfefc02', // 하이어스 (주소오류)
  'cc1ced36', // 더마카트 (노후)
  'b05a4bf0', // 법환해녀
];

const EDITS: Array<{ prefix: string; comment: string; label: string }> = [
  {
    prefix: '5b19accb',
    label: '마블어벤저스스테이션',
    comment: '마블 캐릭터 피규어로 유명한 제주 실내관광지예요. 아이와 의외로 재밌게 시간을 보낼 수 있는 곳입니다.',
  },
  {
    prefix: '1745731c',
    label: '협재 식당',
    comment: '제주의 신선한 재료로 창의적인 요리를 선보이는, 협재 해변 근처의 분위기 좋은 식당입니다.',
  },
  {
    prefix: '0a698a3e',
    label: '김택화미술관',
    comment: '고향 제주로 돌아와 그 풍경에 매료된 김택화 화백의 작품 세계를 만나는 미술관입니다.',
  },
  {
    prefix: '330afcd8',
    label: '우도 횟집',
    comment: '우도 해변 전망을 배경으로 자연산 해산물 요리를 맛볼 수 있는 횟집입니다.',
  },
  {
    prefix: '4ff67f76',
    label: '우도 해산물 전문점',
    comment: '사장님이 매일 배를 타고 나가 직접 잡아온 생선으로 요리하는 우도의 해산물요리 전문점입니다.',
  },
  {
    prefix: '38ff7ce1',
    label: '이타미준뮤지엄',
    comment: '건축가 이타미 준(유동룡)의 세계를 만나는 제주 건축 미술관으로, 사전 예약제로 운영됩니다.',
  },
];

const NEEDS_FIX: Array<{ prefix: string; memo: string }> = [
  {
    prefix: '5a62ab05',
    memo: '지도 위치 선택 정정 필요 — \'용두암해변거리/카페촌\'으로 검색 위치 확인',
  },
  {
    prefix: 'cdc0d917',
    memo: '업체명임 → \'제주 자전거 여행 코스\' 소개로 재작성 필요',
  },
  {
    prefix: '329fd013',
    memo: '명칭 정정 — 지도에 \'산호 해수욕장\'으로 표기됨',
  },
  {
    prefix: '1e9c7436',
    memo: '정식명 \'제주양조장\'으로 변경 필요',
  },
  {
    prefix: 'e277c652',
    memo: '동명 3곳 존재 — 서귀포시 전복돌솥밥 지점으로 위치 명확히',
  },
  {
    prefix: '84ebcd09',
    memo: '프랜차이즈 3지점 — 중문점 위치 명확히',
  },
  {
    prefix: 'f55799f2',
    memo: '네이버 미등록·후기 없음 — 등재/노출 가치 재검토',
  },
  {
    prefix: '995bdc18',
    memo: '정식명 \'제주꿈바당어린이도서관\'으로 변경 필요',
  },
  {
    prefix: '89bb3ca0',
    memo: '\'빛의벙커\' 연계 코멘트인데 빛의벙커 미등재 — 연계 표현 제거 또는 빛의벙커 추가',
  },
];

// ── 배치 마크다운 파싱 ────────────────────────────────────────────────────────

function parseBatchIds(mdPath: string): string[] {
  const content = readFileSync(mdPath, 'utf-8');
  const matches = [...content.matchAll(/<!-- id: ([0-9a-f-]{36}) -->/g)];
  return matches.map(m => m[1]!);
}

function resolvePrefix(allIds: string[], prefix: string): string {
  const matches = allIds.filter(id => id.startsWith(prefix));
  if (matches.length === 0) throw new Error(`No ID found for prefix ${prefix}`);
  if (matches.length > 1) throw new Error(`Multiple IDs found for prefix ${prefix}: ${matches.join(', ')}`);
  return matches[0]!;
}

// ── Main ──────────────────────────────────────────────────────────────────────

loadEnv();
const isDryRun = process.argv.includes('--dry-run');
const mdPath = 'dist/batch-100-2026-05-25.md';

const allIds = parseBatchIds(mdPath);
if (allIds.length !== 100) {
  throw new Error(`Expected 100 IDs in markdown, got ${allIds.length}`);
}

// Resolve full UUIDs
const rejectIds   = REJECT_PREFIXES.map(p => resolvePrefix(allIds, p));
const editIds     = EDITS.map(e => ({ ...e, id: resolvePrefix(allIds, e.prefix) }));
const needsFixIds = NEEDS_FIX.map(n => ({ ...n, id: resolvePrefix(allIds, n.prefix) }));

const handledIds  = new Set([
  ...rejectIds,
  ...editIds.map(e => e.id),
  ...needsFixIds.map(n => n.id),
]);
const approveIds = allIds.filter(id => !handledIds.has(id));

console.log(`\n=== 판정 집계 ===`);
console.log(`  REJECT   : ${rejectIds.length}건`);
console.log(`  EDIT     : ${editIds.length}건`);
console.log(`  NEEDS_FIX: ${needsFixIds.length}건`);
console.log(`  APPROVE  : ${approveIds.length}건`);
console.log(`  합계     : ${rejectIds.length + editIds.length + needsFixIds.length + approveIds.length}건`);
if (rejectIds.length + editIds.length + needsFixIds.length + approveIds.length !== 100) {
  throw new Error('합계가 100이 아님 — ID 중복 또는 누락 확인');
}

if (isDryRun) {
  console.log('\n[dry-run] DB 업데이트 건너뜀.');
  process.exit(0);
}

const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });

// ── Step 1: REJECT ────────────────────────────────────────────────────────────

console.log(`\n[1] REJECT ${rejectIds.length}건`);
for (const id of rejectIds) {
  await pool.query(
    `UPDATE curation_candidates SET comment_warning_flag = 'rejected' WHERE id = $1`,
    [id],
  );
}
console.log(`    완료`);

// ── Step 2: EDIT ──────────────────────────────────────────────────────────────

console.log(`\n[2] EDIT ${editIds.length}건`);
for (const e of editIds) {
  await pool.query(
    `UPDATE curation_candidates
       SET comment_warning_flag = 'approved',
           curator_comment      = $2
     WHERE id = $1`,
    [e.id, e.comment],
  );
  console.log(`    [OK] ${e.label}`);
}

// ── Step 3: NEEDS_FIX ─────────────────────────────────────────────────────────

console.log(`\n[3] NEEDS_FIX ${needsFixIds.length}건`);
for (const n of needsFixIds) {
  await pool.query(
    `UPDATE curation_candidates
       SET comment_warning_flag = 'needs_fix',
           needs_fix_memo       = $2
     WHERE id = $1`,
    [n.id, n.memo],
  );
  const { rows } = await pool.query<{ name: string }>(
    `SELECT name FROM curation_candidates WHERE id = $1`,
    [n.id],
  );
  console.log(`    [OK] ${rows[0]?.name ?? n.id.slice(0, 8)} — ${n.memo.slice(0, 60)}`);
}

// ── Step 4: APPROVE ───────────────────────────────────────────────────────────

console.log(`\n[4] APPROVE ${approveIds.length}건`);
for (const id of approveIds) {
  await pool.query(
    `UPDATE curation_candidates SET comment_warning_flag = 'approved' WHERE id = $1`,
    [id],
  );
}
console.log(`    완료`);

// ── Step 5: Verify flag counts ────────────────────────────────────────────────

const { rows: flagCounts } = await pool.query<{ flag: string; cnt: string }>(`
  SELECT comment_warning_flag AS flag, COUNT(*) AS cnt
  FROM curation_candidates
  WHERE id = ANY($1)
  GROUP BY comment_warning_flag
  ORDER BY flag
`, [allIds]);

console.log(`\n=== flag 분포 검증 (배치 100건) ===`);
let total = 0;
for (const r of flagCounts) {
  console.log(`  ${String(r.flag).padEnd(12)}: ${r.cnt}건`);
  total += parseInt(r.cnt, 10);
}
console.log(`  합계        : ${total}건 ${total === 100 ? '✓' : '⚠ 불일치'}`);

// ── Step 6: Run approve pipeline ──────────────────────────────────────────────

console.log(`\n[5] spots 삽입 (approved 후보)`);

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
`, [allIds]);

console.log(`    대상: ${toApprove.length}건`);
const pipelineStats = { ok: 0, skipped: 0, error: 0 };

for (const row of toApprove) {
  const curationScore = Math.round(row.final_score ?? row.ai_estimated_score ?? 70);
  try {
    const { spotId } = await useCase.execute({ candidateId: row.id, curationScore });
    console.log(`    [OK] ${row.name} → spot ${spotId.slice(0, 8)}…`);
    pipelineStats.ok++;
  } catch (err) {
    if (err instanceof ApproveError || err instanceof ApproveBlockedError || err instanceof InvalidStatusError) {
      console.warn(`    [SKIP] ${row.name}: ${(err as Error).message}`);
      pipelineStats.skipped++;
    } else {
      console.error(`    [ERR] ${row.name}: ${err}`);
      pipelineStats.error++;
    }
  }
}

console.log(`\n    삽입=${pipelineStats.ok} 스킵=${pipelineStats.skipped} 오류=${pipelineStats.error}`);

// ── Final summary ──────────────────────────────────────────────────────────────

const { rows: [spotCount] } = await pool.query<{ cnt: string }>(
  `SELECT COUNT(*) AS cnt FROM spots`,
);
console.log(`\n=== 완료 ===`);
console.log(`  spots 테이블 총: ${spotCount!.cnt}건`);
console.log(`  이번 배치 삽입 : ${pipelineStats.ok}건`);

await pool.end();
