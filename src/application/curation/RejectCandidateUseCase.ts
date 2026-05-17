import type { CurationCandidateRepository } from '../../domain/ports/CurationCandidateRepository.js';
import type { SpotRepository } from '../../domain/ports/SpotRepository.js';
import type { TransactionManager } from '../ports/TransactionManager.js';

export class CandidateNotFoundError extends Error {
  constructor(id: string) {
    super(`CurationCandidate not found: ${id}`);
    this.name = 'CandidateNotFoundError';
  }
}

export class InvalidStatusError extends Error {
  constructor(status: string) {
    super(`Cannot reject candidate with status: ${status}`);
    this.name = 'InvalidStatusError';
  }
}

interface RejectCandidateInput {
  candidateId: string;
}

export class RejectCandidateUseCase {
  constructor(
    private readonly candidateRepo: CurationCandidateRepository,
    private readonly spotRepo: SpotRepository,
    private readonly txManager: TransactionManager,
  ) {}

  async execute(input: RejectCandidateInput): Promise<void> {
    const candidate = await this.candidateRepo.findById(input.candidateId);
    if (candidate === undefined) {
      throw new CandidateNotFoundError(input.candidateId);
    }

    // Already rejected — idempotent no-op
    if (candidate.status === 'rejected') {
      return;
    }

    if (candidate.status === 'pending') {
      const updated = await this.candidateRepo.updateStatusConditional(
        candidate.id, 'rejected', 'pending',
      );
      if (!updated) {
        // Race condition: re-check if now rejected (idempotent) or surface conflict
        const fresh = await this.candidateRepo.findById(input.candidateId);
        if (fresh?.status === 'rejected') return;
        throw new InvalidStatusError(fresh?.status ?? 'unknown');
      }
      return;
    }

    // status === 'approved': cascade — deactivate spot + soft-delete candidate, atomically (C2)
    await this.txManager.run(async () => {
      await this.spotRepo.deactivate(candidate.kakaoPlaceId);
      const updated = await this.candidateRepo.updateStatusConditional(
        candidate.id, 'rejected', 'approved',
      );
      if (!updated) {
        throw new InvalidStatusError('concurrent modification');
      }
    });
  }
}
