import type { Spot } from '../spot/Spot.js';

export interface RecommendationSection {
  readonly kind: 'curated' | 'popular';
  readonly spots: readonly Spot[];
  readonly coldStart: boolean;
}
