import type { Region } from '../shared/Region.js';
import type { Spot } from '../spot/Spot.js';

export interface SpotRepository {
  findById(id: string): Promise<Spot | undefined>;
  findByIds(ids: string[]): Promise<Spot[]>;
  search(query: string, limit?: number): Promise<Spot[]>;
  findTopByCurationScore(limit: number): Promise<Spot[]>;
  findByRegion(region: Region): Promise<Spot[]>;
}
