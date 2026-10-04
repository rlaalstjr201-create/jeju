// Phone back / back-swipe (S15–S20). Each overlay and view is a history entry:
//   history.state = { jeju: 1, view, overlay, depth }   (the first screen is depth 0)
// Rules that keep push/pop balanced:
// - A UI close applies its state right away and calls history.back(). The popstate that follows is
//   *self-caused*: it is counted (`pendingPops`) and not applied again, so it can never close something
//   that is still open underneath (the old bug: a self-pop closed the saved list too).
// - push/replace requested while a self-pop is in flight wait until it lands (history.back() is async and
//   a pushState in between would be popped instead). If no popstate arrives within `settleMs`, give up
//   waiting so nothing stays queued forever.
// - A popstate the app did not cause (phone back/forward) is applied from history.state — the entry says
//   what should be on screen, nothing is guessed.
// - A popstate landing deeper while a self-pop is in flight is the user's forward, not ours: it is not
//   counted, and the self-pop is sent again from there until it reaches its target depth (Chromium drops a
//   back sent right after a forward, so that re-send also runs at settleMs).
import type { Overlay, Route, View } from './types';

interface Entry extends Route {
  jeju: 1;
  depth: number;
}
const VIEWS: readonly View[] = ['home', 'cards', 'saved'];
const OVERLAYS: readonly Overlay[] = [null, 'basis', 'stay', 'move', 'feedback'];
export const HOME: Route = { view: 'home', overlay: null };

export function readEntry(state: unknown): Entry | null {
  if (!state || typeof state !== 'object') return null;
  const s = state as Record<string, unknown>;
  if (s.jeju !== 1 || !VIEWS.includes(s.view as View) || !OVERLAYS.includes(s.overlay as Overlay)) return null;
  const depth = typeof s.depth === 'number' && Number.isInteger(s.depth) && s.depth >= 0 ? s.depth : 0;
  return { jeju: 1, view: s.view as View, overlay: s.overlay as Overlay, depth };
}
const routeOf = (e: Entry | null): Route => (e ? { view: e.view, overlay: e.overlay } : HOME);
export const sameRoute = (a: Route, b: Route) => a.view === b.view && a.overlay === b.overlay;

export interface Nav {
  /** The route the mount should render first (an overlay left open before a reload is consumed, S18). */
  readonly initial: Route;
  push(r: Route): void;
  replace(r: Route): void;
  /** UI close: go back one entry. `then` = the route that should be showing afterwards; pushed if the
   * entry underneath turns out to be something else (e.g. saved list opened from the first screen,
   * then a mood tapped). `'adopt'` = the app doesn't know what is underneath: once the back lands,
   * hand that entry's route to onRoute like a phone back. */
  back(then?: Route | 'adopt'): void;
  /** true while a self-caused back is still in flight (tests / diagnostics). */
  busy(): boolean;
}

export interface NavOptions {
  signal: AbortSignal;
  /** Called for back/forward the app did not cause. */
  onRoute(r: Route): void;
  settleMs?: number;
}

export function createNav(win: Window | null, opts: NavOptions): Nav {
  const settleMs = opts.settleMs ?? 1000;
  const history = win?.history ?? null;
  let depth = 0;
  let pendingPops = 0;
  let target = 0; // depth the in-flight self-pop should land on
  let forwarded = false; // a user forward landed while it was in flight
  const queue: (() => void)[] = [];
  let settleTimer: ReturnType<typeof setTimeout> | null = null;

  const current = () => {
    try {
      return readEntry(history?.state);
    } catch {
      return null;
    }
  };
  function write(kind: 'push' | 'replace', r: Route, d: number) {
    try {
      const entry: Entry = { jeju: 1, view: r.view, overlay: r.overlay, depth: d };
      if (kind === 'push') history?.pushState(entry, '');
      else history?.replaceState(entry, '');
    } catch {
      /* history API unavailable (sandboxed frame) — the app still works, just without the back guard */
    }
  }
  function flush() {
    while (queue.length && pendingPops === 0) queue.shift()!();
  }
  function traverse(delta: number) {
    if (settleTimer) clearTimeout(settleTimer);
    settleTimer = setTimeout(onSettleTimeout, settleMs);
    try {
      if (delta === -1) history!.back();
      else history!.go(delta);
    } catch {
      settled();
    }
  }
  function onSettleTimeout() {
    if (forwarded && depth > target && history) {
      forwarded = false;
      traverse(target - depth);
    } else settled();
  }
  function settled() {
    pendingPops = 0;
    if (settleTimer) clearTimeout(settleTimer);
    settleTimer = null;
    flush();
  }
  function run(op: () => void) {
    if (pendingPops > 0) queue.push(op);
    else op();
  }

  win?.addEventListener(
    'popstate',
    () => {
      const e = current();
      const landed = e?.depth ?? 0;
      if (pendingPops > 0) {
        const forward = landed > depth;
        depth = landed;
        if (forward) {
          forwarded = true; // the user's forward: our back is still to come (or was dropped)
          return;
        }
        if (landed > target) {
          traverse(target - landed); // ours, but it started from the forward entry: go on to the target
          return;
        }
        pendingPops--;
        if (pendingPops === 0) settled();
        return;
      }
      depth = landed;
      opts.onRoute(routeOf(e));
    },
    { signal: opts.signal },
  );
  opts.signal.addEventListener('abort', () => {
    if (settleTimer) clearTimeout(settleTimer);
    queue.length = 0;
  });

  function back(then?: Route | 'adopt') {
    run(() => {
      if (depth <= 0 || !history) {
        // Nothing of ours underneath (history API missing, or a restored depth-0 overlay): rewrite in place.
        const r = then && then !== 'adopt' ? then : HOME;
        write('replace', r, 0);
        if (then === 'adopt') opts.onRoute(r);
        return;
      }
      pendingPops++;
      target = --depth;
      forwarded = false;
      traverse(-1);
      if (then === 'adopt') {
        // pushes queued behind it were asked of the screen being left (⇄ on a closing saved list): the
        // landed entry replaces that screen, so they are dropped, not written on top of it (QA r3 seed 198)
        queue.unshift(() => {
          queue.length = 0;
          opts.onRoute(routeOf(current()));
        });
      } else if (then) {
        queue.unshift(() => {
          const at = routeOf(current());
          if (!sameRoute(at, then)) {
            if (at.view === then.view) write('replace', then, depth);
            else write('push', then, ++depth);
          }
        });
      }
    });
  }

  // --- mount ---
  let initial: Route = HOME;
  const e = current();
  if (!e) {
    write('replace', HOME, 0);
  } else {
    depth = e.depth;
    initial = routeOf(e);
    if (e.overlay) {
      // Reloaded with a sheet open: consume its entry so the first back isn't a dead press (S18).
      initial = { view: e.view, overlay: null };
      back();
    }
  }

  return {
    initial,
    push: (r) =>
      run(() => {
        depth++;
        write('push', r, depth);
      }),
    replace: (r) => run(() => write('replace', r, depth)),
    back,
    busy: () => pendingPops > 0,
  };
}
