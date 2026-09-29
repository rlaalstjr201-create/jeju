// @vitest-environment jsdom
// S3 화면 (plans/tomorrow-picker.md) — static index.html + mountApp in jsdom, real spots.json.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AREAS, LocateError, bookingUrl, kakaoUrl, mountApp, type Deps } from '../src/app';
import { cardTextProblem } from '../src/card-text';
import { distanceKm, pickCards, type Point, type Sub } from '../src/pick';
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
  // ADR-0029: the old 4-region fallback (제주시/서귀포/동쪽/서쪽) is replaced by the same 15-area list
  // used in the basis sheet (S8-2), grouped 제주시 쪽 / 서귀포 쪽.
  it('geolocation denied → 15-area picker (제주시 쪽 8 + 서귀포 쪽 7); picking one shows cards from that area', async () => {
    render({ locate: () => Promise.reject(new LocateError('denied')) });
    await tap('[data-mood="rest"]');
    expect($$('.card')).toHaveLength(0);
    const areaBtns = $$('#sheet [data-area]').filter(visible);
    expect(areaBtns.map((b) => b.textContent)).toEqual(AREAS.map((a) => a.name));
    expect(areaBtns).toHaveLength(15);
    const jeju = AREAS.filter((a) => a.group === 'jeju');
    const seogwipo = AREAS.filter((a) => a.group === 'seogwipo');
    expect(jeju).toHaveLength(8);
    expect(seogwipo).toHaveLength(7);
    const 서귀포시내 = AREAS.find((a) => a.name === '서귀포시내')!;
    await tap('#sheet [data-area="서귀포시내"]');
    expect($('#sheet').hidden).toBe(true);
    expect(cardNames()).toEqual(expectedNames(서귀포시내, 'rest'));
    expect($('#basis').textContent).toContain('서귀포시내 기준');
  });

  it('숙소 via area: saved to localStorage and kept after a fresh render (basis toggle opens a sheet, S8-2)', async () => {
    const locate = vi.fn(() => Promise.resolve(ORIGINS.제주시));
    render({ locate });
    await tap('#basis'); // basis sheet: 내 위치 / 숙소 / 15개 지역
    await tap('#sheet [data-basis="stay"]'); // no 숙소 yet → registration sheet
    expect($$('#sheet button').filter(visible).map((b) => b.textContent)).toEqual(
      expect.arrayContaining(['지금 위치를 숙소로 저장', ...AREAS.map((a) => a.name)]),
    );
    const 성산 = AREAS.find((a) => a.name === '성산')!;
    await tap('#sheet [data-area="성산"]');
    expect(JSON.parse(window.localStorage.getItem('jeju.stay')!)).toMatchObject({ lat: 성산.lat, lng: 성산.lng });
    expect($('#basis').textContent).toContain('숙소 기준');

    // fresh render (reload): still 숙소-based, GPS not asked
    locate.mockClear();
    render({ locate });
    expect($('#basis').textContent).toContain('숙소 기준');
    await tap('[data-mood="walk"]');
    expect(locate).not.toHaveBeenCalled();
    expect(cardNames()).toEqual(expectedNames(성산, 'walk'));
  });

  it('"지금 위치를 숙소로 저장" stores the current position and survives a fresh render', async () => {
    const here = ORIGINS['서쪽(한림)'];
    render({ locate: () => Promise.resolve(here) });
    await tap('#basis');
    await tap('#sheet [data-basis="stay"]');
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

  it('basis sheet: picking 숙소 (already saved) or 내 위치 switches immediately, no re-asking', async () => {
    const 애월 = AREAS.find((a) => a.name === '애월')!;
    window.localStorage.setItem('jeju.stay', JSON.stringify({ lat: 애월.lat, lng: 애월.lng, label: '숙소' }));
    window.localStorage.setItem('jeju.basis', JSON.stringify('stay'));
    render({ locate: () => Promise.resolve(ORIGINS.제주시) });
    await tap('[data-mood="any"]');
    expect(cardNames()).toEqual(expectedNames(애월, 'any'));

    await tap('#basis');
    await tap('#sheet [data-basis="gps"]');
    expect($('#sheet').hidden).toBe(true);
    expect($('#basis').textContent).toContain('내 위치 기준');
    expect(cardNames()).toEqual(expectedNames(ORIGINS.제주시, 'any'));

    await tap('#basis');
    await tap('#sheet [data-basis="stay"]'); // already saved → switches straight back, no registration sheet
    expect($('#sheet').hidden).toBe(true);
    expect($('#basis').textContent).toContain('숙소 기준');
  });

  it('saved area basis: basis sheet → 내 위치 retries GPS (no 숙소 needed) and shows 내 위치 cards', async () => {
    window.localStorage.setItem('jeju.region', JSON.stringify('서귀포시내'));
    window.localStorage.setItem('jeju.basis', JSON.stringify('region'));
    render({ locate: () => Promise.resolve(ORIGINS.제주시) });
    expect($('#basis').textContent).toContain('서귀포시내 기준');
    await tap('[data-mood="rest"]');
    await tap('#basis');
    await tap('#sheet [data-basis="gps"]');
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

// ADR-0029 / plans/tomorrow-picker.md "세부 지역 + 하트 저장" — S8-1..S8-5, encoded directly.
describe('S8-1 지역 커버리지 (15지역 × 6가지 = 90조합, 실데이터)', () => {
  it('every area × button(+food sub) combo yields 3 distinct cards, each within 60 minutes', () => {
    let checked = 0;
    for (const area of AREAS) {
      for (const button of ['rest', 'walk', 'new', 'any'] as const) {
        const { cards } = pickCards(realSpots, area, button, {});
        expect(cards, `${area.name} / ${button}`).toHaveLength(3);
        expect(new Set(cards.map((c) => c.spot.id)).size, `${area.name} / ${button}`).toBe(3);
        for (const c of cards) expect(c.minutes, `${area.name} / ${button} / ${c.spot.name}`).toBeLessThanOrEqual(60);
        checked++;
      }
      for (const sub of ['meal', 'cafe'] as const) {
        const { cards } = pickCards(realSpots, area, 'food', {}, sub);
        expect(cards, `${area.name} / food:${sub}`).toHaveLength(3);
        expect(new Set(cards.map((c) => c.spot.id)).size, `${area.name} / food:${sub}`).toBe(3);
        for (const c of cards) expect(c.minutes, `${area.name} / food:${sub} / ${c.spot.name}`).toBeLessThanOrEqual(60);
        checked++;
      }
    }
    expect(checked).toBe(90);
  });
});

describe('S8-2 위치 전환 시트', () => {
  it('sheet lists 내 위치 / 숙소 / 15개 지역 grouped 제주시 쪽 · 서귀포 쪽 at exactly the plan coordinates', async () => {
    render();
    await tap('#basis');
    expect($('#sheet [data-basis="gps"]')).not.toBeNull();
    expect($('#sheet [data-basis="stay"]')).not.toBeNull();
    const headings = $$('#sheet .area-heading').map((h) => h.textContent);
    expect(headings).toEqual(['제주시 쪽', '서귀포 쪽']);
    const areaBtns = $$('#sheet [data-area]').filter(visible);
    expect(areaBtns.map((b) => b.textContent)).toEqual(AREAS.map((a) => a.name));
  });

  it('picking an area sets "<지역> 기준" and it persists in localStorage across a fresh render', async () => {
    render();
    await tap('#basis');
    await tap('#sheet [data-area="한경"]');
    expect($('#basis').textContent).toContain('한경 기준');
    expect(JSON.parse(window.localStorage.getItem('jeju.region')!)).toBe('한경');
    expect(JSON.parse(window.localStorage.getItem('jeju.basis')!)).toBe('region');

    render(); // fresh mount, same storage — simulates a reload
    expect($('#basis').textContent).toContain('한경 기준');
    const 한경 = AREAS.find((a) => a.name === '한경')!;
    await tap('[data-mood="walk"]');
    expect(cardNames()).toEqual(expectedNames(한경, 'walk'));
  });
});

describe('S8-3 하트', () => {
  it('every card has a real <button> heart with aria-pressed and an accessible name', async () => {
    render();
    await tap('[data-mood="rest"]');
    const hearts = $$('.heart') as HTMLButtonElement[];
    expect(hearts).toHaveLength(3);
    for (const h of hearts) {
      expect(h.tagName).toBe('BUTTON');
      expect(h.getAttribute('type')).toBe('button');
      expect(h.getAttribute('aria-pressed')).toBe('false');
      expect(h.getAttribute('aria-label')).toBeTruthy();
    }
  });

  it('tapping the heart toggles save + aria-pressed, persists in localStorage, and does not follow the card link', async () => {
    render();
    await tap('[data-mood="rest"]');
    const id = $('.card')!.getAttribute('data-id')!;
    const heart = $('.card .heart') as HTMLButtonElement;
    let navigated = false;
    ($('.card .card-link') as HTMLAnchorElement).addEventListener('click', () => (navigated = true));

    heart.click();
    await flush();
    expect(heart.getAttribute('aria-pressed')).toBe('true');
    expect(navigated).toBe(false);
    expect(JSON.parse(window.localStorage.getItem('jeju.saved')!)).toEqual([id]);

    heart.click();
    await flush();
    expect(heart.getAttribute('aria-pressed')).toBe('false');
    expect(navigated).toBe(false);
    expect(JSON.parse(window.localStorage.getItem('jeju.saved')!)).toEqual([]);
  });

  it('saves persist across a fresh render (localStorage)', async () => {
    render();
    await tap('[data-mood="walk"]');
    const id = $('.card')!.getAttribute('data-id')!;
    ($('.card .heart') as HTMLButtonElement).click();
    await flush();
    expect(JSON.parse(window.localStorage.getItem('jeju.saved')!)).toEqual([id]);

    render();
    await tap('[data-mood="walk"]');
    const heart = $(`.card[data-id="${id}"] .heart`) as HTMLButtonElement | null;
    if (heart) expect(heart.getAttribute('aria-pressed')).toBe('true');
  });
});

describe('S8-4 저장 목록', () => {
  it('no 저장 버튼 when 0 saved — first screen stays 기분 5개 + 위치 전환 only', () => {
    render();
    expect($('#saved').hidden).toBe(true);
    const els = interactive();
    expect(els).toHaveLength(6); // 5 moods + basis, same as S3 (saved button absent)
  });

  it('"♥ N" appears once N > 0, opens saved-first list nearest-first from the current basis, allows unsave and 돌아가기', async () => {
    render({ locate: () => Promise.resolve(ORIGINS.제주시) });
    await tap('[data-mood="rest"]');
    const restId = $('.card')!.getAttribute('data-id')!;
    ($('.card .heart') as HTMLButtonElement).click();
    await flush();
    await tap('[data-mood="new"]');
    const newId = $$('.card').find((c) => c.getAttribute('data-id') !== restId)!.getAttribute('data-id')!;
    ($(`.card[data-id="${newId}"] .heart`) as HTMLButtonElement).click();
    await flush();

    expect($('#saved').hidden).toBe(false);
    expect($('#saved').textContent).toBe('♥︎ 2');

    await tap('#saved');
    const savedList = $$('.saved-view .card');
    expect(savedList).toHaveLength(2);
    const shownIds = savedList.map((c) => c.getAttribute('data-id'));
    // saved ids are newest-first ([newId, restId]); the app's sort is stable, so ties break by that order too.
    const savedIds = JSON.parse(window.localStorage.getItem('jeju.saved')!) as string[];
    const expectedOrder = savedIds
      .map((id) => realSpots.find((s) => s.id === id)!)
      .sort((a, b) => distanceKm(ORIGINS.제주시, a) - distanceKm(ORIGINS.제주시, b))
      .map((s) => s.id);
    expect(shownIds).toEqual(expectedOrder);
    expect(new Set(shownIds)).toEqual(new Set([restId, newId]));

    // unsave one from the saved list: stays visible with an outline heart (undo path) until the
    // list is reopened — it does not disappear immediately (MINOR).
    const restHeart = $(`.saved-view .card[data-id="${restId}"] .heart`) as HTMLButtonElement;
    restHeart.click();
    await flush();
    expect($$('.saved-view .card')).toHaveLength(2);
    expect(restHeart.getAttribute('aria-pressed')).toBe('false');
    expect($('#saved').textContent).toBe('♥︎ 1');

    // 돌아가기 restores the mood screen it came from
    await tap('.saved-view .back');
    expect($('.saved-view')).toBeNull();
    expect($$('.card')).toHaveLength(3);

    // reopening the saved list drops the unsaved item
    await tap('#saved');
    expect($$('.saved-view .card')).toHaveLength(1);
    expect($('.saved-view .card')!.getAttribute('data-id')).toBe(newId);
  });

  it('unknown ids (not in the current data) are skipped silently in the saved list', async () => {
    window.localStorage.setItem('jeju.saved', JSON.stringify(['does-not-exist', realSpots[0].id]));
    render();
    expect($('#saved').textContent).toBe('♥︎ 2');
    await tap('#saved');
    expect($$('.saved-view .card')).toHaveLength(1);
    expect($('.saved-view .card')!.getAttribute('data-id')).toBe(realSpots[0].id);
  });

  it('gps basis, locate denied: tapping ♥ N opens the area fallback, and picking an area still renders the saved list (no dead end)', async () => {
    window.localStorage.setItem('jeju.saved', JSON.stringify([realSpots[0].id]));
    render({ locate: () => Promise.reject(new LocateError('denied')) });
    expect($('#saved').textContent).toBe('♥︎ 1');
    await tap('#saved');
    expect($$('.saved-view .card')).toHaveLength(0); // stuck waiting on a basis before the fix
    const areaBtns = $$('#sheet [data-area]').filter(visible);
    expect(areaBtns).toHaveLength(15);
    await tap('#sheet [data-area="애월"]');
    expect($('#sheet').hidden).toBe(true);
    expect($('.saved-view')).not.toBeNull();
    expect($$('.saved-view .card').map((c) => c.getAttribute('data-id'))).toEqual([realSpots[0].id]);
    expect($('#basis').textContent).toContain('애월 기준');
  });

  it('gps basis, locate denied: dismissing the area sheet without picking (닫기) un-sticks ♥ N instead of leaving it dead', async () => {
    window.localStorage.setItem('jeju.saved', JSON.stringify([realSpots[0].id]));
    render({ locate: () => Promise.reject(new LocateError('denied')) });
    await tap('#saved');
    expect($('#sheet').hidden).toBe(false);
    // close without picking an area
    await tap('#sheet .sheet-close');
    expect($('#sheet').hidden).toBe(true);
    // ♥ N must be tappable again, not stuck ignoring taps forever
    await tap('#saved');
    expect($('#sheet').hidden).toBe(false);
    const areaBtns = $$('#sheet [data-area]').filter(visible);
    expect(areaBtns).toHaveLength(15);
  });

  it('"← 돌아가기" restores the exact 3 cards shown before, not a new pick', async () => {
    render();
    await tap('[data-mood="rest"]');
    const before = cardNames();
    ($('.card .heart') as HTMLButtonElement).click();
    await flush();
    await tap('#saved');
    await tap('.saved-view .back');
    expect($('.saved-view')).toBeNull();
    expect(cardNames()).toEqual(before);
  });

  it('"♥ N" aria-label reads 저장한 곳 N개', async () => {
    render();
    await tap('[data-mood="rest"]');
    ($('.card .heart') as HTMLButtonElement).click();
    await flush();
    expect($('#saved').getAttribute('aria-label')).toBe('저장한 곳 1개');
    ($$('.card .heart')[1] as HTMLButtonElement).click();
    await flush();
    expect($('#saved').getAttribute('aria-label')).toBe('저장한 곳 2개');
  });

  it('tapping "♥ N" again while the saved list is open closes it (toggle, matches aria-pressed)', async () => {
    render();
    await tap('[data-mood="rest"]');
    const before = cardNames();
    ($('.card .heart') as HTMLButtonElement).click();
    await flush();
    await tap('#saved');
    expect($('.saved-view')).not.toBeNull();
    expect($('#saved').getAttribute('aria-pressed')).toBe('true');
    await tap('#saved');
    expect($('.saved-view')).toBeNull();
    expect($('#saved').getAttribute('aria-pressed')).toBe('false');
    expect(cardNames()).toEqual(before);
  });

  it('a mood switch racing with opening the saved list still recomputes the right (current) button\'s cards on 돌아가기, never stale ones from the button shown before the switch', async () => {
    let resolveWalk!: (p: Point) => void;
    let calls = 0;
    render({
      locate: () => {
        calls++;
        // 1st call (rest) resolves immediately; 2nd (walk, mid-switch) hangs until released below;
        // every later call resolves immediately so nothing else gets stuck.
        return calls === 2 ? new Promise<Point>((r) => (resolveWalk = r)) : Promise.resolve(ORIGINS.제주시);
      },
    });
    await tap('[data-mood="rest"]');
    ($('.card .heart') as HTMLButtonElement).click();
    await flush();

    // tap walk (its locate() call hangs) then immediately open the saved list, racing the two
    ($('[data-mood="walk"]') as HTMLElement).click();
    ($('#saved') as HTMLElement).click();
    await flush();
    await flush();
    resolveWalk(ORIGINS.제주시); // let the stale walk attempt finish late; its ticket is stale by now
    await flush();
    await flush();

    await tap('.saved-view .back');
    expect($('.saved-view')).toBeNull();
    // must show walk's cards (freshly computed), not rest's stale ones, and not crash
    expect(cardNames()).toEqual(expectedNames(ORIGINS.제주시, 'walk'));
  });
});

describe('S8-4 저장 — 저장소를 쓸 수 없을 때 (storage null/throws)', () => {
  it('heart toggling and "♥ N" still work within the session when storage.setItem throws', async () => {
    const throwingStorage: Storage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota exceeded');
      },
      removeItem: () => undefined,
      clear: () => undefined,
      key: () => null,
      length: 0,
    };
    render({ storage: throwingStorage });
    await tap('[data-mood="rest"]');
    const heart = $('.card .heart') as HTMLButtonElement;
    heart.click();
    await flush();
    expect(heart.getAttribute('aria-pressed')).toBe('true');
    expect($('#saved').hidden).toBe(false);
    expect($('#saved').textContent).toBe('♥︎ 1');

    await tap('#saved');
    expect($$('.saved-view .card')).toHaveLength(1);
  });

  it('heart toggling and "♥ N" still work when storage is null', async () => {
    render({ storage: null });
    await tap('[data-mood="walk"]');
    const heart = $('.card .heart') as HTMLButtonElement;
    heart.click();
    await flush();
    expect(heart.getAttribute('aria-pressed')).toBe('true');
    expect($('#saved').textContent).toBe('♥︎ 1');
    heart.click();
    await flush();
    expect(heart.getAttribute('aria-pressed')).toBe('false');
    expect($('#saved').hidden).toBe(true);
  });
});

describe('S8-4 위치 — GPS 실패 후 지역 시트를 닫을 때 (UX fix #4)', () => {
  it('dismissing the area sheet without picking returns to the calm start state and explains why', async () => {
    render({ locate: () => Promise.reject(new LocateError('denied')) });
    await tap('[data-mood="rest"]');
    expect($('#sheet').hidden).toBe(false);
    await tap('#sheet .sheet-close');
    expect($('#sheet').hidden).toBe(true);
    expect($$('.card')).toHaveLength(0);
    for (const b of $$('[data-mood]')) expect(b.getAttribute('aria-pressed')).toBe('false');
    expect($('#status').textContent).toBe('위치를 몰라서 못 골랐어요. 위 ⇄에서 지역을 골라 주세요');
  });
});

describe('S8 뒤로가기 (UX fix #3)', () => {
  it('opening a sheet pushes history state; closing it via the UI (닫기) pops it back — balanced, no leftover entry', async () => {
    render();
    const before = window.history.state;
    await tap('#basis');
    expect(window.history.state).toEqual({ jejuOverlay: true });
    await tap('#sheet .sheet-close');
    await flush();
    await flush();
    expect(window.history.state).toEqual(before);
  });

  it('phone back (popstate) closes an open sheet instead of leaving the app', async () => {
    render();
    await tap('#basis');
    expect($('#sheet').hidden).toBe(false);
    window.history.back();
    await flush();
    await flush();
    await flush();
    expect($('#sheet').hidden).toBe(true);
  });

  it('phone back (popstate) closes the open saved list instead of leaving the app', async () => {
    render();
    await tap('[data-mood="rest"]');
    ($('.card .heart') as HTMLButtonElement).click();
    await flush();
    await tap('#saved');
    expect($('.saved-view')).not.toBeNull();
    window.history.back();
    await flush();
    await flush();
    await flush();
    expect($('.saved-view')).toBeNull();
  });

  it('opening the stay sheet from the basis sheet does not push a second history entry (one sheet flow, one back)', async () => {
    render();
    const before = window.history.state;
    await tap('#basis');
    const afterBasis = window.history.state;
    await tap('#sheet [data-basis="stay"]'); // no 숙소 yet → nested stay-registration sheet, same sheetBox
    expect(window.history.state).toEqual(afterBasis); // still just the one pushed entry
    await tap('#sheet .sheet-close');
    await flush();
    await flush();
    expect(window.history.state).toEqual(before);
  });
});

describe('S8-2 포커스 복귀 (UX fix #6)', () => {
  it('opening the stay sheet from the basis sheet keeps the original focus-return target (the basis button)', async () => {
    render();
    ($('#basis') as HTMLElement).focus();
    await tap('#basis');
    await tap('#sheet [data-basis="stay"]');
    await tap('#sheet .sheet-close');
    expect(document.activeElement).toBe($('#basis'));
  });
});

describe('S8-5 유지', () => {
  it('첫 화면(저장 0개)에 로그인/가격/운영시간/평점 문구 없음, 카드에도 없음', async () => {
    render();
    await tap('[data-mood="food"]');
    const text = document.body.textContent ?? '';
    for (const w of ['로그인', '회원', '가입', '가격', '원)', '운영시간', '영업시간', '평점', '별점']) {
      expect(text, w).not.toContain(w);
    }
  });

  it('app shell has no fixed width wider than the 390px mobile viewport (max-width: 480px container, 16px gutters)', () => {
    const css = readFileSync(resolve(__dirname, '../src/style.css'), 'utf8');
    expect(css).toMatch(/\.app\s*\{[^}]*max-width:\s*480px/);
    expect(css).toMatch(/\.app\s*\{[^}]*padding:[^;]*16px/);
  });
});
