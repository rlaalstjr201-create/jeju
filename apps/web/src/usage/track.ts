// Anonymous usage counts (ADR-0061, specs/usage-events.md): which places are shown, saved, opened on the map
// or looked up for booking. Place-level events only: no coordinates, no 숙소 position, no device or user id,
// no time of day. Batched into navigator.sendBeacon (sent at once on a map or booking link, which may take the page
// away); offline batches are dropped and nothing is retried. With
// no collection address in the build (VITE_EVENTS_URL, unset in dev and tests) nothing is kept or sent.
import type { AreaName, RegionName, SggCode } from '../region/areas';
import type { Day } from '../dates';
import { isSggDest, type Dest } from '../region/dest';
import type { Button, NewSub, Reach, Sub } from '../pick/pick';
import { BUSAN } from '../region/release';
import type { SeasonKind } from '../pick/season';
import type { Basis, View, When } from '../types';

/** visited / unvisited: 가 봤어요 and its undo (ADR-0087) — this collector only, never GA4·네이버, never in the popularity. */
export type EventName = 'tap' | 'shown' | 'save' | 'unsave' | 'map' | 'book' | 'open' | 'arrange' | 'visited' | 'unvisited' | StartEvent | BrowseEvent;
/** 시작 화면 (specs/busan.md 7): it was seen (up a second or more), and how it was left — no place, no position. */
export type StartEvent = 'start_view' | 'start_done';
/** 오늘 서울 둘러보기 (ADR-0114 7): opened; left (how long, how many shelves scrolled sideways, cards pressed); a card pressed;
 * 길찾기 or 자세히 pressed on a card. This collector only, never GA4·네이버; no item, no position. */
export type BrowseEvent = 'browse_open' | 'browse_done' | 'browse_card' | 'browse_link';
/** start_done: by the position, or a destination button. */
export type StartHow = 'gps' | 'pick';
/** start_done: what the position said before a button was pressed ('none': nothing, or it was not tried). */
export type StartWhy = 'denied' | 'outside' | 'unavailable' | 'none';
/** 저장 목록 정리 (ADR-0085): 위로 / 아래로 / 다른 날로 / 지난 날 펼치기·접기. */
export type ArrangeOp = 'up' | 'down' | 'move' | 'past';
/** days from the day a saved row was saved to today: 0, 1, or 2 = two or more. */
export type Age = 0 | 1 | 2;
export type Range = 'walk' | '30' | '60';
export type BasisKind = 'here' | 'stay' | 'area';

export interface UsageEvent {
  e: EventName;
  /** the place (every event but `tap`, `open` and `arrange`); or `src:<tag>` on a 숙소 링크 count (tap / open / map
   * with nothing else but the day, ADR-0089). */
  id?: string;
  mood?: Button;
  /** food: 식사 / 카페·디저트; new: 섞어서 / 구경 / 체험 (mix / sight / do, ADR-0064). */
  sub?: Sub | NewSub;
  range?: Range;
  basis?: BasisKind;
  /** only with an area basis: the area's name, never a position. */
  area?: AreaName;
  /** a day other than today was chosen (date mode). */
  dated?: boolean;
  /** 비 와요(실내만) was on (ADR-0065); missing = off. */
  indoor?: boolean;
  /** shown and map only: the kind whose 철 words the card showed (ADR-0080); missing = none. */
  season?: SeasonKind;
  /** open only: ♥ N was 0 when the saved list opened (ADR-0085); missing = not 0. */
  live0?: true;
  /** open: the folded 지난 날 line was there; map from the saved list: the row was under 지난 날. */
  past?: true;
  /** map only: opened from the saved list; missing = from a results card. */
  from?: 'saved';
  /** map from the saved list only: days since that row was saved; missing = not known (saved before this or
   * brought back from a backup). The day saved itself never leaves the device. */
  age?: Age;
  /** arrange only. */
  op?: ArrangeOp;
  /** 여행지 (specs/busan.md 7): the destination in use, with the switch on (src/release.ts); start_done: the one chosen. */
  dest?: Dest;
  /** 자동 지역 (plans/nationwide-app.md 7) with an area basis only: the chosen 시군구's code, never a position. */
  sgg?: SggCode;
  /** start_done only. */
  how?: StartHow;
  /** start_done only. */
  why?: StartWhy;
  /** browse_done only: seconds open, in fives (dwellBucket); 600 = ten minutes or more. */
  secs?: number;
  /** browse_done only: shelves scrolled sideways, 0–10. */
  rows?: number;
  /** browse_done only: cards pressed, 0, 1, or 2 = two or more. */
  cards?: 0 | 1 | 2;
  /** browse_link only: 길찾기, 자세히, or 이번 주 서울's 출처 글 보기 (ADR-0118 Amendment 1). */
  link?: 'go' | 'more' | 'post';
  /** browse_card only (ADR-0124 6): the card was 새로 들어옴, 당겨옴 or 기본 on its shelf; missing = not known (an older app). */
  slot?: 'new' | 'pull' | 'base';
  /** Jeju calendar day, no time. */
  d: Day;
}

/** Days from `at` (the day a row was saved) to `today`, as 0 / 1 / 2 (2 or more); undefined without `at`.
 * Both are Jeju days (dayOf), so the boundary is Jeju midnight. */
export function ageOf(at: Day | undefined, today: Day): Age | undefined {
  if (!at) return undefined;
  const n = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${at}T00:00:00Z`)) / 86_400_000);
  if (!Number.isFinite(n)) return undefined;
  return n <= 0 ? 0 : n === 1 ? 1 : 2;
}

/** 머문 시간 (ADR-0114 7, Amendment 1): milliseconds as seconds in fives (the 45-second line falls on a bin's edge), 600
 * meaning ten minutes or more. */
export const dwellBucket = (ms: number): number => Math.min(600, Math.max(0, Math.floor(ms / 5_000) * 5));

export const FLUSH_MS = 10_000;
export const FLUSH_AT = 20;

const RANGE: Record<Reach, Range> = { walk: 'walk', drive30: '30', drive60: '60' };
const BASIS: Record<Basis, BasisKind> = { gps: 'here', stay: 'stay', region: 'area' };

/** What an event says about where it happened: the mood (on the results), the range, the kind of basis. */
export function contextOf(s: {
  view: View;
  mood: Button | null;
  sub: Sub;
  newSub: NewSub;
  reach: Reach;
  basis: Basis;
  region: RegionName | null;
  when: When;
  today: Day;
  indoor?: boolean;
  dest?: Dest;
}): Omit<UsageEvent, 'e' | 'id'> {
  const basis = BASIS[s.basis];
  return {
    ...(s.view === 'cards' && s.mood
      ? { mood: s.mood, ...(s.mood === 'food' ? { sub: s.sub } : s.mood === 'new' ? { sub: s.newSub } : {}) }
      : {}),
    range: RANGE[s.reach],
    basis,
    // a 시군구 is not an area name: its own field, the chosen one only (a GPS read's 시군구 never goes); 강원's 동네 is a
    // 시군구 too (ADR-0102)
    ...(basis === 'area' && s.region ? (s.dest === 'nation' || isSggDest(s.dest) ? { sgg: s.region as SggCode } : { area: s.region as AreaName }) : {}),
    dated: s.when !== 'now',
    ...(s.indoor ? { indoor: true } : {}),
    // the destination only with the switch on: a Jeju-only build sends what it always has
    ...(BUSAN ? { dest: s.dest ?? 'jeju' } : {}),
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
  // an in-app WebView may freeze or close without going hidden (leaving for the map app); pagehide still comes
  doc?.defaultView?.addEventListener('pagehide', flush, { signal });
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
