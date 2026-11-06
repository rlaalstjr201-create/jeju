// Deep link (ADR-0067, specs/drive-and-agents.md): `/?mood=walk&area=aewol&reach=drive30&date=2026-10-03&indoor=1`
// — what an AI agent (or anyone) can hand a user so the app opens on that result. Pure parsing, no DOM.
// 숙소 링크 (ADR-0089): `stay=<lat>,<lng>` (a point in Jeju) and `src=<tag>` (which 숙소's link it was); `relay=1`
// when an in-app browser's 브라우저로 열기 handed it on (its arrival was counted there).
import { areaByName, type AreaName } from './region/areas';
import { DAYS_AHEAD, addDays, isDay, type Day } from './dates';
import { REACHES, type Button, type Point, type Reach } from './pick/pick';
import { OPEN_AREAS, releasedDestOf } from './region/release';
import type { When } from './types';

export interface DeepLink {
  mood?: Button;
  /** an area, or 'here' = the phone's position (asked for as a mood tap asks). */
  area?: AreaName | 'here';
  reach?: Reach;
  when?: When;
  indoor?: boolean;
  /** 숙소 링크: the 숙소, inside an open destination, at most 6 decimals. */
  stay?: Point;
  /** 숙소 링크: the partner's tag, `[a-z0-9-]{2,24}`. */
  src?: string;
  /** with `src` only: handed on from an in-app browser (SPEC 6.14), the arrival not counted again. */
  relay?: true;
}

const MOODS: readonly Button[] = ['rest', 'walk', 'new', 'famous', 'food', 'any'];
/** a 숙소 링크 tag: lowercase letters, digits and hyphens, 2–24. */
export const SRC = /^[a-z0-9-]{2,24}$/;
const round6 = (x: number) => Math.round(x * 1e6) / 1e6;

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
    // either destination's 동네, if it is open in this build (plans/busan.md: Busan's slugs only with the switch on)
    const a = OPEN_AREAS.find((x) => x.slug === slug) ?? areaByName(area, OPEN_AREAS);
    if (a && a.group !== 'nation' && a.group !== 'gangwon' && a.group !== 'seoul') out.area = a.name;
  }
  const reach = get('reach').toLowerCase();
  if (REACHES.includes(reach as Reach)) out.reach = reach as Reach;
  const date = get('date');
  if (isDay(date) && date >= today && date <= addDays(today, DAYS_AHEAD)) out.when = date === today ? 'now' : date;
  const indoor = get('indoor');
  if (indoor === '1' || indoor === '0') out.indoor = indoor === '1';
  const stay = /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(get('stay'));
  if (stay) {
    const p = { lat: round6(Number(stay[1])), lng: round6(Number(stay[2])) };
    if (releasedDestOf(p)) out.stay = p;
  }
  const src = get('src');
  if (SRC.test(src)) {
    out.src = src;
    if (get('relay') === '1') out.relay = true;
  }
  return Object.keys(out).length ? out : null;
}
