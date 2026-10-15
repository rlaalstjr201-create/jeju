// @vitest-environment jsdom
// 가 봤어요 on the cards and 뺀 곳 on the saved list (ADR-0087, specs/hide-visited.md S2·S3·S4).
import { beforeEach, describe, expect, it } from 'vitest';
import { splitName } from '../src/render';
import { KEYS } from '../src/store';
import { fileSpots } from './fixtures';
import { $, $$, cardIds, current, flush, render, reset, tap } from './harness';

const nameOf = (id: string) => fileSpots.find((s) => s.id === id)!.name.trim();
const stored = (): string[] => JSON.parse(window.localStorage.getItem(KEYS.visited) ?? '[]');
/** the status line's words (되돌리기 after them is a button of its own, ADR-0090 5) */
const status = () => $('#status > span')?.textContent ?? '';
const undo = () => $('#status [data-action="visited-undo"]') as HTMLButtonElement | null;
const visitedBtn = (id: string) => $(`#cards .visited[data-id="${id}"]`) as HTMLButtonElement;
async function more() {
  await tap('[data-action="more"]');
  await flush();
}
/** a Storage whose writes always throw (private mode, quota) */
function throwing(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: () => {
      throw new Error('QuotaExceededError');
    },
  };
}

beforeEach(reset);

describe('S3 카드의 「가 봤어요」', () => {
  it('on all 3 cards: unpressed, fixed name; the first card on its own line under 길찾기, a row card after 길찾기', async () => {
    render();
    await tap('[data-mood="walk"]');
    const ids = cardIds() as string[];
    expect(ids).toHaveLength(3);
    for (const id of ids) {
      const b = visitedBtn(id);
      expect(b.textContent).toBe('가 봤어요');
      expect(b.getAttribute('aria-pressed')).toBe('false');
      expect(b.getAttribute('aria-label')).toBe(`${nameOf(id)}, 가 봤어요`);
      expect(b.classList.contains('tbtn')).toBe(true);
    }
    const lead = $('#cards .card.lead');
    expect(visitedBtn(ids[0]).parentElement!.matches('.card.lead > .ctl')).toBe(true);
    expect(lead.querySelector(':scope > .go + .ctl')).not.toBeNull();
    for (const id of ids.slice(1)) {
      const line = visitedBtn(id).parentElement!;
      expect(line.matches('.card.row > .ctl.go-line')).toBe(true);
      expect([...line.children].map((c) => c.className)).toEqual(['tbtn go', 'tbtn visited']);
    }
    // not on the saved list rows, not on the home
    expect($$('#home .visited, #savedView .visited')).toHaveLength(0);
  });

  it('a tap: only that button and the status line change — the card nodes and photos stay; again puts it back', async () => {
    render();
    await tap('[data-mood="walk"]');
    const ids = cardIds() as string[];
    const cards = $$('#cards .card');
    const imgs = $$('#cards img');
    const id = ids[1];
    await tap(visitedBtn(id));
    expect(visitedBtn(id).getAttribute('aria-pressed')).toBe('true');
    expect(visitedBtn(ids[0]).getAttribute('aria-pressed')).toBe('false');
    expect(stored()).toEqual([id]);
    const main = splitName(nameOf(id)).main;
    expect(status()).toMatch(new RegExp(`^${main.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(은|는) 다음부터 빼고 골라요\\.$`));
    expect($$('#cards .card')).toEqual(cards);
    $$('#cards .card').forEach((c, i) => expect(c).toBe(cards[i]));
    $$('#cards img').forEach((c, i) => expect(c).toBe(imgs[i]));
    expect(cardIds()).toEqual(ids); // the cards on screen stay
    await tap(visitedBtn(id));
    expect(visitedBtn(id).getAttribute('aria-pressed')).toBe('false');
    expect(stored()).toEqual([]);
    expect(status()).toMatch(/(을|를) 다시 넣었어요\.$/);
    $$('#cards .card').forEach((c, i) => expect(c).toBe(cards[i]));
  });

  // ADR-0090 5: undo where it was done, not only from 설정 → 가 본 곳
  it('되돌리기 beside 「… 빼고 골라요.」: the same as 가 봤어요 again — put back, the line says so, the button goes; focus to that 가 봤어요', async () => {
    render();
    await tap('[data-mood="walk"]');
    const ids = cardIds() as string[];
    const cards = $$('#cards .card');
    const id = ids[0];
    expect(undo()).toBeNull();
    await tap(visitedBtn(id));
    const b = undo()!;
    expect(b).not.toBeNull();
    expect(b.textContent).toBe('되돌리기');
    expect(b.tagName).toBe('BUTTON');
    expect(b.classList.contains('tbtn')).toBe(true);
    expect(b.getAttribute('aria-label')).toBe(`${nameOf(id)}, 되돌리기`);
    expect(b.previousElementSibling?.textContent).toMatch(/다음부터 빼고 골라요\.$/);
    b.focus();
    await tap(b);
    expect(stored()).toEqual([]);
    expect(current().state().visited).toEqual([]);
    expect(visitedBtn(id).getAttribute('aria-pressed')).toBe('false');
    expect(status()).toMatch(/(을|를) 다시 넣었어요\.$/);
    expect(undo()).toBeNull();
    expect(document.activeElement).toBe(visitedBtn(id));
    $$('#cards .card').forEach((c, i) => expect(c).toBe(cards[i])); // the cards stay, as with 가 봤어요
    // left out again: offered again; the next pick puts the line (and its button) away
    await tap(visitedBtn(id));
    expect(undo()).not.toBeNull();
    await tap('[data-action="more"]');
    expect(undo()).toBeNull();
    expect(stored()).toEqual([id]);
  });

  it('되돌리기 is offered only while the place is still out: put back from another tab, the button goes and never re-adds it', async () => {
    render();
    await tap('[data-mood="walk"]');
    const id = (cardIds() as string[])[1];
    await tap(visitedBtn(id));
    expect(undo()).not.toBeNull();
    window.localStorage.setItem(KEYS.visited, '[]');
    window.dispatchEvent(new StorageEvent('storage', { key: KEYS.visited, newValue: '[]', storageArea: window.localStorage }));
    await flush();
    expect(current().state().visited).toEqual([]);
    expect(undo()).toBeNull();
    expect(stored()).toEqual([]);
  });

  it('the 가 봤어요 check keeps its place while not pressed (ADR-0090 5): a press does not widen the button', async () => {
    const { css } = await import('./harness');
    const flat = css.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(flat).toMatch(/\.visited \.i-check\s*\{[^}]*display:\s*block;[^}]*visibility:\s*hidden/);
    expect(flat).toMatch(/\.visited\[aria-pressed="true"\] > \.i-check\s*\{[^}]*visibility:\s*visible/);
    render();
    await tap('[data-mood="walk"]');
    const b = visitedBtn((cardIds() as string[])[0]);
    // the check is in the button from the start, pressed or not: only its visibility changes
    expect(b.querySelector(':scope > .i-check')).not.toBeNull();
    const before = b.innerHTML;
    await tap(b);
    expect(b.innerHTML).toBe(before);
  });

  it('the particle follows the last syllable: 받침 → 은/을, none → 는/를', async () => {
    const { COPY } = await import('../src/render');
    expect(COPY.visitedOut('협재 해수욕장')).toBe('협재 해수욕장은 다음부터 빼고 골라요.');
    expect(COPY.visitedOut('카페 바다')).toBe('카페 바다는 다음부터 빼고 골라요.');
    expect(COPY.visitedIn('협재 해수욕장')).toBe('협재 해수욕장을 다시 넣었어요.');
    expect(COPY.visitedIn('카페 바다')).toBe('카페 바다를 다시 넣었어요.');
    expect(COPY.visitedOut('더럭초등학교(구, 더럭분교)')).toBe('더럭초등학교는 다음부터 빼고 골라요.');
  });

  it('S1 다른 3곳 보기: a place left out is never picked again; the status line goes with the next intent', async () => {
    render();
    await tap('[data-mood="walk"]');
    const out = (cardIds() as string[])[0];
    await tap(visitedBtn(out));
    expect(status()).not.toBe('');
    await more();
    expect(status()).not.toContain('빼고 골라요');
    for (let i = 0; i < 12; i++) {
      expect(cardIds()).not.toContain(out);
      await more();
    }
    expect(cardIds()).not.toContain(out);
  });

  it('S1 the mood again (the last 3 brought back): one of them left out → picked anew without it', async () => {
    render();
    await tap('[data-mood="rest"]');
    const out = (cardIds() as string[])[2];
    await tap(visitedBtn(out));
    await tap('#back');
    await tap('[data-mood="rest"]');
    expect(cardIds()).toHaveLength(3);
    expect(cardIds()).not.toContain(out);
  });

  it('S2 storage throwing on every write: no error, 빼기·되돌리기 work for the visit', async () => {
    const errors: unknown[] = [];
    const onError = (e: ErrorEvent) => errors.push(e.error);
    window.addEventListener('error', onError);
    render({ storage: throwing() });
    await tap('[data-mood="walk"]');
    const out = (cardIds() as string[])[0];
    await tap(visitedBtn(out));
    expect(visitedBtn(out).getAttribute('aria-pressed')).toBe('true');
    await more();
    expect(cardIds()).not.toContain(out);
    window.removeEventListener('error', onError);
    expect(errors).toEqual([]);
  });

  it('S2 no storage at all: the same', async () => {
    render({ storage: null });
    await tap('[data-mood="walk"]');
    const out = (cardIds() as string[])[0];
    await tap(visitedBtn(out));
    expect(visitedBtn(out).getAttribute('aria-pressed')).toBe('true');
    await more();
    expect(cardIds()).not.toContain(out);
  });

  // 출시 전 점검 F8 (bugs.md B3): hearts, 지도 앱 and 기록 followed another tab; 뺀 곳 did not, so a tap here undid there
  it('F8 (B3) left out in another tab: this tab follows (its button pressed, gone from the next picks); cleared there, back here', async () => {
    render();
    await tap('[data-mood="walk"]');
    const x = (cardIds() as string[])[1];
    const tabB = (value: string | null) => {
      if (value === null) window.localStorage.clear();
      else window.localStorage.setItem(KEYS.visited, value);
      window.dispatchEvent(new StorageEvent('storage', { key: value === null ? null : KEYS.visited, newValue: value, storageArea: window.localStorage }));
    };
    const said = status();
    tabB(JSON.stringify([x]));
    await flush();
    expect(current().state().visited).toEqual([x]);
    // pressed, as stored: a tap here now puts it back, which is what the button says
    expect(visitedBtn(x).getAttribute('aria-pressed')).toBe('true');
    expect(status()).toBe(said); // the other tab's tap is not announced here
    await more();
    expect(cardIds()).not.toContain(x);
    tabB(null); // storage cleared there
    await flush();
    expect(current().state().visited).toEqual([]);
  });

  it('S2 reopened: what was left out stays out', async () => {
    render();
    await tap('[data-mood="walk"]');
    const out = (cardIds() as string[])[0];
    await tap(visitedBtn(out));
    window.sessionStorage.clear();
    render();
    await tap('[data-mood="walk"]');
    expect(cardIds()).not.toContain(out);
  });
});

describe('S4 저장한 곳의 「뺀 곳 N곳」', () => {
  const box = () => $('#savedView .visited-box');
  const toggle = () => $('#savedView [data-action="visited-list"]') as HTMLButtonElement;
  const names = () => $$('#visitedList li span').map((e) => e.textContent);
  const note = () => $('#visitedNote').textContent ?? '';
  async function openSettings() {
    // jsdom has no layout: the 설정 button scrolls to its heading
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { value: () => undefined, configurable: true, writable: true });
    await flush();
    await tap('[data-action="settings"]');
    await flush();
    await flush();
  }

  it('none left out: hidden; the saved list is as it was', async () => {
    render();
    await openSettings();
    expect($('#savedView').hidden).toBe(false);
    expect(box().hidden).toBe(true);
    expect(note()).toBe('');
  });

  it('nothing saved: reached from the home\'s 설정; above 지도 앱; 1곳 or more only', async () => {
    const [a, b] = fileSpots.filter((s) => !s.hide);
    window.localStorage.setItem(KEYS.visited, JSON.stringify([a.id, b.id, 'not-in-the-data']));
    render();
    await flush();
    expect($('#saved').hidden).toBe(true); // no ♥ N on the home: nothing saved
    await openSettings();
    expect(box().hidden).toBe(false);
    expect(box().nextElementSibling!.nextElementSibling!.matches('.mapapp')).toBe(true);
    expect(toggle().textContent).toBe('가 본 곳 2곳'); // an id the data lacks is not counted (shown as 가 본 곳, ADR-0090 5)
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect($('#visitedList').hidden).toBe(true);
  });

  it('opened: names nearest first, 다시 넣기 each, 모두 다시 넣기; 다시 넣기 → count and list follow; empty → gone', async () => {
    const picked = fileSpots.filter((s) => !s.hide).slice(0, 3);
    window.localStorage.setItem(KEYS.visited, JSON.stringify(picked.map((s) => s.id)));
    render();
    await openSettings();
    await tap(toggle());
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(names()).toHaveLength(3);
    expect(new Set(names())).toEqual(new Set(picked.map((s) => s.name.trim())));
    expect($$('#visitedList [data-action="put-back"]').map((b) => b.textContent)).toEqual(['다시 넣기', '다시 넣기', '다시 넣기']);
    expect($('#visitedList [data-action="put-back-all"]').textContent).toBe('모두 다시 넣기');
    const first = $('#visitedList [data-action="put-back"]') as HTMLButtonElement;
    const id = first.dataset.id!;
    first.focus();
    await tap(first);
    expect(toggle().textContent).toBe('가 본 곳 2곳');
    expect(names()).toHaveLength(2);
    expect(stored()).not.toContain(id);
    expect(note()).toMatch(/(을|를) 다시 넣었어요\.$/);
    expect(document.activeElement?.getAttribute('data-action')).toBe('put-back'); // focus stays in the list
    await tap('#visitedList [data-action="put-back-all"]');
    expect(note()).toBe('가 본 곳 2곳을 모두 다시 넣었어요.');
    expect(box().hidden).toBe(true);
    expect(stored()).toEqual([]);
    expect(document.activeElement?.id).toBe('settingsH');
  });

  it('opened from ♥ N, the list nearest the list\'s point first', async () => {
    const saved = fileSpots.find((s) => !s.hide)!;
    window.localStorage.setItem(KEYS.savedV2, JSON.stringify([{ id: saved.id, date: '2026-10-14', order: 0 }]));
    const picked = fileSpots.filter((s) => !s.hide).slice(5, 10);
    window.localStorage.setItem(KEYS.visited, JSON.stringify(picked.map((s) => s.id)));
    render({ today: () => new Date('2026-10-14T10:00:00+09:00') });
    await flush();
    await tap('#saved');
    await flush();
    await tap(toggle());
    const { distanceKm } = await import('../src/pick');
    const { ORIGINS } = await import('./fixtures');
    const want = [...picked].sort((a, b) => distanceKm(ORIGINS.제주시, a) - distanceKm(ORIGINS.제주시, b)).map((s) => s.name.trim());
    expect(names()).toEqual(want);
  });

  it('S6 e2e path in jsdom: 빼기 → 다른 3곳에 안 나옴 → 저장한 곳에서 다시 넣기 → 다시 나옴', async () => {
    render();
    await tap('[data-mood="walk"]');
    const out = (cardIds() as string[])[0];
    await tap(visitedBtn(out));
    await more();
    expect(cardIds()).not.toContain(out);
    await tap('#back');
    await openSettings();
    await tap(toggle());
    await tap(`#visitedList [data-action="put-back"][data-id="${out}"]`);
    expect(box().hidden).toBe(true);
    await tap('#back');
    await flush();
    // a new round from the start: the first pick is the best ones again, the place among them
    window.sessionStorage.clear();
    render();
    await tap('[data-mood="walk"]');
    expect(cardIds()).toContain(out);
  });
});
