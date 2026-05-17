import { describe, it, expect, vi } from 'vitest';
import {
  ApproveCandidateUseCase,
  CandidateNotFoundError,
  InvalidStatusError,
  ApproveError,
} from './ApproveCandidateUseCase.js';
import type { CurationCandidate } from '../../domain/curation/CurationCandidate.js';

function makeCandidate(overrides: Partial<CurationCandidate> = {}): CurationCandidate {
  return {
    id: 'candidate-1',
    kakaoPlaceId: 'kp-001',
    name: 'Test Place',
    region: 'jeju-city',
    category: 'cafe',
    llmSummary: 'Test summary',
    llmTags: ['cafe', 'cozy'],
    status: 'pending',
    discoveredAt: '2026-05-18',
    sourcedFrom: 'discovery-datalab',
    lat: 33.5,
    lng: 126.5,
    thumbnailUrl: 'https://example.com/thumb.jpg',
    priceRange: 'mid',
    enrichedAt: '2026-05-18',
    ...overrides,
  };
}

function makeMocks() {
  const candidateRepo = {
    findById: vi.fn(),
    findByStatus: vi.fn(),
    existsByKakaoPlaceId: vi.fn(),
    findExistingKakaoPlaceIds: vi.fn(),
    save: vi.fn(),
  };
  const spotRepo = {
    findById: vi.fn(),
    findByIds: vi.fn(),
    search: vi.fn(),
    findTopByCurationScore: vi.fn(),
    findByRegion: vi.fn(),
    save: vi.fn(),
    existsByKakaoPlaceId: vi.fn(),
    findExistingKakaoPlaceIds: vi.fn(),
    deactivate: vi.fn(),
    updateScores: vi.fn(),
  };
  return { candidateRepo, spotRepo };
}

describe('ApproveCandidateUseCase', () => {
  it('approves a pending enriched candidate — creates spot and marks approved', async () => {
    const { candidateRepo, spotRepo } = makeMocks();
    const candidate = makeCandidate();

    candidateRepo.findById.mockResolvedValue(candidate);
    spotRepo.save.mockResolvedValue(undefined);
    spotRepo.findById.mockResolvedValue({ id: 'spot-uuid' });
    candidateRepo.save.mockResolvedValue(undefined);

    const useCase = new ApproveCandidateUseCase(candidateRepo as never, spotRepo as never);
    const result = await useCase.execute({
      candidateId: 'candidate-1',
      curationScore: 85,
      curationComment: 'Great cafe',
    });

    expect(result.spotId).toBeDefined();
    expect(spotRepo.save).toHaveBeenCalledOnce();
    expect(candidateRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'approved' }),
    );
  });

  it('throws CandidateNotFoundError when candidate not found', async () => {
    const { candidateRepo, spotRepo } = makeMocks();
    candidateRepo.findById.mockResolvedValue(undefined);

    const useCase = new ApproveCandidateUseCase(candidateRepo as never, spotRepo as never);
    await expect(
      useCase.execute({ candidateId: 'nonexistent', curationScore: 80 }),
    ).rejects.toThrow(CandidateNotFoundError);
  });

  it('throws InvalidStatusError when candidate is already approved', async () => {
    const { candidateRepo, spotRepo } = makeMocks();
    candidateRepo.findById.mockResolvedValue(makeCandidate({ status: 'approved' }));

    const useCase = new ApproveCandidateUseCase(candidateRepo as never, spotRepo as never);
    await expect(
      useCase.execute({ candidateId: 'candidate-1', curationScore: 80 }),
    ).rejects.toThrow(InvalidStatusError);
  });

  it('throws ApproveError(NotEnriched) when enrichedAt is null', async () => {
    const { candidateRepo, spotRepo } = makeMocks();
    candidateRepo.findById.mockResolvedValue(makeCandidate({ enrichedAt: null }));

    const useCase = new ApproveCandidateUseCase(candidateRepo as never, spotRepo as never);
    await expect(
      useCase.execute({ candidateId: 'candidate-1', curationScore: 80 }),
    ).rejects.toThrow(ApproveError);

    try {
      await useCase.execute({ candidateId: 'candidate-1', curationScore: 80 });
    } catch (err) {
      expect((err as ApproveError).code).toBe('NotEnriched');
    }
  });

  it('throws ApproveError(IncompleteEnrichment) when lat is null', async () => {
    const { candidateRepo, spotRepo } = makeMocks();
    candidateRepo.findById.mockResolvedValue(
      makeCandidate({ enrichedAt: '2026-05-18', lat: null }),
    );

    const useCase = new ApproveCandidateUseCase(candidateRepo as never, spotRepo as never);
    await expect(
      useCase.execute({ candidateId: 'candidate-1', curationScore: 80 }),
    ).rejects.toThrow(ApproveError);
  });
});
