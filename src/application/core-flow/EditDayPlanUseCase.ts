import type { Region } from '../../domain/shared/Region.js';
import type { TravellerAuthService } from '../../infrastructure/kakao/TravellerAuthService.js';
import type { TripRepository } from '../../domain/ports/TripRepository.js';
import type { DayPlanRepository } from '../../domain/ports/DayPlanRepository.js';
import type { SpotRepository } from '../../domain/ports/SpotRepository.js';
import { TripNotFoundError, ForbiddenError } from './GetRecommendationsUseCase.js';
import { SpotNotFoundError } from './UpdateShortlistUseCase.js';

export class DayNotFoundError extends Error {
  constructor() {
    super('DAY_NOT_FOUND');
    this.name = 'DayNotFoundError';
  }
}

interface EditDayPlanInput {
  readonly accessToken: string;
  readonly tripId: string;
  readonly dayIndex: number;
  readonly spotId: string;
  readonly action: 'pin' | 'unpin';
}

interface SpotInDay {
  spotId: string;
  name: string;
  region: Region;
  position: number;
  isAutoFilled: boolean;
}

interface EditDayPlanOutput {
  readonly dayIndex: number;
  readonly spots: SpotInDay[];
}

export class EditDayPlanUseCase {
  constructor(
    private readonly authService: TravellerAuthService,
    private readonly tripRepository: TripRepository,
    private readonly dayPlanRepository: DayPlanRepository,
    private readonly spotRepository: SpotRepository,
  ) {}

  async execute(input: EditDayPlanInput): Promise<EditDayPlanOutput> {
    const traveller = await this.authService.authenticate(input.accessToken);

    const trip = await this.tripRepository.findById(input.tripId);
    if (trip === undefined) throw new TripNotFoundError();
    if (trip.travellerId !== traveller.id) throw new ForbiddenError();

    const dayPlan = await this.dayPlanRepository.findByTripId(input.tripId);
    if (dayPlan === undefined) throw new DayNotFoundError();

    const day = dayPlan.dayAt(input.dayIndex);
    if (day === undefined) throw new DayNotFoundError();

    const spot = await this.spotRepository.findById(input.spotId);
    if (spot === undefined) throw new SpotNotFoundError();

    if (input.action === 'pin') {
      day.pin(spot);
    } else {
      day.unpin(spot);
    }

    await this.dayPlanRepository.updatePinnedSpots(dayPlan);

    return {
      dayIndex: input.dayIndex,
      spots: day.pinnedSpots.map((ps, i) => ({
        spotId: ps.spot.id,
        name: ps.spot.name,
        region: ps.spot.region,
        position: i,
        isAutoFilled: ps.isAutoFilled,
      })),
    };
  }
}
