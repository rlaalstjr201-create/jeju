import { describe, it, expect, vi } from 'vitest';
import {
  PersistCurationDecisionUseCase,
  InvalidDecisionError,
} from './PersistCurationDecisionUseCase.js';
import type { CurationDecision } from '../../domain/curation/CurationDecision.js';

function makeMocks() {
  const decisionRepo = {
    save: vi.fn().mockResolvedValue(undefined),
    findByCandidateId: vi.fn().mockResolvedValue(undefined),
  };
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
  return { decisionRepo, candidateRepo };
}

describe('PersistCurationDecisionUseCase', () => {
  it('approve — saves decision with curationScore, updates candidate status', async () => {
    const { decisionRepo, candidateRepo } = makeMocks();
    const useCase = new PersistCurationDecisionUseCase(decisionRepo as never, candidateRepo as never);

    const result = await useCase.execute({
      candidateId: 'cand-1',
      decidedBy: 'curator',
      decision: 'approve',
      curationScore: 80,
    });

    expect(result.decisionId).toBeDefined();
    expect(decisionRepo.save).toHaveBeenCalledOnce();
    const saved = decisionRepo.save.mock.calls[0]![0] as CurationDecision;
    expect(saved.decision).toBe('approve');
    expect(saved.curationScore).toBe(80);
    expect(saved.candidateId).toBe('cand-1');
    expect(saved.decidedBy).toBe('curator');
    expect(saved.rejectionReasonEnum).toBeNull();
    expect(candidateRepo.updateStatusConditional).toHaveBeenCalledWith('cand-1', 'approved', expect.any(String));
  });

  it('reject — saves decision with rejectionReason, updates candidate status', async () => {
    const { decisionRepo, candidateRepo } = makeMocks();
    const useCase = new PersistCurationDecisionUseCase(decisionRepo as never, candidateRepo as never);

    await useCase.execute({
      candidateId: 'cand-2',
      decidedBy: 'curator',
      decision: 'reject',
      rejectionReasonEnum: 'ordinary',
      rejectionReasonText: '너무 유명한 곳',
    });

    const saved = decisionRepo.save.mock.calls[0]![0] as CurationDecision;
    expect(saved.decision).toBe('reject');
    expect(saved.rejectionReasonEnum).toBe('ordinary');
    expect(saved.rejectionReasonText).toBe('너무 유명한 곳');
    expect(saved.curationScore).toBeNull();
    expect(candidateRepo.updateStatusConditional).toHaveBeenCalledWith('cand-2', 'rejected', expect.any(String));
  });

  it('hold — saves decision, does NOT update candidate status', async () => {
    const { decisionRepo, candidateRepo } = makeMocks();
    const useCase = new PersistCurationDecisionUseCase(decisionRepo as never, candidateRepo as never);

    await useCase.execute({
      candidateId: 'cand-3',
      decidedBy: 'curator',
      decision: 'hold',
    });

    const saved = decisionRepo.save.mock.calls[0]![0] as CurationDecision;
    expect(saved.decision).toBe('hold');
    expect(candidateRepo.updateStatusConditional).not.toHaveBeenCalled();
  });

  it('approve without curationScore → throws InvalidDecisionError', async () => {
    const { decisionRepo, candidateRepo } = makeMocks();
    const useCase = new PersistCurationDecisionUseCase(decisionRepo as never, candidateRepo as never);

    await expect(
      useCase.execute({ candidateId: 'c', decidedBy: 'curator', decision: 'approve' }),
    ).rejects.toBeInstanceOf(InvalidDecisionError);
  });

  it('reject without rejectionReasonEnum → throws InvalidDecisionError', async () => {
    const { decisionRepo, candidateRepo } = makeMocks();
    const useCase = new PersistCurationDecisionUseCase(decisionRepo as never, candidateRepo as never);

    await expect(
      useCase.execute({ candidateId: 'c', decidedBy: 'curator', decision: 'reject' }),
    ).rejects.toBeInstanceOf(InvalidDecisionError);
  });

  it('v1 fields ai_estimated_* and curator_override are always null', async () => {
    const { decisionRepo, candidateRepo } = makeMocks();
    const useCase = new PersistCurationDecisionUseCase(decisionRepo as never, candidateRepo as never);

    await useCase.execute({
      candidateId: 'c',
      decidedBy: 'curator',
      decision: 'approve',
      curationScore: 70,
    });

    const saved = decisionRepo.save.mock.calls[0]![0] as CurationDecision;
    expect(saved.aiEstimatedScore).toBeNull();
    expect(saved.aiEstimatedAt).toBeNull();
    expect(saved.curatorOverride).toBeNull();
  });
});
