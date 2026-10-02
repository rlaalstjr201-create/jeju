// design/SPEC.md §2.2, design.md C3: the fallback date field is known by its border alone, so the border
// is ≥ 3:1 against what it sits on (WCAG 1.4.11), in light and dark — read from the shipped style.css.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(__dirname, '../src/style.css'), 'utf8');

function tokens(block: string): Record<string, string> {
  return Object.fromEntries([...block.matchAll(/(--[\w-]+):\s*(#[0-9a-f]{6})\b/gi)].map((m) => [m[1], m[2].toLowerCase()]));
}
const light = tokens(css.match(/^:root\s*\{([^}]*)\}/m)![1]);
const dark = tokens(css.match(/@media \(prefers-color-scheme: dark\)\s*\{\s*:root\s*\{([^}]*)\}/)![1]);

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const ratio = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe('date field border contrast (design.md C3)', () => {
  it('the field draws its border with --field-line', () => {
    expect(css).toMatch(/\.date-in\s*\{[^}]*border:\s*1px solid var\(--field-line\)/);
  });

  it.each([
    ['light', light, '#8a8c8f', 3.37],
    ['dark', dark, '#7e8287', 4.33],
  ])('%s: --field-line is %s, ≥ 3:1 on the sheet (--surface) and on --bg', (_, t, hex, onSurface) => {
    expect(t['--field-line']).toBe(hex);
    expect(ratio(t['--field-line'], t['--surface'])).toBeCloseTo(onSurface, 2);
    expect(ratio(t['--field-line'], t['--surface'])).toBeGreaterThanOrEqual(3);
    expect(ratio(t['--field-line'], t['--bg'])).toBeGreaterThanOrEqual(3);
  });

  it('the old --line border would fail (why the token exists)', () => {
    expect(ratio(light['--line'], light['--surface'])).toBeLessThan(3);
    expect(ratio(dark['--line'], dark['--surface'])).toBeLessThan(3);
  });
});

describe('ADR-0070: the main colour and the accent hold WCAG AA', () => {
  it.each([
    ['light', light],
    ['dark', dark],
  ])('%s: fill-button text ≥ 4.5 (also pressed), main and saved heart ≥ 3 on the ground, body text ≥ 7', (_, t) => {
    expect(ratio(t['--on-main'], t['--main'])).toBeGreaterThanOrEqual(4.5);
    expect(ratio(t['--on-main'], t['--main-press'])).toBeGreaterThanOrEqual(4.5);
    expect(ratio(t['--main'], t['--bg'])).toBeGreaterThanOrEqual(3);
    expect(ratio(t['--main'], t['--surface'])).toBeGreaterThanOrEqual(3);
    expect(ratio(t['--accent'], t['--bg'])).toBeGreaterThanOrEqual(3);
    expect(ratio(t['--text'], t['--bg'])).toBeGreaterThanOrEqual(7);
    expect(ratio(t['--text'], t['--main-tint'])).toBeGreaterThanOrEqual(7);
    expect(ratio(t['--muted'], t['--fill-press'])).toBeGreaterThanOrEqual(4.5);
  });
});

describe('ADR-0070 (decided): ♥ N open is an underline, so its heart sits on the ground, not on --fill', () => {
  it('no fill on .saved-btn[aria-pressed="true"]; a 3px --main rule; heart and rule ≥ 3 on --bg in light and dark', () => {
    const open = [...css.matchAll(/([^{}]*\.saved-btn\[aria-pressed="true"\][^{]*)\{([^}]*)\}/g)];
    expect(open.length).toBeGreaterThan(0);
    for (const [, , body] of open) expect(body).not.toMatch(/background/);
    expect(open.map((m) => m[2]).join(' ')).toMatch(/border-bottom:\s*3px solid var\(--main\)/);
    for (const t of [light, dark]) {
      expect(ratio(t['--accent'], t['--bg'])).toBeGreaterThanOrEqual(3);
      expect(ratio(t['--main'], t['--bg'])).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('ADR-0063 3: the attribution line is readable (≥ AA)', () => {
  it('.credit is --muted on --bg: ≥ 4.5:1 in light and dark', () => {
    expect(css).toMatch(/\.credit\s*\{[^}]*color:\s*var\(--muted\)/);
    for (const t of [light, dark]) expect(ratio(t['--muted'], t['--bg'])).toBeGreaterThanOrEqual(4.5);
  });

  it('its visitjeju.net link keeps that colour and is told apart by an underline (1.4.1), not by colour', () => {
    expect(css).toMatch(/^a \{ color: inherit;/m);
    expect(css).toMatch(/\.credit a\s*\{[^}]*text-decoration:\s*underline/);
    expect(css).not.toMatch(/\.credit a\s*\{[^}]*color:/);
  });
});
