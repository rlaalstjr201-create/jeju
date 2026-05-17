import type { Region } from '../shared/Region.js';

export interface TrendCandidate {
  readonly kakaoPlaceId: string;
  readonly name: string;
  readonly region: Region;
  readonly category: string;
  readonly trendSignal: number;
  readonly sourcedFrom: string;
}

export interface TrendDiscoveryPort {
  fetchCandidatesByRegion(region?: Region, category?: string, limit?: number): Promise<TrendCandidate[]>;
  readonly sourceName: string;
}
