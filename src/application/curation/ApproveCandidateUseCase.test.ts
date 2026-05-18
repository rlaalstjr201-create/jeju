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
    visitjejuContentId: null,
    sourceType: 'visitjeju' as const,
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
    saveReturningId: vi.fn().mockResolvedValue('spot-real-id'),
    findExistingKakaoPlaceIds: vi.fn(),
    findAllActiveIds: vi.fn(),
    deactivate: vi.fn(),
    updateScores: vi.fn(),
  };
  const txManager = {
    run: vi.fn().mockImplementation((work: () => Promise<unknown>) => work()),
  };
  return { candidateRepo, spotRepo, txManager };
}

describe('ApproveCandidateUseCase', () => {
  it('(C3) returns actual DB spotId from saveReturningId — not the generated UUID', async () => {
    const { candidateRepo, spotRepo, txManager } = makeMocks();
    const candidate = makeCandidate();

    candidateRepo.findById.mockResolvedValue(candidate);
    spotRepo.saveReturningId.mockResolvedValue('spot-from-db');
    candidateRepo.updateStatusConditional.mockResolvedValue(true);

    const useCase = new ApproveCandidateUseCase(candidateRepo as never, spotRepo as never, txManager as never);
    const result = await useCase.execute({
      candidateId: 'candidate-1',
      curationScore: 85,
      curationComment: 'Great cafe',
    });

    expect(result.spotId).toBe('spot-from-db');
    expect(spotRepo.saveReturningId).toHaveBeenCalledOnce();
    expect(spotRepo.findById).not.toHaveBeenCalled(); // old phantom-id lookup must not be called
    expect(candidateRepo.updateStatusConditional).toHaveBeenCalledWith('candidate-1', 'approved', 'pending');
  });

  it('(C3) wraps saveReturningId + updateStatusConditional in a transaction', async () => {
    const { candidateRepo, spotRepo, txManager } = makeMocks();
    candidateRepo.findById.mockResolvedValue(makeCandidate());
    spotRepo.saveReturningId.mockResolvedValue('spot-id');
    candidateRepo.updateStatusConditional.mockResolvedValue(true);

    const useCase = new ApproveCandidateUseCase(candidateRepo as never, spotRepo as never, txManager as never);
    await useCase.execute({ candidateId: 'candidate-1', curationScore: 80 });

    expect(txManager.run).toHaveBeenCalledOnce();
  });

  it('(M5) throws InvalidStatusError when updateStatusConditional returns false (race condition)', async () => {
    const { candidateRepo, spotRepo, txManager } = makeMocks();
    candidateRepo.findById.mockResolvedValue(makeCandidate());
    spotRepo.saveReturningId.mockResolvedValue('spot-id');
    candidateRepo.updateStatusConditional.mockResolvedValue(false);

    const useCase = new ApproveCandidateUseCase(candidateRepo as never, spotRepo as never, txManager as never);
    await expect(
      useCase.execute({ candidateId: 'candidate-1', curationScore: 80 }),
    ).rejects.toThrow(InvalidStatusError);
  });

  it('throws CandidateNotFoundError when candidate not found', async () => {
    const { candidateRepo, spotRepo, txManager } = makeMocks();
    candidateRepo.findById.mockResolvedValue(undefined);

    const useCase = new ApproveCandidateUseCase(candidateRepo as never, spotRepo as never, txManager as never);
    await expect(
      useCase.execute({ candidateId: 'nonexistent', curationScore: 80 }),
    ).rejects.toThrow(CandidateNotFoundError);
  });

  it('throws InvalidStatusError when candidate is already approved', async () => {
    const { candidateRepo, spotRepo, txManager } = makeMocks();
    candidateRepo.findById.mockResolvedValue(makeCandidate({ status: 'approved' }));

    const useCase = new ApproveCandidateUseCase(candidateRepo as never, spotRepo as never, txManager as never);
    await expect(
      useCase.execute({ candidateId: 'candidate-1', curationScore: 80 }),
    ).rejects.toThrow(InvalidStatusError);
  });

  it('throws ApproveError(NotEnriched) when enrichedAt is null', async () => {
    const { candidateRepo, spotRepo, txManager } = makeMocks();
    candidateRepo.findById.mockResolvedValue(makeCandidate({ enrichedAt: null }));

    const useCase = new ApproveCandidateUseCase(candidateRepo as never, spotRepo as never, txManager as never);
    await expect(
      useCase.execute({ candidateId: 'candidate-1', curationScore: 80 }),
    ).rejects.toThrow(ApproveError);
  });

  // -------------------------------------------------------------------------
  // S8B-2: InvalidStatusError thrown INSIDE transaction (Spot rolls back)
  // -------------------------------------------------------------------------

  it('(S8B-2) concurrent modification: error thrown inside tx callback (Spot rolled back)', async () => {
    const { candidateRepo, spotRepo } = makeMocks();
    candidateRepo.findById.mockResolvedValue(makeCandidate());
    spotRepo.saveReturningId.mockResolvedValue('spot-id');
    candidateRepo.updateStatusConditional.mockResolvedValue(false);

    // Tracking mock: catches errors from inside the callback — identical to what
    // PostgresTransactionManager does before calling ROLLBACK.
    let threwInsideTx = false;
    const txManager = {
      run: vi.fn().mockImplementation(async (work: () => Promise<unknown>) => {
        try {
          return await work();
        } catch (err) {
          threwInsideTx = true; // real tx would ROLLBACK here — Spot not committed
          throw err;
        }
      }),
    };

    const useCase = new ApproveCandidateUseCase(candidateRepo as never, spotRepo as never, txManager as never);
    await expect(
      useCase.execute({ candidateId: 'candidate-1', curationScore: 80 }),
    ).rejects.toThrow(InvalidStatusError);

    // saveReturningId ran (Spot was attempted) but the callback threw → ROLLBACK
    expect(spotRepo.saveReturningId).toHaveBeenCalledOnce();
    // The throw propagated through the transaction boundary — proves rollback path
    expect(threwInsideTx).toBe(true);
  });

  it('throws ApproveError(IncompleteEnrichment) when lat is null', async () => {
    const { candidateRepo, spotRepo, txManager } = makeMocks();
    candidateRepo.findById.mockResolvedValue(
      makeCandidate({ enrichedAt: '2026-05-18', lat: null }),
    );

    const useCase = new ApproveCandidateUseCase(candidateRepo as never, spotRepo as never, txManager as never);
    await expect(
      useCase.execute({ candidateId: 'candidate-1', curationScore: 80 }),
    ).rejects.toThrow(ApproveError);
  });
});
