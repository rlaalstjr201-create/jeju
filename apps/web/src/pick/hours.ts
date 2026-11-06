// 지금 못 가는 곳 (specs/open-now.md): the hours a place is known to keep, and whether it is shut at a moment.
import type { Day } from '../dates';

/** What the source says, read only where it is sure (scripts/hours/parse.mjs). `c`: the weekdays it is closed every
 * week (0 = Sunday). `o`: open from `o[0]` to `o[1]`, minutes after midnight; `o[1]` past 1440 runs past midnight;
 * [0, 1440] is 24시간. Either may be missing (not known). */
export interface Hours {
  c?: number[];
  o?: [number, number];
}

/** Unknown hours (specs/open-now.md 3): 먹기 not between 22:00 and 07:00; other indoor places and every 놀러 가고 싶어
 * place (요트·카트·워터파크·체험 — someone runs them, whatever its 구경/놀거리 tab) not between 19:00 and 09:00. Other
 * places outdoors, always. */
const FOOD_SHUT: [number, number] = [22 * 60, 7 * 60];
const INDOOR_SHUT: [number, number] = [19 * 60, 9 * 60];
const within = (m: number, [from, to]: [number, number]) => (from <= to ? m >= from && m < to : m >= from || m < to);

export const weekdayOf = (day: Day): number => new Date(`${day}T12:00:00Z`).getUTCDay();

/**
 * Shut on `day` (a closed weekday), or — `minute` given (지금, minutes after midnight in Jeju) — at that minute: outside
 * its hours, or, its hours unknown, inside the shut window of its kind. A place open past midnight is open in the small
 * hours after a day it opened.
 */
export function shutAt(spot: { mood: string; indoor?: boolean; hours?: Hours }, day: Day, minute: number | null = null): boolean {
  const h = spot.hours;
  const wd = weekdayOf(day);
  const closedOn = (d: number) => !!h?.c?.includes(d);
  if (minute === null) return closedOn(wd);
  if (h?.o) {
    const [from, to] = h.o;
    if (minute >= from && minute < Math.min(to, 1440) && !closedOn(wd)) return false;
    // the night before's hours, run past midnight
    if (to > 1440 && minute < to - 1440 && !closedOn((wd + 6) % 7)) return false;
    return true;
  }
  if (closedOn(wd)) return true;
  if (spot.mood === 'food') return within(minute, FOOD_SHUT);
  if (spot.indoor || spot.mood === 'new') return within(minute, INDOOR_SHUT);
  return false;
}
