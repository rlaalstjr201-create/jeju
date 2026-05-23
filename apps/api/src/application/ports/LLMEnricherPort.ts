import type { CurationCandidate } from '../../domain/curation/CurationCandidate.js';

export interface LLMEnricherPort {
  enrich(candidate: CurationCandidate): Promise<{
    summary: string;
    tags: string[];
    priceRange: string | null;
  }>;
}
