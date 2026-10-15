// @vitest-environment jsdom
// 렉 고치기 (docs/audit/2026-10-15/performance.md, criteria.md 「1·2 재측정」): the basis sheet's own frame, one draw
// per tap. What the user ends up seeing is what was drawn before; only when, and in which task, changes.
// design/SPEC.md §6.10, §12.5.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { $, $$, advance, cardIds, css, current, painted, render, reset, tap } from './harness';

async function until(cond: () => boolean, tries = 200) {
  for (let i = 0; i < tries && !cond(); i++) await painted();
  expect(cond()).toBe(true);
}
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
