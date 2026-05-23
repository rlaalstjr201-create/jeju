import type { CurationDecisionRepository } from '../../domain/ports/CurationDecisionRepository.js';
import type { CurationCandidateRepository } from '../../domain/ports/CurationCandidateRepository.js';
import type { CurationDecision, DecisionType, RejectionReasonEnum } from '../../domain/curation/CurationDecision.js';

export class InvalidDecisionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidDecisionError';
  }
}

interface PersistDecisionInput {
  readonly candidateId: string;
  readonly decidedBy: string;
  readonly decision: DecisionType;
  readonly curationScore?: number;
  readonly rejectionReasonEnum?: RejectionReasonEnum;
  readonly rejectionReasonText?: string;
  readonly freeMemo?: string;
}

interface PersistDecisionOutput {
  readonly decisionId: string;
}

export class PersistCurationDecisionUseCase {
  constructor(
    private readonly decisionRepo: CurationDecisionRepository,
    private readonly candidateRepo: CurationCandidateRepository,
  ) {}

  async execute(input: PersistDecisionInput): Promise<PersistDecisionOutput> {
    if (input.decision === 'approve' && input.curationScore === undefined) {
      throw new InvalidDecisionError('curationScore is required for approve decision');
    }
    if (input.decision === 'reject' && input.rejectionReasonEnum === undefined) {
      throw new InvalidDecisionError('rejectionReasonEnum is required for reject decision');
    }

    const now = new Date().toISOString();
    const id = crypto.randomUUID();

    const decision: CurationDecision = {
      id,
      candidateId: input.candidateId,
      decidedAt: now,
      decidedBy: input.decidedBy,
      decision: input.decision,
      curationScore: input.curationScore ?? null,
      rejectionReasonEnum: input.rejectionReasonEnum ?? null,
      rejectionReasonText: input.rejectionReasonText ?? null,
      aiEstimatedScore: null,
      aiEstimatedAt: null,
      curatorOverride: null,
      freeMemo: input.freeMemo ?? null,
      createdAt: now,
    };

    await this.decisionRepo.save(decision);

    if (input.decision === 'approve') {
      await this.candidateRepo.updateStatusConditional(input.candidateId, 'approved', 'pending');
    } else if (input.decision === 'reject') {
      await this.candidateRepo.updateStatusConditional(input.candidateId, 'rejected', 'pending');
    }
    // hold: status unchanged

    return { decisionId: id };
  }
}
