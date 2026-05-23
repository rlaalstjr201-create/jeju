import type { CurationDecision } from '../curation/CurationDecision.js';

export interface CurationDecisionRepository {
  save(decision: CurationDecision): Promise<void>;
  findByCandidateId(candidateId: string): Promise<CurationDecision | undefined>;
}
