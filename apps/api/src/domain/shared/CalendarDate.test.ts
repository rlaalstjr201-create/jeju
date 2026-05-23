import { describe, it, expect } from 'vitest';
import { CalendarDate, InvalidCalendarDateError } from './CalendarDate.js';

describe('CalendarDate', () => {
  describe('fromISO', () => {
    it('parses a valid date', () => {
      const d = CalendarDate.fromISO('2026-05-17');
      expect(d.toISO()).toBe('2026-05-17');
    });

    it('throws InvalidCalendarDateError for "bad"', () => {
      expect(() => CalendarDate.fromISO('bad')).toThrow(InvalidCalendarDateError);
    });

    it('throws InvalidCalendarDateError for "2026-13-01" (invalid month)', () => {
      expect(() => CalendarDate.fromISO('2026-13-01')).toThrow(InvalidCalendarDateError);
    });

    it('throws InvalidCalendarDateError for "2026-00-01" (zero month)', () => {
      expect(() => CalendarDate.fromISO('2026-00-01')).toThrow(InvalidCalendarDateError);
    });

    it('throws InvalidCalendarDateError for "2026-02-30" (invalid day)', () => {
      expect(() => CalendarDate.fromISO('2026-02-30')).toThrow(InvalidCalendarDateError);
    });

    it('throws InvalidCalendarDateError for "" (empty string)', () => {
      expect(() => CalendarDate.fromISO('')).toThrow(InvalidCalendarDateError);
    });

    it('throws InvalidCalendarDateError for "2026-5-7" (no zero-padding)', () => {
      expect(() => CalendarDate.fromISO('2026-5-7')).toThrow(InvalidCalendarDateError);
    });

    it('accepts last day of February in leap year', () => {
      const d = CalendarDate.fromISO('2024-02-29');
      expect(d.toISO()).toBe('2024-02-29');
    });

    it('rejects Feb 29 in non-leap year', () => {
      expect(() => CalendarDate.fromISO('2025-02-29')).toThrow(InvalidCalendarDateError);
    });
  });

  describe('addDays', () => {
    it('adds 3 days to 2026-05-17 → 2026-05-20', () => {
      const d = CalendarDate.fromISO('2026-05-17');
      expect(d.addDays(3).toISO()).toBe('2026-05-20');
    });

    it('adds 1 day to 2026-12-31 → 2027-01-01 (year rollover)', () => {
      const d = CalendarDate.fromISO('2026-12-31');
      expect(d.addDays(1).toISO()).toBe('2027-01-01');
    });

    it('adds 0 days → same date', () => {
      const d = CalendarDate.fromISO('2026-05-17');
      expect(d.addDays(0).toISO()).toBe('2026-05-17');
    });

    it('adds negative days (subtracts)', () => {
      const d = CalendarDate.fromISO('2026-05-17');
      expect(d.addDays(-1).toISO()).toBe('2026-05-16');
    });
  });

  describe('isBefore / isAfter / equals', () => {
    const earlier = CalendarDate.fromISO('2026-05-01');
    const later = CalendarDate.fromISO('2026-05-31');
    const same = CalendarDate.fromISO('2026-05-17');
    const same2 = CalendarDate.fromISO('2026-05-17');

    it('isBefore returns true when date is earlier', () => {
      expect(earlier.isBefore(later)).toBe(true);
    });

    it('isBefore returns false when date is later', () => {
      expect(later.isBefore(earlier)).toBe(false);
    });

    it('isBefore returns false for equal dates', () => {
      expect(same.isBefore(same2)).toBe(false);
    });

    it('isAfter returns true when date is later', () => {
      expect(later.isAfter(earlier)).toBe(true);
    });

    it('isAfter returns false when date is earlier', () => {
      expect(earlier.isAfter(later)).toBe(false);
    });

    it('isAfter returns false for equal dates', () => {
      expect(same.isAfter(same2)).toBe(false);
    });

    it('equals returns true for the same ISO string', () => {
      expect(same.equals(same2)).toBe(true);
    });

    it('equals returns false for different dates', () => {
      expect(earlier.equals(later)).toBe(false);
    });
  });

  describe('diffDays', () => {
    it('computes difference correctly (end - start)', () => {
      const start = CalendarDate.fromISO('2025-06-01');
      const end = CalendarDate.fromISO('2025-06-04');
      expect(end.diffDays(start)).toBe(3);
    });

    it('diffDays of same date is 0', () => {
      const d = CalendarDate.fromISO('2026-05-17');
      expect(d.diffDays(d)).toBe(0);
    });
  });

  describe('today', () => {
    it('returns a valid CalendarDate in YYYY-MM-DD format', () => {
      const d = CalendarDate.today();
      expect(d.toISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });
});
