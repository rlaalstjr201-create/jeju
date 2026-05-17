import type { Shortlist } from '../shortlist/Shortlist.js';
import type { Trip } from '../trip/Trip.js';
import { Day } from '../trip/Day.js';
import { DayPlan } from '../trip/DayPlan.js';
import type { Spot } from '../spot/Spot.js';
import type { Region } from '../shared/Region.js';

export class ShortlistEmptyError extends Error {
  constructor() {
    super('Shortlist에 Spot이 없습니다. 최소 1개 이상의 Spot을 추가해주세요.');
    this.name = 'ShortlistEmptyError';
  }
}

const REGION_ORDER: Region[] = [
  'jeju-city',
  'eastern',
  'seogwipo',
  'western',
  'hallasan',
];

function generateId(): string {
  return `dayplan-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Domain service. Distributes Spots from Shortlist into DayPlan by Region clustering.
 * Does NOT assign times, check conflicts, or call Recommender for gap-fill —
 * that is the application layer's responsibility.
 * Returns a DayPlan with some empty Days if spots < days (gap-fill is app layer's job).
 */
export class ScheduleComposer {
  compose(shortlist: Shortlist, trip: Trip): DayPlan {
    if (shortlist.spots.length === 0) {
      throw new ShortlistEmptyError();
    }

    const dayCount = trip.dayCount;
    const spots = [...shortlist.spots];

    // Build Days
    const days: Day[] = [];
    for (let i = 0; i < dayCount; i++) {
      const dayIndex = i + 1; // 1-based
      const date = trip.dateRange.start.addDays(i);
      days.push(new Day({ dayIndex, date }));
    }

    // Group spots by Region, preserving the canonical region order
    const byRegion = new Map<Region, Spot[]>();
    for (const region of REGION_ORDER) {
      byRegion.set(region, []);
    }
    for (const spot of spots) {
      const group = byRegion.get(spot.region);
      if (group !== undefined) {
        group.push(spot);
      }
    }

    // Collect region groups in order, skipping empty ones
    const regionGroups: Spot[][] = [];
    for (const region of REGION_ORDER) {
      const group = byRegion.get(region);
      if (group !== undefined && group.length > 0) {
        regionGroups.push(group);
      }
    }

    // Distribute region groups to days
    // Strategy: assign each region group to a distinct day if possible.
    // If more region groups than days, merge extra groups into the last day.
    // If fewer region groups than days, some days remain empty.

    if (regionGroups.length <= dayCount) {
      // Each non-empty region group gets its own day (in order)
      for (let gi = 0; gi < regionGroups.length; gi++) {
        const day = days[gi];
        if (day === undefined) break;
        for (const spot of regionGroups[gi]!) {
          day.pin(spot);
        }
      }
      // Remaining days stay empty — application layer handles gap-fill
    } else {
      // More groups than days: distribute round-robin into available days
      for (let gi = 0; gi < regionGroups.length; gi++) {
        const dayIndex = gi % dayCount;
        const day = days[dayIndex];
        if (day === undefined) continue;
        for (const spot of regionGroups[gi]!) {
          day.pin(spot);
        }
      }
    }

    return new DayPlan({ id: generateId(), days });
  }
}
