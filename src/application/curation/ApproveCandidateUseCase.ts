import { createHash } from 'node:crypto';
import type { CurationCandidateRepository } from '../../domain/ports/CurationCandidateRepository.js';
import type { SpotRepository } from '../../domain/ports/SpotRepository.js';
import type { TransactionManager } from '../ports/TransactionManager.js';
import type { Spot } from '../../domain/spot/Spot.js';
import type { PriceRange } from '../../domain/shared/PriceRange.js';

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

// Deterministic ID: synth_<sha1(name|lat.toFixed(6)|lng.toFixed(6))[:12]>
export function buildSyntheticId(name: string, lat: number, lng: number): string {
  const payload = `${name}|${lat.toFixed(6)}|${lng.toFixed(6)}`;
  const hash = createHash('sha1').update(payload).digest('hex');
  return `synth_${hash.slice(0, 12)}`;
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

    // Enrichment guards
    if (candidate.enrichedAt === null) {
      throw new ApproveError('NotEnriched');
    }
    if (candidate.lat === null || candidate.lng === null || candidate.thumbnailUrl === null) {
      throw new ApproveError('IncompleteEnrichment');
    }

    // Build synthetic ID for both path A and path B
    const syntheticId = buildSyntheticId(candidate.name, candidate.lat, candidate.lng);

    const spot: Spot = {
      id: crypto.randomUUID(),
      // Path A: kakao matched (kakaoPlaceId != null)
      // Path B: kakao_unverified (kakaoPlaceId == null)
      kakaoPlaceId: candidate.kakaoPlaceId,
      syntheticId,
      name: candidate.name,
      region: candidate.region,
      category: candidate.category,
      priceRange: (candidate.priceRange ?? 'mid') as PriceRange,
      curationScore: input.curationScore,
      popularityScore: 0,
      trendScore: 0,
      curationComment: input.curationComment ?? null,
      thumbnailUrl: candidate.thumbnailUrl,
      lat: candidate.lat,
      lng: candidate.lng,
    };

    // Store syntheticId on candidate for future dedup tracking
    await this.candidateRepo.setSyntheticId(candidate.id, syntheticId);

    // C3/M5/S8B-2: throw inside callback so a failed race rolls back the Spot insert
    const realSpotId = await this.txManager.run(async () => {
      const id = await this.spotRepo.saveReturningId(spot);
      // Use candidate.status (not hardcoded 'pending') to handle kakao_unverified path
      const ok = await this.candidateRepo.updateStatusConditional(
        candidate.id, 'approved', candidate.status,
      );
      if (!ok) {
        throw new InvalidStatusError('concurrent modification');
      }
      return id;
    });

    return { spotId: realSpotId };
  }
}
