import type { Pool } from 'pg';
import type { CurationDecisionRepository } from '../../domain/ports/CurationDecisionRepository.js';
import type { CurationDecision, DecisionType, RejectionReasonEnum } from '../../domain/curation/CurationDecision.js';

interface DecisionRow {
  id: string;
  candidate_id: string;
  decided_at: Date;
  decided_by: string;
  decision: string;
  curation_score: number | null;
  rejection_reason_enum: string | null;
  rejection_reason_text: string | null;
  ai_estimated_score: number | null;
  ai_estimated_at: Date | null;
  curator_override: boolean | null;
  free_memo: string | null;
  created_at: Date;
}

function rowToDecision(row: DecisionRow): CurationDecision {
  return {
    id: row.id,
    candidateId: row.candidate_id,
    decidedAt: row.decided_at.toISOString(),
    decidedBy: row.decided_by,
    decision: row.decision as DecisionType,
    curationScore: row.curation_score,
    rejectionReasonEnum: row.rejection_reason_enum as RejectionReasonEnum | null,
    rejectionReasonText: row.rejection_reason_text,
    aiEstimatedScore: row.ai_estimated_score,
    aiEstimatedAt: row.ai_estimated_at?.toISOString() ?? null,
    curatorOverride: row.curator_override,
    freeMemo: row.free_memo,
    createdAt: row.created_at.toISOString(),
  };
}

export class PostgresCurationDecisionRepository implements CurationDecisionRepository {
  constructor(private readonly pool: Pool) {}

  async save(decision: CurationDecision): Promise<void> {
    await this.pool.query(
      `INSERT INTO curation_decisions (
         id, candidate_id, decided_at, decided_by, decision,
         curation_score, rejection_reason_enum, rejection_reason_text,
         ai_estimated_score, ai_estimated_at, curator_override, free_memo, created_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (id) DO UPDATE SET
         decided_at             = EXCLUDED.decided_at,
         decided_by             = EXCLUDED.decided_by,
         decision               = EXCLUDED.decision,
         curation_score         = EXCLUDED.curation_score,
         rejection_reason_enum  = EXCLUDED.rejection_reason_enum,
         rejection_reason_text  = EXCLUDED.rejection_reason_text,
         ai_estimated_score     = EXCLUDED.ai_estimated_score,
         ai_estimated_at        = EXCLUDED.ai_estimated_at,
         curator_override       = EXCLUDED.curator_override,
         free_memo              = EXCLUDED.free_memo`,
      [
        decision.id,
        decision.candidateId,
        decision.decidedAt,
        decision.decidedBy,
        decision.decision,
        decision.curationScore,
        decision.rejectionReasonEnum,
        decision.rejectionReasonText,
        decision.aiEstimatedScore,
        decision.aiEstimatedAt,
        decision.curatorOverride,
        decision.freeMemo,
        decision.createdAt,
      ],
    );
  }

  async findByCandidateId(candidateId: string): Promise<CurationDecision | undefined> {
    const result = await this.pool.query<DecisionRow>(
      `SELECT id, candidate_id, decided_at, decided_by, decision,
              curation_score, rejection_reason_enum, rejection_reason_text,
              ai_estimated_score, ai_estimated_at, curator_override, free_memo, created_at
       FROM curation_decisions
       WHERE candidate_id = $1
       ORDER BY decided_at DESC
       LIMIT 1`,
      [candidateId],
    );
    const row = result.rows[0];
    return row !== undefined ? rowToDecision(row) : undefined;
  }
}
