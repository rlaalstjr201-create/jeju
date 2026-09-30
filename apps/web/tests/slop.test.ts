// design/SPEC.md §14 — the AI-slop checklist over the shipped source (scripts/check-slop.ts; also
// `npm run check:slop`, which adds the built dist/ when present).
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkCss, checkSlop, checkStrings, type Violation } from '../scripts/check-slop';

const root = resolve(__dirname, '..');

describe('S9-4 AI 슬롭 체크리스트 (§14 자동 항목 1~16)', () => {
  it('source, index.html and manifest: 0 violations', () => {
    expect(checkSlop(root).map((v) => `#${v.rule} ${v.detail}`)).toEqual([]);
  });

  // The checker must actually catch things, or "0 violations" means nothing.
  it('catches each kind of violation it claims to check', () => {
    const css = `
      :root { --x: #fff; }
      .a { box-shadow: 0 1px 2px black; }
      .b { font-size: 16px; font-weight: 500; }
      .c { color: #123456; }
      .d { color: var(--accent); }
      .e { opacity: 0.5; border-radius: 999px; text-align: center; height: 40px; }
      .f::before { content: "↗"; }
      .card { transition: opacity 300ms; }
      @media (prefers-reduced-motion: no-preference) { .g { transition: transform 400ms; } }`;
    const v: Violation[] = [];
    checkCss('probe.css', css, v);
    checkStrings('probe.ts', ['완벽한 추천이에요!', '당신을 위한 곳입니다', '조용한 곳.'], v);
    const rules = new Set(v.map((x) => x.rule));
    for (const r of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]) expect(rules.has(r), `rule ${r}`).toBe(true);
    // the :root token block is where colour literals belong
    expect(v.some((x) => x.rule === 9 && x.detail.startsWith(':root'))).toBe(false);
  });
});
