import type { CalendarDate } from '../shared/CalendarDate.js';

export interface Traveller {
  readonly id: string;
  readonly kakaoId: string;
  readonly createdAt: CalendarDate;
}
