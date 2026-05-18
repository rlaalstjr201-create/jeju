import type { CurationCandidateRepository } from '../../domain/ports/CurationCandidateRepository.js';
import type { SpotRepository } from '../../domain/ports/SpotRepository.js';
import type { TransactionManager } from '../ports/TransactionManager.js';
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
    private readonly txManager: TransactionManager,
  ) {}

  async execute(input: ApproveCandidateInput): Promise<ApproveCandidateOutput> {
    const candidate = await this.candidateRepo.findById(input.candidateId);
    if (candidate === undefined) {
      throw new CandidateNotFoundError(input.candidateId);
    }

    if (candidate.status !== 'pending' && candidate.status !== 'kakao_unverified') {
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

    const spot: Spot = {
      id: crypto.randomUUID(),
      kakaoPlaceId: candidate.kakaoPlaceId,
      syntheticId: null,
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

    // C3/M5/S8B-2: throw inside callback so a failed race rolls back the Spot insert
    const realSpotId = await this.txManager.run(async () => {
      const id = await this.spotRepo.saveReturningId(spot);
      const ok = await this.candidateRepo.updateStatusConditional(
        candidate.id, 'approved', 'pending',
      );
      if (!ok) {
        throw new InvalidStatusError('concurrent modification');
      }
      return id;
    });

    return { spotId: realSpotId };
  }
}
