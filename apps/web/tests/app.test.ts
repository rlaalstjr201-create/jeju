// @vitest-environment jsdom
// S3 화면 (plans/tomorrow-picker.md) — static index.html + mountApp in jsdom, real spots.json.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AREAS, LocateError, kakaoUrl, mountApp, type App, type Deps } from '../src/app';
import { bookLink, naverSearchUrl } from '../src/links';
import { listed } from '../src/pick';
import { nearestArea } from '../src/areas';
import { cardTextProblem } from '../src/card-text';
import { cleanReason } from '../src/data';
import { dayOf } from '../src/dates';
import { pickCards, travel, travelText, type Point, type Sub } from '../src/pick';
import { splitName } from '../src/render';
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
/** Wait until a history.back() the app made has landed (jsdom delivers popstate a few tasks later). */
const settle = async () => {
  for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 5));
};

// One live mount at a time: a re-render destroys the previous one (its listeners are gone — S9-1 lifecycle).
let app: App | null = null;
/** Test clock for the double-tap guard (S35): every tap() is a separate, deliberate tap. */
let clock = 0;
function render(deps: Partial<Deps> = {}) {
  app?.destroy();
  document.body.innerHTML = body;
  app = mountApp(document, {
    loadSpots: () => Promise.resolve(fileSpots), // spots.json is already S1'-clean
    locate: () => Promise.resolve(ORIGINS.제주시),
    storage: window.localStorage,
    session: window.sessionStorage,
    now: () => clock,
    delays: { slow: 0, long: 10_000, settle: 300 }, // no escape-hatch timer racing the awaits (see harness.ts)
    ...deps,
  });
  return app;
}
async function tap(sel: string) {
  clock += 1000;
  ($(sel) as HTMLElement).click();
  await flush();
  await flush();
  clock += 1000; // a bare .click() after this is a separate tap, not the 2nd half of a double tap
}
/** Names of the cards on screen (results or saved list), by id — the drawn name splits off its "(별칭)". */
const cardNames = () =>
  $$('main > section:not([hidden]) .card:not(.ghost)').map((e) => realSpots.find((s) => s.id === e.getAttribute('data-id'))?.name);
/** How a name is drawn: "더럭초등학교(구, 더럭분교)" → "더럭초등학교 (구, 더럭분교)" with the part in brackets smaller. */
const drawnName = (name: string) => {
  const { main, alias } = splitName(name.trim());
  return alias ? `${main} ${alias}` : main;
};
// jsdom has no layout: scrolling is a no-op here.
window.scrollTo = (() => undefined) as typeof window.scrollTo;
// the app picks for today in Jeju (오일장 rank by the day, ADR-0066)
const expectedNames = (o: Point, b: Parameters<typeof pickCards>[2]) => pickCards(realSpots, o, b, {}, undefined, undefined, false, dayOf(new Date())).cards.map((c) => c.spot.name);
/** saved ids as stored (jeju.saved.v2), day by day in their order */
const storedIds = (): string[] => (JSON.parse(window.localStorage.getItem('jeju.saved.v2') ?? '[]') as { id: string }[]).map((e) => e.id);

beforeEach(() => {
  app?.destroy();
  app = null;
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState(null, '');
});

describe('S3 첫 화면', () => {
  it('only 5 mood buttons + 1 location toggle are interactive, before any data arrives', () => {
    render({ loadSpots: () => new Promise(() => undefined) }); // spots.json never loads
    const els = interactive();
    expect(els).toHaveLength(6);
    const moods = $$('[data-mood]');
    // Changed on purpose (ADR-0075 3): a mood row also carries 「예:」 once the data is in, so its name is read
    // from its own span (the 아무거나 button keeps its plain span)
    expect(moods.map((b) => b.querySelector('.label, span')!.textContent)).toEqual([
      '푹 쉬고 싶어',
      '좀 걷고 싶어',
      '새로운 거 해보고 싶어',
      '맛있는 거 먹고 싶어',
      '아무거나 골라줘',
    ]);
    expect(els).toEqual(expect.arrayContaining([...moods, $('#basis')]));
    expect($('#basis').textContent).toBe('내 위치 근처');
    expect($('#basis').getAttribute('aria-label')).toBe('내 위치 근처, 기준 바꾸기');
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
  // Changed on purpose (S12·S57, design/SPEC.md §7): the first card says where the time is measured
  // from ("여기서 …"), a spot under 1km from a GPS fix reads "걸어서", and the first card ends with where a
  // tap goes (" · 카카오맵"). 3판 (§7): the first card always keeps its own line; when the two row cards
  // are the same trip it is said once on the 아니면 line ("아니면 · 둘 다 …") and the rows have no meta
  // (was: "셋 다 …" on the first card). The time formula is unchanged.
  it('tap → 3 cards, each with image, name, reason, "차로 약 N분" (first card with its origin, rows said once if equal)', async () => {
    // one origin where the three trips differ, one where they are all the same
    for (const [origin, mood] of [
      [ORIGINS.제주시, 'walk'],
      [ORIGINS.서귀포, 'rest'],
    ] as const) {
      window.sessionStorage.clear();
      window.history.replaceState(null, '');
      render({ locate: () => Promise.resolve(origin) });
      await tap(`[data-mood="${mood}"]`);
      const cards = $$('.card');
      expect(cards).toHaveLength(3);
      const expected = pickCards(realSpots, origin, mood, {}, undefined, undefined, false, dayOf(new Date())).cards;
      const trips = expected.map((c) => travelText(travel(origin, true, c.spot)));
      const same = trips[1] === trips[2];
      const alt = $('#cards .alt');
      expect(alt.textContent).toBe(same ? `아니면\u00a0· 둘 다 ${trips[1]}` : '아니면');
      cards.forEach((card, i) => {
        const { spot, minutes } = expected[i];
        expect(card.querySelector('img')?.getAttribute('src')).toBe(spot.image);
        expect(card.querySelector('.name')?.textContent).toBe(drawnName(spot.name));
        expect(card.querySelector('.card-link')?.getAttribute('aria-label')).toBe(`${spot.name}, 네이버지도에서 보기`);
        expect(card.querySelector('.reason')?.textContent).toBe(cleanReason(spot.reason));
        expect(trips[i]).toMatch(/^(차로|걸어서) 약 \d+분$/);
        if (trips[i].includes('차로')) expect(trips[i]).toContain(`약 ${minutes}분`);
        if (i === 0) {
          const meta = `여기서 ${trips[0]}`;
          expect(card.querySelector('.travel')?.textContent).toBe(meta);
          // "·" held to the trip by a no-break space, then a normal space before 네이버지도 (ADR-0071 default)
          expect(card.querySelector('.meta')?.textContent).toBe(`${meta} · 네이버지도`);
        } else if (same) {
          expect(card.querySelector('.meta')).toBeNull();
          expect(card.querySelector('.card-link')?.getAttribute('aria-describedby')).toBe('alt-trip');
        } else {
          expect(card.querySelector('.meta')?.textContent).toBe(trips[i]);
          expect(card.querySelector('.card-link')?.hasAttribute('aria-describedby')).toBe(false);
        }
      });
    }
  });

  it('QA 2026-09-30 (§14): no screen shows the same trip line three times — 15 areas × 6 buttons × first 2 pages', async () => {
    const buttons = [['rest'], ['walk'], ['new'], ['any'], ['food', 'meal'], ['food', 'cafe']] as const;
    let screens = 0;
    const repeated: string[] = [];
    const check = (label: string) => {
      screens++;
      // each trip as drawn (the rows' shared one on the 아니면 line), "둘 다 " / "애월에서 " taken off so the
      // lead compares with the rows
      const lines = $$('#cards .card .travel, #alt-trip').map((e) => e.textContent!.replace(/^둘 다 /, '').replace(/^\S+ ?\S*에서 /, ''));
      const dests = $$('#cards .card .dest').length;
      if (lines.some((t) => lines.filter((x) => x === t).length >= 3) || dests !== 1) repeated.push(`${label}: ${lines.join(' / ')}`);
    };
    for (const a of AREAS) {
      window.localStorage.setItem('jeju.region', JSON.stringify(a.name));
      window.localStorage.setItem('jeju.basis', JSON.stringify('region'));
      window.sessionStorage.clear();
      window.history.replaceState(null, '');
      render();
      for (const [b, sub] of buttons) {
        await tap(`[data-mood="${b}"]`);
        if (sub === 'cafe') await tap('[data-sub="cafe"]');
        check(`${a.name} ${b}${sub ? `:${sub}` : ''}`);
        await tap('#cards .more');
        check(`${a.name} ${b}${sub ? `:${sub}` : ''} more`);
        await tap('#results .change');
        await settle();
      }
    }
    expect(screens).toBe(180);
    expect(repeated).toEqual([]);
  }, 120_000);

  // Changed on purpose (ADR-0071): the default map app is 네이버지도, whose card link is the "{이름} 제주" search.
  it('card link = Naver Map search (default app); target=_blank rel=noopener', async () => {
    render();
    for (const mood of MOODS) {
      await tap(`[data-mood="${mood}"]`);
      const expected = pickCards(realSpots, ORIGINS.제주시, mood, {}, undefined, undefined, false, dayOf(new Date())).cards;
      const links = $$('.card-link') as HTMLAnchorElement[];
      expect(links).toHaveLength(3);
      links.forEach((a, i) => {
        expect(a.getAttribute('href')).toBe(naverSearchUrl(expected[i].spot));
        expect(a.getAttribute('target')).toBe('_blank');
        expect(a.getAttribute('rel')).toBe('noopener');
      });
    }
  });

  // Changed on purpose (S56): the name search is scoped to 제주 so short names ('담다') don't match
  // places all over Korea; names that already say 제주/서귀포 are left as they are.
  it('search-link fallback is used exactly when kakaoPlaceId is null (scoped to 제주)', () => {
    const withId = { ...realSpots[0], kakaoPlaceId: '123' };
    const withoutId = { ...realSpots[0], name: '담다', kakaoPlaceId: null };
    expect(kakaoUrl(withId)).toBe('https://place.map.kakao.com/123');
    expect(kakaoUrl(withoutId)).toBe(`https://map.kakao.com/link/search/${encodeURIComponent('제주 담다')}`);
    expect(kakaoUrl({ ...withoutId, name: '서귀포 올레시장' })).toBe(
      `https://map.kakao.com/link/search/${encodeURIComponent('서귀포 올레시장')}`,
    );
  });

  it('booking link (ADR-0074): on every 체험 card, one verified route with honest words; none elsewhere; never the 마이리얼트립 search', async () => {
    const check = () => {
      for (const li of $$('.card')) {
        const spot = realSpots.find((s) => s.id === li.getAttribute('data-id'))!;
        const book = li.querySelectorAll<HTMLAnchorElement>('a.book');
        if (spot.mood === 'new' && spot.sub === 'do') expect(spot.book, spot.name).toBeTruthy();
        if (!spot.book) {
          expect(book).toHaveLength(0);
          continue;
        }
        expect(book).toHaveLength(1);
        const want = bookLink(spot)!;
        expect(book[0].getAttribute('href')).toBe(spot.book.u);
        expect(book[0].textContent).toBe(want.text);
        expect(['네이버로 예약하기', '마이리얼트립에서 예약', '홈페이지에서 예약 확인', '전화로 예약']).toContain(want.text);
        expect(book[0].getAttribute('aria-label')).toBe(`${spot.name.trim()}, ${want.text}`);
        expect(book[0].getAttribute('rel')).toBe('noopener');
        expect(book[0].getAttribute('target')).toBe(spot.book.u.startsWith('tel:') ? null : '_blank');
      }
      expect($('#cards')?.innerHTML).not.toContain('myrealtrip.com/search');
      return $$('a.book').length;
    };
    let seen = 0;
    for (const origin of Object.values(ORIGINS)) {
      render({ locate: () => Promise.resolve(origin) });
      for (const mood of MOODS) {
        await tap(`[data-mood="${mood}"]`);
        expect($$('.card')).toHaveLength(3);
        seen += check();
      }
    }
    expect(seen).toBeGreaterThan(0);

    // one 체험 with a route + two places without one, on the same screen
    const exp = realSpots.find((s) => s.book?.k === 'naver')!;
    const others = realSpots.filter((s) => s.mood === exp.mood && !s.book && listed(s)).slice(0, 2);
    render({ loadSpots: () => Promise.resolve([exp, ...others]), locate: () => Promise.resolve(exp) });
    await tap(`[data-mood="${exp.mood}"]`);
    expect($$('.card')).toHaveLength(3);
    expect(check()).toBe(1);
    expect($('.card a.book')?.closest('.card')?.getAttribute('data-id')).toBe(exp.id);
    expect($('.card a.book')?.textContent).toBe('네이버로 예약하기');
    expect(kakaoUrl(exp)).toBe(
      exp.kakaoPlaceId
        ? `https://place.map.kakao.com/${exp.kakaoPlaceId}`
        : `https://map.kakao.com/link/search/${encodeURIComponent(/제주|서귀포/.test(exp.name) ? exp.name : `제주 ${exp.name}`)}`,
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
          // first 3 for the mood, then "다른 3곳 보기" twice (SPEC D2: the next 3 have their own button)
          await tap(i === 0 ? `[data-mood="${mood}"]` : '#cards .more');
          for (const card of $$('.card')) {
            const name = card.querySelector('.name')?.textContent ?? '';
            const reason = card.querySelector('.reason')?.textContent ?? '';
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

  it('image load failure drops the photo box (a text card) instead of leaving it blank, and it stays dropped', async () => {
    render();
    await tap('[data-mood="rest"]');
    const card = $('.card') as HTMLElement;
    const id = card.dataset.id!;
    (card.querySelector('img') as HTMLImageElement).dispatchEvent(new Event('error'));
    expect(card.querySelector('.ph')).toBeNull();
    expect(card.classList.contains('noimg')).toBe(true);
    // the same place drawn again (바꾸기 → same mood) comes back without a photo box
    await tap('#results .change');
    await settle();
    await tap('[data-mood="rest"]');
    const again = $(`.card[data-id="${id}"]`) as HTMLElement;
    expect(again.querySelector('.ph')).toBeNull();
    expect(again.classList.contains('noimg')).toBe(true);
  });
});

describe('S3 위치', () => {
  // ADR-0029: the old 4-region fallback (제주시/서귀포/동쪽/서쪽) is replaced by the same 15-area list
  // used in the basis sheet (S8-2), grouped 제주시 쪽 / 서귀포 쪽.
  // Changed on purpose (S03·S37·S38): the list is shown in place of the cards, not in a sheet that pops
  // up by itself — a late GPS failure can no longer cover newer cards.
  it('geolocation denied → 15-area picker (제주시 쪽 8 + 서귀포 쪽 7); picking one shows cards from that area', async () => {
    render({ locate: () => Promise.reject(new LocateError('denied')) });
    await tap('[data-mood="rest"]');
    expect($$('.card')).toHaveLength(0);
    expect($('#sheet').hidden).toBe(true);
    const areaBtns = $$('#cards [data-area]').filter(visible);
    expect(areaBtns.map((b) => b.textContent)).toEqual(AREAS.map((a) => a.label + a.landmark));
    expect(areaBtns).toHaveLength(15);
    const jeju = AREAS.filter((a) => a.group === 'jeju');
    const seogwipo = AREAS.filter((a) => a.group === 'seogwipo');
    expect(jeju).toHaveLength(8);
    expect(seogwipo).toHaveLength(7);
    const 서귀포시내 = AREAS.find((a) => a.name === '서귀포시내')!;
    await tap('#cards [data-area="서귀포시내"]');
    expect($('#sheet').hidden).toBe(true);
    expect(cardNames()).toEqual(expectedNames(서귀포시내, 'rest'));
    expect($('#basis').textContent).toBe('서귀포 시내 근처');
  });

  it('숙소 via area: saved to localStorage and kept after a fresh render (basis toggle opens a sheet, S8-2)', async () => {
    const locate = vi.fn(() => Promise.resolve(ORIGINS.제주시));
    render({ locate });
    await tap('#basis'); // basis sheet: 내 위치 / 숙소 / 15개 지역
    await tap('#sheet [data-basis="stay"]'); // no 숙소 yet → registration sheet
    expect($$('#sheet button').filter(visible).map((b) => b.textContent)).toEqual(
      expect.arrayContaining(['지금 위치를 숙소로', ...AREAS.map((a) => a.label + a.landmark)]),
    );
    const 성산 = AREAS.find((a) => a.name === '성산')!;
    await tap('#sheet [data-area="성산"]');
    expect(JSON.parse(window.localStorage.getItem('jeju.stay')!)).toMatchObject({ lat: 성산.lat, lng: 성산.lng });
    expect($('#basis').textContent).toBe('숙소 근처');

    // fresh render (reload): still 숙소-based, GPS not asked
    locate.mockClear();
    render({ locate });
    expect($('#basis').textContent).toBe('숙소 근처');
    await tap('[data-mood="walk"]');
    expect(locate).not.toHaveBeenCalled();
    expect(cardNames()).toEqual(expectedNames(성산, 'walk'));
  });

  it('"지금 위치를 숙소로" stores the current position and survives a fresh render', async () => {
    const here = ORIGINS['서쪽(한림)'];
    render({ locate: () => Promise.resolve(here) });
    await tap('#basis');
    await tap('#sheet [data-basis="stay"]');
    const save = $$('#sheet button').find((b) => b.textContent === '지금 위치를 숙소로') as HTMLButtonElement;
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
    expect($('#basis').textContent).toBe('내 위치 근처');
    expect(cardNames()).toEqual(expectedNames(ORIGINS.제주시, 'any'));

    await tap('#basis');
    await tap('#sheet [data-basis="stay"]'); // already saved → switches straight back, no registration sheet
    expect($('#sheet').hidden).toBe(true);
    expect($('#basis').textContent).toBe('숙소 근처');
  });

  it('saved area basis: basis sheet → 내 위치 retries GPS (no 숙소 needed) and shows 내 위치 cards', async () => {
    window.localStorage.setItem('jeju.region', JSON.stringify('서귀포시내'));
    window.localStorage.setItem('jeju.basis', JSON.stringify('region'));
    render({ locate: () => Promise.resolve(ORIGINS.제주시) });
    expect($('#basis').textContent).toBe('서귀포 시내 근처');
    await tap('[data-mood="rest"]');
    await tap('#basis');
    await tap('#sheet [data-basis="gps"]');
    expect($('#sheet').hidden).toBe(true);
    expect($('#basis').textContent).toBe('내 위치 근처');
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

  it('GPS jitter (~150m) keeps the rotation: 다른 3곳 보기 gives the next 3, not the same 3', async () => {
    const fixes = [ORIGINS.제주시, { lat: ORIGINS.제주시.lat + 0.0012, lng: ORIGINS.제주시.lng + 0.0012 }];
    let n = 0;
    render({ locate: () => Promise.resolve(fixes[Math.min(n++, 1)]) });
    await tap('[data-mood="walk"]');
    const first = cardNames();
    await tap('#cards .more');
    expect(cardNames().filter((x) => first.includes(x))).toEqual([]);
  });

  // Changed on purpose (SPEC D2): "again" is 다른 3곳 보기; the same mood chosen again after 바꾸기
  // brings back the 3 that were being looked at.
  it('다른 3곳 보기 → none of the previous 3 cards; 바꾸기 → same mood → those 3 again', async () => {
    render();
    await tap('[data-mood="rest"]');
    const first = cardNames();
    await tap('#cards .more');
    const second = cardNames();
    expect(second).toHaveLength(3);
    expect(second.filter((n) => first.includes(n))).toEqual([]);
    await tap('#results .change');
    await settle();
    await tap('[data-mood="rest"]');
    expect(cardNames()).toEqual(second);
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

  // Changed on purpose (S43): going back to 식사 brings back the 3 places being compared, instead of
  // moving on. Next 3 is "다른 3곳 보기" (or tapping the active mood again). Histories stay separate.
  it('switching the toggle changes the 3 cards to the other sub; toggling back restores the same meal cards', async () => {
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
    expect(cardNames()).toEqual(meal1);
    // next 3 meals are still their own rotation — the cafe cards never leak in
    await tap('[data-action="more"]');
    const meal2 = cardNames();
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
    const headings = $$('#sheet .group-h > span:first-child').map((h) => h.textContent);
    expect(headings).toEqual(['언제', '어디', '얼마나', '날씨', '제주시 쪽', '서귀포 쪽']); // 얼마나: ADR-0060
    expect($('#sheet .group-h .order')?.textContent).toBe('서쪽부터');
    const areaBtns = $$('#sheet [data-area]').filter(visible) as HTMLElement[];
    expect(areaBtns.map((b) => b.dataset.area)).toEqual(AREAS.map((a) => a.name));
    expect(areaBtns.map((b) => b.textContent)).toEqual(AREAS.map((a) => a.label + a.landmark));
    // west → east inside each group, so the grid reads like a map
    for (const g of ['jeju', 'seogwipo']) {
      const lngs = AREAS.filter((a) => a.group === g).map((a) => a.lng);
      expect(lngs).toEqual([...lngs].sort((a, b) => a - b));
    }
  });

  // 3판 (§6.9, D7): each area cell names one place a traveller knows; that place's centre is nearest to the
  // area's own centre (so the landmark never points at the neighbour). Coordinates fixed in SPEC §15.2.
  it('area landmarks: 15 fixed places, each nearest to its own area; the sheet index shows name + landmark, choice by weight + check only', async () => {
    const PLACES: [string, string, number, number][] = [
      ['한경', '수월봉', 33.2948, 126.1635],
      ['한림', '협재', 33.3938, 126.2397],
      ['애월', '한담', 33.46, 126.3105],
      ['신제주', '공항 근처', 33.507, 126.4929],
      ['구제주', '동문시장', 33.5119, 126.5268],
      ['조천', '함덕', 33.5432, 126.67],
      ['구좌', '월정리', 33.5566, 126.795],
      ['우도', '배로 가는 섬', 33.5141, 126.9586],
      ['대정', '모슬포', 33.2189, 126.2486],
      ['안덕', '산방산', 33.2366, 126.3129],
      ['중문', '주상절리', 33.2383, 126.4259],
      ['서귀포시내', '올레시장', 33.2497, 126.5634],
      ['남원', '위미', 33.2707, 126.6636],
      ['표선', '성읍', 33.3851, 126.8016],
      ['성산', '일출봉', 33.4621, 126.9364],
    ];
    expect(PLACES.map((p) => p[0])).toEqual(AREAS.map((a) => a.name));
    for (const [name, landmark, lat, lng] of PLACES) {
      expect(nearestArea({ lat, lng }).name, name).toBe(name);
      expect(AREAS.find((a) => a.name === name)?.landmark).toBe(landmark);
    }
    window.localStorage.setItem('jeju.region', JSON.stringify('애월'));
    window.localStorage.setItem('jeju.basis', JSON.stringify('region'));
    render();
    await tap('#basis');
    const cells = $$('#sheet .areas .opt') as HTMLElement[];
    expect(cells).toHaveLength(15);
    expect(cells.map((c) => `${c.querySelector('.nm')?.textContent}|${c.querySelector('.lm')?.textContent}`)).toEqual(AREAS.map((a) => `${a.label}|${a.landmark}`));
    expect(cells.filter((c) => c.getAttribute('aria-pressed') === 'true').map((c) => c.dataset.area)).toEqual(['애월']);
    for (const c of cells) expect(c.querySelector('.i-check')).not.toBeNull();
    // each group is labelled by its heading
    for (const g of $$('#sheet .areas')) expect(document.getElementById(g.getAttribute('aria-labelledby')!)?.classList.contains('group-h')).toBe(true);
  });

  // D1 (design/SPEC.md §16): the label reads "<지역> 근처".
  it('picking an area sets "<지역> 근처" and it persists in localStorage across a fresh render', async () => {
    render();
    await tap('#basis');
    await tap('#sheet [data-area="한경"]');
    expect($('#basis').textContent).toBe('한경 근처');
    expect(JSON.parse(window.localStorage.getItem('jeju.region')!)).toBe('한경');
    expect(JSON.parse(window.localStorage.getItem('jeju.basis')!)).toBe('region');

    render(); // fresh mount, same storage — simulates a reload
    expect($('#basis').textContent).toBe('한경 근처');
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
    expect(storedIds()).toEqual([id]);

    heart.click();
    await flush();
    expect(heart.getAttribute('aria-pressed')).toBe('false');
    expect(navigated).toBe(false);
    expect(storedIds()).toEqual([]);
  });

  it('saves persist across a fresh render (localStorage)', async () => {
    render();
    await tap('[data-mood="walk"]');
    const id = $('.card')!.getAttribute('data-id')!;
    ($('.card .heart') as HTMLButtonElement).click();
    await flush();
    expect(storedIds()).toEqual([id]);

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

  // Changed on purpose (specs/date-mode.md): the list is in the order the user set (saved order to begin with),
  // no longer nearest first.
  it('"♥ N" appears once N > 0, opens the saved list in saved order under 오늘, allows unsave and 돌아가기', async () => {
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
    expect($('#saved').textContent).toBe('2');

    await tap('#saved');
    const savedList = $$('#savedView .card');
    expect(savedList).toHaveLength(2);
    const shownIds = savedList.map((c) => c.getAttribute('data-id'));
    expect(shownIds).toEqual([restId, newId]);
    expect($$('#savedView .day-h').map((h) => h.textContent)).toEqual(['오늘']);

    // unsave one from the saved list: stays visible with an outline heart (undo path) until the
    // list is reopened — it does not disappear immediately (MINOR).
    const restHeart = $(`#savedView .card[data-id="${restId}"] .heart`) as HTMLButtonElement;
    restHeart.click();
    await flush();
    expect($$('#savedView .card')).toHaveLength(2);
    expect(restHeart.getAttribute('aria-pressed')).toBe('false');
    expect($('#saved').textContent).toBe('1');

    // 돌아가기 restores the mood screen it came from
    await tap('#savedView .back');
    expect($('#savedView').hidden).toBe(true);
    expect($$('.card')).toHaveLength(3);

    // reopening the saved list drops the unsaved item
    await tap('#saved');
    expect($$('#savedView .card')).toHaveLength(1);
    expect($('#savedView .card')!.getAttribute('data-id')).toBe(newId);
  });

  it('unknown ids (not in the current data) are skipped silently in the saved list', async () => {
    window.localStorage.setItem('jeju.saved', JSON.stringify(['does-not-exist', realSpots[0].id]));
    render();
    expect($('#saved').textContent).toBe('2');
    await tap('#saved');
    expect($$('#savedView .card')).toHaveLength(1);
    expect($('#savedView .card')!.getAttribute('data-id')).toBe(realSpots[0].id);
  });

  // Changed on purpose (no dead end, no sheet popping up by itself): without a position the saved list
  // opens right away in saved order and says so; choosing an area via ⇄ re-sorts it in place.
  it('gps basis, locate denied: ♥ N shows the saved list, and picking an area via ⇄ keeps it open, trips from there (no dead end)', async () => {
    window.localStorage.setItem('jeju.saved', JSON.stringify([realSpots[0].id]));
    render({ locate: () => Promise.reject(new LocateError('denied')) });
    expect($('#saved').textContent).toBe('1');
    await tap('#saved');
    expect($('#sheet').hidden).toBe(true);
    expect($$('#savedView .card').map((c) => c.getAttribute('data-id'))).toEqual([realSpots[0].id]);
    // no position: no trip, the first row says only where a tap goes
    expect($('#savedView .sort')?.textContent).toBe('');
    expect($('#savedView .meta')?.textContent).toBe('네이버지도');
    await tap('#basis');
    await tap('#sheet [data-area="애월"]');
    await settle();
    expect($('#sheet').hidden).toBe(true);
    expect($('#savedView').hidden).toBe(false);
    expect($$('#savedView .card').map((c) => c.getAttribute('data-id'))).toEqual([realSpots[0].id]);
    expect($('#savedView .travel')?.textContent).toMatch(/^애월에서 /);
    expect($('#basis').textContent).toBe('애월 근처');
  });

  // Replaces "dismissing the area sheet un-sticks ♥ N": there is no auto sheet any more; ♥ N keeps
  // toggling the list with GPS denied.
  it('gps basis, locate denied: ♥ N keeps opening and closing the list (never stuck)', async () => {
    window.localStorage.setItem('jeju.saved', JSON.stringify([realSpots[0].id]));
    render({ locate: () => Promise.reject(new LocateError('denied')) });
    await tap('#saved');
    expect($('#savedView').hidden).toBe(false);
    await tap('#saved');
    expect($('#savedView').hidden).toBe(true);
    await tap('#saved');
    expect($('#savedView').hidden).toBe(false);
    expect($('#sheet').hidden).toBe(true);
  });

  it('"돌아가기" restores the exact 3 cards shown before, not a new pick', async () => {
    render();
    await tap('[data-mood="rest"]');
    const before = cardNames();
    ($('.card .heart') as HTMLButtonElement).click();
    await flush();
    await tap('#saved');
    await tap('#savedView .back');
    expect($('#savedView').hidden).toBe(true);
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
    expect($('#savedView').hidden).toBe(false);
    expect($('#saved').getAttribute('aria-pressed')).toBe('true');
    await tap('#saved');
    expect($('#savedView').hidden).toBe(true);
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

    await tap('#savedView .back');
    expect($('#savedView').hidden).toBe(true);
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
    expect($('#saved').textContent).toBe('1');

    await tap('#saved');
    expect($$('#savedView .card')).toHaveLength(1);
  });

  it('heart toggling and "♥ N" still work when storage is null', async () => {
    render({ storage: null });
    await tap('[data-mood="walk"]');
    const heart = $('.card .heart') as HTMLButtonElement;
    heart.click();
    await flush();
    expect(heart.getAttribute('aria-pressed')).toBe('true');
    expect($('#saved').textContent).toBe('1');
    heart.click();
    await flush();
    expect(heart.getAttribute('aria-pressed')).toBe('false');
    expect($('#saved').hidden).toBe(true);
  });
});

// Replaces "GPS 실패 후 지역 시트를 닫을 때": the failure is explained in place of the cards with the
// area list right there (S03) — nothing to dismiss, and the pressed mood and the message agree.
describe('S8-4 위치 — GPS 실패 안내 (UX fix #4 → S03)', () => {
  it('GPS denied: the pressed mood shows why there are no cards and what to do, in place', async () => {
    render({ locate: () => Promise.reject(new LocateError('denied')) });
    await tap('[data-mood="rest"]');
    expect($('#sheet').hidden).toBe(true);
    expect($$('.card')).toHaveLength(0);
    expect($('#results').hidden).toBe(false);
    expect($('#crumb').textContent).toBe('푹 쉬고 싶어');
    expect($('.notice-t')?.textContent).toBe('위치 권한이 꺼져 있어요.');
    expect($('.notice-b')?.textContent).toBe('동네를 고르면 거기서 가까운 곳을 보여 드려요.');
    expect($$('#cards [data-area]')).toHaveLength(15);
  });
});

describe('S8 뒤로가기 (UX fix #3)', () => {
  // Changed on purpose: history.state now names the route ({view, overlay, depth}) instead of a bare flag.
  it('opening a sheet pushes history state; closing it via the UI (닫기) pops it back — balanced, no leftover entry', async () => {
    render();
    const before = window.history.state;
    await tap('#basis');
    expect(window.history.state).toEqual({ jeju: 1, view: 'home', overlay: 'basis', depth: 1 });
    await tap('#sheet .sheet-close');
    await settle();
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
    expect($('#savedView').hidden).toBe(false);
    window.history.back();
    await flush();
    await flush();
    await flush();
    expect($('#savedView').hidden).toBe(true);
  });

  // Changed on purpose: the entry is *replaced* (its overlay now says 'stay'), so compare depth and length.
  it('opening the stay sheet from the basis sheet does not push a second history entry (one sheet flow, one back)', async () => {
    render();
    const before = window.history.state;
    await tap('#basis');
    const length = window.history.length;
    await tap('#sheet [data-basis="stay"]'); // no 숙소 yet → nested stay-registration sheet, same sheetBox
    expect(window.history.length).toBe(length); // still just the one pushed entry
    expect(window.history.state).toMatchObject({ overlay: 'stay', depth: 1 });
    await tap('#sheet .sheet-close');
    await settle();
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
