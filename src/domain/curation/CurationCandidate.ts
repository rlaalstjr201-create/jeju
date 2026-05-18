import type { Region } from '../shared/Region.js';

export type CandidateStatus = 'pending' | 'kakao_unverified' | 'approved' | 'rejected';

export type CandidateSourceType = 'visitjeju' | 'naver';

export interface CurationCandidate {
  readonly id: string;
  readonly kakaoPlaceId: string | null;
  readonly visitjejuContentId: string | null;
  readonly sourceType: CandidateSourceType;
  readonly name: string;
  readonly region: Region;
  readonly category: string;
  readonly llmSummary: string | null;
  readonly llmTags: string[];
  readonly status: CandidateStatus;
  readonly discoveredAt: string; // ISO date string
  readonly sourcedFrom: string;
  readonly lat: number | null;
  readonly lng: number | null;
  readonly thumbnailUrl: string | null;
  readonly priceRange: string | null;
  readonly enrichedAt: string | null;
  readonly naverSourceUrl: string | null;
  readonly naverSnippet: string | null;
  readonly authenticityScore: number | null; // 0–1, high = not ad
  readonly ordinarinessScore: number | null; // 0–1, high = ordinary package tour spot
  readonly aiEstimatedScore: number | null;  // 1–10, v1 null
  readonly aiEstimatedAt: string | null;     // ISO timestamp, v1 null
  readonly syntheticId: string | null;       // set on approval of kakao_unverified
}
