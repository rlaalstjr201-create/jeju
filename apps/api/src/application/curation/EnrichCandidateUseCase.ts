import type { CurationCandidateRepository } from '../../domain/ports/CurationCandidateRepository.js';
import type { LLMEnricherPort } from '../ports/LLMEnricherPort.js';
import type { KakaoLocalApiPort } from '../ports/KakaoLocalApiPort.js';

export class CandidateNotFoundError extends Error {
  constructor(id: string) {
    super(`CurationCandidate not found: ${id}`);
    this.name = 'CandidateNotFoundError';
  }
}

export class EnrichmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnrichmentError';
  }
}

interface EnrichCandidateInput {
  candidateId: string;
}

interface EnrichCandidateOutput {
  summary: string;
  tags: string[];
  lat: number;
  lng: number;
  thumbnailUrl: string;
  priceRange: string | null;
}

export class EnrichCandidateUseCase {
  constructor(
    private readonly candidateRepo: CurationCandidateRepository,
    private readonly llmEnricher: LLMEnricherPort,
    private readonly kakaoLocalApi: KakaoLocalApiPort,
  ) {}

  async execute(input: EnrichCandidateInput): Promise<EnrichCandidateOutput> {
    const candidate = await this.candidateRepo.findById(input.candidateId);
    if (candidate === undefined) {
      throw new CandidateNotFoundError(input.candidateId);
    }

    let lat: number;
    let lng: number;
    let thumbnailUrl: string;

    if (candidate.kakaoPlaceId !== null) {
      // Old flow: enrich coords + thumbnail from Kakao
      const placeDetails = await this.kakaoLocalApi.fetchPlaceDetails(candidate.kakaoPlaceId);
      if (placeDetails === null) {
        throw new EnrichmentError(
          `Kakao API returned null for kakaoPlaceId: ${candidate.kakaoPlaceId}`,
        );
      }
      lat = placeDetails.lat;
      lng = placeDetails.lng;
      thumbnailUrl = placeDetails.thumbnailUrl;
    } else {
      // Phase 0 visitjeju flow: coords + thumbnail already present from Stage 1
      if (candidate.lat === null || candidate.lng === null || candidate.thumbnailUrl === null) {
        throw new EnrichmentError('visitjeju candidate missing lat/lng/thumbnailUrl');
      }
      lat = candidate.lat;
      lng = candidate.lng;
      thumbnailUrl = candidate.thumbnailUrl;
    }

    const { summary, tags, priceRange } = await this.llmEnricher.enrich(candidate);

    const today = new Date().toISOString().slice(0, 10);

    await this.candidateRepo.save({
      ...candidate,
      lat,
      lng,
      thumbnailUrl,
      priceRange,
      enrichedAt: today,
      llmSummary: summary,
      llmTags: tags,
    });

    return { summary, tags, lat, lng, thumbnailUrl, priceRange };
  }
}
