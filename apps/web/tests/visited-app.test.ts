// @vitest-environment jsdom
// 가 봤어요 on the cards and 뺀 곳 on the saved list (ADR-0087, specs/hide-visited.md S2·S3·S4).
import { beforeEach, describe, expect, it } from 'vitest';
import { splitName } from '../src/render';
import { KEYS } from '../src/store';
import { fileSpots } from './fixtures';
import { $, $$, cardIds, flush, render, reset, tap } from './harness';

const nameOf = (id: string) => fileSpots.find((s) => s.id === id)!.name.trim();
const stored = (): string[] => JSON.parse(window.localStorage.getItem(KEYS.visited) ?? '[]');
const status = () => $('#status').textContent ?? '';
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
    await tap('[data-action="change"]');
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
