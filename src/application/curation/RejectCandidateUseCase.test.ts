import { describe, it, expect, vi } from 'vitest';
import { RejectCandidateUseCase, CandidateNotFoundError } from './RejectCandidateUseCase.js';
import type { CurationCandidate } from '../../domain/curation/CurationCandidate.js';

function makeCandidate(overrides: Partial<CurationCandidate> = {}): CurationCandidate {
  return {
    id: 'candidate-1',
    kakaoPlaceId: 'kp-001',
    name: 'Test Place',
    region: 'jeju-city',
    category: 'cafe',
    llmSummary: null,
    llmTags: [],
    status: 'pending',
    discoveredAt: '2026-05-18',
    sourcedFrom: 'discovery-datalab',
    lat: null,
    lng: null,
    thumbnailUrl: null,
    priceRange: null,
    enrichedAt: null,
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

describe('RejectCandidateUseCase', () => {
  it('pending → rejected (soft delete)', async () => {
    const { candidateRepo, spotRepo } = makeMocks();
    candidateRepo.findById.mockResolvedValue(makeCandidate({ status: 'pending' }));
    candidateRepo.save.mockResolvedValue(undefined);

    const useCase = new RejectCandidateUseCase(candidateRepo as never, spotRepo as never);
    await useCase.execute({ candidateId: 'candidate-1' });

    expect(candidateRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'rejected' }),
    );
    expect(spotRepo.deactivate).not.toHaveBeenCalled();
  });

  it('approved → rejected + spot deactivation', async () => {
    const { candidateRepo, spotRepo } = makeMocks();
    candidateRepo.findById.mockResolvedValue(makeCandidate({ status: 'approved' }));
    candidateRepo.save.mockResolvedValue(undefined);
    spotRepo.deactivate.mockResolvedValue(undefined);

    const useCase = new RejectCandidateUseCase(candidateRepo as never, spotRepo as never);
    await useCase.execute({ candidateId: 'candidate-1' });

    expect(spotRepo.deactivate).toHaveBeenCalledWith('kp-001');
    expect(candidateRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'rejected' }),
    );
  });

  it('already-rejected → idempotent no-op', async () => {
    const { candidateRepo, spotRepo } = makeMocks();
    candidateRepo.findById.mockResolvedValue(makeCandidate({ status: 'rejected' }));

    const useCase = new RejectCandidateUseCase(candidateRepo as never, spotRepo as never);
    await useCase.execute({ candidateId: 'candidate-1' });

    expect(candidateRepo.save).not.toHaveBeenCalled();
    expect(spotRepo.deactivate).not.toHaveBeenCalled();
  });

  it('throws CandidateNotFoundError when not found', async () => {
    const { candidateRepo, spotRepo } = makeMocks();
    candidateRepo.findById.mockResolvedValue(undefined);

    const useCase = new RejectCandidateUseCase(candidateRepo as never, spotRepo as never);
    await expect(
      useCase.execute({ candidateId: 'nonexistent' }),
    ).rejects.toThrow(CandidateNotFoundError);
  });
});
