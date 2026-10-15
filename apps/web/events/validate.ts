// What the collector accepts (specs/usage-events.md): a JSON array of at most 50 events, at most 8 KB, each
// with known fields and values only. Anything else is refused whole — so a coordinate, an identifier or a
// time of day can never be stored by accident.
import { AREAS } from '../src/areas';
import { addDays, isDay, type Day } from '../src/dates';
import { SEASON_KINDS } from '../src/season';
import type { UsageEvent } from '../src/track';

export const MAX_BYTES = 8 * 1024;
export const MAX_EVENTS = 50;

// visited / unvisited (ADR-0087): a place id and the usual context, like save / unsave
const EVENTS = new Set(['tap', 'shown', 'save', 'unsave', 'map', 'book', 'open', 'arrange', 'visited', 'unvisited']);
/** events about the saved list, not a place (ADR-0085): no id, like tap. */
const NO_PLACE = new Set(['tap', 'open', 'arrange']);
const OPS = new Set(['up', 'down', 'move', 'past']);
const AGES = new Set([0, 1, 2]);
const MOODS = new Set(['rest', 'walk', 'new', 'food', 'any']);
const SUBS: Record<string, Set<string>> = { food: new Set(['meal', 'cafe']), new: new Set(['mix', 'sight', 'do']) };
const RANGES = new Set(['walk', '30', '60']);
const BASES = new Set(['here', 'stay', 'area']);
const AREA_NAMES = new Set<string>(AREAS.map((a) => a.name));
const SEASONS = new Set<string>(SEASON_KINDS);
const FIELDS = new Set(['e', 'id', 'mood', 'sub', 'range', 'basis', 'area', 'dated', 'indoor', 'season', 'live0', 'past', 'from', 'age', 'op', 'd']);
/** a place id (the data's are UUIDs). */
const ID = /^[A-Za-z0-9-]{1,64}$/;
/** 숙소 링크 (ADR-0089): `src:<tag>` on tap / open / map, with nothing but the day. */
const SRC_ID = /^src:[a-z0-9-]{2,24}$/;
const SRC_EVENTS = new Set(['tap', 'open', 'map']);

const inSet = (set: Set<string>, v: unknown) => typeof v === 'string' && set.has(v);

/** null when the event is well formed, else why not. `today` (the collector's Jeju day): `d` is within one day of it —
 * a phone's clock a little off at midnight — so a day far off cannot keep the daily 「0건」 check quiet (ADR-0078 2). */
export function eventProblem(x: unknown, today?: Day): string | null {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return 'not an object';
  const o = x as Record<string, unknown>;
  const extra = Object.keys(o).find((k) => !FIELDS.has(k));
  if (extra) return `unknown field ${extra}`;
  if (!inSet(EVENTS, o.e)) return 'e';
  if (!isDay(o.d)) return 'd';
  if (today && (o.d < addDays(today, -1) || o.d > addDays(today, 1))) return 'd not near today';
  if (typeof o.id === 'string' && o.id.startsWith('src:')) {
    if (!SRC_ID.test(o.id)) return 'src';
    if (!inSet(SRC_EVENTS, o.e)) return `src on ${o.e}`;
    return Object.keys(o).length === 3 ? null : 'src with more';
  }
  if (NO_PLACE.has(o.e as string)) {
    if (o.id !== undefined) return `id on ${o.e}`;
    if (o.e === 'tap' && !inSet(MOODS, o.mood)) return 'tap without mood';
  } else if (typeof o.id !== 'string' || !ID.test(o.id)) return 'id';
  if (o.mood !== undefined && !inSet(MOODS, o.mood)) return 'mood';
  if (o.sub !== undefined && !(typeof o.mood === 'string' && SUBS[o.mood] && inSet(SUBS[o.mood], o.sub))) return 'sub';
  if (o.range !== undefined && !inSet(RANGES, o.range)) return 'range';
  if (o.basis !== undefined && !inSet(BASES, o.basis)) return 'basis';
  if (o.area !== undefined && (o.basis !== 'area' || !inSet(AREA_NAMES, o.area))) return 'area';
  if (o.dated !== undefined && typeof o.dated !== 'boolean') return 'dated';
  if (o.indoor !== undefined && typeof o.indoor !== 'boolean') return 'indoor';
  if (o.season !== undefined && !((o.e === 'shown' || o.e === 'map') && inSet(SEASONS, o.season))) return 'season';
  // 저장 목록 흐름 (ADR-0085): each only on its events, `true` / the listed values only
  const fromSaved = o.e === 'map' && o.from === 'saved';
  if (o.live0 !== undefined && !(o.e === 'open' && o.live0 === true)) return 'live0';
  if (o.past !== undefined && !((o.e === 'open' || fromSaved) && o.past === true)) return 'past';
  if (o.from !== undefined && !fromSaved) return 'from';
  if (o.age !== undefined && !(fromSaved && AGES.has(o.age as number))) return 'age';
  if ((o.op !== undefined || o.e === 'arrange') && !(o.e === 'arrange' && inSet(OPS, o.op))) return 'op';
  return null;
}

export type Batch = { ok: true; events: UsageEvent[] } | { ok: false; status: 400 | 413; error: string };

export function parseBatch(body: string, today?: Day): Batch {
  if (new TextEncoder().encode(body).length > MAX_BYTES) return { ok: false, status: 413, error: 'too large' };
  let v: unknown;
  try {
    v = JSON.parse(body);
  } catch {
    return { ok: false, status: 400, error: 'not JSON' };
  }
  if (!Array.isArray(v) || v.length === 0) return { ok: false, status: 400, error: 'not a non-empty array' };
  if (v.length > MAX_EVENTS) return { ok: false, status: 413, error: 'too many events' };
  for (let i = 0; i < v.length; i++) {
    const p = eventProblem(v[i], today);
    if (p) return { ok: false, status: 400, error: `event ${i}: ${p}` };
  }
  return { ok: true, events: v as UsageEvent[] };
}
