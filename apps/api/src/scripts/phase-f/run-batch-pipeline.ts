#!/usr/bin/env tsx
/**
 * Phase F: batch-100 approved 후보 spots 삽입 + 2건 판정 복구
 *
 * 1. enriched_at 백필 (lat/lng/thumbnail 있는 approved 후보 대상)
 * 2. approved 79건 → ApproveCandidateUseCase → spots 삽입
 * 3. 2건 rejected→approved 복구 + curator_comment 교체
 * 4. 복구 2건 spots 삽입
 *
 * 실행: npx tsx src/scripts/phase-f/run-batch-pipeline.ts [--dry-run]
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

// ── 2건 복구 판정 ──────────────────────────────────────────────────────────────
const REVERTS: Array<{ prefix: string; comment: string }> = [
  {
    prefix: '7e76e85c',
    comment: '카트를 타러 많이 찾는 제주 서부의 테마파크예요. 승마·미로공원도 함께 운영합니다.',
  },
  {
    prefix: 'cc1ced36',
    comment: '기마 공연과 승마, 카트를 즐길 수 있는 제주 서부의 테마파크예요. 트랙이 넓은 편입니다.',
  },
];

// 배치 마크다운에서 prefix → full UUID
function parseBatchIds(mdPath: string): string[] {
  const content = readFileSync(mdPath, 'utf-8');
  return [...content.matchAll(/<!-- id: ([0-9a-f-]{36}) -->/g)].map(m => m[1]!);
}

function resolvePrefix(allIds: string[], prefix: string): string {
  const matches = allIds.filter(id => id.startsWith(prefix));
  if (matches.length !== 1) throw new Error(`prefix ${prefix}: ${matches.length}개 매칭`);
  return matches[0]!;
}

async function runApprove(
  pool: Pool,
  useCase: ApproveCandidateUseCase,
  candidateIds: string[],
  label: string,
): Promise<{ ok: number; skipped: number; error: number }> {
  const { rows } = await pool.query<{
    id: string; name: string; final_score: number | null; ai_estimated_score: number | null;
  }>(`
    SELECT id, name, final_score, ai_estimated_score
    FROM curation_candidates
    WHERE id = ANY($1)
      AND comment_warning_flag = 'approved'
      AND status IN ('pending', 'kakao_unverified')
    ORDER BY name
  `, [candidateIds]);

  console.log(`  대상: ${rows.length}건`);
  const stats = { ok: 0, skipped: 0, error: 0 };

  for (const row of rows) {
    const curationScore = Math.round(row.final_score ?? row.ai_estimated_score ?? 70);
    try {
      const { spotId } = await useCase.execute({ candidateId: row.id, curationScore });
      console.log(`  [OK] ${row.name} → ${spotId.slice(0, 8)}…`);
      stats.ok++;
    } catch (err) {
      if (err instanceof ApproveError || err instanceof ApproveBlockedError || err instanceof InvalidStatusError) {
        console.warn(`  [SKIP] ${row.name}: ${(err as Error).message}`);
        stats.skipped++;
      } else {
        console.error(`  [ERR] ${row.name}: ${err}`);
        stats.error++;
      }
    }
  }
  return stats;
}

// ── Main ──────────────────────────────────────────────────────────────────────

loadEnv();
const isDryRun = process.argv.includes('--dry-run');
const allBatchIds = parseBatchIds('dist/batch-100-2026-05-25.md');
const revertIds = REVERTS.map(r => ({ ...r, id: resolvePrefix(allBatchIds, r.prefix) }));

console.log(`\n복구 대상:`);
for (const r of revertIds) console.log(`  ${r.prefix}… → "${r.comment.slice(0, 50)}"`);

if (isDryRun) {
  console.log('\n[dry-run] 건너뜀.');
  process.exit(0);
}

const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });
const candidateRepo = new PostgresCurationCandidateRepository(pool);
const spotRepo = new PostgresSpotRepository(pool);
const txManager = new PostgresTransactionManager(pool);
const useCase = new ApproveCandidateUseCase(candidateRepo, spotRepo, txManager);

// ── Step 1: enriched_at 백필 ──────────────────────────────────────────────────
console.log(`\n[1] enriched_at 백필`);
const { rowCount: enrichedCount } = await pool.query(`
  UPDATE curation_candidates
    SET enriched_at = NOW()
  WHERE comment_warning_flag = 'approved'
    AND status IN ('pending', 'kakao_unverified')
    AND enriched_at IS NULL
    AND lat IS NOT NULL
    AND lng IS NOT NULL
    AND thumbnail_url IS NOT NULL
`);
console.log(`    ${enrichedCount ?? 0}건 enriched_at 설정`);

// ── Step 2: 79건 spots 삽입 ───────────────────────────────────────────────────
console.log(`\n[2] 배치 79건 spots 삽입`);
const stats79 = await runApprove(pool, useCase, allBatchIds, 'batch-79');
console.log(`    삽입=${stats79.ok} 스킵=${stats79.skipped} 오류=${stats79.error}`);

// ── Step 3: 2건 복구 ──────────────────────────────────────────────────────────
console.log(`\n[3] 2건 rejected→approved 복구`);
for (const r of revertIds) {
  await pool.query(`
    UPDATE curation_candidates
      SET comment_warning_flag = 'approved',
          curator_comment      = $2
    WHERE id = $1
  `, [r.id, r.comment]);

  const { rows: [row] } = await pool.query<{ name: string; flag: string; curator_comment: string }>(
    `SELECT name, comment_warning_flag AS flag, curator_comment FROM curation_candidates WHERE id = $1`,
    [r.id],
  );
  console.log(`  [OK] ${row!.name} flag=${row!.flag} comment="${row!.curator_comment?.slice(0, 40)}"`);
}

// ── Step 4: 복구 2건 enriched_at + 삽입 ──────────────────────────────────────
console.log(`\n[4] 복구 2건 enriched_at + spots 삽입`);
await pool.query(`
  UPDATE curation_candidates
    SET enriched_at = NOW()
  WHERE id = ANY($1)
    AND enriched_at IS NULL
    AND lat IS NOT NULL AND lng IS NOT NULL AND thumbnail_url IS NOT NULL
`, [revertIds.map(r => r.id)]);

const stats2 = await runApprove(pool, useCase, revertIds.map(r => r.id), 'revert-2');
console.log(`    삽입=${stats2.ok} 스킵=${stats2.skipped} 오류=${stats2.error}`);

// ── 최종 검증 ──────────────────────────────────────────────────────────────────
const allIds = [...allBatchIds];
const { rows: flagCounts } = await pool.query<{ flag: string; cnt: string }>(`
  SELECT comment_warning_flag AS flag, COUNT(*) AS cnt
  FROM curation_candidates
  WHERE id = ANY($1)
  GROUP BY flag ORDER BY flag
`, [allIds]);

console.log(`\n=== 최종 flag 분포 (배치 100건) ===`);
let total = 0;
for (const r of flagCounts) {
  console.log(`  ${String(r.flag ?? 'NULL').padEnd(12)}: ${r.cnt}건`);
  total += parseInt(r.cnt, 10);
}
console.log(`  합계        : ${total}건 ${total === 100 ? '✓' : '⚠'}`);

const { rows: [spotTotal] } = await pool.query<{ cnt: string }>(`SELECT COUNT(*) AS cnt FROM spots`);
console.log(`\nspots 테이블 총 건수: ${spotTotal!.cnt}건`);
console.log(`이번 배치 spots 삽입: ${stats79.ok + stats2.ok}건`);

await pool.end();
