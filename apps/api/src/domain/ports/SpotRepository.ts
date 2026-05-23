import type { Region } from '../shared/Region.js';
import type { Spot } from '../spot/Spot.js';

export interface SpotRepository {
  findById(id: string): Promise<Spot | undefined>;
  findByIds(ids: string[]): Promise<Spot[]>;
  search(query: string, limit?: number): Promise<Spot[]>;
  findTopByCurationScore(limit: number): Promise<Spot[]>;
  findByRegion(region: Region): Promise<Spot[]>;
  save(spot: Spot): Promise<void>;
  saveReturningId(spot: Spot): Promise<string>;
  findExistingKakaoPlaceIds(kakaoPlaceIds: string[]): Promise<Set<string>>;
  findAllActiveIds(): Promise<string[]>;
  deactivate(kakaoPlaceId: string): Promise<void>;
  updateScores(updates: { spotId: string; popularityScore: number; trendScore: number }[]): Promise<void>;
  findApproved(category?: string): Promise<Spot[]>;
}
