// 철 (ADR-0080, specs/seasonal-spots.md): is a place in season on a Jeju day. Static data, no requests.
import { isDay, type Day } from '../dates';

export type SeasonKind = 'cherry' | 'plum' | 'maple' | 'rapeseed' | 'hydrangea' | 'silvergrass' | 'camellia' | 'tangerine' | 'muhly';
/** As shipped in spots.json: the whole months the source names, or this year's observed window (Jeju dates). */
export type Season = { kind: SeasonKind; months: number[] } | { kind: SeasonKind; from: Day; to: Day };

/** The words, in ADR-0080 5 order (observed kinds first): the first of two seasons on one day is shown. */
const WORDS: Record<SeasonKind, string> = {
  cherry: '벚꽃',
  plum: '매화',
  maple: '단풍',
  rapeseed: '유채꽃',
  hydrangea: '수국',
  silvergrass: '억새',
  camellia: '동백',
  tangerine: '귤 따기',
  muhly: '핑크뮬리',
};
export const SEASON_KINDS = Object.keys(WORDS) as SeasonKind[];

/** One entry the app can read: a known kind with months 1~12, or a from ≤ to window. */
export function validSeason(v: unknown): boolean {
  if (!Array.isArray(v) || !v.length) return false;
  return v.every((e) => {
    if (!e || typeof e !== 'object' || !SEASON_KINDS.includes((e as Season).kind)) return false;
    const { months, from, to } = e as Record<string, unknown>;
    if (Array.isArray(months)) return months.length > 0 && months.every((m) => Number.isInteger(m) && m >= 1 && m <= 12);
    return isDay(from) && isDay(to) && from <= to;
  });
}

/** The kind in season on `day`, or null. */
export function seasonOn(list: readonly Season[] | undefined, day: Day): SeasonKind | null {
  if (!list) return null;
  const month = Number(day.slice(5, 7));
  let best: SeasonKind | null = null;
  for (const e of list) {
    const on = 'months' in e ? e.months.includes(month) : e.from <= day && day <= e.to;
    if (on && (best === null || SEASON_KINDS.indexOf(e.kind) < SEASON_KINDS.indexOf(best))) best = e.kind;
  }
  return best;
}

/** ADR-0093: another language's table replaces the words. */
export const SEASON_TEXT = { text: (kind: SeasonKind) => `${WORDS[kind]} 철` };
export const seasonText = (kind: SeasonKind) => SEASON_TEXT.text(kind);
