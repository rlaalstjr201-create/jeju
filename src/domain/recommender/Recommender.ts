import type { Spot } from '../spot/Spot.js';
import type { RecommendationContext } from './RecommendationContext.js';

/**
 * Domain service port — no implementation here.
 * Implementations live in infrastructure (e.g. PostgresRecommenderAdapter).
 *
 * v1: recommendForShortlist — supplements a Shortlist with curated Spots for gap-fill.
 * v2: recommendNow — surfaces immediately relevant nearby Spots (GPS-based, Now Mode).
 */
export interface Recommender {
  recommendForShortlist(context: RecommendationContext): Promise<Spot[]>;
}
