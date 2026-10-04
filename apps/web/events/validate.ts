// What the collector accepts (specs/usage-events.md): a JSON array of at most 50 events, at most 8 KB, each
// with known fields and values only. Anything else is refused whole — so a coordinate, an identifier or a
// time of day can never be stored by accident.
import { AREAS } from '../src/areas';
import { isDay } from '../src/dates';
import { SEASON_KINDS } from '../src/season';
import type { UsageEvent } from '../src/track';

export const MAX_BYTES = 8 * 1024;
export const MAX_EVENTS = 50;

const EVENTS = new Set(['tap', 'shown', 'save', 'unsave', 'map', 'book']);
const MOODS = new Set(['rest', 'walk', 'new', 'food', 'any']);
const SUBS: Record<string, Set<string>> = { food: new Set(['meal', 'cafe']), new: new Set(['mix', 'sight', 'do']) };
const RANGES = new Set(['walk', '30', '60']);
const BASES = new Set(['here', 'stay', 'area']);
const AREA_NAMES = new Set<string>(AREAS.map((a) => a.name));
const SEASONS = new Set<string>(SEASON_KINDS);
const FIELDS = new Set(['e', 'id', 'mood', 'sub', 'range', 'basis', 'area', 'dated', 'indoor', 'season', 'd']);
/** a place id (the data's are UUIDs). */
const ID = /^[A-Za-z0-9-]{1,64}$/;

const inSet = (set: Set<string>, v: unknown) => typeof v === 'string' && set.has(v);

/** null when the event is well formed, else why not. */
export function eventProblem(x: unknown): string | null {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return 'not an object';
  const o = x as Record<string, unknown>;
  const extra = Object.keys(o).find((k) => !FIELDS.has(k));
  if (extra) return `unknown field ${extra}`;
  if (!inSet(EVENTS, o.e)) return 'e';
  if (!isDay(o.d)) return 'd';
  if (o.e === 'tap') {
    if (o.id !== undefined) return 'id on tap';
    if (!inSet(MOODS, o.mood)) return 'tap without mood';
  } else if (typeof o.id !== 'string' || !ID.test(o.id)) return 'id';
  if (o.mood !== undefined && !inSet(MOODS, o.mood)) return 'mood';
  if (o.sub !== undefined && !(typeof o.mood === 'string' && SUBS[o.mood] && inSet(SUBS[o.mood], o.sub))) return 'sub';
  if (o.range !== undefined && !inSet(RANGES, o.range)) return 'range';
  if (o.basis !== undefined && !inSet(BASES, o.basis)) return 'basis';
  if (o.area !== undefined && (o.basis !== 'area' || !inSet(AREA_NAMES, o.area))) return 'area';
  if (o.dated !== undefined && typeof o.dated !== 'boolean') return 'dated';
  if (o.indoor !== undefined && typeof o.indoor !== 'boolean') return 'indoor';
  if (o.season !== undefined && !((o.e === 'shown' || o.e === 'map') && inSet(SEASONS, o.season))) return 'season';
  return null;
}

export type Batch = { ok: true; events: UsageEvent[] } | { ok: false; status: 400 | 413; error: string };

export function parseBatch(body: string): Batch {
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
    const p = eventProblem(v[i]);
    if (p) return { ok: false, status: 400, error: `event ${i}: ${p}` };
  }
  return { ok: true, events: v as UsageEvent[] };
}
