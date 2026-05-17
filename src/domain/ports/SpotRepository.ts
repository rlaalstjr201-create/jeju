import type { Spot } from '../spot/Spot.js';

export interface SpotRepository {
  findById(id: string): Promise<Spot | undefined>;
  findByIds(ids: string[]): Promise<Spot[]>;
  search(query: string, limit?: number): Promise<Spot[]>;
}
