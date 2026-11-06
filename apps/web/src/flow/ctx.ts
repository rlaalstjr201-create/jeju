// What mountApp hands its feature controllers (ADR-0126): the app's live state and the few shared tools. Read
// lazily (getters and wrappers in app.ts), so a controller sees the state of the moment it runs, never a copy.
import type { Delays, Deps } from '../app';
import type { Nav } from '../nav';
import type { Els } from '../render';
import type { Action, State } from '../state';
import type { Store } from '../store';
import type { SurveyRec } from '../usage/survey';
import type { Tracker } from '../usage/track';

export type OverlayKind = 'basis' | 'stay' | 'move' | 'feedback' | 'culture' | 'browse';

export interface AppCtx {
  readonly deps: Deps;
  /** the current state (always the latest: a getter) */
  readonly state: State;
  dispatch(a: Action): void;
  readonly store: Store;
  readonly signal: AbortSignal;
  readonly timers: Set<ReturnType<typeof setTimeout>>;
  /** a timer cleared when the app is destroyed */
  later(ms: number, fn: () => void): ReturnType<typeof setTimeout>;
  /** the wall clock (deps.today) */
  clockNow(): Date;
  /** the monotonic clock of taps */
  now(): number;
  readonly delays: Delays;
  readonly tracker: Tracker;
  /** the survey record as read at mount (ADR-0081) */
  readonly survey0: SurveyRec;
  readonly els: Els;
  /** the same control again within delays.guard: true (ignore it) */
  guarded(key: string): boolean;
  openOverlay(kind: OverlayKind): void;
  closeOverlay(): void;
  /** the browser's navigator (webdriver: QA runs are not counted) */
  readonly nav0: Navigator | undefined;
  /** history entries (nav.ts) */
  readonly nav: Nav;
  /** taps right after this one are ignored for a moment (an overlay just opened) */
  hush(): void;
}
