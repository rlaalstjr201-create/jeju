// Anonymous usage counts (ADR-0061, specs/usage-events.md): which places are shown, saved, opened on the map
// or looked up for booking. Place-level events only: no coordinates, no 숙소 position, no device or user id,
// no time of day. Batched into navigator.sendBeacon; offline batches are dropped and nothing is retried. With
// no collection address in the build (VITE_EVENTS_URL, unset in dev and tests) nothing is kept or sent.
import type { AreaName } from './areas';
import type { Day } from './dates';
import type { Button, Reach, Sub } from './pick';
import type { Basis, View, When } from './types';

export type EventName = 'tap' | 'shown' | 'save' | 'unsave' | 'map' | 'book';
export type Range = 'walk' | '30' | '60';
export type BasisKind = 'here' | 'stay' | 'area';

export interface UsageEvent {
  e: EventName;
  /** the place (every event but `tap`). */
  id?: string;
  mood?: Button;
  /** food only: 식사 / 카페·디저트. */
  sub?: Sub;
  range?: Range;
  basis?: BasisKind;
  /** only with an area basis: the area's name, never a position. */
  area?: AreaName;
  /** a day other than today was chosen (date mode). */
  dated?: boolean;
  /** Jeju calendar day, no time. */
  d: Day;
}

export const FLUSH_MS = 10_000;
export const FLUSH_AT = 20;

const RANGE: Record<Reach, Range> = { walk: 'walk', drive30: '30', drive60: '60' };
const BASIS: Record<Basis, BasisKind> = { gps: 'here', stay: 'stay', region: 'area' };

/** What an event says about where it happened: the mood (on the results), the range, the kind of basis. */
export function contextOf(s: {
  view: View;
  mood: Button | null;
  sub: Sub;
  reach: Reach;
  basis: Basis;
  region: AreaName | null;
  when: When;
  today: Day;
}): Omit<UsageEvent, 'e' | 'id'> {
  const basis = BASIS[s.basis];
  return {
    ...(s.view === 'cards' && s.mood ? { mood: s.mood, ...(s.mood === 'food' ? { sub: s.sub } : {}) } : {}),
    range: RANGE[s.reach],
    basis,
    ...(basis === 'area' && s.region ? { area: s.region } : {}),
    dated: s.when !== 'now',
    d: s.today,
  };
}

export interface TrackerDeps {
  /** collection address; empty or missing = off. */
  url?: string | null;
  /** navigator.sendBeacon. */
  send?: (url: string, body: string) => boolean;
  /** the 기록 끄기 setting. */
  enabled(): boolean;
  online(): boolean;
  doc?: Document | null;
  signal?: AbortSignal;
}

export interface Tracker {
  track(ev: UsageEvent): void;
  flush(): void;
  /** forget what is queued (기록 끄기). */
  drop(): void;
}

const OFF: Tracker = { track: () => undefined, flush: () => undefined, drop: () => undefined };

export function createTracker(deps: TrackerDeps): Tracker {
  const { url, send, doc, signal } = deps;
  if (!url || !send) return OFF;
  let queue: UsageEvent[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  const stop = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  function flush() {
    stop();
    const batch = queue;
    queue = [];
    if (!batch.length || !deps.enabled() || !deps.online()) return; // offline: dropped, no retry
    try {
      send!(url!, JSON.stringify(batch));
    } catch {
      /* the app never depends on it */
    }
  }
  doc?.addEventListener(
    'visibilitychange',
    () => {
      if (doc.visibilityState === 'hidden') flush();
    },
    { signal },
  );
  signal?.addEventListener('abort', () => {
    stop();
    queue = [];
  });
  return {
    track(ev) {
      if (signal?.aborted || !deps.enabled()) return;
      queue.push(ev);
      if (queue.length >= FLUSH_AT) flush();
      else if (!timer) timer = setTimeout(flush, FLUSH_MS);
    },
    flush,
    drop() {
      stop();
      queue = [];
    },
  };
}
