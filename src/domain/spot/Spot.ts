import type { Region } from '../shared/Region.js';
import type { PriceRange } from '../shared/PriceRange.js';

export interface Spot {
  readonly id: string;
  readonly kakaoPlaceId: string | null; // null for kakao_unverified approved spots
  readonly syntheticId: string | null;  // non-null when kakaoPlaceId is null
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
  readonly tier: 'reference' | 'hidden';
  readonly awards: string[];
  readonly curatorComment: string | null;
  readonly curatorCommentSource: 'gemma' | 'claude_fallback' | 'curator_edit' | null;
  readonly curatorCommentRetryCount: number;
}
