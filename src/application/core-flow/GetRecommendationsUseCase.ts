import { SpotPreferences } from '../../domain/recommender/SpotPreferences.js';
import { CalibrationProfile } from '../../domain/recommender/CalibrationProfile.js';
import type { Region } from '../../domain/shared/Region.js';
import type { PriceRange } from '../../domain/shared/PriceRange.js';
import type { AuthService } from '../ports/AuthService.js';
import type { TripRepository } from '../../domain/ports/TripRepository.js';
import type { ShortlistRepository } from '../../domain/ports/ShortlistRepository.js';
import type { Recommender } from '../../domain/recommender/Recommender.js';
import type { CalibrationProfileRepository } from '../../domain/ports/CalibrationProfileRepository.js';
import { resolveOwnedTrip } from '../helpers/resolveOwnedTrip.js';
export { TripNotFoundError, ForbiddenError } from '../errors.js';

const SECTION_LIMIT = 8;

interface GetRecommendationsInput {
  readonly accessToken: string;
  readonly tripId: string;
}

interface SpotOutput {
  spotId: string;
  name: string;
  category: string;
  region: Region;
  priceRange: PriceRange;
  curationScore: number;
  thumbnailUrl: string | null;
  curationComment: string | null;
}

interface GetRecommendationsOutput {
  readonly curatedPicks: {
    label: 'curatedPicks';
    spots: SpotOutput[];
    coldStart: boolean;
  };
  readonly popularSpots: {
    label: 'popularSpots';
    spots: SpotOutput[];
    coldStart: boolean;
  };
  readonly calibration: { curatedRatio: number; popularRatio: number };
}

export class GetRecommendationsUseCase {
  constructor(
    private readonly authService: AuthService,
    private readonly tripRepository: TripRepository,
    private readonly shortlistRepository: ShortlistRepository,
    private readonly recommender: Recommender,
    private readonly calibrationRepo?: CalibrationProfileRepository,
  ) {}

  async execute(input: GetRecommendationsInput): Promise<GetRecommendationsOutput> {
    const { traveller, trip } = await resolveOwnedTrip(
      this.authService, this.tripRepository, input.accessToken, input.tripId,
    );

    const shortlist = await this.shortlistRepository.findByTravellerId(traveller.id);
    const preferences = SpotPreferences.fromShortlist(shortlist);

    const calibration = this.calibrationRepo
      ? await this.calibrationRepo.findByTripId(trip.id)
      : CalibrationProfile.default();

    const context = { traveller, trip, preferences, calibration };
    const result = await this.recommender.recommendForShortlist(context);

    const mapSpot = (s: import('../../domain/spot/Spot.js').Spot): SpotOutput => ({
      spotId: s.id,
      name: s.name,
      category: s.category,
      region: s.region,
      priceRange: s.priceRange,
      curationScore: s.curationScore,
      thumbnailUrl: s.thumbnailUrl,
      curationComment: s.curationComment,
    });

    return {
      curatedPicks: {
        label: 'curatedPicks',
        spots: result.curatedPicks.spots.slice(0, SECTION_LIMIT).map(mapSpot),
        coldStart: result.curatedPicks.coldStart,
      },
      popularSpots: {
        label: 'popularSpots',
        spots: result.popularSpots.spots.slice(0, SECTION_LIMIT).map(mapSpot),
        coldStart: result.popularSpots.coldStart,
      },
      calibration: {
        curatedRatio: calibration.curatedRatio,
        popularRatio: calibration.popularRatio,
      },
    };
  }
}
