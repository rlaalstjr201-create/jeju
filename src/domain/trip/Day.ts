import type { CalendarDate } from '../shared/CalendarDate.js';
import type { Spot } from '../spot/Spot.js';

export class Day {
  private readonly _dayIndex: number;
  private readonly _date: CalendarDate;
  private readonly _pinnedSpots: Spot[];

  constructor(params: { dayIndex: number; date: CalendarDate }) {
    this._dayIndex = params.dayIndex;
    this._date = params.date;
    this._pinnedSpots = [];
  }

  get dayIndex(): number {
    return this._dayIndex;
  }

  get date(): CalendarDate {
    return this._date;
  }

  get pinnedSpots(): readonly Spot[] {
    return this._pinnedSpots;
  }

  /** Idempotent: pinning the same spot id again is a no-op. */
  pin(spot: Spot): void {
    const alreadyPinned = this._pinnedSpots.some((s) => s.id === spot.id);
    if (!alreadyPinned) {
      this._pinnedSpots.push(spot);
    }
  }

  /** Safe: unpinning a spot that is not pinned is a no-op, no throw. */
  unpin(spot: Spot): void {
    const index = this._pinnedSpots.findIndex((s) => s.id === spot.id);
    if (index !== -1) {
      this._pinnedSpots.splice(index, 1);
    }
  }

  /** Returns a new Day with the same dayIndex and pinnedSpots, but updated date. */
  withDate(date: CalendarDate): Day {
    const clone = new Day({ dayIndex: this._dayIndex, date });
    for (const spot of this._pinnedSpots) {
      clone.pin(spot);
    }
    return clone;
  }
}
