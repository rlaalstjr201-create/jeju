// @vitest-environment jsdom
// 렉 고치기 (docs/audit/2026-10-15/performance.md, criteria.md 「1·2 재측정」): the basis sheet's own frame, one draw
// per tap, the first load cut into turns. What the user ends up seeing is what was drawn before; only when, and in
// which task, changes. design/SPEC.md §6.10, §12.5.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSpotSource, normalizeSpots, normalizeSpotsIn } from '../src/data';
import { createNav } from '../src/nav';
import { yieldToMain } from '../src/yield';
import { fileSpots } from './fixtures';
import { $, $$, advance, cardIds, css, current, painted, render, reset, tap } from './harness';

/** a turn as main.ts gives it, in jsdom: a task */
const turn = () => new Promise<void>((r) => setTimeout(r, 0));
async function until(cond: () => boolean, tries = 200) {
  for (let i = 0; i < tries && !cond(); i++) await painted();
  expect(cond()).toBe(true);
}
/** the data is in and drawn in full: the moods' 「예:」 and the home's last line (설정 · 지도 앱 · 의견) */
const homeDrawn = () => $$('#home .mood .ex').length === 4 && !!$('#homeMore .settings');
const SVG = 'http://www.w3.org/2000/svg';

describe('the basis sheet', () => {
  beforeEach(() => reset());

  it('the hidden date field keeps the page font (Chrome draws a date field in monospace, a font loaded for it alone)', () => {
    expect(css).toMatch(/\.date-fb \.sr \{ font: inherit; \}/);
  });

  it('every option row has its own check icon, a real SVG (parsed once, then cloned)', async () => {
    render();
    await tap('#basis');
    const opts = $$('#sheet .opt');
    expect(opts.length).toBeGreaterThan(20);
    const checks = opts.map((o) => o.querySelectorAll(':scope > svg.i-check'));
    expect(checks.every((c) => c.length === 1)).toBe(true);
    const svgs = checks.map((c) => c[0]);
    expect(new Set(svgs).size).toBe(svgs.length);
    expect(svgs.every((s) => s.namespaceURI === SVG && s.getAttribute('viewBox') === '0 0 24 24' && s.querySelector('path')?.namespaceURI === SVG)).toBe(true);
  });
});

describe('one tap, one draw', () => {
  beforeEach(() => reset());

  it('a mood with a fixed basis and the list in: the results and their 3 cards are drawn inside the tap, the screen scrolled once', async () => {
    window.localStorage.setItem('jeju.basis', JSON.stringify('region'));
    window.localStorage.setItem('jeju.region', JSON.stringify('애월'));
    render();
    await until(() => !!current().state().spots);
    const scrollTo = vi.spyOn(window, 'scrollTo');
    try {
      advance();
      $('[data-mood="walk"]').click(); // nothing awaited
      expect(cardIds()).toHaveLength(3);
      expect(scrollTo).toHaveBeenCalledTimes(1);
      expect(document.activeElement).toBe($('#crumb'));
      const first = cardIds();
      advance();
      $('#cards .more').click();
      expect(cardIds()).toHaveLength(3);
      expect(cardIds()).not.toEqual(first);
    } finally {
      scrollTo.mockRestore();
    }
  });
});

describe('the list is tidied a slice at a time', () => {
  it('normalizeSpotsIn gives the very list normalizeSpots gives, a turn before each slice', async () => {
    const pause = vi.fn(() => Promise.resolve());
    const out = await normalizeSpotsIn(fileSpots, pause, 1000);
    expect(out).toEqual(normalizeSpots(fileSpots));
    expect(pause).toHaveBeenCalledTimes(Math.ceil(fileSpots.length / 1000));
    await expect(normalizeSpotsIn({}, pause)).rejects.toThrow();
  });

  it('a spot source with a pause: the same list, reported once, with a turn of its own before the first draw', async () => {
    const order: string[] = [];
    const pause = () => (order.push('pause'), Promise.resolve());
    const onLoad = vi.fn(() => order.push('load'));
    const src = createSpotSource(() => Promise.resolve(fileSpots), 10_000, onLoad, pause);
    expect(await src.get()).toEqual(normalizeSpots(fileSpots));
    expect(onLoad).toHaveBeenCalledTimes(1);
    expect(order.at(-2)).toBe('pause'); // the slices' turns, and one more before onLoad
    expect(order.filter((x) => x === 'pause')).toHaveLength(Math.ceil(fileSpots.length / 1000) + 1);
    src.dispose();
  });
});

describe('yieldToMain', () => {
  afterEach(() => {
    delete (globalThis as { scheduler?: unknown }).scheduler;
  });

  it('scheduler.yield() where the browser has it', async () => {
    const y = vi.fn(() => Promise.resolve());
    (globalThis as { scheduler?: unknown }).scheduler = { yield: y };
    await yieldToMain();
    expect(y).toHaveBeenCalledTimes(1);
  });

  it('else a task (a message), after what is already queued as a microtask', async () => {
    const order: string[] = [];
    const p = yieldToMain().then(() => order.push('turn'));
    void Promise.resolve().then(() => order.push('microtask'));
    await p;
    expect(order).toEqual(['microtask', 'turn']);
  });
});

describe('a deep link leaves the address with the mount’s own history entry', () => {
  it('nav: a fresh entry is written with the tidied address, in one call', () => {
    const replaceState = vi.fn();
    const win = { history: { state: null, replaceState, pushState: vi.fn() }, addEventListener: vi.fn() } as unknown as Window;
    createNav(win, { signal: new AbortController().signal, onRoute: vi.fn(), address: '/' });
    expect(replaceState).toHaveBeenCalledTimes(1);
    expect(replaceState).toHaveBeenCalledWith({ jeju: 1, view: 'home', overlay: null, depth: 0 }, '', '/');
  });

  it('nav: an entry of ours (a reload) keeps its state, only the address changes; no address, no third argument', () => {
    const state = { jeju: 1, view: 'cards', overlay: null, depth: 1 };
    const replaceState = vi.fn();
    const win = { history: { state, replaceState, pushState: vi.fn() }, addEventListener: vi.fn() } as unknown as Window;
    const nav = createNav(win, { signal: new AbortController().signal, onRoute: vi.fn(), address: '/' });
    expect(replaceState).toHaveBeenCalledTimes(1);
    expect(replaceState).toHaveBeenCalledWith(state, '', '/');
    expect(nav.initial).toEqual({ view: 'cards', overlay: null });
    const fresh = vi.fn();
    createNav({ history: { state: null, replaceState: fresh, pushState: vi.fn() }, addEventListener: vi.fn() } as unknown as Window, { signal: new AbortController().signal, onRoute: vi.fn() });
    expect(fresh.mock.calls[0]).toHaveLength(2);
  });

  it('the app: ?area=aewol&reach=drive60 is applied and leaves the address in one history call (the 2nd call of a load was the slow one)', () => {
    reset();
    window.history.replaceState(null, '', '/?area=aewol&reach=drive60');
    const replaceState = vi.spyOn(window.history, 'replaceState');
    try {
      render();
      expect(replaceState).toHaveBeenCalledTimes(1);
      expect(location.search).toBe('');
      expect(window.history.state).toEqual({ jeju: 1, view: 'home', overlay: null, depth: 0 });
      expect(current().state()).toMatchObject({ basis: 'region', region: '애월', reach: 'drive60' });
    } finally {
      replaceState.mockRestore();
      window.history.replaceState(null, '', '/');
    }
  });
});

describe('the first load in turns (deps.yieldToMain, main.ts)', () => {
  beforeEach(() => reset());

  it('the first draw comes a turn after the mount; a mood tapped in between is carried out and drawn with it', async () => {
    window.localStorage.setItem('jeju.basis', JSON.stringify('region'));
    window.localStorage.setItem('jeju.region', JSON.stringify('애월'));
    render({ yieldToMain: turn });
    expect($('#basis').textContent).toBe('내 위치 근처'); // the page as loaded: nothing drawn yet
    advance();
    $('[data-mood="rest"]').click();
    expect(current().state().view).toBe('cards'); // handled at once
    expect($('#results').hidden).toBe(true); // drawn with the first draw
    await turn();
    expect($('#basis').textContent).toBe('애월 근처');
    expect($('#results').hidden).toBe(false);
    expect($('#crumb').textContent).toBe('푹 쉬고 싶어');
    await until(() => cardIds().length === 3);
  });

  it('the home drawn in steps ends up exactly as drawn straight through', async () => {
    window.localStorage.setItem('jeju.basis', JSON.stringify('region'));
    window.localStorage.setItem('jeju.region', JSON.stringify('애월'));
    render();
    await until(homeDrawn);
    const straight = $('#home').innerHTML;
    render({ yieldToMain: turn });
    await until(() => !!current().state().spots);
    // the moods' photos first, two rows at a time; the sections under them after
    await until(() => $$('#home .mood .ex').length > 0);
    expect($('#homeMore .settings')).toBeNull();
    await until(homeDrawn);
    await painted();
    expect($('#home').innerHTML).toBe(straight);
  });

  it('the 오늘 판 row and the section it jumps to come in the same draw (a tap on it always finds 오늘 장 서는 곳)', async () => {
    // 2026-10-02 (KST): 제주민속오일장 opens (2·7일), near 구제주 (e2e M4-market)
    window.localStorage.setItem('jeju.basis', JSON.stringify('region'));
    window.localStorage.setItem('jeju.region', JSON.stringify('구제주'));
    render({ yieldToMain: turn, today: () => new Date('2026-10-02T12:00:00+09:00') });
    await until(() => !!current().state().spots && !$('#today').classList.contains('wait'));
    expect($('#today .act')?.getAttribute('href')).toBe('#market');
    expect($('#homeMore #market')).not.toBeNull();
    expect($('#homeMore .settings')).toBeNull(); // the rest still to come
    await until(homeDrawn);
  });

  it('a later draw of the home (another 동네) is done in place at once, not in steps', async () => {
    render({ yieldToMain: turn });
    await until(homeDrawn);
    advance();
    $('#basis').click();
    await painted();
    advance();
    $('#sheet [data-area="성산"]').click();
    expect($('#homeMore .settings')).not.toBeNull();
    expect($$('#home .mood .ex')).toHaveLength(4);
  });
});
