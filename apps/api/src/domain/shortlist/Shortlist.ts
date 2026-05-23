import type { Spot } from '../spot/Spot.js';

/**
 * Traveller-owned collection of Spots with no date assignment.
 * Operates independently of any Trip.
 * Rendered as "찜하기" in the UI; the domain term is always Shortlist.
 */
export class Shortlist {
  private readonly _spots: Spot[];

  constructor(spots: Spot[] = []) {
    this._spots = [...spots];
  }

  get spots(): readonly Spot[] {
    return this._spots;
  }

  /** Idempotent: adding the same spot id again is a no-op. */
  add(spot: Spot): void {
    if (!this.contains(spot)) {
      this._spots.push(spot);
    }
  }

  /** Safe: removing a spot that is not in the list is a no-op, no throw. */
  remove(spot: Spot): void {
    const index = this._spots.findIndex((s) => s.id === spot.id);
    if (index !== -1) {
      this._spots.splice(index, 1);
    }
  }

  contains(spot: Spot): boolean {
    return this._spots.some((s) => s.id === spot.id);
  }
}
