import { SpotPreferences } from '../../domain/recommender/SpotPreferences.js';
import type { Region } from '../../domain/shared/Region.js';
import type { PriceRange } from '../../domain/shared/PriceRange.js';
import type { AuthService } from '../ports/AuthService.js';
import type { TripRepository } from '../../domain/ports/TripRepository.js';
import type { ShortlistRepository } from '../../domain/ports/ShortlistRepository.js';
import type { Recommender } from '../../domain/recommender/Recommender.js';
import { resolveOwnedTrip } from '../helpers/resolveOwnedTrip.js';
export { TripNotFoundError, ForbiddenError } from '../errors.js';

interface GetRecommendationsInput {
  readonly accessToken: string;
  readonly tripId: string;
  readonly limit: number;
  readonly offset: number;
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
  readonly spots: SpotOutput[];
  readonly total: number;
  readonly coldStart: boolean;
}

export class GetRecommendationsUseCase {
  constructor(
    private readonly authService: AuthService,
    private readonly tripRepository: TripRepository,
    private readonly shortlistRepository: ShortlistRepository,
    private readonly recommender: Recommender,
  ) {}

  async execute(input: GetRecommendationsInput): Promise<GetRecommendationsOutput> {
    const { traveller, trip } = await resolveOwnedTrip(
      this.authService, this.tripRepository, input.accessToken, input.tripId,
    );

    const shortlist = await this.shortlistRepository.findByTravellerId(traveller.id);
    const preferences = SpotPreferences.fromShortlist(shortlist);
    const coldStart = preferences.isEmpty;

    const context = { traveller, trip, preferences };
    const allSpots = await this.recommender.recommendForShortlist(context);

    const pageSpots = allSpots.slice(input.offset, input.offset + input.limit);

    return {
      spots: pageSpots.map((s) => ({
        spotId: s.id,
        name: s.name,
        category: s.category,
        region: s.region,
        priceRange: s.priceRange,
        curationScore: s.curationScore,
        thumbnailUrl: s.thumbnailUrl,
        curationComment: s.curationComment,
      })),
      total: allSpots.length,
      coldStart,
    };
  }
}
