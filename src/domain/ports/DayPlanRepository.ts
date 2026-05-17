import type { DayPlan } from '../trip/DayPlan.js';

export interface DayPlanRepository {
  findByTripId(tripId: string): Promise<DayPlan | undefined>;
  save(tripId: string, dayPlan: DayPlan, autoFilledSpotIds?: readonly string[]): Promise<void>;
  updatePinnedSpots(dayPlan: DayPlan): Promise<void>;
}
