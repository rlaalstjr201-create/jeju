import { describe, it, expect } from 'vitest';
import { ScheduleComposer, ShortlistEmptyError } from './ScheduleComposer.js';
import { Shortlist } from '../shortlist/Shortlist.js';
import { Trip } from '../trip/Trip.js';
import { CalendarDate } from '../shared/CalendarDate.js';
import type { Spot } from '../spot/Spot.js';
import type { Region } from '../shared/Region.js';

function makeSpot(id: string, region: Region, category = 'beach'): Spot {
  return {
    id,
    kakaoPlaceId: `kakao-${id}`,
    syntheticId: null,
    name: `Spot ${id}`,
    region,
    category,
    priceRange: 'free',
    curationScore: 80,
    popularityScore: 70,
    trendScore: 0,
    curationComment: null,
    thumbnailUrl: null,
    lat: 33.25,
    lng: 126.5,
  };
}

function makeTrip(startISO: string, endISO: string): Trip {
  return new Trip({
    id: 'trip-1',
    travellerId: 'traveller-1',
    dateRange: {
      start: CalendarDate.fromISO(startISO),
      end: CalendarDate.fromISO(endISO),
    },
    phase: 'planning',
    dateInferred: false,
  });
}

describe('ScheduleComposer', () => {
  const composer = new ScheduleComposer();

  describe('empty Shortlist guard', () => {
    it('throws ShortlistEmptyError for an empty Shortlist', () => {
      const sl = new Shortlist();
      const trip = makeTrip('2025-06-01', '2025-06-01');
      expect(() => composer.compose(sl, trip)).toThrow(ShortlistEmptyError);
    });
  });

  describe('1 Spot + 1-Day Trip', () => {
    it('assigns the single Spot to Day 1', () => {
      const spot = makeSpot('spot-1', 'seogwipo');
      const sl = new Shortlist([spot]);
      const trip = makeTrip('2025-06-01', '2025-06-01');

      const dayPlan = composer.compose(sl, trip);

      expect(dayPlan.days.length).toBe(1);
      const day1 = dayPlan.dayAt(1);
      expect(day1).toBeDefined();
      expect(day1!.pinnedSpots.length).toBe(1);
      expect(day1!.pinnedSpots[0]?.spot.id).toBe('spot-1');
    });
  });

  describe('Region clustering', () => {
    it('3 Spots (seogwipo, seogwipo, jeju-city) + 3-Day Trip → clusters same-region together', () => {
      const s1 = makeSpot('spot-1', 'seogwipo');
      const s2 = makeSpot('spot-2', 'seogwipo');
      const s3 = makeSpot('spot-3', 'jeju-city');
      const sl = new Shortlist([s1, s2, s3]);
      const trip = makeTrip('2025-06-01', '2025-06-03');

      const dayPlan = composer.compose(sl, trip);
      expect(dayPlan.days.length).toBe(3);

      // Find the day that has seogwipo spots
      const seogwipoDays = dayPlan.days.filter((d) =>
        d.pinnedSpots.some((ps) => ps.spot.region === 'seogwipo'),
      );
      // Both seogwipo spots should be on the same day
      expect(seogwipoDays.length).toBe(1);
      expect(seogwipoDays[0]!.pinnedSpots.filter((ps) => ps.spot.region === 'seogwipo').length).toBe(2);

      // jeju-city spot should be on a different day
      const jejuCityDays = dayPlan.days.filter((d) =>
        d.pinnedSpots.some((ps) => ps.spot.region === 'jeju-city'),
      );
      expect(jejuCityDays.length).toBe(1);
      expect(jejuCityDays[0]!.dayIndex).not.toBe(seogwipoDays[0]!.dayIndex);
    });
  });

  describe('fewer Spots than Days (gap-fill scenario)', () => {
    it('2 Spots + 4-Day Trip → 2 Days have Spots, 2 Days are empty', () => {
      const s1 = makeSpot('spot-1', 'seogwipo');
      const s2 = makeSpot('spot-2', 'jeju-city');
      const sl = new Shortlist([s1, s2]);
      const trip = makeTrip('2025-06-01', '2025-06-04');

      const dayPlan = composer.compose(sl, trip);

      expect(dayPlan.days.length).toBe(4);
      const daysWithSpots = dayPlan.days.filter((d) => d.pinnedSpots.length > 0);
      const emptyDays = dayPlan.days.filter((d) => d.pinnedSpots.length === 0);

      expect(daysWithSpots.length).toBe(2);
      expect(emptyDays.length).toBe(2);
    });
  });

  describe('more Spots than Days', () => {
    it('4 Spots + 2-Day Trip → both Days have Spots (no Spot is dropped)', () => {
      const s1 = makeSpot('spot-1', 'seogwipo');
      const s2 = makeSpot('spot-2', 'seogwipo');
      const s3 = makeSpot('spot-3', 'jeju-city');
      const s4 = makeSpot('spot-4', 'eastern');
      const sl = new Shortlist([s1, s2, s3, s4]);
      const trip = makeTrip('2025-06-01', '2025-06-02');

      const dayPlan = composer.compose(sl, trip);

      expect(dayPlan.days.length).toBe(2);
      const totalPinned = dayPlan.days.reduce((acc, d) => acc + d.pinnedSpots.length, 0);
      expect(totalPinned).toBe(4);

      // Both days must have at least 1 spot
      expect(dayPlan.days[0]!.pinnedSpots.length).toBeGreaterThan(0);
      expect(dayPlan.days[1]!.pinnedSpots.length).toBeGreaterThan(0);
    });
  });

  describe('DayPlan structure', () => {
    it('DayPlan days have 1-based dayIndex starting from 1', () => {
      const sl = new Shortlist([makeSpot('spot-1', 'seogwipo')]);
      const trip = makeTrip('2025-06-01', '2025-06-03');

      const dayPlan = composer.compose(sl, trip);
      const indices = dayPlan.days.map((d) => d.dayIndex);
      expect(indices).toEqual([1, 2, 3]);
    });

    it('DayPlan days have correct dates based on trip start', () => {
      const sl = new Shortlist([makeSpot('spot-1', 'seogwipo')]);
      const trip = makeTrip('2025-06-01', '2025-06-02');

      const dayPlan = composer.compose(sl, trip);
      expect(dayPlan.days[0]?.date.toISO()).toBe('2025-06-01');
      expect(dayPlan.days[1]?.date.toISO()).toBe('2025-06-02');
    });

    it('returns a DayPlan with a non-empty id', () => {
      const sl = new Shortlist([makeSpot('spot-1', 'seogwipo')]);
      const trip = makeTrip('2025-06-01', '2025-06-01');
      const dayPlan = composer.compose(sl, trip);
      expect(dayPlan.id.length).toBeGreaterThan(0);
    });
  });
});
