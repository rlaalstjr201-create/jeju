import type { CalendarDate } from '../shared/CalendarDate.js';

export interface TimeRange {
  readonly start: CalendarDate;
  readonly end: CalendarDate;
}

export interface Booking {
  readonly id: string;
  readonly tripId: string;
  readonly type: string;
  readonly deepLink: string;
  readonly timeRange: TimeRange;
}
