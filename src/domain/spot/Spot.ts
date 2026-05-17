import type { Region } from '../shared/Region.js';
import type { PriceRange } from '../shared/PriceRange.js';

export interface Spot {
  readonly id: string;
  readonly kakaoPlaceId: string;
  readonly name: string;
  readonly region: Region;
  readonly category: string;
  readonly priceRange: PriceRange;
  readonly curationScore: number;
  readonly popularityScore: number;
  readonly trendScore: number;
  readonly curationComment: string | null;
  readonly thumbnailUrl: string | null;
  readonly lat: number;
  readonly lng: number;
}
