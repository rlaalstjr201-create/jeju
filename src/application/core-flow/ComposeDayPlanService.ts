import { ScheduleComposer } from '../../domain/schedule-composer/ScheduleComposer.js';
import { SpotPreferences } from '../../domain/recommender/SpotPreferences.js';
import { Shortlist } from '../../domain/shortlist/Shortlist.js';
import type { Trip } from '../../domain/trip/Trip.js';
import type { DayPlan } from '../../domain/trip/DayPlan.js';
import type { Recommender } from '../../domain/recommender/Recommender.js';
import type { ShortlistRepository } from '../../domain/ports/ShortlistRepository.js';
import type { DayPlanRepository } from '../../domain/ports/DayPlanRepository.js';
import type { Traveller } from '../../domain/traveller/Traveller.js';
import type { TransactionManager } from '../ports/TransactionManager.js';

export interface ComposeDayPlanParams {
  readonly travellerId: string;
  readonly shortlist: Shortlist;
  readonly trip: Trip;
  readonly recommender: Recommender;
  readonly shortlistRepository: ShortlistRepository;
  readonly dayPlanRepository: DayPlanRepository;
  readonly transactionManager: TransactionManager;
}

export interface ComposeDayPlanResult {
  readonly dayPlan: DayPlan;
  readonly autoFilledSpotIds: readonly string[];
}

export class ComposeDayPlanService {
  async compose(params: ComposeDayPlanParams): Promise<ComposeDayPlanResult> {
    const composer = new ScheduleComposer();

    // May throw ShortlistEmptyError — let it propagate
    const initialPlan = composer.compose(params.shortlist, params.trip);

    const emptyDays = initialPlan.days.filter((d) => d.pinnedSpots.length === 0);

    if (emptyDays.length === 0) {
      await params.dayPlanRepository.save(params.trip.id, initialPlan, []);
      return { dayPlan: initialPlan, autoFilledSpotIds: [] };
    }

    // Build preferences and recommendation context
    const preferences = SpotPreferences.fromShortlist(params.shortlist);
    const context = {
      traveller: { id: params.travellerId } as Traveller,
      trip: params.trip,
      preferences,
    };

    const candidates = await params.recommender.recommendForShortlist(context);

    // Filter out spots already in the shortlist
    const filteredCandidates = candidates.filter(
      (c) => !params.shortlist.contains(c),
    );

    // Fill as many empty days as possible — partial fill is acceptable
    const fillCount = Math.min(emptyDays.length, filteredCandidates.length);

    const updatedShortlist = new Shortlist([...params.shortlist.spots]);
    const autoFilledSpotIds: string[] = [];

    for (let i = 0; i < fillCount; i++) {
      const spot = filteredCandidates[i];
      if (spot === undefined) break;
      updatedShortlist.add(spot);
      autoFilledSpotIds.push(spot.id);
    }

    // Pure computation — outside transaction
    const dayPlan = composer.compose(updatedShortlist, params.trip);

    // Atomic: shortlist and dayplan saved together — if dayplan save fails, shortlist is rolled back
    await params.transactionManager.run(async () => {
      await params.shortlistRepository.save(params.travellerId, updatedShortlist, autoFilledSpotIds);
      await params.dayPlanRepository.save(params.trip.id, dayPlan, autoFilledSpotIds);
    });

    return { dayPlan, autoFilledSpotIds };
  }
}
