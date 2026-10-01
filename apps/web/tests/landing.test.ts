// Static landing pages (ADR-0072, specs/seo-landing.md): slugs, page content, and the quality bar's checks.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assignSlugs, buildSite, copiedReasons, ENTITY, ownShare, romanize, similarPairs, sitemapFiles, slugBase, sourceCopies, type SlugRegistry,
} from '../scripts/landing';
import { parseJsonLd } from '../scripts/seo/crawl-parse.mjs';
import type { Spot } from '../src/pick';
import { fileSpots } from './fixtures';

const root = resolve(__dirname, '..');
const spot = (id: string, name: string, lat: number, lng: number, over: Partial<Spot> = {}): Spot => ({
  id, name, lat, lng, mood: 'walk', reason: `${name}에서 바다를 따라 걸어요`, image: `https://api.cdn.visitjeju.net/photomng/thumbnailpath/${id}.webp`,
  kakaoPlaceId: null, bookable: false, score: 3, indoor: false, ...over,
});
// 애월 (33.4475, 126.3678) and 우도 (33.5079, 126.9538)
const SPOTS: Spot[] = [
  spot('a1', '한담해안산책로', 33.462, 126.31),
  spot('a2', '곽지해수욕장', 33.45, 126.305, { mood: 'rest', reason: '모래가 고운 해변에서 쉬어 가요' }),
  spot('a3', '애월 카페', 33.463, 126.312, { mood: 'food', sub: 'cafe', indoor: true, reason: '창밖으로 바다가 보이는 카페예요' }),
  spot('a4', '애월 국숫집', 33.465, 126.32, { mood: 'food', sub: 'meal', indoor: true, reason: '고기국수 한 그릇을 빨리 내요', market: { days: [2, 7], label: '2·7일' } }),
  spot('a5', '새별오름', 33.366, 126.357, { reason: '억새가 덮인 오름을 한 바퀴 올라요' }),
  spot('u1', '우도 등대', 33.495, 126.965, { mood: 'new', sub: 'sight', reason: '섬 끝 등대에 올라 성산을 바라봐요' }),
];
const slugs = (): SlugRegistry => assignSlugs(SPOTS, {});
const site = (over: Partial<Parameters<typeof buildSite>[0]> = {}) =>
  buildSite({ spots: SPOTS, slugs: slugs(), site: 'https://x.test', photos: true, dataDate: '2026-10-01', ...over });

describe('주소(OQ5: 영문 슬러그)', () => {
  it('romanizes by letter with 연음 and ㄹㄹ; Latin and digits stay; words become hyphens', () => {
    expect(romanize('협재')).toBe('hyeopjae');
    expect(romanize('올레')).toBe('olle');
    expect(romanize('성산일출봉')).toBe('seongsanilchulbong');
    expect(slugBase('버거307 협재점')).toBe('beogeo-307-hyeopjaejeom');
    expect(slugBase('카페리(CAFERI)')).toBe('kaperi-caferi');
    expect(slugBase('あり')).toBe('place');
  });

  it('every shipped place has one, no two alike, and each is a plain path segment', () => {
    const reg = JSON.parse(readFileSync(resolve(root, 'data/landing/slugs.json'), 'utf8')).slugs as SlugRegistry;
    for (const s of fileSpots) expect(reg[s.id], s.name).toBeDefined();
    const all = Object.values(reg).map((e) => e.slug);
    expect(new Set(all).size).toBe(all.length);
    for (const x of all) expect(x).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    for (const x of ['rest', 'walk', 'new', 'food', 'any']) expect(all).not.toContain(x);
  });

  it('stable: known ids keep theirs, a clash or a reserved word gets -2, a removed place keeps its slug reserved', () => {
    const first = assignSlugs([spot('b', '산책', 33.46, 126.31), spot('c', 'Rest', 33.46, 126.31)], {});
    expect(first).toEqual({ b: { slug: 'sanchaek', area: 'aewol' }, c: { slug: 'rest-2', area: 'aewol' } });
    // 'b' is gone from the data; a new place with the same name does not get its address
    const next = assignSlugs([spot('c', 'Rest', 33.46, 126.31), spot('a', '산책', 33.46, 126.31)], first);
    expect(next).toEqual({ a: { slug: 'sanchaek-2', area: 'aewol' } });
  });
});

describe('페이지', () => {
  it('hub, 15 areas, the gate-passed combos, one page per place; a moved place gets a 301 from its first address', () => {
    const reg = slugs();
    reg.a1 = { ...reg.a1, area: 'hallim' };
    const s = site({ slugs: reg, combos: [{ area: 'aewol', mood: 'walk', query: '애월 산책' }] });
    expect(s.pages.map((p) => p.kind).filter((k) => k !== 'place')).toEqual(['hub', ...Array(15).fill('area'), 'combo']);
    expect(s.pages.filter((p) => p.kind === 'place')).toHaveLength(SPOTS.length);
    expect(s.redirects).toEqual([`/jeju/hallim/${reg.a1.slug}/ /jeju/aewol/${reg.a1.slug}/ 301`]);
    expect(s.pages.find((p) => p.kind === 'combo')!.path).toBe('/jeju/aewol/walk/');
  });

  it('place page: our reason, area, mood, indoor and market lines, Naver links, the deep link, nearby places, breadcrumbs, credit', () => {
    const s = site();
    const html = s.pages.find((p) => p.id === 'a4')!.html;
    expect(html).toContain('<h1>애월 국숫집</h1>');
    expect(html).toContain('고기국수 한 그릇을 빨리 내요');
    expect(html).toContain('「맛있는 거 먹고 싶어」, 식사');
    expect(html).toContain('실내라 「비 와요(실내만)」를 켜도 나와요');
    expect(html).toContain('장날은 매달 2·7일이에요');
    expect(html).toContain('https://map.naver.com/p/directions/-/126.32,33.465,');
    expect(html).toContain('href="/?area=aewol&mood=food"');
    expect((html.match(/<ul class="near">([\s\S]*?)<\/ul>/)![1].match(/<li>/g) ?? []).length).toBe(4);
    expect(html).toContain('<li><a href="/jeju/aewol/">애월</a></li>');
    expect(html).toContain('정보·사진: 비짓제주(제주관광공사)');
    expect(html).not.toMatch(/<script(?![^>]*application\/ld\+json)/);
  });

  it('JSON-LD: the place type, geo, image (photos on), breadcrumbs; never aggregateRating', () => {
    const s = site();
    const html = s.pages.find((p) => p.id === 'a3')!.html;
    const types = parseJsonLd(html)[0].types;
    expect(types).toEqual(expect.arrayContaining(['CafeOrCoffeeShop', 'GeoCoordinates', 'BreadcrumbList', 'TouristDestination']));
    expect(html).toContain('"image":"https://api.cdn.visitjeju.net/');
    for (const p of s.pages) expect(p.html).not.toMatch(/aggregateRating|ratingValue/);
    expect(parseJsonLd(s.pages[0].html)[0].types).toEqual(expect.arrayContaining(['CollectionPage', 'ItemList', 'BreadcrumbList']));
    expect(parseJsonLd(s.pages[3].html)[0].types).toEqual(expect.arrayContaining(['TouristDestination', 'ItemList', 'TouristAttraction']));
  });

  it('LANDING_PHOTOS=0: no photo anywhere (img, og:image of a place, JSON-LD image) and the credit drops 사진', () => {
    const s = site({ photos: false });
    for (const p of s.pages) {
      expect(p.html).not.toContain('api.cdn.visitjeju.net');
      expect(p.html).not.toContain('<img');
      expect(p.html).toContain('정보: 비짓제주(제주관광공사)');
    }
  });

  it('hub: the entity sentence, the app link, every area; area page: our sentence, 5 per mood at most, every place linked', () => {
    const s = site();
    const hub = s.pages[0].html;
    expect(hub).toContain(ENTITY);
    expect(hub).toContain('<a class="go" href="/">앱에서 지금 3곳 받기</a>');
    expect((hub.match(/href="\/jeju\/[a-z]+\/"/g) ?? []).length).toBe(15);
    const aewol = s.pages.find((p) => p.path === '/jeju/aewol/')!.html;
    expect(aewol).toContain('한담 해안 산책로를 따라 카페가 이어져요');
    for (const p of s.places.filter((x) => x.area.slug === 'aewol')) expect(aewol).toContain(`href="${p.url}"`);
    expect(aewol).toContain('<title>애월(한담) 근처, 지금 갈 만한 곳 · 여행계획짜기 귀찮아:제주</title>');
  });

  it('a place left out by the quality bar gets no page and no link', () => {
    const s = site({ exclude: new Set(['a2']) });
    expect(s.pages.some((p) => p.id === 'a2')).toBe(false);
    expect(s.pages.some((p) => p.html.includes(`/${slugs().a2.slug}/`))).toBe(false);
  });
});

describe('품질 기준', () => {
  it('source text: a 20-character run of it on a page is caught; place names are cut out first; reasons that repeat their source are found', () => {
    const src = ['한담해안산책로는 애월읍 한담동에서 곽지해수욕장까지 이어지는 해안 산책로로 노을이 유명하다'];
    const pages = [
      { path: '/a/', html: '<main><p>애월읍 한담동에서 곽지해수욕장까지 이어지는 길</p></main>' },
      { path: '/b/', html: '<main><p>한담해안산책로 바다를 따라 걸어요</p></main>' },
    ];
    expect(sourceCopies(pages, src, ['한담해안산책로', '곽지해수욕장'])).toEqual([]);
    expect(sourceCopies(pages, src, []).map((x) => x.path)).toEqual(['/a/']);
    expect(sourceCopies([{ path: '/c/', html: '<main><p>곽지해수욕장까지 이어지는 해안 산책로로 노을이 좋아요</p></main>' }], src, [])).toHaveLength(1);
    expect(copiedReasons([{ id: 'x', reason: '애월읍 한담동에서 곽지해수욕장까지 이어지는 길' }, { id: 'y', reason: '바다를 보며 걸어요' }], () => src)).toEqual(new Set(['x']));
  });

  it('similarity: the same page twice is found, different pages are not; own text is measured against the template', () => {
    const page = (t: string) => `<main><p>${t}</p></main>`;
    const a = page('가나다라마바사아자차카타파하 거너더러머버서어저처커터퍼허 고노도로모보소오조초코토포호');
    const pages = [
      { path: '/1/', html: a },
      { path: '/2/', html: a },
      { path: '/3/', html: page('구누두루무부수우주추쿠투푸후 그느드르므브스으즈츠크트프흐 기니디리미비시이지치키티피히') },
    ];
    expect(similarPairs(pages, 0.8)).toEqual([{ a: '/1/', b: '/2/', sim: 1 }]);
    expect(ownShare(pages).map((x) => x.share)).toEqual([0, 0, 1]);
  });

  it('sitemap: one file, or past the limit an index of numbered files', () => {
    expect(Object.keys(sitemapFiles(['/', '/jeju/'], 'https://x.test', '2026-10-01'))).toEqual(['sitemap.xml']);
    const split = sitemapFiles(['/', '/a/', '/b/'], 'https://x.test', null, 2);
    expect(Object.keys(split)).toEqual(['sitemap-1.xml', 'sitemap-2.xml', 'sitemap.xml']);
    expect(split['sitemap.xml']).toContain('<sitemapindex');
    expect(split['sitemap.xml']).toContain('<loc>https://x.test/sitemap-2.xml</loc>');
  });
});
