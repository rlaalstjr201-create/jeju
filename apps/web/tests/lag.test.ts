// @vitest-environment jsdom
// 렉 고치기 (docs/audit/2026-10-15/performance.md, criteria.md 「1·2 재측정」): the basis sheet's own frame. What the
// user ends up seeing is what was drawn before; only when, and in which task, changes. design/SPEC.md §6.10, §12.5.
import { beforeEach, describe, expect, it } from 'vitest';
import { $$, css, render, reset, tap } from './harness';

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
