import type { CurationCandidate, CandidateStatus } from '../curation/CurationCandidate.js';

export interface CandidateCoordinate {
  readonly id: string;
  readonly lat: number;
  readonly lng: number;
  readonly sourceType: 'visitjeju' | 'naver';
}

export interface CurationCandidateRepository {
  findById(id: string): Promise<CurationCandidate | undefined>;
  findByStatus(
    status: CandidateStatus,
    opts?: { limit: number; offset: number },
  ): Promise<CurationCandidate[]>;
  findExistingKakaoPlaceIds(kakaoPlaceIds: string[]): Promise<Set<string>>;
  findExistingVisitjejuContentIds(contentIds: string[]): Promise<Set<string>>;
  findAllWithCoordinates(): Promise<CandidateCoordinate[]>;
  save(candidate: CurationCandidate): Promise<void>;
  updateStatusConditional(
    id: string,
    newStatus: 'approved' | 'rejected',
    expectedCurrentStatus: CandidateStatus,
  ): Promise<boolean>;
  setSyntheticId(id: string, syntheticId: string): Promise<void>;
  patchCoordinates(id: string, lat: number, lng: number, verifiedBy: string): Promise<void>;
}
