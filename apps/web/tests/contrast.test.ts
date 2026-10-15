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

// Changed on purpose (ADR-0088): ♥ N is a grey chip and turns --main-tint while the list is open
describe('ADR-0088: ♥ N is a chip; open, a --main-tint chip with --tag-ink words', () => {
  it('open = --main-tint face and --tag-ink; the number ≥ 4.5 and the heart (--acc-ink) ≥ 3 on both faces, light and dark', () => {
    expect(css).toMatch(/\.saved-btn\[aria-pressed="true"\]\s*\{[^}]*background:\s*var\(--main-tint\)[^}]*color:\s*var\(--tag-ink\)/);
    expect(css).toMatch(/\.saved-btn svg\s*\{[^}]*color:\s*var\(--acc-ink\)/);
    for (const t of [light, dark]) {
      expect(ratio(t['--tag-ink'], t['--main-tint'])).toBeGreaterThanOrEqual(4.5);
      expect(ratio(t['--text'], t['--fill'])).toBeGreaterThanOrEqual(4.5);
      for (const face of [t['--fill'], t['--main-tint']]) expect(ratio(t['--acc-ink'], face)).toBeGreaterThanOrEqual(3);
    }
    // why the heart takes the darker ink on the chip
    expect(ratio(light['--accent'], light['--fill'])).toBeLessThan(3);
  });
});

describe('ADR-0088: the new faces hold AA (SPEC §2.2)', () => {
  it.each([
    ['light', light, { tag: 5.27, any: 5.35 }],
    ['dark', dark, { tag: 5.85, any: 8.18 }],
  ])('%s: tag and 아무거나 ≥ 4.5 on their tints; grey words on the faces ≥ 4.5', (_, t, want) => {
    expect(ratio(t['--tag-ink'], t['--main-tint'])).toBeCloseTo(want.tag, 2);
    expect(ratio(t['--acc-ink'], t['--acc-tint'])).toBeCloseTo(want.any, 2);
    expect(ratio(t['--muted'], t['--fill'])).toBeGreaterThanOrEqual(4.5);
    expect(ratio(t['--muted'], t['--fill-press'])).toBeGreaterThanOrEqual(4.5);
    expect(ratio(t['--text'], t['--fill-press'])).toBeGreaterThanOrEqual(4.5);
    expect(ratio(t['--text'], t['--acc-tint'])).toBeGreaterThanOrEqual(4.5);
  });
});

describe('ADR-0075: the first card\'s 길찾기 is --text on --main-tint (--main there would miss AA)', () => {
  it('.card.lead .go fills with --main-tint and writes --text: ≥ 4.5:1 in light and dark', () => {
    expect(css).toMatch(/\.card\.lead \.go\s*\{[^}]*background:\s*var\(--main-tint\)[^}]*color:\s*var\(--text\)/);
    for (const t of [light, dark]) {
      expect(ratio(t['--text'], t['--main-tint'])).toBeGreaterThanOrEqual(4.5);
      expect(ratio(t['--text'], t['--fill'])).toBeGreaterThanOrEqual(4.5); // pressed
    }
    expect(ratio(light['--main'], light['--main-tint'])).toBeLessThan(4.5);
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
