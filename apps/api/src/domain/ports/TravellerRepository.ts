import type { Traveller } from '../traveller/Traveller.js';

export interface TravellerRepository {
  findById(id: string): Promise<Traveller | undefined>;
  findByKakaoId(kakaoId: string): Promise<Traveller | undefined>;
  save(traveller: Traveller): Promise<void>;
}
