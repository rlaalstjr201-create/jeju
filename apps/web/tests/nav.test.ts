// S9-1 history push/pop balance. A fake window whose history.back() is *asynchronous* like a real browser
// (the traversal target is computed when it runs, not when it is called). jsdom hides this race — the
// audit's "self-caused popstate closes the saved list" bug only showed in Chromium — so it is modelled
// here explicitly: nothing is delivered until the test calls deliver().
import { describe, expect, it, vi } from 'vitest';
import { createNav, readEntry } from '../src/nav';
import type { Route } from '../src/types';

class FakeWindow extends EventTarget {
  entries: unknown[] = [null];
  index = 0;
  pending: number[] = [];
  left = false;
  history = {
    get state() {
      return fake.entries[fake.index];
    },
    get length() {
      return fake.entries.length;
    },
    pushState: (s: unknown) => {
      this.entries = this.entries.slice(0, this.index + 1);
      this.entries.push(structuredClone(s));
      this.index++;
    },
    replaceState: (s: unknown) => {
      this.entries[this.index] = structuredClone(s);
    },
    back: () => this.pending.push(-1),
    go: (d: number) => this.pending.push(d),
  };
  /** Run the next queued traversal (what the browser does a task or two later). */
  deliver() {
    const d = this.pending.shift();
    if (d === undefined) return false;
    const target = this.index + d;
    if (target < 0) {
      this.left = true; // left the app
      return true;
    }
    this.index = Math.min(target, this.entries.length - 1);
    this.dispatchEvent(new Event('popstate'));
    return true;
  }
  deliverAll() {
    while (this.deliver());
  }
  get route() {
    const e = readEntry(this.history.state);
    return e && { view: e.view, overlay: e.overlay, depth: e.depth };
  }
}
let fake: FakeWindow;

function setup(initial: unknown = null, settleMs = 1000) {
  fake = new FakeWindow();
  if (initial) fake.entries = Array.isArray(initial) ? initial : [initial];
  fake.index = fake.entries.length - 1;
  const onRoute = vi.fn<[Route], void>();
  const ac = new AbortController();
  const nav = createNav(fake as unknown as Window, { signal: ac.signal, onRoute, settleMs });
  return { nav, onRoute, ac };
}
const HOME: Route = { view: 'home', overlay: null };
const CARDS: Route = { view: 'cards', overlay: null };
const SAVED: Route = { view: 'saved', overlay: null };

describe('nav: mount', () => {
  it('a fresh entry is marked as the first screen (depth 0)', () => {
    const { nav } = setup();
    expect(nav.initial).toEqual(HOME);
    expect(fake.route).toEqual({ ...HOME, depth: 0 });
    expect(fake.history.length).toBe(1);
  });

  it('S18 reloaded with a sheet open: its entry is consumed (back), so the next back is not a dead press', () => {
    const { nav, onRoute } = setup([
      { jeju: 1, view: 'home', overlay: null, depth: 0 },
      { jeju: 1, view: 'home', overlay: 'basis', depth: 1 },
    ]);
    expect(nav.initial).toEqual(HOME);
    fake.deliverAll();
    expect(fake.route).toEqual({ ...HOME, depth: 0 });
    expect(onRoute).not.toHaveBeenCalled(); // self-caused
    fake.history.back(); // the user's first back now leaves the app
    fake.deliver();
    expect(fake.left).toBe(true);
  });

  it('a reloaded view entry is kept as it is', () => {
    const { nav } = setup([
      { jeju: 1, view: 'home', overlay: null, depth: 0 },
      { jeju: 1, view: 'cards', overlay: null, depth: 1 },
    ]);
    expect(nav.initial).toEqual(CARDS);
    expect(fake.pending).toEqual([]);
  });
});

describe('nav: self-caused pops are never applied (audit MAJOR 1)', () => {
  it('S16 saved list → sheet → UI close: the popstate does not reach the app, the saved entry is on top', () => {
    const { nav, onRoute } = setup();
    nav.push(CARDS);
    nav.push(SAVED);
    nav.push({ view: 'saved', overlay: 'basis' });
    nav.back(); // 닫기
    fake.deliverAll();
    expect(onRoute).not.toHaveBeenCalled();
    expect(fake.route).toEqual({ ...SAVED, depth: 2 });
  });

  it('S15 saved list → sheet → area picked → UI close + re-sort: the saved list entry survives', () => {
    const { nav, onRoute } = setup();
    nav.push(SAVED);
    nav.push({ view: 'saved', overlay: 'basis' });
    nav.back();
    fake.deliverAll();
    expect(onRoute).not.toHaveBeenCalled();
    expect(fake.route).toEqual({ ...SAVED, depth: 1 });
  });

  it('a phone back is applied from the entry it lands on', () => {
    const { nav, onRoute } = setup();
    nav.push(CARDS);
    nav.push(SAVED);
    fake.history.back(); // user
    fake.deliver();
    expect(onRoute).toHaveBeenCalledWith(CARDS);
    fake.history.go(1); // forward
    fake.deliver();
    expect(onRoute).toHaveBeenLastCalledWith(SAVED);
  });

  it('a push made while the self-pop is still in flight waits for it (never popped instead)', () => {
    const { nav, onRoute } = setup();
    nav.push(SAVED);
    nav.push({ view: 'saved', overlay: 'basis' });
    nav.back(); // UI close, popstate not delivered yet
    nav.push({ view: 'saved', overlay: 'basis' }); // opened again right away
    expect(fake.history.length).toBe(3); // nothing pushed yet
    fake.deliverAll();
    expect(onRoute).not.toHaveBeenCalled();
    expect(fake.route).toEqual({ view: 'saved', overlay: 'basis', depth: 2 });
    expect(fake.entries.map((e) => readEntry(e)?.view)).toEqual(['home', 'saved', 'saved']);
  });

  it('a user back racing a UI close: first popstate is ours, the second is the user\'s', () => {
    const { nav, onRoute } = setup();
    nav.push(CARDS);
    nav.push(SAVED);
    nav.back(); // UI 돌아가기
    fake.history.back(); // user presses back at the same moment
    fake.deliverAll();
    expect(onRoute).toHaveBeenCalledTimes(1);
    expect(onRoute).toHaveBeenCalledWith(HOME);
  });

  it('a phone forward landing before a UI close\'s own back is the user\'s, not ours (QA r3, seed 5018)', () => {
    const { nav, onRoute } = setup();
    nav.push(CARDS);
    nav.push({ view: 'cards', overlay: 'basis' });
    fake.history.back(); // phone back closes the sheet: the sheet stays as a forward entry
    fake.deliverAll();
    onRoute.mockClear();
    nav.back(HOME); // 바꾸기
    fake.pending.unshift(1); // the user's forward (pressed just before) lands first
    fake.deliverAll();
    expect(nav.busy()).toBe(false);
    expect(onRoute).not.toHaveBeenCalled(); // the app already shows the first screen
    expect(fake.route).toEqual({ ...HOME, depth: 0 });
    expect(fake.entries.map((e) => readEntry(e)?.depth)).toEqual([0, 1, 2]);
  });

  it('a phone forward that swallowed the own back (Chromium drops it): the back is sent again at settleMs', () => {
    vi.useFakeTimers();
    try {
      const { nav } = setup(null, 200);
      nav.push(CARDS);
      nav.push({ view: 'cards', overlay: 'basis' });
      fake.history.back();
      fake.deliverAll();
      nav.back(HOME);
      fake.pending = [1]; // only the forward happens
      fake.deliverAll();
      vi.advanceTimersByTime(250);
      fake.deliverAll();
      expect(nav.busy()).toBe(false);
      expect(fake.route).toEqual({ ...HOME, depth: 0 });
      expect(fake.entries.map((e) => readEntry(e)?.depth)).toEqual([0, 1, 2]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('if the popstate never arrives, queued pushes run after settleMs', () => {
    vi.useFakeTimers();
    try {
      const { nav } = setup(null, 200);
      nav.push(SAVED);
      nav.back();
      nav.push({ view: 'home', overlay: 'basis' });
      expect(nav.busy()).toBe(true);
      vi.advanceTimersByTime(250);
      expect(nav.busy()).toBe(false);
      expect(fake.route?.overlay).toBe('basis');
    } finally {
      vi.useRealTimers();
    }
  });

  it('after destroy (abort) the listener is gone', () => {
    const { nav, onRoute, ac } = setup();
    nav.push(CARDS);
    ac.abort();
    fake.history.back();
    fake.deliver();
    expect(onRoute).not.toHaveBeenCalled();
  });
});

describe('nav: leaving the saved list for a mood (S17, audit MAJOR 2)', () => {
  it('saved opened from cards → mood: back lands on the cards entry, nothing pushed, one back leaves it', () => {
    const { nav } = setup();
    nav.push(CARDS);
    nav.push(SAVED);
    nav.back(CARDS);
    fake.deliverAll();
    expect(fake.route).toEqual({ ...CARDS, depth: 1 });
    expect(fake.history.length).toBe(3); // saved stays only as a forward entry
  });

  it('saved opened from the first screen → mood: back then push cards (no duplicate, no dead entry)', () => {
    const { nav } = setup();
    nav.push(SAVED);
    nav.back(CARDS);
    fake.deliverAll();
    expect(fake.route).toEqual({ ...CARDS, depth: 1 });
    expect(fake.entries.map((e) => readEntry(e)?.view)).toEqual(['home', 'cards']);
  });

  it("'adopt' hands the landed entry to the app (restored saved list, unknown underneath)", () => {
    const { nav, onRoute } = setup([
      { jeju: 1, view: 'home', overlay: null, depth: 0 },
      { jeju: 1, view: 'cards', overlay: null, depth: 1 },
      { jeju: 1, view: 'saved', overlay: null, depth: 2 },
    ]);
    nav.back('adopt');
    fake.deliverAll();
    expect(onRoute).toHaveBeenCalledWith(CARDS);
  });

  it('push/pop stay balanced through a whole session: 첫 화면 → 기분 → ♥ → ⇄ → 지역 → back×3 leaves the app', () => {
    const { nav, onRoute } = setup();
    nav.push(CARDS); // mood
    nav.push(SAVED); // ♥ N
    nav.push({ view: 'saved', overlay: 'basis' }); // ⇄
    nav.back(); // area picked → sheet closes, list re-sorted
    fake.deliverAll();
    expect(fake.route).toEqual({ ...SAVED, depth: 2 });
    const seen: string[] = [];
    for (let i = 0; i < 3; i++) {
      fake.history.back();
      fake.deliver();
      seen.push(fake.left ? 'left' : fake.route!.view);
    }
    expect(seen).toEqual(['cards', 'home', 'left']);
    expect(onRoute.mock.calls.map((c) => c[0].view)).toEqual(['cards', 'home']);
  });
});
