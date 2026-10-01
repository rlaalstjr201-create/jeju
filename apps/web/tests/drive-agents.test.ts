// @vitest-environment jsdom
// ADR-0067 (specs/drive-and-agents.md): 길찾기 in one tap from every card (D1·D2), and the deep link an AI agent
// can hand a user (D4·D5).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AREAS, areaByName } from '../src/areas';
import { addDays } from '../src/dates';
import { readDeepLink } from '../src/deeplink';
import { directionsUrl, kakaoUrl } from '../src/links';
import { pickCards } from '../src/pick';
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

  it('results: one 길찾기 per card, after the meta and before the booking link; the card link and 카카오맵 stay', async () => {
    render();
    await tap('[data-mood="new"]');
    const cards = $$('#cards .card:not(.ghost)');
    expect(cards).toHaveLength(3);
    for (const c of cards) {
      const s = realSpots.find((x) => x.id === c.dataset.id)!;
      const go = c.querySelectorAll<HTMLAnchorElement>('a.go');
      expect(go).toHaveLength(1);
      expect(go[0].textContent).toBe('길찾기');
      expect(go[0].classList.contains('tbtn')).toBe(true);
      expect(go[0].getAttribute('href')).toBe(directionsUrl(s));
      expect(go[0].getAttribute('target')).toBe('_blank');
      expect(go[0].getAttribute('rel')).toBe('noopener');
      expect(go[0].getAttribute('aria-label')).toBe(`${s.name.trim()}, 카카오맵 자동차 길찾기`);
      expect(c.querySelector('.card-link')!.getAttribute('href')).toBe(kakaoUrl(s));
      const meta = c.querySelector('.meta');
      if (meta) expect(meta.compareDocumentPosition(go[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      const book = c.querySelector('a.book');
      if (book) expect(go[0].compareDocumentPosition(book) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect($$('#cards .dest').map((d) => d.textContent)).toEqual(['카카오맵']);
  });

  it('saved list rows have it too', async () => {
    render();
    await tap('[data-mood="rest"]');
    await tap($$('#cards .heart')[0]);
    await tap('#saved');
    await until(() => $$('#savedView .card:not(.ghost)').length === 1);
    const row = $('#savedView .card');
    const s = realSpots.find((x) => x.id === row.dataset.id)!;
    expect(row.querySelector('a.go')?.getAttribute('href')).toBe(directionsUrl(s));
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
