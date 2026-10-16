// Calendar days in Jeju: Asia/Seoul (UTC+9, no daylight saving), written 'YYYY-MM-DD' (specs/date-mode.md).
// Plain arithmetic on a fixed offset: no Intl time-zone data needed, the same on every device.
export type Day = string;

const KST = 9 * 3600_000;
const DAY_MS = 86_400_000;
const WEEKDAYS = '일월화수목금토';

/** The Seoul calendar day an instant falls on. */
export function dayOf(d: Date): Day {
  return new Date(d.getTime() + KST).toISOString().slice(0, 10);
}

export function addDays(day: Day, n: number): Day {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/** 날짜 고르기 reaches this many days past today (the date field's max). */
export const DAYS_AHEAD = 365;

/** A real calendar day ('2026-02-30' is not). */
export function isDay(v: unknown): v is Day {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const t = Date.parse(`${v}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === v;
}

/** The Seoul time of day of an instant, in minutes after midnight (with fractions). */
export function minuteOf(d: Date): number {
  return ((d.getTime() + KST) % DAY_MS) / 60_000;
}

/** Milliseconds until the next Seoul midnight. */
export function msToNextDay(d: Date): number {
  return DAY_MS - ((d.getTime() + KST) % DAY_MS);
}

/** The day words (ADR-0093: another language's table replaces them). `w`: 0 = Sunday. */
export const DAY_TEXT = {
  short: (m: number, d: number) => `${m}월 ${d}일`,
  long: (m: number, d: number, w: number) => `${DAY_TEXT.short(m, d)} ${WEEKDAYS[w]}요일`,
};

function parts(day: Day) {
  const t = new Date(`${day}T00:00:00Z`);
  return { m: t.getUTCMonth() + 1, d: t.getUTCDate(), w: t.getUTCDay() };
}
/** "10월 3일" */
export function shortDay(day: Day): string {
  const p = parts(day);
  return DAY_TEXT.short(p.m, p.d);
}
/** "10월 3일 금요일" */
export function longDay(day: Day): string {
  const p = parts(day);
  return DAY_TEXT.long(p.m, p.d, p.w);
}
