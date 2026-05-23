import type { AuthService } from '../ports/AuthService.js';
import type { TripRepository } from '../../domain/ports/TripRepository.js';
import type { CalibrationProfileRepository } from '../../domain/ports/CalibrationProfileRepository.js';
import { CalibrationProfile } from '../../domain/recommender/CalibrationProfile.js';
import { resolveOwnedTrip } from '../helpers/resolveOwnedTrip.js';
export { TripNotFoundError, ForbiddenError } from '../errors.js';

interface AdjustCalibrationInput {
  accessToken: string;
  tripId: string;
  curatedRatio: number;
}

interface AdjustCalibrationOutput {
  curatedRatio: number;
  popularRatio: number;
}

export class AdjustCalibrationUseCase {
  constructor(
    private readonly authService: AuthService,
    private readonly tripRepository: TripRepository,
    private readonly calibrationRepo: CalibrationProfileRepository,
  ) {}

  async execute(input: AdjustCalibrationInput): Promise<AdjustCalibrationOutput> {
    await resolveOwnedTrip(
      this.authService,
      this.tripRepository,
      input.accessToken,
      input.tripId,
    );

    const profile = CalibrationProfile.fromUserInput(input.curatedRatio);
    await this.calibrationRepo.save(input.tripId, profile);

    return {
      curatedRatio: profile.curatedRatio,
      popularRatio: profile.popularRatio,
    };
  }
}
