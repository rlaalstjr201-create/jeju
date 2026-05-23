import type { Day } from './Day.js';

export class DayPlan {
  private readonly _id: string;
  private readonly _days: Day[];

  constructor(params: { id: string; days: Day[] }) {
    this._id = params.id;
    this._days = [...params.days];
  }

  get id(): string {
    return this._id;
  }

  get days(): readonly Day[] {
    return this._days;
  }

  dayAt(dayIndex: number): Day | undefined {
    return this._days.find((d) => d.dayIndex === dayIndex);
  }
}
