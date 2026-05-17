import type { Region } from '../shared/Region.js';

export interface CurationCandidate {
  readonly id: string;
  readonly kakaoPlaceId: string;
  readonly name: string;
  readonly region: Region;
  readonly category: string;
  readonly llmSummary: string | null;
  readonly llmTags: string[];
  readonly status: 'pending' | 'approved' | 'rejected';
  readonly discoveredAt: string; // ISO date string
  readonly sourcedFrom: string;
  readonly lat: number | null;
  readonly lng: number | null;
  readonly thumbnailUrl: string | null;
  readonly priceRange: string | null;
  readonly enrichedAt: string | null; // ISO date string or null
}
