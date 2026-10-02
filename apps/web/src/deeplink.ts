// Deep link (ADR-0067, specs/drive-and-agents.md): `/?mood=walk&area=aewol&reach=drive30&date=2026-10-03&indoor=1`
// — what an AI agent (or anyone) can hand a user so the app opens on that result. Pure parsing, no DOM.
import { AREAS, areaByName, type AreaName } from './areas';
import { DAYS_AHEAD, addDays, isDay, type Day } from './dates';
import { REACHES, type Button, type Reach } from './pick';
import type { When } from './types';

export interface DeepLink {
  mood?: Button;
  /** an area, or 'here' = the phone's position (asked for as a mood tap asks). */
  area?: AreaName | 'here';
  reach?: Reach;
  when?: When;
  indoor?: boolean;
}

const MOODS: readonly Button[] = ['rest', 'walk', 'new', 'food', 'any'];

/** The query's link, each key validated on its own (a bad value drops only that key); null when none is left. */
export function readDeepLink(search: string, today: Day): DeepLink | null {
  let q: URLSearchParams;
  try {
    q = new URLSearchParams(search);
  } catch {
    return null;
  }
  const get = (k: string) => q.get(k)?.trim() ?? '';
  const out: DeepLink = {};
  const mood = get('mood').toLowerCase();
  if (MOODS.includes(mood as Button)) out.mood = mood as Button;
  const area = get('area');
  const slug = area.toLowerCase();
  if (slug === 'here') out.area = 'here';
  else {
    const a = AREAS.find((x) => x.slug === slug) ?? areaByName(area);
    if (a) out.area = a.name;
  }
  const reach = get('reach').toLowerCase();
  if (REACHES.includes(reach as Reach)) out.reach = reach as Reach;
  const date = get('date');
  if (isDay(date) && date >= today && date <= addDays(today, DAYS_AHEAD)) out.when = date === today ? 'now' : date;
  const indoor = get('indoor');
  if (indoor === '1' || indoor === '0') out.indoor = indoor === '1';
  return Object.keys(out).length ? out : null;
}
