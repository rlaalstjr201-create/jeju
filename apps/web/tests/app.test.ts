// @vitest-environment jsdom
// S3 화면 (plans/tomorrow-picker.md) — static index.html + mountApp in jsdom, real spots.json.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocateError, REGIONS, bookingUrl, kakaoUrl, mountApp, type Deps } from '../src/app';
import { cardTextProblem } from '../src/card-text';
import { pickCards, type Point, type Sub } from '../src/pick';
import { ORIGINS, fileSpots, realSpots } from './fixtures';

const html = readFileSync(resolve(__dirname, '../index.html'), 'utf8');
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>')).replace(/<script[\s\S]*?<\/script>/g, '');
const MOODS = ['rest', 'walk', 'new', 'food', 'any'] as const;

const INTERACTIVE = 'a[href], button, input, select, textarea, [tabindex], [contenteditable], summary, details, iframe';
const visible = (e: Element) => !e.closest('[hidden]');
const interactive = () => [...document.querySelectorAll(INTERACTIVE)].filter(visible);
const $ = <T extends Element = HTMLElement>(s: string) => document.querySelector(s) as T;
const $$ = (s: string) => [...document.querySelectorAll(s)];
const flush = () => new Promise((r) => setTimeout(r, 0));

function render(deps: Partial<Deps> = {}) {
  document.body.innerHTML = body;
  return mountApp(document, {
    loadSpots: () => Promise.resolve(fileSpots), // spots.json is already S1'-clean
    locate: () => Promise.resolve(ORIGINS.제주시),
    storage: window.localStorage,
    ...deps,
  });
}
async function tap(sel: string) {
  ($(sel) as HTMLElement).click();
  await flush();
  await flush();
}
const cardNames = () => $$('.card-name').map((e) => e.textContent);
const expectedNames = (o: Point, b: Parameters<typeof pickCards>[2]) => pickCards(realSpots, o, b).cards.map((c) => c.spot.name);

beforeEach(() => {
  window.localStorage.clear();
});

describe('S3 첫 화면', () => {
  it('only 5 mood buttons + 1 location toggle are interactive, before any data arrives', () => {
    render({ loadSpots: () => new Promise(() => undefined) }); // spots.json never loads
    const els = interactive();
    expect(els).toHaveLength(6);
    const moods = $$('[data-mood]');
    expect(moods.map((b) => b.textContent)).toEqual([
      '푹 쉬고 싶어',
      '좀 걷고 싶어',
      '새로운 거 해보고 싶어',
      '맛있는 거 먹고 싶어',
      '아무거나 골라줘',
    ]);
    expect(els).toEqual(expect.arrayContaining([...moods, $('#basis')]));
    expect($('#basis').textContent).toContain('내 위치 기준');
  });

  it('the 5 mood buttons are in the static HTML itself (ADR-0028) — shown before data loads', () => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    expect(doc.querySelectorAll('button[data-mood]')).toHaveLength(5);
  });

  it('no login / price / hours / rating wording (first screen stays calm)', () => {
    render();
    const text = document.body.textContent ?? '';
    for (const w of ['로그인', '회원', '가입', '가격', '원)', '운영시간', '영업시간', '평점', '별점', '리뷰']) {
      expect(text, w).not.toContain(w);
    }
  });
});

describe('S3 카드', () => {
  it('tap → 3 cards, each with image, name, reason, "차로 약 N분"', async () => {
    render();
    await tap('[data-mood="walk"]');
    const cards = $$('.card');
    expect(cards).toHaveLength(3);
    const expected = pickCards(realSpots, ORIGINS.제주시, 'walk').cards;
    cards.forEach((card, i) => {
      const { spot, minutes } = expected[i];
      expect(card.querySelector('img')?.getAttribute('src')).toBe(spot.image);
      expect(card.querySelector('.card-name')?.textContent).toBe(spot.name);
      expect(card.querySelector('.card-reason')?.textContent).toBe(spot.reason);
      expect(card.querySelector('.card-drive')?.textContent).toBe(`차로 약 ${minutes}분`);
      expect(card.querySelector('.card-drive')?.textContent).toMatch(/^차로 약 \d+분$/);
    });
  });

  it('card link = kakao place page, or a name-search fallback when kakaoPlaceId is null; target=_blank rel=noopener', async () => {
    render();
    for (const mood of MOODS) {
      await tap(`[data-mood="${mood}"]`);
      const expected = pickCards(realSpots, ORIGINS.제주시, mood).cards;
      const links = $$('.card-link') as HTMLAnchorElement[];
      expect(links).toHaveLength(3);
      links.forEach((a, i) => {
        expect(a.getAttribute('href')).toBe(kakaoUrl(expected[i].spot));
        expect(a.getAttribute('target')).toBe('_blank');
        expect(a.getAttribute('rel')).toBe('noopener');
      });
    }
  });

  it('search-link fallback is used exactly when kakaoPlaceId is null', () => {
    const withId = { ...realSpots[0], kakaoPlaceId: '123' };
    const withoutId = { ...realSpots[0], kakaoPlaceId: null };
    expect(kakaoUrl(withId)).toBe('https://place.map.kakao.com/123');
    expect(kakaoUrl(withoutId)).toBe(`https://map.kakao.com/link/search/${encodeURIComponent(withoutId.name)}`);
  });

  it('MyRealTrip link only on bookable (experience) cards: 20 combos + a mixed "new" set', async () => {
    const check = () => {
      for (const li of $$('.card')) {
        const id = li.getAttribute('data-id')!;
        const spot = realSpots.find((s) => s.id === id)!;
        const book = li.querySelector('a.book');
        if (spot.bookable) {
          expect(book?.getAttribute('href')).toBe(bookingUrl(spot));
          expect(book?.getAttribute('href')).toBe(`https://www.myrealtrip.com/search?q=${encodeURIComponent(spot.name)}`);
          expect(book?.getAttribute('target')).toBe('_blank');
          expect(book?.getAttribute('rel')).toBe('noopener');
        } else {
          expect(book).toBeNull();
        }
      }
      return $$('a.book').length;
    };
    let seenBook = 0;
    for (const origin of Object.values(ORIGINS)) {
      render({ locate: () => Promise.resolve(origin) });
      for (const mood of MOODS) {
        await tap(`[data-mood="${mood}"]`);
        expect($$('.card')).toHaveLength(3);
        seenBook += check();
      }
    }
    expect(seenBook).toBeGreaterThan(0);

    // one bookable + two non-bookable spots of the same mood on the same screen
    const exp = realSpots.find((s) => s.bookable)!;
    const others = realSpots.filter((s) => s.mood === exp.mood && !s.bookable).slice(0, 2);
    render({ loadSpots: () => Promise.resolve([exp, ...others]), locate: () => Promise.resolve(exp) });
    await tap(`[data-mood="${exp.mood}"]`);
    expect($$('.card')).toHaveLength(3);
    expect(check()).toBe(1);
    expect($('.card a.book')?.closest('.card')?.getAttribute('data-id')).toBe(exp.id);
    expect(kakaoUrl(exp)).toBe(
      exp.kakaoPlaceId ? `https://place.map.kakao.com/${exp.kakaoPlaceId}` : `https://map.kakao.com/link/search/${encodeURIComponent(exp.name)}`,
    );
  });
});

describe('S3 카드 문구·사진', () => {
  it('no card in 20 combos (3 taps each) shows price/hours/rating wording', async () => {
    let shown = 0;
    for (const origin of Object.values(ORIGINS)) {
      render({ locate: () => Promise.resolve(origin) });
      for (const mood of MOODS) {
        for (let i = 0; i < 3; i++) {
          await tap(`[data-mood="${mood}"]`);
          for (const card of $$('.card')) {
            const name = card.querySelector('.card-name')?.textContent ?? '';
            const reason = card.querySelector('.card-reason')?.textContent ?? '';
            expect(cardTextProblem({ name, reason }), `${name}: ${reason}`).toBeNull();
            shown++;
          }
        }
      }
    }
    expect(shown).toBe(4 * 5 * 3 * 3);
  });

  it('a spot with a price reason never reaches a card (app trusts the file, but stays defensive)', async () => {
    const priced = { ...realSpots[0], id: 'priced-test', reason: '입장료 5,000원, 매주 월요일 휴무인 곳이에요' };
    const safe = realSpots.filter((s) => s.mood === priced.mood).slice(0, 3);
    render({ loadSpots: () => Promise.resolve([priced, ...safe]), locate: () => Promise.resolve(priced) });
    await tap(`[data-mood="${priced.mood}"]`);
    // build-spots.mjs guarantees the shipped file never contains this; the app renders whatever loadSpots returns.
    expect($$('.card')).toHaveLength(3);
  });

  it('image load failure collapses the photo box instead of leaving it blank', async () => {
    render();
    await tap('[data-mood="rest"]');
    const img = $('.card img') as HTMLImageElement;
    img.dispatchEvent(new Event('error'));
    expect((img.closest('.card-img') as HTMLElement).hidden).toBe(true);
  });
});

describe('S3 위치', () => {
  it('geolocation denied → 4-region picker; picking one shows cards from that region', async () => {
    render({ locate: () => Promise.reject(new LocateError('denied')) });
    await tap('[data-mood="rest"]');
    expect($$('.card')).toHaveLength(0);
    const regionBtns = $$('#sheet [data-region]').filter(visible);
    expect(regionBtns.map((b) => b.textContent)).toEqual(['제주시', '서귀포', '동쪽', '서쪽']);
    await tap('#sheet [data-region="서귀포"]');
    expect($('#sheet').hidden).toBe(true);
    expect(cardNames()).toEqual(expectedNames(REGIONS[1], 'rest'));
    expect($('#basis').textContent).toContain('서귀포 기준');
  });

  it('숙소 via region: saved to localStorage and kept after a fresh render', async () => {
    const locate = vi.fn(() => Promise.resolve(ORIGINS.제주시));
    render({ locate });
    await tap('#basis'); // no 숙소 yet → registration sheet
    expect($$('#sheet button').filter(visible).map((b) => b.textContent)).toEqual(
      expect.arrayContaining(['지금 위치를 숙소로 저장', '제주시', '서귀포', '동쪽', '서쪽']),
    );
    await tap('#sheet [data-region="동쪽"]');
    expect(JSON.parse(window.localStorage.getItem('jeju.stay')!)).toMatchObject({ lat: REGIONS[2].lat, lng: REGIONS[2].lng });
    expect($('#basis').textContent).toContain('숙소 기준');

    // fresh render (reload): still 숙소-based, GPS not asked
    locate.mockClear();
    render({ locate });
    expect($('#basis').textContent).toContain('숙소 기준');
    await tap('[data-mood="walk"]');
    expect(locate).not.toHaveBeenCalled();
    expect(cardNames()).toEqual(expectedNames(REGIONS[2], 'walk'));
  });

  it('"지금 위치를 숙소로 저장" stores the current position and survives a fresh render', async () => {
    const here = ORIGINS['서쪽(한림)'];
    render({ locate: () => Promise.resolve(here) });
    await tap('#basis');
    const save = $$('#sheet button').find((b) => b.textContent === '지금 위치를 숙소로 저장') as HTMLButtonElement;
    save.click();
    await flush();
    await flush();
    expect(JSON.parse(window.localStorage.getItem('jeju.stay')!)).toMatchObject(here);

    // later, somewhere else: cards still follow the 숙소
    render({ locate: () => Promise.resolve(ORIGINS.제주시) });
    await tap('[data-mood="new"]');
    expect(cardNames()).toEqual(expectedNames(here, 'new'));
  });

  it('toggle 숙소 → 내 위치 uses GPS again, and toggles back without asking', async () => {
    window.localStorage.setItem('jeju.stay', JSON.stringify({ lat: REGIONS[1].lat, lng: REGIONS[1].lng, label: '숙소' }));
    window.localStorage.setItem('jeju.basis', JSON.stringify('stay'));
    render({ locate: () => Promise.resolve(ORIGINS.제주시) });
    await tap('[data-mood="any"]');
    expect(cardNames()).toEqual(expectedNames(REGIONS[1], 'any'));
    await tap('#basis');
    expect($('#basis').textContent).toContain('내 위치 기준');
    expect(cardNames()).toEqual(expectedNames(ORIGINS.제주시, 'any'));
    await tap('#basis');
    expect($('#sheet').hidden).toBe(true);
    expect($('#basis').textContent).toContain('숙소 기준');
  });

  it('saved region basis: toggle retries GPS (no 숙소 needed) and shows 내 위치 cards', async () => {
    window.localStorage.setItem('jeju.region', JSON.stringify('서귀포'));
    window.localStorage.setItem('jeju.basis', JSON.stringify('region'));
    render({ locate: () => Promise.resolve(ORIGINS.제주시) });
    expect($('#basis').textContent).toContain('서귀포 기준');
    await tap('[data-mood="rest"]');
    await tap('#basis');
    expect($('#sheet').hidden).toBe(true);
    expect($('#basis').textContent).toContain('내 위치 기준');
    expect(cardNames()).toEqual(expectedNames(ORIGINS.제주시, 'rest'));
  });

  it('shows "위치 확인 중…" while waiting for GPS, cleared once cards render', async () => {
    let resolve!: (p: Point) => void;
    render({ locate: () => new Promise<Point>((r) => (resolve = r)) });
    ($('[data-mood="walk"]') as HTMLElement).click();
    await flush();
    expect($('#status').textContent).toBe('위치 확인 중…');
    resolve(ORIGINS.제주시);
    await flush();
    await flush();
    expect($('#status').textContent).toBe('');
    expect(cardNames()).toHaveLength(3);
  });

  it('GPS jitter (~150m) keeps the re-tap history: next 3 cards, not the same 3', async () => {
    const fixes = [ORIGINS.제주시, { lat: ORIGINS.제주시.lat + 0.0012, lng: ORIGINS.제주시.lng + 0.0012 }];
    let n = 0;
    render({ locate: () => Promise.resolve(fixes[Math.min(n++, 1)]) });
    await tap('[data-mood="walk"]');
    const first = cardNames();
    await tap('[data-mood="walk"]');
    expect(cardNames().filter((x) => first.includes(x))).toEqual([]);
  });

  it('same button again → none of the previous 3 cards', async () => {
    render();
    await tap('[data-mood="rest"]');
    const first = cardNames();
    await tap('[data-mood="rest"]');
    const second = cardNames();
    expect(second).toHaveLength(3);
    expect(second.filter((n) => first.includes(n))).toEqual([]);
  });
});

describe('S3 식사 | 카페·디저트 토글', () => {
  const expectedSub = (o: Point, sub: Sub) => pickCards(realSpots, o, 'food', {}, sub).cards.map((c) => c.spot.name);

  it('toggle absent on first screen and in every non-food state; present only when food is active', async () => {
    render();
    expect($('#foodSub').hidden).toBe(true);
    for (const mood of ['rest', 'walk', 'new', 'any'] as const) {
      await tap(`[data-mood="${mood}"]`);
      expect($('#foodSub').hidden, mood).toBe(true);
    }
    await tap('[data-mood="food"]');
    expect($('#foodSub').hidden).toBe(false);
    await tap('[data-mood="walk"]');
    expect($('#foodSub').hidden).toBe(true);
  });

  it('tapping 맛있는 거 먹고 싶어 shows cards immediately with default 식사 (meal), toggle shows 식사 pressed', async () => {
    render();
    await tap('[data-mood="food"]');
    expect($$('.card')).toHaveLength(3);
    expect(cardNames()).toEqual(expectedSub(ORIGINS.제주시, 'meal'));
    const [mealBtn, cafeBtn] = $$('[data-sub]') as HTMLButtonElement[];
    expect(mealBtn.getAttribute('aria-pressed')).toBe('true');
    expect(cafeBtn.getAttribute('aria-pressed')).toBe('false');
  });

  it('switching the toggle changes the 3 cards to the other sub; toggling back keeps meal rotation separate from cafe', async () => {
    render();
    await tap('[data-mood="food"]');
    const meal1 = cardNames();
    expect(meal1).toEqual(expectedSub(ORIGINS.제주시, 'meal'));
    await tap('[data-sub="cafe"]');
    const cafe1 = cardNames();
    expect(cafe1).toEqual(expectedSub(ORIGINS.제주시, 'cafe'));
    const [mealBtn, cafeBtn] = $$('[data-sub]') as HTMLButtonElement[];
    expect(mealBtn.getAttribute('aria-pressed')).toBe('false');
    expect(cafeBtn.getAttribute('aria-pressed')).toBe('true');
    await tap('[data-sub="meal"]');
    const meal2 = cardNames();
    // meal history advances on its own (like re-tapping any mood button); the cafe tap in between must not leak in.
    expect(meal2.filter((n) => meal1.includes(n))).toEqual([]);
    expect(meal2.filter((n) => cafe1.includes(n))).toEqual([]);
  });

  it('every card shown under either sub actually has that sub (no leakage between meal/cafe)', async () => {
    render();
    await tap('[data-mood="food"]');
    for (const id of $$('.card').map((c) => c.getAttribute('data-id'))) {
      expect(realSpots.find((s) => s.id === id)?.sub).toBe('meal');
    }
    await tap('[data-sub="cafe"]');
    for (const id of $$('.card').map((c) => c.getAttribute('data-id'))) {
      expect(realSpots.find((s) => s.id === id)?.sub).toBe('cafe');
    }
  });
});
