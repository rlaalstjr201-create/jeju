import type { CurationCandidateRepository } from '../../domain/ports/CurationCandidateRepository.js';
import { CandidateNotFoundError, InvalidStatusError } from './ApproveCandidateUseCase.js';

interface PatchCandidateCoordinatesInput {
  candidateId: string;
  lat: number;
  lng: number;
}

export class PatchCandidateCoordinatesUseCase {
  constructor(private readonly candidateRepo: CurationCandidateRepository) {}

  async execute(input: PatchCandidateCoordinatesInput): Promise<void> {
    const candidate = await this.candidateRepo.findById(input.candidateId);
    if (!candidate) throw new CandidateNotFoundError(input.candidateId);
    if (candidate.status !== 'kakao_unverified') {
      throw new InvalidStatusError(candidate.status);
    }
    await this.candidateRepo.patchCoordinates(input.candidateId, input.lat, input.lng, 'manual');
  }
}
