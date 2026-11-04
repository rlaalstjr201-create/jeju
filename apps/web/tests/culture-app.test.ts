// @vitest-environment jsdom
// 오늘 근처에서 하는 것 (ADR-0112): 서울's home, 지금, with a basis — the list asked for once (no position in the request),
// at most 2 on the home with their why line, up to 6 in the sheet; nothing elsewhere, on a 204, for another day or in date
// mode. With the switch on only (npm run test:nation): 서울 opens with the 자동 지역's part.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cultureItems, type SeoulRow } from '../functions/_lib/culture-filter';
import { DEST } from '../src/dest';
import type { Fetch } from '../src/effects';
import { normalizeNation } from '../src/nation';
import { NATION, loadCulture, loadNation } from '../src/release';
import { KEYS } from '../src/store';
import rows from './fixtures/seoul-culture-20261104.json';
import { fileSpots } from './fixtures';
import { $, $$, advance, current, flush, render, reset, settle, tap } from './harness';

const DAY = '2026-11-04';
const items = cultureItems(rows as SeoulRow[], DAY);
const nationFile = (f: string) => readFileSync(resolve(__dirname, `../data/nation/${f}.json`), 'utf8');
const seoulRaw = JSON.parse(readFileSync(resolve(__dirname, '../data/seoul/spots-seoul.json'), 'utf8')) as Record<string, unknown>[];
const 경복궁 = { lat: 37.5796, lng: 126.977 };
const 제주시 = { lat: 33.4996, lng: 126.5312 };
const at1400 = () => new Date(`${DAY}T14:00:00+09:00`);

/** /api/culture answers `culture` (a status, or the body); everything else is a 204. Remembers what it was asked. */
function cultureFetch(culture: number | { day: string; items: unknown[] }) {
  const urls: string[] = [];
  const f: Fetch = async (url) => {
    urls.push(url);
    if (!url.startsWith('/api/culture')) return { ok: false, status: 204, json: async () => null };
    if (typeof culture === 'number') return { ok: culture === 200, status: culture, json: async () => null };
    return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(culture)) };
  };
  return { f, urls, asked: () => urls.filter((u) => u.startsWith('/api/culture')) };
}
const wait = async () => {
  for (let i = 0; i < 6; i++) await flush();
  await settle();
};
function mount(fetch: Fetch, o: { dest?: string; at?: { lat: number; lng: number }; when?: string } = {}) {
  localStorage.setItem(KEYS.dest, JSON.stringify(o.dest ?? 'seoul'));
  if (o.when) localStorage.setItem(KEYS.when, JSON.stringify(o.when));
  render({
    loadSpots: (d, sgg) => Promise.resolve(d === 'nation' ? normalizeNation(JSON.parse(nationFile('11')), [...DEST.gangwon.sgg!, ...DEST.seoul.sgg!], sgg) : d === 'seoul' ? seoulRaw : fileSpots),
    locate: () => Promise.resolve(o.at ?? 경복궁),
    geoPermission: async () => 'granted',
    today: at1400,
    fetch,
  });
}
const block = () => $('#culture');
const picks = (box: Element) => [...box.querySelectorAll<HTMLAnchorElement>('.cult a.mk')];

describe.runIf(NATION)('오늘 근처에서 하는 것 (switch on)', () => {
  beforeAll(async () => {
    vi.stubGlobal('fetch', (url: string) => {
      const m = /^\/nation\/(\w+)\.json\?v=\w+$/.exec(url);
      return Promise.resolve(m ? { ok: true, json: () => Promise.resolve(JSON.parse(nationFile(m[1]))) } : { ok: false, status: 404 });
    });
    expect(await loadNation()).toBe(true);
    // the culture chunk (now with 둘러보기's view and stylesheet) in before the first test: its first import can outlast `wait` on a busy run
    expect(await loadCulture()).toBe(true);
    vi.unstubAllGlobals();
  });
  beforeEach(() => {
    reset();
    Element.prototype.scrollIntoView ??= () => undefined;
  });
  afterEach(() => reset());

  it('서울 at 14:00: one ask without a position; the home shows at most 2 with why lines, the sheet up to 6', async () => {
    const c = cultureFetch({ day: DAY, items });
    mount(c.f);
    await wait();
    expect(current().state()).toMatchObject({ dest: 'seoul', view: 'home', when: 'now' });
    expect(c.asked()).toEqual(['/api/culture?city=seoul']);
    // no coordinates, no 구 in the request
    expect(c.asked()[0]).not.toMatch(/\d+\.\d+|lat|lng|grid|sgg|gu=/);
    const home = picks(block());
    expect(home.length).toBeGreaterThan(0);
    expect(home.length).toBeLessThanOrEqual(2);
    for (const a of home) {
      expect(a.querySelector('.nm')!.textContent).not.toBe('');
      const metas = [...a.querySelectorAll('.meta')].map((m) => m.textContent!);
      expect(metas).toHaveLength(2);
      expect(metas[1]).toMatch(/^(걸어서|차로) 약 \d+분$/);
      expect(a.getAttribute('href')).toMatch(/^https:\/\/map\.naver\.com\/p\/directions\/-\//);
      expect(a.getAttribute('href')).not.toContain('126.977,37.5796');
    }
    expect(home[0].querySelector('.meta')!.textContent).toMatch(/요일까지|오늘|지금 열림|시작|무료/);
    expect(block().querySelector('h2')!.textContent).toBe('오늘 근처에서 하는 것');
    expect(block().querySelector('.cult-src')!.textContent).toBe('정보: 서울시 문화행사(서울 열린데이터광장)');

    await tap('#culture [data-action="culture-more"]');
    expect(current().state().overlay).toBe('culture');
    const sheet = $('#sheet .sheet');
    expect(sheet.querySelector('h2')!.textContent).toBe('오늘 근처에서 하는 것');
    const list = picks(sheet);
    expect(list.length).toBeGreaterThan(home.length);
    expect(list.length).toBeLessThanOrEqual(6);
    for (const a of list) expect(a.querySelectorAll('.meta').length).toBeGreaterThanOrEqual(1);
    expect(list.slice(0, home.length).map((a) => a.querySelector('.nm')!.textContent)).toEqual(home.map((a) => a.querySelector('.nm')!.textContent));
    await tap('#sheet [data-action="close"]');
    await wait();
    expect(current().state().overlay).toBeNull();
    // asked once a day: other draws do not ask again
    document.dispatchEvent(new Event('visibilitychange'));
    await wait();
    expect(c.asked()).toHaveLength(1);
  });

  it('a KOPIS show among the picks: its cast after the why line, and the KOPIS source line', async () => {
    const show = { id: 'kp-PF1', title: '연극 오늘 한 번', kind: '연극', place: '경복궁 앞 소극장', gu: '', lat: 경복궁.lat, lng: 경복궁.lng, start: DAY, end: DAY, time: '수요일 19:00', free: false, forAll: true, link: '', image: '', cast: '김상우·이원우' };
    mount(cultureFetch({ day: DAY, items: [show, ...items] }).f);
    await wait();
    const a = picks(block()).find((x) => x.querySelector('.nm')!.textContent === show.title)!;
    expect(a).toBeTruthy();
    expect(a.querySelector('.meta')!.textContent).toBe('오늘만 · 19:00 시작 · 김상우·이원우 출연');
    expect([...block().querySelectorAll('.cult-src')].map((p) => p.textContent)).toEqual(['정보: 서울시 문화행사(서울 열린데이터광장)', '출처: (재)예술경영지원센터 공연예술통합전산망(KOPIS)']);
  });

  it('no KOPIS show among the picks: the Seoul source line alone', async () => {
    mount(cultureFetch({ day: DAY, items }).f);
    await wait();
    expect(block().querySelectorAll('.cult-src')).toHaveLength(1);
  });

  it('not 서울 (제주): never asked, no block', async () => {
    const c = cultureFetch({ day: DAY, items });
    mount(c.f, { dest: 'jeju', at: 제주시 });
    await wait();
    expect(current().state().dest).toBe('jeju');
    expect(c.asked()).toEqual([]);
    expect(block()).toBeNull();
  });

  it('a 204, then 5 minutes on: asked again, and the block comes', async () => {
    let status = 204;
    let clock = at1400().getTime();
    const urls: string[] = [];
    const f: Fetch = async (url) => {
      urls.push(url);
      if (!url.startsWith('/api/culture') || status !== 200) return { ok: false, status: 204, json: async () => null };
      return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify({ day: DAY, items })) };
    };
    localStorage.setItem(KEYS.dest, JSON.stringify('seoul'));
    render({
      loadSpots: (d, sgg) => Promise.resolve(d === 'nation' ? normalizeNation(JSON.parse(nationFile('11')), [...DEST.gangwon.sgg!, ...DEST.seoul.sgg!], sgg) : d === 'seoul' ? seoulRaw : fileSpots),
      locate: () => Promise.resolve(경복궁),
      geoPermission: async () => 'granted',
      today: () => new Date(clock),
      fetch: f,
    });
    await wait();
    const asked = () => urls.filter((u) => u.startsWith('/api/culture')).length;
    expect(asked()).toBe(1);
    expect(block()).toBeNull();
    // back in front a minute on: not yet
    clock += 60_000;
    document.dispatchEvent(new Event('visibilitychange'));
    await wait();
    expect(asked()).toBe(1);
    status = 200;
    clock += 5 * 60_000;
    document.dispatchEvent(new Event('visibilitychange'));
    await wait();
    expect(asked()).toBe(2);
    expect(block()).not.toBeNull();
  });

  it('a 204: no block', async () => {
    const c = cultureFetch(204);
    mount(c.f);
    await wait();
    expect(c.asked()).toHaveLength(1);
    expect(block()).toBeNull();
    expect($$('.cult')).toEqual([]);
  });

  it("another day's list: no block", async () => {
    const c = cultureFetch({ day: '2026-11-03', items });
    mount(c.f);
    await wait();
    expect(c.asked()).toHaveLength(1);
    expect(block()).toBeNull();
  });

  it('date mode (내일): not asked, no block', async () => {
    const c = cultureFetch({ day: DAY, items });
    mount(c.f, { when: '2026-11-05' });
    await wait();
    expect(current().state().when).toBe('2026-11-05');
    expect(c.asked()).toEqual([]);
    expect(block()).toBeNull();
  });

  it('back to a day picked after the block was up: the block goes', async () => {
    const c = cultureFetch({ day: DAY, items });
    mount(c.f);
    await wait();
    expect(block()).not.toBeNull();
    await tap('#basis');
    await tap('#sheet [data-when="2026-11-05"]');
    await wait();
    expect(current().state().when).toBe('2026-11-05');
    expect(block()).toBeNull();
  });
});

// 오늘 서울 둘러보기 (ADR-0114): the way in under the block, the whole screen (back closes it), a card's sheet over it (back
// closes the card first), links http(s) only in a new tab, and the counts it sends (no item, no position).
describe.runIf(NATION)('오늘 서울 둘러보기 (switch on)', () => {
  beforeAll(async () => {
    vi.stubGlobal('fetch', (url: string) => {
      const m = /^\/nation\/(\w+)\.json\?v=\w+$/.exec(url);
      return Promise.resolve(m ? { ok: true, json: () => Promise.resolve(JSON.parse(nationFile(m[1]))) } : { ok: false, status: 404 });
    });
    expect(await loadNation()).toBe(true);
    vi.unstubAllGlobals();
  });
  beforeEach(() => {
    reset();
    Element.prototype.scrollIntoView ??= () => undefined;
  });
  afterEach(() => reset());

  const show = { id: 'kp-PF1', title: '연극 오늘 한 번', kind: '연극', place: '경복궁 앞 소극장', gu: '', lat: 경복궁.lat, lng: 경복궁.lng, start: DAY, end: DAY, time: '수요일 19:00', free: false, forAll: true, link: 'javascript:alert(1)', image: 'http://www.kopis.or.kr/upload/pfmPoster/PF_1.jpg', cast: '김상우·이원우' };
  function mountSent() {
    const sent: Record<string, unknown>[] = [];
    localStorage.setItem(KEYS.dest, JSON.stringify('seoul'));
    render({
      loadSpots: (d, sgg) => Promise.resolve(d === 'nation' ? normalizeNation(JSON.parse(nationFile('11')), [...DEST.gangwon.sgg!, ...DEST.seoul.sgg!], sgg) : d === 'seoul' ? seoulRaw : fileSpots),
      locate: () => Promise.resolve(경복궁),
      geoPermission: async () => 'granted',
      today: at1400,
      fetch: cultureFetch({ day: DAY, items: [show, ...items] }).f,
      eventsUrl: '/api/events',
      beacon: (_, body) => (sent.push(...(JSON.parse(body) as Record<string, unknown>[])), true),
    });
    return sent;
  }
  const browse = (sent: Record<string, unknown>[]) => sent.filter((e) => String(e.e).startsWith('browse_'));

  it('opens from the block; shelves of cards, each item once; a card sheet over it; back closes the card, then the screen', async () => {
    const sent = mountSent();
    await wait();
    const way = $('#culture [data-action="browse"]');
    expect(way.textContent).toBe('오늘 서울 둘러보기');
    await tap(way);
    expect(current().state().overlay).toBe('browse');
    const screen = $('#sheet .browse');
    expect(screen.querySelector('h2')!.textContent).toBe('오늘 서울 둘러보기');
    const shelves = [...screen.querySelectorAll<HTMLElement>('.shelf-row')];
    expect(shelves.length).toBeGreaterThan(1);
    expect(shelves.length).toBeLessThanOrEqual(7);
    expect(shelves[0].dataset.shelf).toBe('near');
    const cards = [...screen.querySelectorAll<HTMLElement>('.bcard')];
    for (const s of shelves) expect(s.querySelectorAll('.bcard').length).toBeLessThanOrEqual(12);
    expect(new Set(cards.map((c) => c.dataset.id)).size).toBe(cards.length);
    // the show: its poster over https, lazily, no referrer; a picture that fails becomes the text card
    const poster = screen.querySelector<HTMLElement>(`[data-id="${show.id}"] img`)!;
    expect(poster.getAttribute('src')).toBe('https://www.kopis.or.kr/upload/pfmPoster/PF_1.jpg');
    expect(poster.getAttribute('loading')).toBe('lazy');
    expect(poster.getAttribute('referrerpolicy')).toBe('no-referrer');
    poster.dispatchEvent(new Event('error'));
    expect(screen.querySelector(`[data-id="${show.id}"] .bpic`)!.classList.contains('noimg')).toBe(true);
    expect(screen.querySelector(`[data-id="${show.id}"] img`)).toBeNull();
    // a shelf scrolled sideways (twice: one shelf)
    shelves[1].dispatchEvent(new Event('scroll'));
    shelves[1].dispatchEvent(new Event('scroll'));

    await tap(screen.querySelector<HTMLElement>(`[data-id="${show.id}"]`)!);
    expect(current().state()).toMatchObject({ overlay: 'browse-card', browseId: show.id });
    const card = $('#sheet .bc');
    expect(card.querySelector('h2')!.textContent).toBe(show.title);
    expect(card.querySelector('.bc-place')!.textContent).toBe(show.place);
    expect([...card.querySelectorAll('.bc-facts li')].map((l) => l.textContent)).toEqual(['오늘만 · 19:00 시작', '김상우·이원우 출연', '걸어서 약 5분']);
    const go = card.querySelector<HTMLAnchorElement>('a[data-blink="go"]')!;
    expect(go.getAttribute('href')).toMatch(/^https:\/\/map\.naver\.com\/p\/directions\/-\//);
    expect([go.target, go.rel]).toEqual(['_blank', 'noopener']);
    // javascript: is no link
    expect(card.querySelector('a[data-blink="more"]')).toBeNull();
    expect(screen.hasAttribute('inert')).toBe(true);
    go.addEventListener('click', (e) => e.preventDefault(), { once: true });
    go.click();
    // the shelf's scroll is kept: the screen is not built again under the card
    expect($('#sheet .browse')).toBe(screen);

    window.history.back();
    await wait();
    expect(current().state().overlay).toBe('browse');
    expect($('#sheet .bc')).toBeNull();
    expect($('#sheet .browse')).toBe(screen);
    expect(screen.hasAttribute('inert')).toBe(false);
    expect(document.activeElement?.getAttribute('data-id')).toBe(show.id);

    advance(52_000);
    window.history.back();
    await wait();
    expect(current().state().overlay).toBeNull();
    // what was sent: no item, no position, nothing but these fields
    expect(browse(sent)).toEqual([
      { e: 'browse_open', d: DAY },
      { e: 'browse_card', d: DAY },
      { e: 'browse_link', link: 'go', d: DAY },
      { e: 'browse_done', secs: 50, rows: 1, cards: 1, d: DAY },
    ]);
  });

  it('a card sheet: 자세히 when the link is http(s), in a new tab; 닫기 back to the screen; Esc closes the screen', async () => {
    const sent = mountSent();
    await wait();
    await tap('#culture [data-action="browse"]');
    const withLink = items.find((i) => /^https?:/.test(i.link) && $(`#sheet .bcard[data-id="${i.id}"]`))!;
    expect(withLink).toBeTruthy();
    await tap(`#sheet .bcard[data-id="${withLink.id}"]`);
    const more = $('#sheet .bc a[data-blink="more"]') as HTMLAnchorElement;
    expect(more.getAttribute('href')).toBe(withLink.link.trim());
    expect([more.target, more.rel]).toEqual(['_blank', 'noopener']);
    await tap('#sheet .bc .sheet-close');
    await wait();
    expect(current().state().overlay).toBe('browse');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await wait();
    expect(current().state().overlay).toBeNull();
    expect(browse(sent).map((e) => e.e)).toEqual(['browse_open', 'browse_card', 'browse_done']);
    expect(browse(sent)[2]).toMatchObject({ rows: 0, cards: 1 });
  });

  it('the page hidden while it is open: left then, once (a map app may never bring it back)', async () => {
    const sent = mountSent();
    await wait();
    await tap('#culture [data-action="browse"]');
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    await tap('#sheet .browse > .sheet-close');
    await wait();
    expect(current().state().overlay).toBeNull();
    expect(browse(sent).map((e) => e.e)).toEqual(['browse_open', 'browse_done']);
  });

  it('기록 끄기: nothing sent', async () => {
    localStorage.setItem(KEYS.track, JSON.stringify(false));
    const sent = mountSent();
    await wait();
    await tap('#culture [data-action="browse"]');
    await tap('#sheet .browse > .sheet-close');
    await wait();
    expect(sent).toEqual([]);
  });
});
