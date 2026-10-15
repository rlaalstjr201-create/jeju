// @vitest-environment jsdom
// ADR-0090 길 잃지 않게 (docs/research/heuristic-audit-02/02-synthesis.md T3·T4·T11): the top bar's left moves you (the
// logo on the first screen, 뒤로 on the results and the saved list), the basis and ♥ N chips stay on its right on every
// screen, 설정 is reached from the results too, and the basis sheet's 다른 동네 고르기 goes down to the 동네 index.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { $, $$, advance, cardIds, css, current, flush, render, reset, settle, tap } from './harness';

const back = () => $('#back') as HTMLButtonElement;
/** the top bar's children in order: the same four nodes on every screen */
const bar = () => [...$('header.top').children].map((e) => (e as HTMLElement).id || e.className);
const shown = () => (['home', 'results', 'savedView'] as const).filter((id) => !$(`#${id}`).hidden);
const flat = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@media[^{]*\{(?:[^{}]*\{[^}]*\})*[^{}]*\}/g, '');
const cssRule = (sel: string) =>
  [...flat.matchAll(/([^{}]+)\{([^}]*)\}/g)]
    .filter((m) => m[1].split(',').some((x) => x.trim() === sel))
    .map((m) => m[2])
    .join('');
const region = (name: string) => {
  window.localStorage.setItem('jeju.region', JSON.stringify(name));
  window.localStorage.setItem('jeju.basis', JSON.stringify('region'));
};
/** a pointer tap (detail 1): the 2nd one of a double tap is swallowed by the app, a keyboard press never is */
const pointerTap = (e: HTMLElement) => e.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));

// jsdom has no layout: 설정 and 다른 동네 고르기 scroll to a heading — which one, and how, is recorded
let scrolled: { el: Element; opts: unknown }[] = [];
beforeEach(() => {
  reset();
  scrolled = [];
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    value(this: Element, opts: unknown) {
      scrolled.push({ el: this, opts });
    },
    configurable: true,
    writable: true,
  });
});
afterEach(() => {
  delete (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView;
});

describe('1·2 위 줄: 왼쪽은 이동, 오른쪽은 기준 · ♥ N', () => {
  it('one bar on every screen: logo, 뒤로, 기준, ♥ N in that order; 뒤로 hidden only on the first screen', async () => {
    render();
    const nodes = [...$('header.top').children];
    expect(bar()).toEqual(['logo', 'back', 'basis', 'saved']);
    expect(shown()).toEqual(['home']);
    expect(back().hidden).toBe(true);
    await tap('[data-mood="walk"]');
    expect(shown()).toEqual(['results']);
    expect(back().hidden).toBe(false);
    await tap($$('#cards .heart')[0]);
    expect($('#saved').hidden).toBe(false);
    await tap('#saved');
    expect(shown()).toEqual(['savedView']);
    expect(back().hidden).toBe(false);
    // the very same nodes, never moved between screens
    expect([...$('header.top').children]).toEqual(nodes);
    expect(bar()).toEqual(['logo', 'back', 'basis', 'saved']);
  });

  it('the chips are on the right on every screen (CSS): 기준 margin-left auto always; no rule moves them per screen', () => {
    expect(cssRule('.basis')).toMatch(/margin-left:\s*auto/);
    expect(cssRule('.saved-btn')).not.toMatch(/margin-left/);
    expect(css).not.toMatch(/#home:not\(\[hidden\]\)\)\s*\.(basis|saved-btn)/);
    // the logo shows on the first screen only (CSS), 뒤로 by its hidden attribute on the other two
    expect(css).toMatch(/\.app:has\(#home:not\(\[hidden\]\)\) \.logo\s*\{\s*display:\s*flex;?\s*\}/);
    // page zoom 200% (under 300 wide, S48): 뒤로 and the chips do not fit one line; the chips go under it, and the
    // scroll margins keep the two lines clear
    const narrow = css.match(/@media \(max-width: 299px\) \{([\s\S]*?)\n\}/)?.[1] ?? '';
    expect(narrow).toMatch(/\.top:has\(> \.back:not\(\[hidden\]\)\) \{ flex-wrap: wrap; \}/);
    expect(narrow).toMatch(/> \.back \{ margin-right: calc\(100% - 44px\); \}/);
    expect(narrow).toMatch(/:root:has\(#back:not\(\[hidden\]\)\) \{ --top-h: 100px; \}/);
  });

  it('뒤로 is an icon button named 뒤로: inline SVG left chevron on a 24 grid, stroke 2, currentColor, aria-hidden; no glyph', () => {
    render();
    const b = back();
    expect(b.tagName).toBe('BUTTON');
    expect(b.getAttribute('type')).toBe('button');
    expect(b.getAttribute('aria-label')).toBe('뒤로');
    expect(b.textContent).toBe('');
    const svg = b.querySelector('svg')!;
    expect(svg.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(svg.getAttribute('stroke')).toBe('currentColor');
    expect(svg.getAttribute('stroke-width')).toBe('2');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.querySelector('path')!.getAttribute('d')).toBe('M15 6l-6 6 6 6');
    // a drawn 40 circle (--fill) in a square 48 box: the box itself is not rounded, so its corners are hit too
    const box = cssRule('.back');
    expect(box).toMatch(/width:\s*48px/);
    expect(box).toMatch(/min-height:\s*48px/);
    expect(box).not.toMatch(/border-radius/);
    const face = cssRule('.back::before');
    expect(face).toMatch(/inset:\s*4px/);
    expect(face).toMatch(/border-radius:\s*var\(--r-pill\)/);
    expect(face).toMatch(/background:\s*var\(--fill\)/);
  });

  it('the head rows hold no 바꾸기 / 돌아가기 any more', () => {
    render();
    expect($$('#results .head button, #savedView .head button')).toHaveLength(0);
    const words = $$('button, a').map((b) => b.textContent?.trim());
    expect(words).not.toContain('바꾸기');
    expect(words).not.toContain('돌아가기');
    expect($$('[data-action="change"], [data-action="close-saved"]')).toHaveLength(0);
  });
});

describe('3 뒤로는 바꾸기 · 돌아가기가 하던 일', () => {
  it('on the results: the moods, the results entry gone (the first screen\'s entry at depth 0), the record cleared', async () => {
    region('애월');
    render();
    await tap('[data-mood="walk"]');
    expect(window.history.state).toMatchObject({ view: 'cards', depth: 1 });
    await tap(back());
    await settle();
    expect(shown()).toEqual(['home']);
    expect(back().hidden).toBe(true);
    expect(window.history.state).toMatchObject({ view: 'home', overlay: null, depth: 0 });
    expect($('[data-mood="walk"]').getAttribute('aria-current')).toBe('true');
    // what a reload now shows is the first screen, not the mood just left
    render();
    await flush();
    expect(shown()).toEqual(['home']);
  });

  it('on the results: the focus lands on the mood just left, as from 바꾸기', async () => {
    region('애월');
    render();
    await tap('[data-mood="rest"]');
    back().focus();
    await tap(back());
    await settle();
    expect(document.activeElement).toBe($('[data-mood="rest"]'));
  });

  it('on the saved list opened from the results: back to those same 3 cards, the focus on the results heading', async () => {
    region('애월');
    render();
    await tap('[data-mood="walk"]');
    const ids = cardIds();
    await tap($$('#cards .heart')[1]);
    await tap('#saved');
    expect(shown()).toEqual(['savedView']);
    expect(window.history.state).toMatchObject({ view: 'saved', depth: 2 });
    back().focus();
    await tap(back());
    await settle();
    expect(shown()).toEqual(['results']);
    expect(cardIds()).toEqual(ids);
    expect(back().hidden).toBe(false);
    expect(document.activeElement).toBe($('#crumb'));
    expect(window.history.state).toMatchObject({ view: 'cards', depth: 1 });
  });

  it('on the saved list opened from the first screen: back to the moods', async () => {
    region('애월');
    render();
    await tap('[data-mood="walk"]');
    await tap($$('#cards .heart')[0]);
    await tap(back());
    await settle();
    await tap('#saved');
    expect(shown()).toEqual(['savedView']);
    back().focus();
    await tap(back());
    await settle();
    expect(shown()).toEqual(['home']);
    expect(window.history.state).toMatchObject({ view: 'home', depth: 0 });
    expect(document.activeElement).toBe($('[data-mood="walk"]'));
  });

  it('a double tap on 뒤로 on the saved list goes back once: the 2nd tap lands on the results\' 뒤로 and is swallowed', async () => {
    region('애월');
    render();
    await tap('[data-mood="walk"]');
    await tap($$('#cards .heart')[0]);
    await tap('#saved');
    pointerTap(back());
    await flush();
    pointerTap(back()); // the same moment, the same place
    await settle();
    expect(shown()).toEqual(['results']);
    advance();
    pointerTap(back()); // a deliberate tap later: the moods
    await settle();
    expect(shown()).toEqual(['home']);
  });
});

describe('4 결과 화면 아래 「설정 · 지도 앱 · 의견」', () => {
  it('the first screen\'s button under the results: opens the saved list at 설정; 뒤로 → the same results', async () => {
    region('애월');
    render();
    await tap('[data-mood="walk"]');
    const ids = cardIds();
    const b = $('#results [data-action="settings"]') as HTMLButtonElement;
    expect(b).not.toBeNull();
    expect(b.textContent).toBe('설정 · 지도 앱 · 의견');
    expect(b.className).toBe($('#homeMore [data-action="settings"]').className);
    // the last thing on the results, after the cards, their credit and 동네별로 둘러보기
    expect($('#results').lastElementChild).toBe(b);
    await tap(b);
    expect(shown()).toEqual(['savedView']);
    expect(current().state().savedFrom).toBe('cards');
    expect(document.activeElement?.id).toBe('settingsH');
    expect(scrolled.at(-1)?.el).toBe($('#settingsH'));
    await tap(back());
    await settle();
    expect(shown()).toEqual(['results']);
    expect(cardIds()).toEqual(ids);
  });

  it('hidden with the credit while the results have no cards yet (CSS)', () => {
    expect(css).toMatch(/#cards:empty ~ \.settings\s*\{\s*display:\s*none;?\s*\}/);
  });
});

describe('6 기준 시트 「다른 동네 고르기」', () => {
  it('a 동네 basis: its row checked with 다른 동네 고르기 at its end; pressed, the first 동네 cell takes the focus, its heading scrolled to', async () => {
    region('애월');
    render();
    await flush();
    await tap('#basis');
    const opt = $('#sheet [data-action="close"][aria-pressed="true"]');
    expect(opt.querySelector('.nm')?.textContent).toBe('애월 근처');
    expect(opt.querySelector('.lm')).toBeNull();
    const go = $('#sheet [data-action="other-area"]') as HTMLButtonElement;
    expect(go.textContent).toBe('다른 동네 고르기');
    expect(go.classList.contains('tbtn')).toBe(true);
    expect(go.parentElement).toBe(opt.parentElement); // the same row, like 다시 정하기
    expect($('#sheet').textContent).not.toContain('다른 동네는 아래에서 골라요');
    await tap(go);
    const first = $('#sheet .areas .opt');
    expect(first.getAttribute('data-area')).toBe('한경');
    expect(document.activeElement).toBe(first);
    expect(scrolled.at(-1)?.el).toBe(first.closest('.areas')!.previousElementSibling);
    expect(scrolled.at(-1)?.opts).toEqual({ block: 'start' });
    // nothing else happened: the sheet is open, the basis as it was
    expect(current().state().overlay).toBe('basis');
    expect(current().state().region).toBe('애월');
    expect($('#sheet').hidden).toBe(false);
  });

  it('not a 동네 basis: no such row', async () => {
    render();
    await flush();
    await tap('#basis');
    expect($('#sheet [data-action="other-area"]')).toBeNull();
  });
});
