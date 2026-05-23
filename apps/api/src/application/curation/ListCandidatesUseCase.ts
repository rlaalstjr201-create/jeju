import type { CurationCandidateRepository } from '../../domain/ports/CurationCandidateRepository.js';
import type { CurationCandidate } from '../../domain/curation/CurationCandidate.js';

interface ListCandidatesInput {
  status: 'pending' | 'approved' | 'rejected';
  limit: number;
  offset: number;
}

export class ListCandidatesUseCase {
  constructor(private readonly candidateRepo: CurationCandidateRepository) {}

  async execute(input: ListCandidatesInput): Promise<CurationCandidate[]> {
    return this.candidateRepo.findByStatus(input.status, {
      limit: input.limit,
      offset: input.offset,
    });
  }
}
