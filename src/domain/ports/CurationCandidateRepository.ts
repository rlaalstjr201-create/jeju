import type { CurationCandidate } from '../curation/CurationCandidate.js';

export interface CurationCandidateRepository {
  findById(id: string): Promise<CurationCandidate | undefined>;
  findByStatus(
    status: 'pending' | 'approved' | 'rejected',
    opts?: { limit: number; offset: number },
  ): Promise<CurationCandidate[]>;
  findExistingKakaoPlaceIds(kakaoPlaceIds: string[]): Promise<Set<string>>;
  save(candidate: CurationCandidate): Promise<void>;
  updateStatusConditional(
    id: string,
    newStatus: 'approved' | 'rejected',
    expectedCurrentStatus: 'pending' | 'approved',
  ): Promise<boolean>;
}
