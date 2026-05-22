#!/usr/bin/env tsx
/**
 * Phase F: 큐레이터 승인 후보 → Spot 레코드 생성
 *
 * apply-alpha-decisions.ts 실행 후, comment_warning_flag = 'approved'인
 * 후보를 ApproveCandidateUseCase로 처리해 spots 테이블에 삽입.
 *
 * Guards (ApproveCandidateUseCase 내부):
 *   - enrichedAt IS NULL         → skipped (NotEnriched)
 *   - lat/lng/thumbnailUrl NULL  → skipped (IncompleteEnrichment)
 *   - status not pending/kakao_unverified → skipped (InvalidStatusError)
 *
 * 실행: npx tsx src/scripts/phase-f/run-approve-pipeline.ts [--dry-run]
 */
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { PostgresCurationCandidateRepository } from '../../infrastructure/persistence/PostgresCurationCandidateRepository.js';
import { PostgresSpotRepository } from '../../infrastructure/persistence/PostgresSpotRepository.js';
import { PostgresTransactionManager } from '../../infrastructure/persistence/PostgresTransactionManager.js';
import { ApproveCandidateUseCase, ApproveError, ApproveBlockedError, InvalidStatusError } from '../../application/curation/ApproveCandidateUseCase.js';

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

interface CandidateApproveRow {
  id: string;
  name: string;
  final_score: number | null;
  ai_estimated_score: number | null;
}

// ── Main ──────────────────────────────────────────────────────────────────────

loadEnv();
const isDryRun = process.argv.includes('--dry-run');
console.log(`Phase F approve pipeline${isDryRun ? '  [dry-run]' : ''}`);

const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });

const { rows } = await pool.query<CandidateApproveRow>(`
  SELECT id, name, final_score, ai_estimated_score
  FROM curation_candidates
  WHERE comment_warning_flag = 'approved'
    AND status IN ('pending', 'kakao_unverified')
  ORDER BY name
`);

console.log(`\n승인 대기 후보: ${rows.length}건`);
if (rows.length === 0) {
  console.log('apply-alpha-decisions.ts 먼저 실행하세요.');
  await pool.end();
  process.exit(0);
}

if (isDryRun) {
  for (const r of rows) {
    const score = Math.round(r.final_score ?? r.ai_estimated_score ?? 70);
    console.log(`  [dry] ${r.name} → curationScore=${score}`);
  }
  await pool.end();
  process.exit(0);
}

const candidateRepo = new PostgresCurationCandidateRepository(pool);
const spotRepo = new PostgresSpotRepository(pool);
const txManager = new PostgresTransactionManager(pool);
const useCase = new ApproveCandidateUseCase(candidateRepo, spotRepo, txManager);

const stats = { ok: 0, skipped: 0, error: 0 };

for (const row of rows) {
  const curationScore = Math.round(row.final_score ?? row.ai_estimated_score ?? 70);
  try {
    const { spotId } = await useCase.execute({
      candidateId: row.id,
      curationScore,
    });
    console.log(`  [OK] ${row.name} → spot ${spotId.slice(0, 8)}…`);
    stats.ok++;
  } catch (err) {
    if (err instanceof ApproveError || err instanceof ApproveBlockedError || err instanceof InvalidStatusError) {
      console.warn(`  [SKIP] ${row.name}: ${err.message}`);
      stats.skipped++;
    } else {
      console.error(`  [ERR] ${row.name}: ${err}`);
      stats.error++;
    }
  }
}

await pool.end();

console.log(`\n완료: ok=${stats.ok} skipped=${stats.skipped} error=${stats.error}`);
if (stats.ok > 0) {
  console.log(`\n${stats.ok}건 Spot 레코드 생성 완료.`);
}
if (stats.skipped > 0) {
  console.log(`${stats.skipped}건 스킵 — enrichment 미완료 또는 status 불일치 후보.`);
  console.log(`  → PATCH /candidates/:id/coordinates 로 좌표 보강 후 재실행`);
}
