import type { RecommendationSection } from './RecommendationSection.js';

export interface RecommendationResult {
  readonly curatedPicks: RecommendationSection;
  readonly popularSpots: RecommendationSection;
}
