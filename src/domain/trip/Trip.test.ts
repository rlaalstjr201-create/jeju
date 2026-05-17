import { describe, it, expect } from 'vitest';
import { Trip, InvalidDateRangeError } from './Trip.js';
import { CalendarDate } from '../shared/CalendarDate.js';

function makeTrip(startISO: string, endISO: string, opts?: { dateInferred?: boolean }) {
  return new Trip({
    id: 'trip-1',
    travellerId: 'traveller-1',
    dateRange: {
      start: CalendarDate.fromISO(startISO),
      end: CalendarDate.fromISO(endISO),
    },
    phase: 'planning',
    dateInferred: opts?.dateInferred ?? false,
  });
}

describe('Trip', () => {
  describe('construction', () => {
    it('constructs a valid Trip', () => {
      const trip = makeTrip('2025-06-01', '2025-06-04');
      expect(trip.id).toBe('trip-1');
      expect(trip.travellerId).toBe('traveller-1');
      expect(trip.phase).toBe('planning');
      expect(trip.dateInferred).toBe(false);
    });

    it('throws InvalidDateRangeError when end < start', () => {
      expect(() => makeTrip('2025-06-04', '2025-06-01')).toThrow(InvalidDateRangeError);
    });

    it('allows start === end (day trip)', () => {
      const trip = makeTrip('2025-06-01', '2025-06-01');
      expect(trip.dayCount).toBe(1);
    });

    it('stores dateInferred: true correctly', () => {
      const trip = makeTrip('2025-06-01', '2025-06-02', { dateInferred: true });
      expect(trip.dateInferred).toBe(true);
    });
  });

  describe('dayCount', () => {
    it('returns 2 for 1박2일 (2025-06-01 ~ 2025-06-02)', () => {
      const trip = makeTrip('2025-06-01', '2025-06-02');
      expect(trip.dayCount).toBe(2);
    });

    it('returns 4 for 3박4일 (2025-06-01 ~ 2025-06-04)', () => {
      const trip = makeTrip('2025-06-01', '2025-06-04');
      expect(trip.dayCount).toBe(4);
    });

    it('returns 1 for a single-day trip', () => {
      const trip = makeTrip('2025-06-01', '2025-06-01');
      expect(trip.dayCount).toBe(1);
    });

    it('returns 7 for a week-long trip', () => {
      const trip = makeTrip('2025-06-01', '2025-06-07');
      expect(trip.dayCount).toBe(7);
    });
  });

  describe('withPhase', () => {
    it('returns a new Trip with updated phase', () => {
      const trip = makeTrip('2025-06-01', '2025-06-02');
      const active = trip.withPhase('active');
      expect(active.phase).toBe('active');
      expect(active.id).toBe(trip.id);
      expect(active.travellerId).toBe(trip.travellerId);
    });

    it('does not mutate the original Trip', () => {
      const trip = makeTrip('2025-06-01', '2025-06-02');
      trip.withPhase('completed');
      expect(trip.phase).toBe('planning');
    });
  });

  describe('dateRange', () => {
    it('exposes correct start and end', () => {
      const trip = makeTrip('2025-06-01', '2025-06-04');
      expect(trip.dateRange.start.toISO()).toBe('2025-06-01');
      expect(trip.dateRange.end.toISO()).toBe('2025-06-04');
    });
  });
});
