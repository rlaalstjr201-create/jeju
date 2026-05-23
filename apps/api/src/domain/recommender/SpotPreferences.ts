import type { Shortlist } from '../shortlist/Shortlist.js';

/**
 * D3: A derived, non-persisted categorical distribution map.
 * Format: Record<category, frequencyWeight>, e.g. { oreum: 0.4, cafe: 0.3, beach: 0.3 }.
 * NOT an embedding vector. Computed on demand from a Traveller's Shortlist.
 * Consumed by Recommender to weight ranked output.
 */
export class SpotPreferences {
  private constructor(private readonly distribution: Record<string, number>) {}

  static fromShortlist(shortlist: Shortlist): SpotPreferences {
    const spots = shortlist.spots;
    if (spots.length === 0) {
      return new SpotPreferences({});
    }

    const counts: Record<string, number> = {};
    for (const spot of spots) {
      counts[spot.category] = (counts[spot.category] ?? 0) + 1;
    }

    const total = spots.length;
    const distribution: Record<string, number> = {};
    for (const [category, count] of Object.entries(counts)) {
      distribution[category] = count / total;
    }

    return new SpotPreferences(distribution);
  }

  get isEmpty(): boolean {
    return Object.keys(this.distribution).length === 0;
  }

  /** Returns the weight distribution. Sums to 1.0 if non-empty. */
  get weights(): Record<string, number> {
    return { ...this.distribution };
  }

  /** Returns the weight for a category. Returns 0.0 if not in distribution. */
  weightFor(category: string): number {
    return this.distribution[category] ?? 0.0;
  }
}
