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
    ['light', light, '#8a8f8c', 3.29],
    ['dark', dark, '#6b706d', 3.18],
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
