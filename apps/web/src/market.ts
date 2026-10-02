// 오일장 장날 (ADR-0066, specs/market-days.md). Static rules from review/copy/market-days.json, no requests.
import type { Day } from './dates';

/** A five-day market's rule as shipped in spots.json: the days of the month it opens, the label shown
 * (`2·7일`), and 대정's exception (opens on the 31st, not on the 1st after a 31-day month). */
export interface Market {
  days: number[];
  label: string;
  noFirstAfter31?: boolean;
}

/** open: a market day; off: not one; closed: the source says it does not open that day (left out of picks). */
export type MarketDay = 'open' | 'off' | 'closed';

/** Days in the month before `day`'s month. */
function daysInPrevMonth(day: Day): number {
  const [y, m] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 0)).getUTCDate();
}

export function marketDay(rule: Market, day: Day): MarketDay {
  const d = Number(day.slice(8, 10));
  if (rule.noFirstAfter31 && d === 1 && daysInPrevMonth(day) === 31) return 'closed';
  return Array.isArray(rule.days) && rule.days.includes(d) ? 'open' : 'off';
}

/** The meta words for a market card on `day`; `dated`: date mode (a chosen day, not today). */
export function marketText(rule: Market, day: Day, dated: boolean): string {
  if (marketDay(rule, day) === 'open') return dated ? '이날 장 서는 날' : '오늘 장 서는 날';
  return `장날: ${rule.label}`;
}
