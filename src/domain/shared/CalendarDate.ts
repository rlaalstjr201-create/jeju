// Immutable value object. YYYY-MM-DD string, KST-fixed (UTC+9). No timezone conversion.

export class InvalidCalendarDateError extends Error {
  constructor(value: string) {
    super(`유효하지 않은 날짜 형식입니다: "${value}". YYYY-MM-DD 형식이어야 합니다.`);
    this.name = 'InvalidCalendarDateError';
  }
}

const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(iso: string): boolean {
  if (!ISO_PATTERN.test(iso)) return false;
  const [yearStr, monthStr, dayStr] = iso.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  if (month < 1 || month > 12) return false;
  if (day < 1) return false;
  // Use Date to validate the day count for the given month/year
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

export class CalendarDate {
  private constructor(private readonly iso: string) {}

  static fromISO(s: string): CalendarDate {
    if (!isValidDate(s)) {
      throw new InvalidCalendarDateError(s);
    }
    return new CalendarDate(s);
  }

  static today(): CalendarDate {
    // KST = UTC+9
    const nowUtcMs = Date.now();
    const kstMs = nowUtcMs + 9 * 60 * 60 * 1000;
    const kstDate = new Date(kstMs);
    const year = kstDate.getUTCFullYear();
    const month = String(kstDate.getUTCMonth() + 1).padStart(2, '0');
    const day = String(kstDate.getUTCDate()).padStart(2, '0');
    return new CalendarDate(`${year}-${month}-${day}`);
  }

  toISO(): string {
    return this.iso;
  }

  equals(other: CalendarDate): boolean {
    return this.iso === other.iso;
  }

  isBefore(other: CalendarDate): boolean {
    return this.iso < other.iso;
  }

  isAfter(other: CalendarDate): boolean {
    return this.iso > other.iso;
  }

  addDays(n: number): CalendarDate {
    const [yearStr, monthStr, dayStr] = this.iso.split('-');
    const date = new Date(Number(yearStr), Number(monthStr) - 1, Number(dayStr));
    date.setDate(date.getDate() + n);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return new CalendarDate(`${year}-${month}-${day}`);
  }

  /** Returns the number of days between this and other (this - other). */
  diffDays(other: CalendarDate): number {
    const [ay, am, ad] = this.iso.split('-').map(Number);
    const [by, bm, bd] = other.iso.split('-').map(Number);
    const a = new Date(ay!, am! - 1, ad!).getTime();
    const b = new Date(by!, bm! - 1, bd!).getTime();
    return Math.round((a - b) / (1000 * 60 * 60 * 24));
  }
}
