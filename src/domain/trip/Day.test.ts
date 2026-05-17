import { describe, it, expect } from 'vitest';
import { Day } from './Day.js';
import { CalendarDate } from '../shared/CalendarDate.js';
import type { Spot } from '../spot/Spot.js';

function makeSpot(id: string, category = 'beach'): Spot {
  return {
    id,
    kakaoPlaceId: `kakao-${id}`,
    name: `Spot ${id}`,
    region: 'seogwipo',
    category,
    priceRange: 'free',
    curationScore: 80,
    popularityScore: 70,
    curationComment: null,
    lat: 33.25,
    lng: 126.5,
  };
}

function makeDay(dayIndex = 1, dateISO = '2025-06-01'): Day {
  return new Day({
    dayIndex,
    date: CalendarDate.fromISO(dateISO),
  });
}

describe('Day', () => {
  describe('pin', () => {
    it('adds a spot to pinnedSpots', () => {
      const day = makeDay();
      const spot = makeSpot('spot-1');
      day.pin(spot);
      expect(day.pinnedSpots.length).toBe(1);
      expect(day.pinnedSpots[0]?.id).toBe('spot-1');
    });

    it('is idempotent: pinning the same spot twice keeps length 1', () => {
      const day = makeDay();
      const spot = makeSpot('spot-1');
      day.pin(spot);
      day.pin(spot);
      expect(day.pinnedSpots.length).toBe(1);
    });

    it('can pin multiple different spots', () => {
      const day = makeDay();
      day.pin(makeSpot('spot-1'));
      day.pin(makeSpot('spot-2'));
      expect(day.pinnedSpots.length).toBe(2);
    });

    it('does not reference any Shortlist (Day has no Shortlist property)', () => {
      const day = makeDay();
      expect((day as unknown as Record<string, unknown>)['shortlist']).toBeUndefined();
    });
  });

  describe('unpin', () => {
    it('removes a pinned spot', () => {
      const day = makeDay();
      const spot = makeSpot('spot-1');
      day.pin(spot);
      day.unpin(spot);
      expect(day.pinnedSpots.length).toBe(0);
    });

    it('is safe: unpinning a spot that was never pinned does not throw', () => {
      const day = makeDay();
      const spot = makeSpot('spot-1');
      expect(() => day.unpin(spot)).not.toThrow();
      expect(day.pinnedSpots.length).toBe(0);
    });

    it('only removes the targeted spot', () => {
      const day = makeDay();
      const s1 = makeSpot('spot-1');
      const s2 = makeSpot('spot-2');
      day.pin(s1);
      day.pin(s2);
      day.unpin(s1);
      expect(day.pinnedSpots.length).toBe(1);
      expect(day.pinnedSpots[0]?.id).toBe('spot-2');
    });
  });

  describe('dayIndex and date', () => {
    it('stores dayIndex correctly', () => {
      const day = makeDay(3, '2025-06-03');
      expect(day.dayIndex).toBe(3);
    });

    it('stores date correctly', () => {
      const day = makeDay(1, '2025-06-01');
      expect(day.date.toISO()).toBe('2025-06-01');
    });
  });

  describe('withDate', () => {
    it('returns a new Day with the same dayIndex and pinnedSpots but updated date', () => {
      const day = makeDay(2, '2025-06-02');
      const spot = makeSpot('spot-1');
      day.pin(spot);

      const shifted = day.withDate(CalendarDate.fromISO('2025-06-09'));
      expect(shifted.dayIndex).toBe(2);
      expect(shifted.date.toISO()).toBe('2025-06-09');
      expect(shifted.pinnedSpots.length).toBe(1);
      expect(shifted.pinnedSpots[0]?.id).toBe('spot-1');
    });

    it('does not mutate the original Day', () => {
      const day = makeDay(1, '2025-06-01');
      day.withDate(CalendarDate.fromISO('2025-06-08'));
      expect(day.date.toISO()).toBe('2025-06-01');
    });
  });
});
