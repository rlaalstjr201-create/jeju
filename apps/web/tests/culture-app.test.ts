// @vitest-environment jsdom
// 서울 홈의 선반 (ADR-0117, before it ADR-0112·0114): 서울's home, 지금, with a basis — the list asked for once (no position in
// the request), the shelves where the moods were (the list's and the moods'), a card's sheet over the home; the moods'
// shelves alone without the list; nothing of it elsewhere or in date mode. With the switch on only (npm run test:nation):
// 서울 opens with the 자동 지역's part.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cultureItems, type SeoulRow } from '../functions/_lib/culture-filter';
import { SHELVES } from '../src/browse';
import { initialState, reduce } from '../src/state';
import { DEST } from '../src/dest';
import type { Fetch } from '../src/effects';
import { normalizeNation } from '../src/nation';
import { NATION, loadCulture, loadNation } from '../src/release';
import { KEYS } from '../src/store';
import rows from './fixtures/seoul-culture-20261104.json';
import { fileSpots } from './fixtures';
import { $, $$, current, flush, render, reset, settle, tap } from './harness';

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
const shelves = () => $('#shelves');
const shelfRows = () => $$('#shelves .shelf-row');
const moodsHidden = () => (document.querySelector('ul.moods') as HTMLElement).hidden;
const MOODS = ['rest', 'walk', 'new', 'famous', 'food'];

describe.runIf(NATION)('서울 홈의 선반 (switch on)', () => {
  beforeAll(async () => {
    vi.stubGlobal('fetch', (url: string) => {
      const m = /^\/nation\/(\w+)\.json\?v=\w+$/.exec(url);
      return Promise.resolve(m ? { ok: true, json: () => Promise.resolve(JSON.parse(nationFile(m[1]))) } : { ok: false, status: 404 });
    });
    expect(await loadNation()).toBe(true);
    // the culture chunk (the shelves' view and stylesheet) in before the first test: its first import can outlast `wait` on a busy run
    expect(await loadCulture()).toBe(true);
    vi.unstubAllGlobals();
  });
  beforeEach(() => {
    reset();
    Element.prototype.scrollIntoView ??= () => undefined;
  });
  afterEach(() => reset());

  it('서울 at 14:00: one ask without a position; the shelves where the moods were, 아무거나 under them, no 「오늘 근처에서 하는 것」', async () => {
    const c = cultureFetch({ day: DAY, items });
    mount(c.f);
    await wait();
    expect(current().state()).toMatchObject({ dest: 'seoul', view: 'home', when: 'now' });
    expect(c.asked()).toEqual(['/api/culture?city=seoul']);
    // no coordinates, no 구 in the request
    expect(c.asked()[0]).not.toMatch(/\d+\.\d+|lat|lng|grid|sgg|gu=/);
    expect($('#culture')).toBeNull();
    expect(shelves()).not.toBeNull();
    expect(moodsHidden()).toBe(true);
    expect($('#lede').hidden).toBe(true);
    expect($('#ask').hidden).toBe(false);
    // 아무거나 stays, after the shelves
    const any = $('button.any');
    expect(any.hidden).toBe(false);
    expect(shelves().compareDocumentPosition(any) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(shelfRows().length).toBeGreaterThanOrEqual(4);
    expect(shelfRows().length).toBeLessThanOrEqual(SHELVES.length + MOODS.length);
    // at most 9 shown, the five moods' among them, the rest behind 선반 더 보기 (Amendment 4); pressed, all of them, the focus on
    // the first it opened
    const shown = () => $$('#shelves .shelf:not([hidden])');
    expect(shown().length).toBe(Math.min(9, shelfRows().length));
    for (const m of MOODS) expect(shown().map((x) => x.querySelector<HTMLElement>('.shelf-row')!.dataset.shelf)).toContain(m);
    if (shelfRows().length > 9) {
      const first = $('#shelves .shelf[hidden] h2');
      await tap('#shelves .shelves-more');
      expect(shown()).toHaveLength(shelfRows().length);
      expect($('#shelves .shelves-more')).toBeNull();
      expect(document.activeElement).toBe(first);
    }
    // a redraw that changes nothing keeps the block itself (its scroll and focus)
    const block = shelves();
    document.dispatchEvent(new Event('visibilitychange'));
    await wait();
    expect(shelves()).toBe(block);
    for (const r of shelfRows()) {
      if (!MOODS.includes(r.dataset.shelf!)) expect(r.querySelectorAll('.bcard').length).toBeGreaterThan(0);
      expect(r.querySelectorAll('.bcard').length).toBeLessThanOrEqual(12);
    }
    // the five moods' headings are their buttons, in the mood buttons' words
    const heads = $$('#shelves .shelf-go');
    expect(heads.map((b) => b.dataset.mood).sort()).toEqual([...MOODS].sort());
    expect(heads.find((b) => b.dataset.mood === 'rest')!.textContent).toBe('푹 쉬고 싶어');
    // each card once
    const ids = $$('#shelves .bcard').map((b) => b.dataset.id ?? b.dataset.pin);
    expect(new Set(ids).size).toBe(ids.length);
    // 지금 여기서's place is not on them again
    const nowId = $('#now img[data-id]')?.dataset.id;
    expect(nowId).toBeTruthy();
    expect(ids).not.toContain(nowId);
    // a mood card: its photo, name and how far
    const card = $('#shelves .bcard[data-pin]');
    expect(card.querySelector('img')!.getAttribute('src')).toBeTruthy();
    expect(card.querySelector('.nm')!.textContent).not.toBe('');
    expect(card.querySelector('.meta')!.textContent).toMatch(/(걸어서|차로) 약 \d+분/);
    // the sources of what is shown, at the shelves' end
    const src = $$('#shelves .cult-src').map((p) => p.textContent);
    expect(src).toContain('정보: 서울시 문화행사(서울 열린데이터광장)');
    expect(src).toContain('장소 정보: 카카오맵');
    expect(shelves().lastElementChild!.classList.contains('cult-src')).toBe(true);
    // asked once a day: other draws do not ask again
    document.dispatchEvent(new Event('visibilitychange'));
    await wait();
    expect(c.asked()).toHaveLength(1);

    // a mood's heading: that mood's results, as its button did
    await tap('#shelves .shelf-go[data-mood="famous"]');
    await wait();
    expect(current().state()).toMatchObject({ view: 'cards', mood: 'famous' });
    // back: the focus on that mood's shelf heading (its button in the hidden list cannot take it)
    await tap('#back');
    await wait();
    expect(current().state().view).toBe('home');
    expect(document.activeElement).toBe($('#shelves .shelf-go[data-mood="famous"]'));
  });

  it("a mood card: its mood's results, that place first (Amendment 1)", async () => {
    mount(cultureFetch({ day: DAY, items }).f);
    await wait();
    const cards = $$('#shelves .shelf-row[data-shelf="food"] .bcard');
    expect(cards.length).toBeGreaterThan(3);
    const pin = cards[3].dataset.pin!;
    await tap(cards[3]);
    await wait();
    const st = current().state();
    expect(st).toMatchObject({ view: 'cards', mood: 'food', pin: null });
    expect(st.cards!.list[0].spot.id).toBe(pin);
    expect(st.cards!.list).toHaveLength(3);
    expect(new Set(st.cards!.list.map((c) => c.spot.id)).size).toBe(3);
  });

  it('a KOPIS show on the shelves: the KOPIS source line', async () => {
    const show = { id: 'kp-PF1', title: '연극 오늘 한 번', kind: '연극', place: '경복궁 앞 소극장', gu: '', lat: 경복궁.lat, lng: 경복궁.lng, start: DAY, end: DAY, time: '수요일 19:00', free: false, forAll: true, link: '', image: '', cast: '김상우·이원우' };
    mount(cultureFetch({ day: DAY, items: [show, ...items] }).f);
    await wait();
    expect($(`#shelves .bcard[data-id="${show.id}"]`)).not.toBeNull();
    expect($$('#shelves .cult-src').map((p) => p.textContent)).toContain('출처: (재)예술경영지원센터 공연예술통합전산망(KOPIS)');
  });

  it('not 서울 (제주): never asked, no shelves, the moods as they were', async () => {
    const c = cultureFetch({ day: DAY, items });
    mount(c.f, { dest: 'jeju', at: 제주시 });
    await wait();
    expect(current().state().dest).toBe('jeju');
    expect(c.asked()).toEqual([]);
    expect(shelves()).toBeNull();
    expect(moodsHidden()).toBe(false);
    expect($('#lede').hidden).toBe(false);
  });

  it("a 204: the moods' shelves alone; 5 minutes on, asked again, and the list's come", async () => {
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
    expect(shelfRows().map((r) => r.dataset.shelf).sort()).toEqual([...MOODS].sort());
    expect(moodsHidden()).toBe(true);
    expect($$('#shelves .cult-src')).toEqual([]);
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
    expect(shelfRows().some((r) => !MOODS.includes(r.dataset.shelf!))).toBe(true);
  });

  it("another day's list: the moods' shelves alone", async () => {
    const c = cultureFetch({ day: '2026-11-03', items });
    mount(c.f);
    await wait();
    expect(c.asked()).toHaveLength(1);
    expect(shelfRows().map((r) => r.dataset.shelf).sort()).toEqual([...MOODS].sort());
    expect($$('#shelves [data-action="browse-card"]')).toEqual([]);
  });

  it('date mode (내일): not asked, no shelves, the moods as they were', async () => {
    const c = cultureFetch({ day: DAY, items });
    mount(c.f, { when: '2026-11-05' });
    await wait();
    expect(current().state().when).toBe('2026-11-05');
    expect(c.asked()).toEqual([]);
    expect(shelves()).toBeNull();
    expect(moodsHidden()).toBe(false);
  });

  it('a day picked after the shelves were up: they go, the moods come back', async () => {
    const c = cultureFetch({ day: DAY, items });
    mount(c.f);
    await wait();
    expect(shelves()).not.toBeNull();
    await tap('#basis');
    await tap('#sheet [data-when="2026-11-05"]');
    await wait();
    expect(current().state().when).toBe('2026-11-05');
    expect(shelves()).toBeNull();
    expect(moodsHidden()).toBe(false);
    expect($('#lede').hidden).toBe(false);
  });

  it("오늘 서울 둘러보기's screen is gone (ADR-0117 5): an entry of it (a back, a forward) finds the home", () => {
    const s = { ...initialState({ dest: 'seoul', basis: 'gps', today: DAY, region: null, stay: null, saved: [], hintSeen: true, offline: false }), culture: { day: DAY, items, minute: 840 } };
    expect(reduce(s, { type: 'overlay', overlay: 'browse' }).overlay).toBeNull();
    expect(reduce(s, { type: 'route', route: { view: 'home', overlay: 'browse' } }).overlay).toBeNull();
  });
});

// A card's sheet over 서울 홈 (ADR-0114 4, ADR-0117 5): back closes it, links http(s) only in a new tab, and the counts it sends
// (no item, no position): browse_card and browse_link only — no screen to open or leave any more.
describe.runIf(NATION)('서울 홈의 카드 시트 (switch on)', () => {
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

  it('a card on the home: its sheet over it; back closes it to the home', async () => {
    const sent = mountSent();
    await wait();
    // the show: its poster over https, lazily, no referrer; a picture that fails becomes the text card
    const poster = $(`#shelves [data-id="${show.id}"] img`);
    expect(poster.getAttribute('src')).toBe('https://yeochana.com/cdn-cgi/image/width=256,quality=75,format=auto/https://kopis.or.kr/upload/pfmPoster/PF_1.jpg');
    expect(poster.getAttribute('loading')).toBe('lazy');
    expect(poster.getAttribute('referrerpolicy')).toBe('no-referrer');
    poster.dispatchEvent(new Event('error'));
    expect($(`#shelves [data-id="${show.id}"] .bpic`).classList.contains('noimg')).toBe(true);

    await tap(`#shelves [data-id="${show.id}"]`);
    expect(current().state()).toMatchObject({ overlay: 'browse-card', browseId: show.id, view: 'home' });
    const card = $('#sheet .bc');
    expect(card.querySelector('h2')!.textContent).toBe(show.title);
    expect(card.querySelector('.bc-place')!.textContent).toBe(show.place);
    expect([...card.querySelectorAll('.bc-facts li')].map((l) => l.textContent)).toEqual(['오늘만 · 19:00 시작', '김상우·이원우 출연', '걸어서 약 5분']);
    const go = card.querySelector<HTMLAnchorElement>('a[data-blink="go"]')!;
    expect(go.getAttribute('href')).toMatch(/^https:\/\/map\.naver\.com\/p\/directions\/-\//);
    expect([go.target, go.rel]).toEqual(['_blank', 'noopener']);
    // javascript: is no link
    expect(card.querySelector('a[data-blink="more"]')).toBeNull();
    expect($('#sheet .browse')).toBeNull();
    go.addEventListener('click', (e) => e.preventDefault(), { once: true });
    go.click();

    window.history.back();
    await wait();
    expect(current().state().overlay).toBeNull();
    expect($('#sheet .bc')).toBeNull();
    expect(shelves()).not.toBeNull();
    // what was sent: no item, no position, nothing but these fields
    expect(browse(sent)).toEqual([
      { e: 'browse_card', d: DAY },
      { e: 'browse_link', link: 'go', d: DAY },
    ]);
  });

  it('a card sheet: 자세히 when the link is http(s), in a new tab; 닫기 and Esc close it', async () => {
    const sent = mountSent();
    await wait();
    const withLink = items.find((i) => /^https?:/.test(i.link) && $(`#shelves .bcard[data-id="${i.id}"]`))!;
    expect(withLink).toBeTruthy();
    await tap(`#shelves .bcard[data-id="${withLink.id}"]`);
    const more = $('#sheet .bc a[data-blink="more"]') as HTMLAnchorElement;
    expect(more.getAttribute('href')).toBe(withLink.link.trim());
    expect([more.target, more.rel]).toEqual(['_blank', 'noopener']);
    await tap('#sheet .bc .sheet-close');
    await wait();
    expect(current().state().overlay).toBeNull();
    await tap(`#shelves .bcard[data-id="${withLink.id}"]`);
    expect(current().state().overlay).toBe('browse-card');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await wait();
    expect(current().state().overlay).toBeNull();
    window.dispatchEvent(new Event('pagehide'));
    expect(browse(sent).map((e) => e.e)).toEqual(['browse_card', 'browse_card']);
  });

  it('under a webdriver: nothing of it sent (QA runs must not move the verdict)', async () => {
    Object.defineProperty(navigator, 'webdriver', { value: true, configurable: true });
    try {
      const sent = mountSent();
      await wait();
      await tap('#shelves .bcard[data-action="browse-card"]');
      await tap('#sheet .bc .sheet-close');
      await wait();
      expect(browse(sent)).toEqual([]);
    } finally {
      Object.defineProperty(navigator, 'webdriver', { value: false, configurable: true });
    }
  });

  it('a card sheet: its links are in the Tab loop', async () => {
    mountSent();
    await wait();
    await tap(`#shelves .bcard[data-id="${show.id}"]`);
    // from 닫기 (the last), Tab comes round to 길찾기, not to 닫기 again
    ($('#sheet .bc .sheet-close') as HTMLElement).focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', cancelable: true }));
    expect(document.activeElement?.getAttribute('data-blink')).toBe('go');
  });

  it('기록 끄기: nothing sent', async () => {
    localStorage.setItem(KEYS.track, JSON.stringify(false));
    const sent = mountSent();
    await wait();
    await tap('#shelves .bcard[data-action="browse-card"]');
    await tap('#sheet .bc .sheet-close');
    await wait();
    expect(sent).toEqual([]);
  });
});
