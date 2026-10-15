// Static landing pages (ADR-0072, specs/seo-landing.md): slugs, page content, and the quality bar's checks.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assignSlugs, buildSite, contentHash, copiedReasons, ENTITY, kstDay, pageLastmods, ownShare, romanize, similarPairs, sitemapFiles, slugBase, sourceCopies, type SlugRegistry,
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
    expect(hub).toContain('<a class="go" href="/">앱에서 지금 3곳 보기</a>');
    expect((hub.match(/href="\/jeju\/[a-z]+\/"/g) ?? []).length).toBe(15);
    const aewol = s.pages.find((p) => p.path === '/jeju/aewol/')!.html;
    expect(aewol).toContain('한담 해안 산책로를 따라 카페가 이어져요');
    for (const p of s.places.filter((x) => x.area.slug === 'aewol')) expect(aewol).toContain(`href="${p.url}"`);
    expect(aewol).toContain('<title>애월(한담) 근처, 지금 갈 만한 곳 · 여차나:제주</title>');
  });

  // ADR-0090 7: 「받기」 read as installing an app (heuristic-audit-02)
  it('the app link says 「… 3곳 보기」 on every page, never 「받기」', () => {
    const s = site({ combos: [{ area: 'aewol', mood: 'walk', query: '애월 산책' }] });
    const page = (kind: string, path?: string) => s.pages.find((p) => p.kind === kind && (!path || p.path === path))!.html;
    expect(page('area', '/jeju/aewol/')).toContain('<a class="go" href="/?area=aewol">앱에서 애월 근처 3곳 보기</a>');
    expect(page('area', '/jeju/aewol/')).toContain('>앱에서 애월 근처 3곳 보기</a>');
    expect(page('combo')).toContain('>앱에서 지금 3곳 보기</a>');
    expect(page('place')).toContain('>앱에서 근처 3곳 보기</a>');
    for (const p of s.pages) expect(p.html).not.toContain('받기');
  });

  // docs/seo/2026-10-16-generic-search.md a1: 「애월 실내 놀거리」·「애월 비오는날 놀거리」 land on the area page
  it('area page: a 「비 오는 날」 section with the top 5 indoor 쉬기·새로운 거 and the indoor deep link; fewer than 10 → none', () => {
    const indoor = (n: number) =>
      Array.from({ length: n }, (_, i) => spot(`r${i}`, `애월 전시관 ${i + 1}`, 33.46 + i * 0.001, 126.33, { mood: i % 2 ? 'new' : 'rest', sub: i % 2 ? 'sight' : undefined, indoor: true, reason: `비를 피해 전시 ${i + 1}을 봐요` }));
    const spots = [...SPOTS, ...indoor(11)];
    const s = buildSite({ spots, slugs: assignSlugs(spots, {}), site: 'https://x.test', photos: true, dataDate: '2026-10-01' });
    const aewol = s.pages.find((p) => p.path === '/jeju/aewol/')!.html;
    const rain = aewol.match(/<section aria-labelledby="rain">([\s\S]*?)<\/section>/)![1];
    expect(rain).toContain('<h2 id="rain">비 오는 날, 애월 실내</h2>');
    expect(rain).toContain('애월 근처 실내 쉬기·구경·체험 11곳 중');
    expect(rain.match(/href="\/jeju\/aewol\/[a-z0-9-]+\/"/g)).toHaveLength(5);
    expect(rain).toContain('<a class="tbtn" href="/?area=aewol&indoor=1">앱에서 애월 실내 3곳 보기</a>');
    expect(rain).not.toContain('애월 카페'); // food stays out even when indoor
    expect(aewol).toContain('먹기마다, 비 오는 날 실내까지 먼저 갈 만한 곳을 모았어요.');
    const udo = s.pages.find((p) => p.path === '/jeju/udo/')!.html;
    expect(udo).not.toContain('비 오는 날,');
    const few = [...SPOTS, ...indoor(9)];
    const f = buildSite({ spots: few, slugs: assignSlugs(few, {}), site: '', photos: false, dataDate: null });
    expect(f.pages.find((p) => p.path === '/jeju/aewol/')!.html).not.toContain('aria-labelledby="rain"');
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

  // docs/seo/2026-10-16-generic-search.md a4: Search Console counts indexed pages per sitemap
  it('sitemap: an index of one file per group (core, then each area); empty groups left out; a group past the limit goes on in -2', () => {
    const files = sitemapFiles({ core: ['/', '/jeju/', '/jeju/aewol/'], aewol: ['/jeju/aewol/x/'], udo: [] }, 'https://x.test', '2026-10-01');
    expect(Object.keys(files)).toEqual(['sitemap-core.xml', 'sitemap-aewol.xml', 'sitemap.xml']);
    expect(files['sitemap.xml']).toContain('<sitemapindex');
    expect(files['sitemap.xml']).toContain('<loc>https://x.test/sitemap-core.xml</loc>');
    expect(files['sitemap.xml']).not.toContain('<urlset');
    expect(files['sitemap-core.xml'].match(/<loc>/g)).toHaveLength(3);
    expect(files['sitemap-aewol.xml']).toContain('<loc>https://x.test/jeju/aewol/x/</loc>');
    const split = sitemapFiles({ core: ['/', '/a/', '/b/'] }, 'https://x.test', null, 2);
    expect(Object.keys(split)).toEqual(['sitemap-core.xml', 'sitemap-core-2.xml', 'sitemap.xml']);
    expect(split['sitemap.xml']).toContain('<loc>https://x.test/sitemap-core-2.xml</loc>');
  });

  it('sitemap: each page its own lastmod; the index each file\'s latest', () => {
    const files = sitemapFiles({ core: ['/', '/a/'], aewol: ['/b/'] }, 'https://x.test', { '/': '2026-10-01', '/a/': '2026-10-03', '/b/': '2026-10-02' });
    expect(files['sitemap-core.xml']).toContain('<loc>https://x.test/</loc><lastmod>2026-10-01</lastmod>');
    expect(files['sitemap-core.xml']).toContain('<loc>https://x.test/a/</loc><lastmod>2026-10-03</lastmod>');
    expect(files['sitemap.xml']).toContain('<loc>https://x.test/sitemap-core.xml</loc><lastmod>2026-10-03</lastmod>');
    expect(files['sitemap.xml']).toContain('<loc>https://x.test/sitemap-aewol.xml</loc><lastmod>2026-10-02</lastmod>');
  });
});

describe('per-page lastmod (audit D4): only a page whose content changed gets a new date', () => {
  const page = (main: string, foot = '장소 정보 기준 2026-10-01.') => `<head><title>t</title></head><body><main>${main}</main><footer>${foot}</footer></body>`;

  it('contentHash: the <main> only — not the footer\'s data date, the site address or the photos', () => {
    const h = contentHash(page('<a href="https://x.test/jeju/">애월</a><img src="https://p/1.jpg" alt="">'), 'https://x.test');
    expect(contentHash(page('<a href="/jeju/">애월</a>', '장소 정보 기준 2026-10-09.'), '')).toBe(h);
    expect(contentHash(page('<a href="/jeju/">한림</a>'), '')).not.toBe(h);
  });

  // docs/seo/2026-10-16-generic-search.md a3: 「받기」→「보기」 alone moved 2,939 dates on 10-16
  it('contentHash: two place pages that differ only in button words hash the same; where a button leads still counts', () => {
    const s = site();
    const html = s.pages.find((p) => p.id === 'a4')!.html;
    const reworded = html.replace('>앱에서 근처 3곳 보기</a>', '>앱에서 근처 3곳 받기</a>').replace(/>네이버지도로 [^<]*<\/a>/, '>길찾기</a>');
    expect(reworded).not.toBe(html);
    expect(contentHash(reworded, 'https://x.test')).toBe(contentHash(html, 'https://x.test'));
    expect(contentHash(reworded, 'https://x.test', 1)).not.toBe(contentHash(html, 'https://x.test', 1));
    expect(contentHash(html.replace('href="/?area=aewol&mood=food"', 'href="/?area=aewol&mood=rest"'), 'https://x.test')).not.toBe(contentHash(html, 'https://x.test'));
  });

  it('pageLastmods: a record from an older hash keeps each page\'s day where the old hash still matches', () => {
    const prev = { '/a/': { hash: 'old-a', lastmod: '2026-10-04' }, '/b/': { hash: 'old-b', lastmod: '2026-10-04' } };
    expect(pageLastmods(prev, { '/a/': 'new-a', '/b/': 'new-b' }, '2026-10-16', null, { '/a/': 'old-a', '/b/': 'changed-b' })).toEqual({
      '/a/': { hash: 'new-a', lastmod: '2026-10-04' },
      '/b/': { hash: 'new-b', lastmod: '2026-10-16' },
    });
  });

  it('pageLastmods: no record yet → every page at the old data date (nothing changes for IndexNow)', () => {
    expect(pageLastmods(null, { '/': 'a', '/x/': 'b' }, '2026-10-03', '2026-10-01')).toEqual({
      '/': { hash: 'a', lastmod: '2026-10-01' },
      '/x/': { hash: 'b', lastmod: '2026-10-01' },
    });
  });

  it('pageLastmods: same hash keeps its day; changed or new → today; gone → dropped; a second run is the same', () => {
    const prev = { '/': { hash: 'a', lastmod: '2026-10-01' }, '/x/': { hash: 'b', lastmod: '2026-10-01' }, '/gone/': { hash: 'g', lastmod: '2026-10-01' } };
    const next = pageLastmods(prev, { '/': 'a', '/x/': 'B', '/new/': 'n' }, '2026-10-03', '2026-10-01');
    expect(next).toEqual({
      '/': { hash: 'a', lastmod: '2026-10-01' },
      '/new/': { hash: 'n', lastmod: '2026-10-03' },
      '/x/': { hash: 'B', lastmod: '2026-10-03' },
    });
    // idempotent: the same build again (same day or a later one) writes the same record
    expect(pageLastmods(next, { '/': 'a', '/x/': 'B', '/new/': 'n' }, '2026-10-03', '2026-10-01')).toEqual(next);
    expect(JSON.stringify(pageLastmods(next, { '/new/': 'n', '/x/': 'B', '/': 'a' }, '2026-10-05', null))).toBe(JSON.stringify(next));
  });

  it('kstDay: the date in Jeju', () => {
    expect(kstDay(new Date('2026-10-02T15:00:00Z'))).toBe('2026-10-03');
    expect(kstDay(new Date('2026-10-02T14:59:59Z'))).toBe('2026-10-02');
  });
});
