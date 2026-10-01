// @vitest-environment jsdom
// ADR-0067 (specs/drive-and-agents.md): 길찾기 in one tap from every card (D1·D2), and the deep link an AI agent
// can hand a user (D4·D5).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AREAS, areaByName } from '../src/areas';
import { addDays } from '../src/dates';
import { readDeepLink } from '../src/deeplink';
import { backupUrl, readBackup } from '../src/keep';
import { MAP_APPS, TERMINALS, directionsUrl, goLink, kakaoUrl, naverDirectionsUrl, naverSearchUrl, placeUrl, tmapUrl, walkDirectionsUrl } from '../src/links';
import { islandOf, pickCards } from '../src/pick';
import { realSpots } from './fixtures';
import { $, $$, current, flush, render, reset, settle, tap, today } from './harness';

const TODAY = today();
async function until(cond: () => boolean) {
  for (let i = 0; i < 50 && !cond(); i++) await flush();
  expect(cond()).toBe(true);
}
const spot = realSpots.find((s) => !s.bookable)!;

describe('D1 directionsUrl — Kakao car directions to the spot, from where the phone is', () => {
  it('coordinates → map.kakao.com/link/to/{name},{lat},{lng}', () => {
    const s = { ...spot, name: '협재해수욕장', lat: 33.394, lng: 126.239 };
    expect(directionsUrl(s)).toBe(`https://map.kakao.com/link/to/${encodeURIComponent('협재해수욕장')},33.394,126.239`);
  });

  it('a comma or slash in the name (the link’s separators) becomes a space; whitespace collapses', () => {
    const s = { ...spot, name: '되도록 채식, 칠분의오', lat: 33.4, lng: 126.5 };
    expect(directionsUrl(s)).toBe(`https://map.kakao.com/link/to/${encodeURIComponent('되도록 채식 칠분의오')},33.4,126.5`);
    expect(directionsUrl({ ...s, name: '우연히,그곳 / 카페' })).toBe(`https://map.kakao.com/link/to/${encodeURIComponent('우연히 그곳 카페')},33.4,126.5`);
  });

  it('no usable coordinates (not finite, outside Jeju) → the search link the card already falls back to', () => {
    const noId = { ...spot, name: '담다', kakaoPlaceId: null };
    expect(directionsUrl({ ...noId, lat: NaN, lng: 126.5 })).toBe(kakaoUrl(noId));
    expect(directionsUrl({ ...noId, lat: 37.5, lng: 127 })).toBe(`https://map.kakao.com/link/search/${encodeURIComponent('제주 담다')}`);
    expect(directionsUrl({ ...spot, kakaoPlaceId: '123', lat: NaN, lng: NaN })).toMatch(/^https:\/\/map\.kakao\.com\/link\/search\//);
  });

  it('every shipped place gets a car-directions link', () => {
    const bad = realSpots.filter((s) => !directionsUrl(s).startsWith('https://map.kakao.com/link/to/'));
    expect(bad.map((s) => s.name)).toEqual([]);
  });
});

describe('D2 길찾기 on every card', () => {
  const noNav = (e: Event) => e.preventDefault();
  beforeEach(() => {
    reset();
    document.addEventListener('click', noNav);
  });
  afterEach(() => document.removeEventListener('click', noNav));

  // Changed on purpose (ADR-0071): the default app is 네이버지도 — its card link (search) and its words.
  it('results: one 길찾기 per card, after the meta and before the booking link; the card link and 네이버지도 stay', async () => {
    render();
    await tap('[data-mood="new"]');
    const cards = $$('#cards .card:not(.ghost)');
    expect(cards).toHaveLength(3);
    const { origin, reach } = current().state().cards!;
    for (const c of cards) {
      const s = realSpots.find((x) => x.id === c.dataset.id)!;
      const go = c.querySelectorAll<HTMLAnchorElement>('a.go');
      const want = goLink(s, origin.point, reach === 'walk', origin.isPoint);
      expect(go).toHaveLength(1);
      expect(go[0].textContent).toBe(want.text);
      expect(go[0].classList.contains('tbtn')).toBe(true);
      expect(go[0].getAttribute('href')).toBe(want.href);
      expect(go[0].getAttribute('target')).toBe('_blank');
      expect(go[0].getAttribute('rel')).toBe('noopener');
      expect(go[0].getAttribute('aria-label')).toBe(`${s.name.trim()}, 네이버지도 ${want.mode === 'foot' ? '도보' : '자동차'} 길찾기`);
      expect(c.querySelector('.card-link')!.getAttribute('href')).toBe(naverSearchUrl(s));
      const meta = c.querySelector('.meta');
      if (meta) expect(meta.compareDocumentPosition(go[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      const book = c.querySelector('a.book');
      if (book) expect(go[0].compareDocumentPosition(book) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect($$('#cards .dest').map((d) => d.textContent)).toEqual(['네이버지도']);
  });

  it('saved list rows have it too', async () => {
    render();
    await tap('[data-mood="rest"]');
    await tap($$('#cards .heart')[0]);
    await tap('#saved');
    await until(() => $$('#savedView .card:not(.ghost)').length === 1);
    const row = $('#savedView .card');
    const s = realSpots.find((x) => x.id === row.dataset.id)!;
    const o = current().state().savedList!.origin!;
    expect(row.querySelector('a.go')?.getAttribute('href')).toBe(goLink(s, o.point, current().state().reach === 'walk', o.isPoint).href);
  });

  it('a tap on 길찾기 is counted as `map` (ADR-0061), a double tap once', async () => {
    const sent: Record<string, unknown>[] = [];
    const beacon = vi.fn((_u: string, body: string) => (sent.push(...(JSON.parse(body) as Record<string, unknown>[])), true));
    render({ eventsUrl: 'https://events.test/e', beacon });
    await tap('[data-mood="rest"]');
    const go = $<HTMLAnchorElement>('#cards a.go');
    const id = go.closest<HTMLElement>('.card')!.dataset.id;
    go.click();
    go.click();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    delete (document as unknown as Record<string, unknown>).visibilityState;
    expect(sent.filter((e) => e.e === 'map' && e.id === id)).toHaveLength(1);
  });
});

describe('D4 readDeepLink', () => {
  it('every key, the example from the ADR', () => {
    const d = addDays(TODAY, 2);
    expect(readDeepLink(`?mood=walk&area=aewol&reach=drive30&date=${d}&indoor=1`, TODAY)).toEqual({ mood: 'walk', area: '애월', reach: 'drive30', when: d, indoor: true });
  });

  it('the 15 area slugs (specs/seo-landing.md) map to the 15 areas in order; 한글 키 and here too', () => {
    const slugs = 'hangyeong hallim aewol sinjeju gujeju jocheon gujwa udo daejeong andeok jungmun seogwipo namwon pyoseon seongsan'.split(' ');
    expect(AREAS.map((a) => a.slug)).toEqual(slugs);
    slugs.forEach((slug, i) => expect(readDeepLink(`?area=${slug}`, TODAY)).toEqual({ area: AREAS[i].name }));
    expect(readDeepLink(`?area=${encodeURIComponent('서귀포시내')}`, TODAY)).toEqual({ area: '서귀포시내' });
    expect(readDeepLink('?area=here', TODAY)).toEqual({ area: 'here' });
    expect(readDeepLink('?area=AEWOL', TODAY)).toEqual({ area: '애월' });
    expect(areaByName(readDeepLink('?area=seogwipo', TODAY)!.area)?.label).toBe('서귀포 시내');
  });

  it('moods, ranges, indoor 1/0', () => {
    for (const m of ['rest', 'walk', 'new', 'food', 'any']) expect(readDeepLink(`?mood=${m}`, TODAY)).toEqual({ mood: m });
    for (const r of ['walk', 'drive30', 'drive60']) expect(readDeepLink(`?reach=${r}`, TODAY)).toEqual({ reach: r });
    expect(readDeepLink('?indoor=1', TODAY)).toEqual({ indoor: true });
    expect(readDeepLink('?indoor=0', TODAY)).toEqual({ indoor: false });
  });

  it('date: today = 지금, tomorrow … +365 = that day; yesterday, +366, not a day = ignored', () => {
    expect(readDeepLink(`?date=${TODAY}`, TODAY)).toEqual({ when: 'now' });
    expect(readDeepLink(`?date=${addDays(TODAY, 1)}`, TODAY)).toEqual({ when: addDays(TODAY, 1) });
    expect(readDeepLink(`?date=${addDays(TODAY, 365)}`, TODAY)).toEqual({ when: addDays(TODAY, 365) });
    for (const bad of [addDays(TODAY, -1), addDays(TODAY, 366), '2026-02-30', 'tomorrow', '']) expect(readDeepLink(`?date=${bad}`, TODAY)).toBeNull();
  });

  it('a bad value drops only its key; unknown keys and an empty query are no link', () => {
    expect(readDeepLink('?mood=sleep&area=aewol&reach=drive90&indoor=yes', TODAY)).toEqual({ area: '애월' });
    expect(readDeepLink('?mood=%E0%A4%A&area=nowhere', TODAY)).toBeNull();
    expect(readDeepLink('?utm_source=chatgpt.com', TODAY)).toBeNull();
    expect(readDeepLink('', TODAY)).toBeNull();
    expect(readDeepLink('?mood=walk&mood=rest', TODAY)).toEqual({ mood: 'walk' });
    expect(readDeepLink('?mood=%20Walk%20', TODAY)).toEqual({ mood: 'walk' });
  });
});

describe('D5 opening a deep link', () => {
  beforeEach(() => reset());
  afterEach(() => window.history.replaceState(null, '', '/'));
  const open = (q: string, deps: Parameters<typeof render>[0] = {}) => {
    window.history.replaceState(null, '', `/${q}`);
    return render(deps);
  };

  it('?mood=walk&area=aewol&reach=drive60&indoor=1 → the results for 애월, 걷기, 1시간, 실내; query gone; settings kept', async () => {
    const locate = vi.fn(() => Promise.resolve({ lat: 33.5, lng: 126.5 }));
    open('?mood=walk&area=aewol&reach=drive60&indoor=1', { locate });
    await until(() => $$('#cards .card:not(.ghost)').length === 3);
    const 애월 = areaByName('애월')!;
    const exp = pickCards(realSpots, 애월, 'walk', {}, undefined, 'drive60', true, TODAY).cards.map((c) => c.spot.id);
    expect($$('#cards .card').map((c) => c.dataset.id)).toEqual(exp);
    expect(locate).not.toHaveBeenCalled();
    expect(location.search).toBe('');
    expect(current().state()).toMatchObject({ view: 'cards', mood: 'walk', basis: 'region', region: '애월', reach: 'drive60', indoor: true });
    expect(localStorage.getItem('jeju.basis')).toBe('"region"');
    expect(localStorage.getItem('jeju.region')).toBe('"애월"');
    expect(localStorage.getItem('jeju.reach')).toBe('"drive60"');
    expect(sessionStorage.getItem('jeju.indoor')).toBe('true');
    expect($('#basis').textContent).toContain('애월');
    // back = the first screen (the moods), as after a tap
    window.history.back();
    await settle();
    expect(current().state().view).toBe('home');
  });

  it('a date sets 언제; no mood = the first screen with the settings applied, nothing asked', async () => {
    const d = addDays(TODAY, 3);
    const locate = vi.fn(() => Promise.resolve({ lat: 33.5, lng: 126.5 }));
    open(`?area=seongsan&date=${d}`, { locate });
    await flush();
    expect(current().state()).toMatchObject({ view: 'home', basis: 'region', region: '성산', when: d });
    expect(localStorage.getItem('jeju.when')).toBe(JSON.stringify(d));
    expect(locate).not.toHaveBeenCalled();
    expect(location.search).toBe('');
  });

  it('area=here asks for the position as a tap does; bad values are ignored', async () => {
    localStorage.setItem('jeju.basis', '"region"');
    localStorage.setItem('jeju.region', '"한림"');
    const locate = vi.fn(() => Promise.resolve({ lat: 33.4996, lng: 126.5312 }));
    open('?mood=rest&area=here&reach=far&date=yesterday', { locate });
    await until(() => $$('#cards .card:not(.ghost)').length === 3);
    expect(locate).toHaveBeenCalled();
    expect(current().state()).toMatchObject({ mood: 'rest', basis: 'gps', reach: 'drive30' });
  });

  it('without area the stored basis is used; a link of nothing but junk changes nothing', async () => {
    localStorage.setItem('jeju.basis', '"region"');
    localStorage.setItem('jeju.region', '"한림"');
    open('?mood=food');
    await until(() => $$('#cards .card:not(.ghost)').length === 3);
    expect(current().state()).toMatchObject({ mood: 'food', basis: 'region', region: '한림' });
    reset();
    open('?mood=nap&utm_source=x');
    await flush();
    expect(current().state().view).toBe('home');
    expect(location.search).toBe('');
  });

  it('a reload of the results entry restores the session, the link is not applied again', async () => {
    open('?mood=walk&area=aewol');
    await until(() => $$('#cards .card:not(.ghost)').length === 3);
    const ids = $$('#cards .card').map((c) => c.dataset.id);
    const pushed = history.length;
    render(); // reload: the address no longer has the query, the history entry is the results
    await until(() => $$('#cards .card:not(.ghost)').length === 3);
    expect(current().state()).toMatchObject({ view: 'cards', mood: 'walk', region: '애월' });
    expect($$('#cards .card').map((c) => c.dataset.id)).toEqual(ids);
    expect(history.length).toBe(pushed);
  });

  it('with a #s= backup link both apply', async () => {
    open('?area=udo#s=AQ');
    await flush();
    expect(current().state()).toMatchObject({ basis: 'region', region: '우도' });
    expect(location.search).toBe('');
  });
});

describe('D6 what agents read: llms.txt and the home JSON-LD', () => {
  const read = (f: string) => readFileSync(resolve(__dirname, '..', f), 'utf8');

  it('llms.txt: brand first, every deep-link value the app reads, source, what we do not do', () => {
    const t = read('public/llms.txt');
    expect(t.startsWith('# 여행계획짜기 귀찮아:제주\n')).toBe(true);
    for (const a of AREAS) expect(t, a.slug).toContain(`${a.slug}(`);
    for (const v of ['rest', 'walk', 'new', 'food', 'any', 'here', 'drive30', 'drive60', 'indoor', 'YYYY-MM-DD']) expect(t, v).toContain(v);
    expect(t).toContain('비짓제주(제주관광공사)');
    expect(t).not.toMatch(/공공누리 1유형/);
    for (const v of ['일정·코스', '평점', '광고']) expect(t, v).toContain(v);
    // every example link opens a result
    const examples = [...t.matchAll(/`(\/\?[^`]+)`/g)].map((m) => m[1]).filter((u) => !u.includes('…'));
    expect(examples.length).toBeGreaterThanOrEqual(3);
    for (const u of examples) expect(readDeepLink(u.slice(1), '2026-10-01')?.mood, u).toBeDefined();
  });

  it('index.html: valid JSON-LD, WebApplication with a SearchAction whose template is the deep link', () => {
    const html = read('index.html');
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
    expect(blocks).toHaveLength(1);
    const graph = blocks[0]['@graph'] as Record<string, unknown>[];
    expect(graph.map((g) => g['@type'])).toEqual(['WebSite', 'WebApplication']);
    const app = graph[1] as { name: string; potentialAction: { '@type': string; target: { urlTemplate: string } } };
    expect(app.name).toBe('여행계획짜기 귀찮아:제주');
    expect(app.potentialAction['@type']).toBe('SearchAction');
    const tpl = app.potentialAction.target.urlTemplate;
    expect(tpl).toBe('__SITE__/?mood={mood}&area={area}&reach={reach}&date={date}&indoor={indoor}');
    const filled = tpl.replace('__SITE__/', '').replace('{mood}', 'walk').replace('{area}', 'aewol').replace('{reach}', 'drive30').replace('{date}', '2026-10-01').replace('{indoor}', '1');
    expect(readDeepLink(filled, '2026-10-01')).toEqual({ mood: 'walk', area: '애월', reach: 'drive30', when: 'now', indoor: true });
  });
});

// ADR-0069: 걸어서 → Kakao walking directions; a small island's card → the pier its boat leaves from.
describe('D8 walkDirectionsUrl — Kakao walking directions with no start (the phone stays private)', () => {
  it('m.map.kakao.com/scheme/route?ep={lat},{lng}&en={name}&by=foot, no sp', () => {
    const s = { ...spot, name: '동문재래시장', lat: 33.5122, lng: 126.5272 };
    const u = walkDirectionsUrl(s);
    expect(u).toBe(`https://m.map.kakao.com/scheme/route?ep=33.5122,126.5272&en=${encodeURIComponent('동문재래시장')}&by=foot`);
    expect(new URL(u).searchParams.has('sp')).toBe(false);
  });
  it('no usable coordinates → the name search, like directionsUrl', () => {
    const s = { ...spot, lat: NaN, lng: NaN };
    expect(walkDirectionsUrl(s)).toBe(directionsUrl(s));
  });
});

describe('D9 goLink — which 길찾기 a card gets', () => {
  const at = (lat: number, lng: number) => ({ lat, lng });
  const main = realSpots.find((s) => !islandOf(s) && s.lat > 33.5 && s.lat < 33.52)!;

  it('walking reach and within it → foot; beyond it (the whole-island fill) → car; a card under 1km from a position → foot', () => {
    const near = at(main.lat + 0.005, main.lng); // ~550m
    const far = at(main.lat - 0.2, main.lng); // ~22km
    expect(goLink(main, near, true, false, 'kakao')).toMatchObject({ mode: 'foot', text: '길찾기', href: walkDirectionsUrl(main) });
    expect(goLink(main, far, true, false, 'kakao')).toMatchObject({ mode: 'car', href: directionsUrl(main) });
    expect(goLink(main, near, false, false, 'kakao')).toMatchObject({ mode: 'car', href: directionsUrl(main) });
    expect(goLink(main, near, false, true, 'kakao')).toMatchObject({ mode: 'foot', href: walkDirectionsUrl(main) });
    expect(goLink(main, null, true, true, 'kakao')).toMatchObject({ mode: 'car', href: directionsUrl(main) });
  });

  it('every island spot, from the main island or with no position → its pier, 「배 타는 곳까지 길찾기」; from the same island → the spot', () => {
    const islandSpots = realSpots.filter((s) => islandOf(s));
    expect(islandSpots.length).toBe(86); // 비양도 itself counts since corrections-02 (ADR-0071)
    expect(islandOf(realSpots.find((x) => x.name === '비양도')!)).toBe('비양도');
    for (const s of islandSpots) {
      const t = TERMINALS[islandOf(s)!];
      for (const from of [at(33.4996, 126.5312), null]) {
        const g = goLink(s, from, false, false, 'kakao');
        expect(g.text, s.name).toBe('배 타는 곳까지 길찾기');
        expect(g.terminal).toBe(t.name);
        expect(g.href).toBe(directionsUrl({ ...s, name: t.name, lat: t.lat, lng: t.lng }));
      }
      expect(goLink(s, s, false, true)).toMatchObject({ text: '길찾기', terminal: undefined });
    }
  });

  it('piers: one per island, on the main island, inside Jeju (link/to, not the name search)', () => {
    for (const [island, t] of Object.entries(TERMINALS)) {
      expect(islandOf(t), island).toBeNull();
      expect(directionsUrl({ ...spot, ...t }), island).toMatch(/^https:\/\/map\.kakao\.com\/link\/to\//);
    }
    expect(Object.keys(TERMINALS).sort()).toEqual(['가파도', '마라도', '비양도', '우도', '차귀도', '추자도'].sort());
  });

  it('no link ever carries the start: the position is never in an href (every map app)', () => {
    const from = at(33.51234, 126.52345);
    for (const s of realSpots.slice(0, 400).concat(realSpots.filter((x) => islandOf(x)))) {
      for (const walk of [true, false]) {
        for (const app of MAP_APPS) {
          const { href } = goLink(s, from, walk, true, app);
          expect(href).not.toContain('33.51234');
          expect(href).not.toContain('126.52345');
          expect(href).not.toMatch(/[?&]sp=/);
          expect(href).not.toMatch(/\/directions\/[^-]/); // Naver: the start slot stays `-`
        }
      }
    }
  });
});

describe('D10 the app: 걸어서 cards walk, island cards go to the pier', () => {
  beforeEach(() => reset());
  afterEach(() => window.history.replaceState(null, '', '/'));
  const open = (q: string) => {
    window.history.replaceState(null, '', `/${q}`);
    return render();
  };

  it('?area=here&reach=walk: every card 길찾기 is Naver walking directions (default app), said 도보', async () => {
    open('?mood=food&area=here&reach=walk');
    await until(() => $$('#cards .card:not(.ghost)').length === 3);
    const { origin } = current().state().cards!;
    for (const c of $$('#cards .card')) {
      const s = realSpots.find((x) => x.id === c.dataset.id)!;
      const go = c.querySelector<HTMLAnchorElement>('a.go')!;
      const want = goLink(s, origin.point, true, origin.isPoint);
      expect(go.getAttribute('href')).toBe(want.href);
      if (want.mode === 'foot') {
        expect(go.getAttribute('href')).toMatch(/^https:\/\/map\.naver\.com\/p\/directions\/-\/126\.\d+,33\.\d+,[^/]+,,\/-\/walk$/);
        expect(go.getAttribute('aria-label')).toBe(`${s.name.trim()}, 네이버지도 도보 길찾기`);
      }
    }
    expect($$('#cards a.go').some((a) => a.getAttribute('href')!.endsWith('/walk'))).toBe(true);
  });

  it('the 차귀도 card seen from 한경 → 「배 타는 곳까지 길찾기」 to 자구내포구; a 우도 card seen from 우도 → the place itself', async () => {
    // the one main-island area whose results hold an island place (한경 · 새로운 거 · 차로 30분)
    expect(pickCards(realSpots, areaByName('한경')!, 'new', {}, undefined, 'drive30', false, TODAY).cards.some((c) => islandOf(c.spot) === '차귀도')).toBe(true);
    open('?mood=new&area=hangyeong&reach=drive30');
    await until(() => $$('#cards .card:not(.ghost)').length === 3);
    const isle = $$('#cards .card').find((c) => islandOf(realSpots.find((x) => x.id === c.dataset.id)!) === '차귀도')!;
    const go = isle.querySelector<HTMLAnchorElement>('a.go')!;
    const t = TERMINALS.차귀도;
    expect(go.textContent).toBe('배 타는 곳까지 길찾기');
    expect(go.getAttribute('href')).toBe(`https://map.naver.com/p/directions/-/${t.lng},${t.lat},${encodeURIComponent(t.name)},,/-/car`);
    expect(go.getAttribute('aria-label')).toBe(`차귀도, 배 타는 곳 ${t.name}까지 네이버지도 자동차 길찾기`);
    for (const c of $$('#cards .card').filter((x) => x !== isle)) expect(c.querySelector('a.go')!.textContent).toBe('길찾기');

    reset();
    const 우도 = areaByName('우도')!;
    const m = (['rest', 'walk', 'new', 'food', 'any'] as const).find((x) => pickCards(realSpots, 우도, x, {}, undefined, 'drive30', false, TODAY).cards.some((c) => islandOf(c.spot) === '우도'))!;
    open(`?mood=${m}&area=udo&reach=drive30`);
    await until(() => $$('#cards .card:not(.ghost)').length === 3);
    const udo = $$('#cards .card').filter((c) => islandOf(realSpots.find((x) => x.id === c.dataset.id)!) === '우도');
    expect(udo.length).toBeGreaterThan(0);
    for (const c of udo) expect(c.querySelector('a.go')!.textContent).toBe('길찾기');
  });
});

// ADR-0071: 네이버지도 first; 카카오맵 · TMAP chosen at the foot of 저장한 곳, remembered, carried in the backup link.
describe('D11 지도 앱 — Naver Map by default, Kakao Map or TMAP by choice', () => {
  const s = { ...spot, name: '협재해수욕장', lat: 33.394, lng: 126.239, kakaoPlaceId: '8159415' };

  it('Naver: directions with the end only (start `-`), car or walk; place info = the "{이름} 제주" search', () => {
    expect(naverDirectionsUrl(s, 'car')).toBe(`https://map.naver.com/p/directions/-/126.239,33.394,${encodeURIComponent('협재해수욕장')},,/-/car`);
    expect(naverDirectionsUrl(s, 'foot')).toBe(`https://map.naver.com/p/directions/-/126.239,33.394,${encodeURIComponent('협재해수욕장')},,/-/walk`);
    expect(naverDirectionsUrl({ ...s, name: '우연히,그곳 / 카페' }, 'car')).toContain(`/-/126.239,33.394,${encodeURIComponent('우연히 그곳 카페')},,/-/car`);
    expect(naverSearchUrl(s)).toBe(`https://map.naver.com/p/search/${encodeURIComponent('협재해수욕장 제주')}`);
    expect(naverSearchUrl({ ...s, name: '서귀포 올레시장' })).toBe(`https://map.naver.com/p/search/${encodeURIComponent('서귀포 올레시장')}`);
    expect(naverDirectionsUrl({ ...s, lat: NaN }, 'car')).toBe(naverSearchUrl(s));
  });

  it('TMAP: its app scheme, end only (goalx = lng, goaly = lat); no coordinates → the Naver search', () => {
    expect(tmapUrl(s)).toBe(`tmap://route?goalname=${encodeURIComponent('협재해수욕장')}&goalx=126.239&goaly=33.394`);
    expect(tmapUrl({ ...s, lat: 37.5, lng: 127 })).toBe(naverSearchUrl(s));
  });

  it('placeUrl: Kakao keeps its place page; Naver and TMAP open the Naver search', () => {
    expect(placeUrl(s, 'kakao')).toBe(kakaoUrl(s));
    expect(placeUrl(s, 'naver')).toBe(naverSearchUrl(s));
    expect(placeUrl(s, 'tmap')).toBe(naverSearchUrl(s));
  });

  it('goLink per app: car · walk · pier; TMAP walks open in Naver (its scheme has no walking mode)', () => {
    const near = { lat: s.lat + 0.005, lng: s.lng };
    expect(goLink(s, near, true, false)).toMatchObject({ app: 'naver', mode: 'foot', href: naverDirectionsUrl(s, 'foot') });
    expect(goLink(s, null, false, false)).toMatchObject({ app: 'naver', mode: 'car', href: naverDirectionsUrl(s, 'car') });
    expect(goLink(s, near, true, false, 'kakao')).toMatchObject({ app: 'kakao', href: walkDirectionsUrl(s) });
    expect(goLink(s, null, false, false, 'tmap')).toMatchObject({ app: 'tmap', mode: 'car', href: tmapUrl(s) });
    expect(goLink(s, near, true, false, 'tmap')).toMatchObject({ app: 'naver', mode: 'foot', href: naverDirectionsUrl(s, 'foot') });
    const isle = realSpots.find((x) => islandOf(x) === '우도')!;
    const t = TERMINALS.우도;
    const pier = { ...isle, name: t.name, lat: t.lat, lng: t.lng };
    for (const app of MAP_APPS) {
      const g = goLink(isle, null, false, false, app);
      expect(g.text).toBe('배 타는 곳까지 길찾기');
      expect(g.href).toBe(app === 'kakao' ? directionsUrl(pier) : app === 'tmap' ? tmapUrl(pier) : naverDirectionsUrl(pier, 'car'));
    }
  });

  it('the setting: one line at the foot of 저장한 곳, 네이버지도 pressed first; a tap switches every link, is kept, and rides in the backup', async () => {
    render();
    await tap('[data-mood="rest"]');
    await tap($$('#cards .heart')[0]);
    await tap('#saved');
    await until(() => $$('#savedView .card:not(.ghost)').length === 1);
    const btns = $$('#savedView .mapapp button');
    expect(btns.map((b) => b.textContent)).toEqual(['네이버지도', '카카오맵', 'TMAP']);
    expect(btns.map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false']);
    expect($('#savedView .mapapp').closest('#savedView')).not.toBeNull();
    const row = $('#savedView .card');
    const id = row.dataset.id!;
    const sp = realSpots.find((x) => x.id === id)!;
    expect(row.querySelector('.card-link')!.getAttribute('href')).toBe(naverSearchUrl(sp));

    await tap('#savedView [data-app="kakao"]');
    expect(btns.map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false']);
    expect(window.localStorage.getItem('jeju.mapApp')).toBe('"kakao"');
    expect(row.querySelector('.card-link')!.getAttribute('href')).toBe(kakaoUrl(sp));
    expect(row.querySelector('.card-link')!.getAttribute('aria-label')).toBe(`${sp.name.trim()}, 카카오맵에서 보기`);
    expect(row.querySelector('.dest')?.textContent).toBe('카카오맵');
    expect(row.querySelector('a.go')!.getAttribute('aria-label')).toMatch(/카카오맵 (자동차|도보) 길찾기$/);
    expect($('#mapAppNote').textContent).toBe('');

    await tap('#savedView [data-app="tmap"]');
    expect($('#mapAppNote').textContent).toContain('TMAP은 앱이 있어야 열려요');
    expect(row.querySelector('.dest')?.textContent).toBe('네이버지도');
    const st = current().state();
    const o = st.savedList!.origin;
    expect(row.querySelector('a.go')!.getAttribute('href')).toBe(goLink(sp, o?.point ?? null, st.reach === 'walk', o?.isPoint ?? false, 'tmap').href);

    // back on the results the cards follow too
    await tap('[data-action="close-saved"]');
    await until(() => $$('#cards .card:not(.ghost)').length === 3);
    expect($('#cards .dest')?.textContent).toBe('네이버지도');
    await tap('#saved');
    await tap('#savedView [data-app="kakao"]');
    await tap('[data-action="close-saved"]');
    await until(() => $$('#cards .card:not(.ghost)').length === 3);
    expect($('#cards .dest')?.textContent).toBe('카카오맵');
    for (const a of $$('#cards .card-link')) expect(a.getAttribute('href')).toMatch(/^https:\/\/(place\.map|map)\.kakao\.com\//);

    // kept: a new visit starts with 카카오맵
    current().destroy();
    render();
    expect(current().state().mapApp).toBe('kakao');
  });

  it('backup link: &m=kakao / &m=tmap when not 네이버지도 (the default link is as before); opening one switches the app', async () => {
    const list = [{ id: realSpots[0].id, date: TODAY, order: 0 }];
    expect(backupUrl('https://p.example/', list)).toBe(backupUrl('https://p.example/', list, false, 'naver'));
    const k = new URL(backupUrl('https://p.example/', list, true, 'kakao'));
    expect(k.hash.endsWith('&r=1&m=kakao')).toBe(true);
    expect(readBackup(k.hash)).toEqual({ found: true, entries: list, indoor: true, mapApp: 'kakao' });
    expect(readBackup(`${new URL(backupUrl('https://p.example/', list)).hash}&m=bogus`)).toEqual({ found: true, entries: list });
    reset();
    window.history.replaceState(null, '', `/${backupUrl('x', list, false, 'tmap')}`);
    render();
    await settle();
    expect(current().state().mapApp).toBe('tmap');
    expect(window.localStorage.getItem('jeju.mapApp')).toBe('"tmap"');
    window.history.replaceState(null, '', '/');
  });
});
