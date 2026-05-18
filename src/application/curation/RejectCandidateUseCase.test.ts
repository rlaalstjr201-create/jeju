import { describe, it, expect, vi } from 'vitest';
import { RejectCandidateUseCase, CandidateNotFoundError, InvalidStatusError } from './RejectCandidateUseCase.js';
import type { CurationCandidate } from '../../domain/curation/CurationCandidate.js';

function makeCandidate(overrides: Partial<CurationCandidate> = {}): CurationCandidate {
  return {
    id: 'candidate-1',
    kakaoPlaceId: 'kp-001',
    visitjejuContentId: null,
    sourceType: 'visitjeju' as const,
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
    naverSourceUrl: null,
    naverSnippet: null,
    authenticityScore: null,
    ordinarinessScore: null,
    aiEstimatedScore: null,
    aiEstimatedAt: null,
    syntheticId: null,
    ...overrides,
  };
}

function makeMocks() {
  const candidateRepo = {
    findById: vi.fn(),
    findByStatus: vi.fn(),
    findExistingKakaoPlaceIds: vi.fn(),
    findExistingVisitjejuContentIds: vi.fn(),
    findAllWithCoordinates: vi.fn(),
    save: vi.fn(),
    updateStatusConditional: vi.fn().mockResolvedValue(true),
    setSyntheticId: vi.fn(),
  };
  const spotRepo = {
    findById: vi.fn(),
    findByIds: vi.fn(),
    search: vi.fn(),
    findTopByCurationScore: vi.fn(),
    findByRegion: vi.fn(),
    save: vi.fn(),
    saveReturningId: vi.fn(),
    findExistingKakaoPlaceIds: vi.fn(),
    findAllActiveIds: vi.fn(),
    deactivate: vi.fn().mockResolvedValue(undefined),
    updateScores: vi.fn(),
  };
  const txManager = {
    run: vi.fn().mockImplementation((work: () => Promise<unknown>) => work()),
  };
  return { candidateRepo, spotRepo, txManager };
}

describe('RejectCandidateUseCase', () => {
  it('pending → rejected (soft delete via updateStatusConditional)', async () => {
    const { candidateRepo, spotRepo, txManager } = makeMocks();
    candidateRepo.findById.mockResolvedValue(makeCandidate({ status: 'pending' }));

    const useCase = new RejectCandidateUseCase(candidateRepo as never, spotRepo as never, txManager as never);
    await useCase.execute({ candidateId: 'candidate-1' });

    expect(candidateRepo.updateStatusConditional).toHaveBeenCalledWith('candidate-1', 'rejected', 'pending');
    expect(spotRepo.deactivate).not.toHaveBeenCalled();
    expect(txManager.run).not.toHaveBeenCalled();
  });

  it('(C2) approved → rejected uses transaction wrapping deactivate + status update', async () => {
    const { candidateRepo, spotRepo, txManager } = makeMocks();
    candidateRepo.findById.mockResolvedValue(makeCandidate({ status: 'approved' }));

    const useCase = new RejectCandidateUseCase(candidateRepo as never, spotRepo as never, txManager as never);
    await useCase.execute({ candidateId: 'candidate-1' });

    expect(txManager.run).toHaveBeenCalledOnce();
    expect(spotRepo.deactivate).toHaveBeenCalledWith('kp-001');
    expect(candidateRepo.updateStatusConditional).toHaveBeenCalledWith('candidate-1', 'rejected', 'approved');
  });

  it('(M5) approved → rejected throws InvalidStatusError on concurrent modification', async () => {
    const { candidateRepo, spotRepo, txManager } = makeMocks();
    candidateRepo.findById.mockResolvedValue(makeCandidate({ status: 'approved' }));
    candidateRepo.updateStatusConditional.mockResolvedValue(false);

    const useCase = new RejectCandidateUseCase(candidateRepo as never, spotRepo as never, txManager as never);
    await expect(
      useCase.execute({ candidateId: 'candidate-1' }),
    ).rejects.toThrow(InvalidStatusError);
  });

  it('already-rejected → idempotent no-op', async () => {
    const { candidateRepo, spotRepo, txManager } = makeMocks();
    candidateRepo.findById.mockResolvedValue(makeCandidate({ status: 'rejected' }));

    const useCase = new RejectCandidateUseCase(candidateRepo as never, spotRepo as never, txManager as never);
    await useCase.execute({ candidateId: 'candidate-1' });

    expect(candidateRepo.updateStatusConditional).not.toHaveBeenCalled();
    expect(spotRepo.deactivate).not.toHaveBeenCalled();
    expect(txManager.run).not.toHaveBeenCalled();
  });

  it('throws CandidateNotFoundError when not found', async () => {
    const { candidateRepo, spotRepo, txManager } = makeMocks();
    candidateRepo.findById.mockResolvedValue(undefined);

    const useCase = new RejectCandidateUseCase(candidateRepo as never, spotRepo as never, txManager as never);
    await expect(
      useCase.execute({ candidateId: 'nonexistent' }),
    ).rejects.toThrow(CandidateNotFoundError);
  });
});
