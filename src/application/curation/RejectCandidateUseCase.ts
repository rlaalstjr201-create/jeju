import type { CurationCandidateRepository } from '../../domain/ports/CurationCandidateRepository.js';
import type { SpotRepository } from '../../domain/ports/SpotRepository.js';

export class CandidateNotFoundError extends Error {
  constructor(id: string) {
    super(`CurationCandidate not found: ${id}`);
    this.name = 'CandidateNotFoundError';
  }
}

interface RejectCandidateInput {
  candidateId: string;
}

export class RejectCandidateUseCase {
  constructor(
    private readonly candidateRepo: CurationCandidateRepository,
    private readonly spotRepo: SpotRepository,
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
      await this.candidateRepo.save({ ...candidate, status: 'rejected' });
      return;
    }

    // status === 'approved': cascade — deactivate spot + soft delete candidate
    if (candidate.status === 'approved') {
      await this.spotRepo.deactivate(candidate.kakaoPlaceId);
      await this.candidateRepo.save({ ...candidate, status: 'rejected' });
    }
  }
}
