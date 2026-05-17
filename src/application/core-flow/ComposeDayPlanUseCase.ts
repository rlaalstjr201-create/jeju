import type { Region } from '../../domain/shared/Region.js';
import type { TravellerAuthService } from '../../infrastructure/kakao/TravellerAuthService.js';
import type { TripRepository } from '../../domain/ports/TripRepository.js';
import type { ShortlistRepository } from '../../domain/ports/ShortlistRepository.js';
import type { DayPlanRepository } from '../../domain/ports/DayPlanRepository.js';
import type { Recommender } from '../../domain/recommender/Recommender.js';
import type { TransactionManager } from '../ports/TransactionManager.js';
import { ComposeDayPlanService } from './ComposeDayPlanService.js';
import { TripNotFoundError, ForbiddenError } from './GetRecommendationsUseCase.js';

interface ComposeDayPlanInput {
  readonly accessToken: string;
  readonly tripId: string;
}

interface SpotInDay {
  spotId: string;
  name: string;
  region: Region;
  position: number;
  isAutoFilled: boolean;
}

interface DayOutput {
  dayIndex: number;
  date: string;
  spots: SpotInDay[];
}

interface ComposeDayPlanOutput {
  readonly dayPlanId: string;
  readonly days: DayOutput[];
  readonly autoFilledSpotIds: readonly string[];
}

export class ComposeDayPlanUseCase {
  constructor(
    private readonly authService: TravellerAuthService,
    private readonly tripRepository: TripRepository,
    private readonly shortlistRepository: ShortlistRepository,
    private readonly dayPlanRepository: DayPlanRepository,
    private readonly recommender: Recommender,
    private readonly composeDayPlanService: ComposeDayPlanService,
    private readonly transactionManager: TransactionManager,
  ) {}

  async execute(input: ComposeDayPlanInput): Promise<ComposeDayPlanOutput> {
    const traveller = await this.authService.authenticate(input.accessToken);

    const trip = await this.tripRepository.findById(input.tripId);
    if (trip === undefined) throw new TripNotFoundError();
    if (trip.travellerId !== traveller.id) throw new ForbiddenError();

    const shortlist = await this.shortlistRepository.findByTravellerId(traveller.id);

    // May throw ShortlistEmptyError — let it propagate
    const result = await this.composeDayPlanService.compose({
      travellerId: traveller.id,
      shortlist,
      trip,
      recommender: this.recommender,
      shortlistRepository: this.shortlistRepository,
      dayPlanRepository: this.dayPlanRepository,
      transactionManager: this.transactionManager,
    });

    const autoFilledSet = new Set(result.autoFilledSpotIds);

    return {
      dayPlanId: result.dayPlan.id,
      days: result.dayPlan.days.map((day) => ({
        dayIndex: day.dayIndex,
        date: day.date.toISO(),
        spots: day.pinnedSpots.map((ps, i) => ({
          spotId: ps.spot.id,
          name: ps.spot.name,
          region: ps.spot.region,
          position: i,
          isAutoFilled: autoFilledSet.has(ps.spot.id),
        })),
      })),
      autoFilledSpotIds: result.autoFilledSpotIds,
    };
  }
}
