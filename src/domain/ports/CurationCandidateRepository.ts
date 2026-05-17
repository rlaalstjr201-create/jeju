import type { CurationCandidate } from '../curation/CurationCandidate.js';

export interface CurationCandidateRepository {
  findById(id: string): Promise<CurationCandidate | undefined>;
  findByStatus(
    status: 'pending' | 'approved' | 'rejected',
    opts?: { limit: number; offset: number },
  ): Promise<CurationCandidate[]>;
  existsByKakaoPlaceId(kakaoPlaceId: string): Promise<boolean>;
  findExistingKakaoPlaceIds(kakaoPlaceIds: string[]): Promise<Set<string>>;
  save(candidate: CurationCandidate): Promise<void>;
}
