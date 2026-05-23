import { describe, it, expect } from 'vitest';
import { SpotPreferences } from './SpotPreferences.js';
import { Shortlist } from '../shortlist/Shortlist.js';
import type { Spot } from '../spot/Spot.js';

function makeSpot(id: string, category: string): Spot {
  return {
    id,
    kakaoPlaceId: `kakao-${id}`,
    syntheticId: null,
    name: `Spot ${id}`,
    region: 'seogwipo',
    category,
    priceRange: 'free',
    curationScore: 80,
    popularityScore: 70,
    trendScore: 0,
    curationComment: null,
    thumbnailUrl: null,
    lat: 33.25,
    lng: 126.5,
    tier: 'hidden',
    awards: [],
    curatorComment: null,
    curatorCommentSource: null,
    curatorCommentRetryCount: 0,
  };
}

describe('SpotPreferences', () => {
  describe('fromShortlist — empty Shortlist', () => {
    it('returns isEmpty === true for empty Shortlist', () => {
      const sl = new Shortlist();
      const prefs = SpotPreferences.fromShortlist(sl);
      expect(prefs.isEmpty).toBe(true);
    });

    it('returns weights === {} for empty Shortlist', () => {
      const sl = new Shortlist();
      const prefs = SpotPreferences.fromShortlist(sl);
      expect(prefs.weights).toEqual({});
    });

    it('does NOT throw for empty Shortlist', () => {
      const sl = new Shortlist();
      expect(() => SpotPreferences.fromShortlist(sl)).not.toThrow();
    });
  });

  describe('fromShortlist — non-empty Shortlist', () => {
    it('computes correct distribution for 2 oreum + 1 cafe', () => {
      const sl = new Shortlist([
        makeSpot('s1', 'oreum'),
        makeSpot('s2', 'oreum'),
        makeSpot('s3', 'cafe'),
      ]);
      const prefs = SpotPreferences.fromShortlist(sl);

      expect(prefs.isEmpty).toBe(false);
      const oreumWeight = prefs.weightFor('oreum');
      const cafeWeight = prefs.weightFor('cafe');

      expect(oreumWeight).toBeCloseTo(2 / 3, 5);
      expect(cafeWeight).toBeCloseTo(1 / 3, 5);
    });

    it('weights sum to 1.0 for non-empty Shortlist', () => {
      const sl = new Shortlist([
        makeSpot('s1', 'oreum'),
        makeSpot('s2', 'oreum'),
        makeSpot('s3', 'cafe'),
        makeSpot('s4', 'beach'),
      ]);
      const prefs = SpotPreferences.fromShortlist(sl);
      const total = Object.values(prefs.weights).reduce((a, b) => a + b, 0);
      expect(total).toBeCloseTo(1.0, 5);
    });

    it('returns 0.0 for an unknown category', () => {
      const sl = new Shortlist([makeSpot('s1', 'oreum')]);
      const prefs = SpotPreferences.fromShortlist(sl);
      expect(prefs.weightFor('unknown-category')).toBe(0.0);
    });

    it('weightFor returns the correct weight for a known category', () => {
      const sl = new Shortlist([
        makeSpot('s1', 'oreum'),
        makeSpot('s2', 'oreum'),
        makeSpot('s3', 'oreum'),
        makeSpot('s4', 'cafe'),
      ]);
      const prefs = SpotPreferences.fromShortlist(sl);
      expect(prefs.weightFor('oreum')).toBeCloseTo(0.75, 5);
      expect(prefs.weightFor('cafe')).toBeCloseTo(0.25, 5);
    });

    it('handles a single-spot Shortlist: weight is 1.0', () => {
      const sl = new Shortlist([makeSpot('s1', 'beach')]);
      const prefs = SpotPreferences.fromShortlist(sl);
      expect(prefs.weightFor('beach')).toBeCloseTo(1.0, 5);
    });
  });
});
