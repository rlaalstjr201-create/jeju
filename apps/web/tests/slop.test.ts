// design/SPEC.md §14 — the AI-slop checklist over the shipped source (scripts/check-slop.ts; also
// `npm run check:slop`, which adds the built dist/ when present).
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkCss, checkReasons, checkSlop, checkStrings, type Violation } from '../scripts/check-slop';
import { cleanReason } from '../src/pick/data';

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
      @media (prefers-reduced-motion: no-preference) { .g { transition: transform 400ms; } }
      .h[aria-pressed="true"] { background: var(--sel-bg); }`;
    const v: Violation[] = [];
    checkCss('probe.css', css, v);
    checkStrings('probe.ts', ['완벽한 추천이에요!', '당신을 위한 곳입니다', '조용한 곳.'], v);
    checkReasons('probe.json', [{ id: 'r1', reason: '겉바속촉 돈까스예요' }, { id: 'r2', reason: '딱새우김밥과 컵밥. 포장해 가도 돼요' }], v);
    const rules = new Set(v.map((x) => x.rule));
    for (const r of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 17, 18, 19]) expect(rules.has(r), `rule ${r}`).toBe(true);
    // the :root token block is where colour literals belong
    expect(v.some((x) => x.rule === 9 && x.detail.startsWith(':root'))).toBe(false);
  });

  it('#7: only the fallback date field may be max(1rem, 16px) (iOS zoom, design.md F2)', () => {
    const v: Violation[] = [];
    checkCss('probe.css', '.date-in { font-size: max(1rem, 16px); } .date-in{font-size:max(1rem,16px)} .opt { font-size: max(1rem, 16px); } .date-in { font-size: 1rem; }', v);
    expect(v.map((x) => `${x.rule} ${x.detail}`)).toEqual(['7 .opt font-size max(1rem, 16px)', '7 .date-in font-size 1rem']);
  });

  // Changed on purpose (ADR-0088): ♥ N open is the one chip that fills (--main-tint); no other selection may
  it('3판: any centred text counts (#14); only ♥ N open may fill (ADR-0088); decimals are not a second sentence (#19)', () => {
    const v: Violation[] = [];
    checkCss('probe.css', '.more { text-align: center; } .saved-btn[aria-pressed="true"] { background: var(--main-tint); } .mood[aria-current="true"] { background: var(--fill); }', v);
    expect(v.map((x) => x.rule)).toEqual([14, 18]);
    const r: Violation[] = [];
    checkReasons('probe.json', [{ id: 'a', reason: '제주4.3평화공원에서 4.3의 역사를 기억해요' }, { id: 'b', reason: '약 17.5km 이어지는 올레길' }], r);
    expect(r).toEqual([]);
    checkReasons('probe.json', [{ id: 'c', reason: '벚꽃 축제가 열리는 길.' }], r);
    expect(r.map((x) => x.rule)).toEqual([19]);
  });

  it('#19 catches a second sentence after any stop, and a fullwidth final stop; decimals still pass', () => {
    const r: Violation[] = [];
    const bad = ['맛있어요 . 포장해 가도 돼요', '카페(동문시장). 포장해요', '약 1.5km. 걸어요', 'OK. 좋아요', '좋아요．', '좋아요｡', '좋아요． 포장해요'];
    checkReasons('probe.json', bad.map((reason, i) => ({ id: `b${i}`, reason })), r);
    expect(r.map((x) => x.detail.split(' in ')[1])).toEqual(bad.map((_, i) => `b${i}: ${bad[i]}`));
    const ok: Violation[] = [];
    checkReasons('probe.json', [{ id: 'a', reason: '4.3 사건을 기억해요' }, { id: 'b', reason: '약 17.5km 이어지는 올레길' }], ok);
    expect(ok).toEqual([]);
  });

  it('shipReason and cleanReason drop a fullwidth final stop too, and agree', async () => {
    const { shipReason } = await import('../scripts/reason.mjs');
    for (const s of ['좋아요．', '좋아요｡', '좋아요 ． ', '좋아요.。．｡']) {
      expect(shipReason(s), s).toBe('좋아요');
      expect(cleanReason(s), s).toBe('좋아요');
    }
  });

  it('#18 catches a filled selection however the attribute is quoted, and aria-current', () => {
    for (const css of [
      '.opt[aria-pressed=true] { background: var(--fill); }',
      ".opt[aria-pressed='true'] { background: var(--fill); }",
      '.mood[aria-current="true"] { background: var(--fill); }',
      '.mood[aria-current=true] { background-color: var(--fill); }',
    ]) {
      const v: Violation[] = [];
      checkCss('probe.css', css, v);
      expect(v.map((x) => x.rule), css).toEqual([18]);
    }
    // Changed on purpose (ADR-0088): ♥ N open fills its chip, written exactly as in style.css
    const v: Violation[] = [];
    checkCss('probe.css', '.saved-btn[aria-pressed="true"] { background: var(--main-tint); }', v);
    expect(v).toEqual([]);
  });

  it('#1 (ADR-0088): box-shadow only as var(--float), only on .more and .sheet; no other shadow, gradient or use of the token', () => {
    const ok: Violation[] = [];
    checkCss('probe.css', ':root { --float: 0 1px 2px rgb(0 0 0 / 5%); } .more { padding: 0; box-shadow: var(--float); } .sheet{box-shadow:var(--float)}', ok);
    expect(ok).toEqual([]);
    for (const css of [
      '.card { box-shadow: var(--float); }',
      '.more, .card { box-shadow: var(--float); }',
      '.more { box-shadow: 0 1px 2px black; }',
      '.more { box-shadow: var(--float), 0 0 4px red; }',
      '.sheet { text-shadow: 0 1px black; }',
      '.ph img { filter: drop-shadow(0 1px 2px black); }',
      '.more { background: linear-gradient(red, blue); }',
      ':root { --x: linear-gradient(red, blue); }',
      '.tbtn { outline-color: var(--float); }',
    ]) {
      const v: Violation[] = [];
      checkCss('probe.css', css, v);
      expect(v.map((x) => x.rule), css).toEqual([1]);
    }
  });

  it('#18 also catches a bare attribute, the i flag and aria-current="page"; a cleared background passes', () => {
    for (const css of [
      '.mood[aria-current] { background: var(--fill); }',
      '.mood[aria-pressed] { background: var(--fill); }',
      '.mood[aria-current="true" i] { background: var(--fill); }',
      '.mood[aria-current="page"] { background: var(--fill); }',
      ".mood[aria-current='page' i] { background-color: var(--fill); }",
    ]) {
      const v: Violation[] = [];
      checkCss('probe.css', css, v);
      expect(v.map((x) => x.rule), css).toEqual([18]);
    }
    for (const css of [
      '.mood[aria-current="true"] { background: none; }',
      '.mood[aria-current="true"] { background: transparent; }',
      '.mood[aria-current="page"] { background-color: initial; }',
    ]) {
      const v: Violation[] = [];
      checkCss('probe.css', css, v);
      expect(v, css).toEqual([]);
    }
  });
});
