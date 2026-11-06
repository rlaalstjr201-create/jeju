// @vitest-environment jsdom
// 부산 몫 청크가 오지 않을 때 (ADR-0098 1, 독립 리뷰 2026-10-20 m1): a new device whose 시작 화면 lost its module opens Jeju for
// this visit only — no 여행지 is kept for it (the 시작 화면 comes again next time) — and a 「내 위치로 시작하기」 pressed on the
// cover is still a position read. A file of its own: here the part's import always fails.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountApp, type App } from '../src/app';
import { BUSAN, loadBusan } from '../src/region/release';
import { fileSpots } from './fixtures';
import { flush, html, reset, settle } from './harness';

vi.mock('../src/region/busan-part', () => {
  throw new Error('chunk failed to load');
});

const cover = [...html.matchAll(/<!--busan--><script>([\s\S]*?)<\/script>/g)][1][1];
const page = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>')).replace(/<script[\s\S]*?<\/script>/g, '');
const 동문시장 = { lat: 33.5122, lng: 126.5272 };
const wait = async () => {
  for (let i = 0; i < 4; i++) await flush();
  await settle();
};

describe.runIf(BUSAN)('부산 몫이 오지 않은 시작 화면 (switch on)', () => {
  let app: App | null = null;
  beforeEach(() => {
    reset();
    Element.prototype.scrollIntoView ??= () => undefined;
  });
  afterEach(() => {
    app?.destroy();
    app = null;
    reset();
  });
  /** a new device: the cover drawn by index.html, `tap` pressed on it before the app came */
  function open(tap: boolean) {
    delete (window as { __startTap?: unknown }).__startTap;
    document.documentElement.classList.add('yc-start');
    document.body.innerHTML = page;
    new Function(cover)();
    if (tap) (document.getElementById('ycGps') as HTMLElement).click();
    const calls = { locate: 0 };
    app = mountApp(document, {
      loadSpots: () => Promise.resolve(fileSpots),
      locate: () => (calls.locate++, Promise.resolve(동문시장)),
      storage: localStorage,
      session: sessionStorage,
      today: () => new Date('2026-10-20T12:00:00+09:00'),
    });
    return calls;
  }

  it('the part could not be loaded: the cover goes, Jeju is drawn, and nothing is kept for the device', async () => {
    expect(await loadBusan()).toBe(false);
    const calls = open(false);
    await wait();
    expect(document.getElementById('ycStart')).toBeNull();
    expect(document.documentElement.classList.contains('yc-start')).toBe(false);
    expect(document.querySelector('.logo .rg')?.textContent).toBe(':제주');
    expect(localStorage.getItem('jeju.dest')).toBeNull();
    expect(Object.keys(localStorage).filter((k) => k.startsWith('jeju.'))).toEqual([]);
    expect(calls.locate).toBe(0);
  });

  it('「내 위치로 시작하기」 pressed before: the position is read once (not dropped), still no 여행지 kept', async () => {
    const calls = open(true);
    await wait();
    expect(calls.locate).toBe(1);
    expect(localStorage.getItem('jeju.dest')).toBeNull();
  });
});
