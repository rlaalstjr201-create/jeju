import type { Region } from '../../domain/shared/Region.js';
import type { AuthService } from '../ports/AuthService.js';
import type { TripRepository } from '../../domain/ports/TripRepository.js';
import type { DayPlanRepository } from '../../domain/ports/DayPlanRepository.js';
import type { SpotRepository } from '../../domain/ports/SpotRepository.js';
import { SpotNotFoundError, DayNotFoundError } from '../errors.js';
import { resolveOwnedTrip } from '../helpers/resolveOwnedTrip.js';
export { DayNotFoundError };

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
    private readonly authService: AuthService,
    private readonly tripRepository: TripRepository,
    private readonly dayPlanRepository: DayPlanRepository,
    private readonly spotRepository: SpotRepository,
  ) {}

  async execute(input: EditDayPlanInput): Promise<EditDayPlanOutput> {
    await resolveOwnedTrip(this.authService, this.tripRepository, input.accessToken, input.tripId);

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
