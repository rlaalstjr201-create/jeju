import type { CalendarDate } from '../shared/CalendarDate.js';
import type { TripPhase } from '../shared/TripPhase.js';

export class InvalidDateRangeError extends Error {
  constructor(start: string, end: string) {
    super(`종료일이 시작일보다 앞설 수 없습니다: ${start} ~ ${end}`);
    this.name = 'InvalidDateRangeError';
  }
}

export interface DateRange {
  readonly start: CalendarDate;
  readonly end: CalendarDate;
}

export interface TripParams {
  readonly id: string;
  readonly travellerId: string;
  readonly dateRange: DateRange;
  readonly phase: TripPhase;
  readonly dateInferred: boolean;
}

export class Trip {
  private readonly _id: string;
  private readonly _travellerId: string;
  private readonly _dateRange: DateRange;
  private readonly _phase: TripPhase;
  private readonly _dateInferred: boolean;

  constructor(params: TripParams) {
    if (params.dateRange.end.isBefore(params.dateRange.start)) {
      throw new InvalidDateRangeError(
        params.dateRange.start.toISO(),
        params.dateRange.end.toISO(),
      );
    }
    this._id = params.id;
    this._travellerId = params.travellerId;
    this._dateRange = params.dateRange;
    this._phase = params.phase;
    this._dateInferred = params.dateInferred;
  }

  get id(): string {
    return this._id;
  }

  get travellerId(): string {
    return this._travellerId;
  }

  get dateRange(): DateRange {
    return this._dateRange;
  }

  get phase(): TripPhase {
    return this._phase;
  }

  get dateInferred(): boolean {
    return this._dateInferred;
  }

  get dayCount(): number {
    // inclusive: end - start + 1
    return this._dateRange.end.diffDays(this._dateRange.start) + 1;
  }

  withPhase(phase: TripPhase): Trip {
    return new Trip({
      id: this._id,
      travellerId: this._travellerId,
      dateRange: this._dateRange,
      phase,
      dateInferred: this._dateInferred,
    });
  }
}
