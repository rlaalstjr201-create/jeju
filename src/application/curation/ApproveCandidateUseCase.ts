import type { CurationCandidateRepository } from '../../domain/ports/CurationCandidateRepository.js';
import type { SpotRepository } from '../../domain/ports/SpotRepository.js';
import type { Spot } from '../../domain/spot/Spot.js';

export class CandidateNotFoundError extends Error {
  constructor(id: string) {
    super(`CurationCandidate not found: ${id}`);
    this.name = 'CandidateNotFoundError';
  }
}

export class InvalidStatusError extends Error {
  constructor(status: string) {
    super(`Cannot approve candidate with status: ${status}`);
    this.name = 'InvalidStatusError';
  }
}

export class ApproveError extends Error {
  readonly code: 'NotEnriched' | 'IncompleteEnrichment';
  constructor(code: 'NotEnriched' | 'IncompleteEnrichment') {
    super(`ApproveError: ${code}`);
    this.name = 'ApproveError';
    this.code = code;
  }
}

interface ApproveCandidateInput {
  candidateId: string;
  curationScore: number;
  curationComment?: string;
}

interface ApproveCandidateOutput {
  spotId: string;
}

export class ApproveCandidateUseCase {
  constructor(
    private readonly candidateRepo: CurationCandidateRepository,
    private readonly spotRepo: SpotRepository,
  ) {}

  async execute(input: ApproveCandidateInput): Promise<ApproveCandidateOutput> {
    const candidate = await this.candidateRepo.findById(input.candidateId);
    if (candidate === undefined) {
      throw new CandidateNotFoundError(input.candidateId);
    }

    if (candidate.status !== 'pending') {
      throw new InvalidStatusError(candidate.status);
    }

    // Enrichment guards (CM-2)
    if (candidate.enrichedAt === null) {
      throw new ApproveError('NotEnriched');
    }
    if (
      candidate.lat === null ||
      candidate.lng === null ||
      candidate.thumbnailUrl === null
    ) {
      throw new ApproveError('IncompleteEnrichment');
    }

    const spotId = crypto.randomUUID();

    const spot: Spot = {
      id: spotId,
      kakaoPlaceId: candidate.kakaoPlaceId,
      name: candidate.name,
      region: candidate.region,
      category: candidate.category,
      priceRange: (candidate.priceRange ?? 'mid') as import('../../domain/shared/PriceRange.js').PriceRange,
      curationScore: input.curationScore,
      popularityScore: 0,
      trendScore: 0,
      curationComment: input.curationComment ?? null,
      thumbnailUrl: candidate.thumbnailUrl,
      lat: candidate.lat,
      lng: candidate.lng,
    };

    await this.spotRepo.save(spot);

    // Get the actual spotId (may differ if kakaoPlaceId already exists — idempotent)
    const existingSpot = await this.spotRepo.findById(spot.id);
    const finalSpotId = existingSpot?.id ?? spotId;

    await this.candidateRepo.save({ ...candidate, status: 'approved' });

    return { spotId: finalSpotId };
  }
}
