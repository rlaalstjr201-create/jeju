// 오늘 서울 둘러보기 (ADR-0114, ADR-0115): the shelves from the day's list and the curated places — one shelf per item, at
// most 12, none empty, nothing shut now, the hour's shelves first, 동네 cards; the picture and link addresses; 머문 시간 in fives.
import { describe, expect, it } from 'vitest';
import { cultureItems, type CultureItem, type SeoulRow } from '../functions/_lib/culture-filter';
import { FULL, HOOD_MIN, ORDER, PER_SHELF, browseCard, buildShelves, imageUrl, inHood, linkUrl, RESIZE, todayTimes, type ShelfKey } from '../src/browse';
import { openNow, type Now } from '../src/culture';
import { bandOf, funItems, hoursOf, isFun, likelyOpen, realItems, type FunItem } from '../src/fun';
import { distanceKm } from '../src/pick';
import { sunsetMinutes } from '../src/sun';
import { dwellBucket } from '../src/track';
import rows from './fixtures/seoul-culture-20261104.json';

const DAY = '2026-11-04'; // a Wednesday
const at = (h: number, m = 0): Now => ({ day: DAY, weekday: 3, minute: h * 60 + m });
const events = cultureItems(rows as SeoulRow[], DAY);
const fun = funItems(DAY);
const items = [...events, ...fun];
const 경복궁 = { lat: 37.5796, lng: 126.977 };
const 망원 = { lat: 37.5563, lng: 126.9056 };
const 성수 = { lat: 37.5446, lng: 127.0559 };
const SUNSET = sunsetMinutes(경복궁, DAY); // about 17:25
const item = (over: Partial<CultureItem>): CultureItem => ({
  id: 'sc-x',
  title: '전시',
  kind: '전시/미술',
  place: '갤러리',
  gu: '종로구',
  lat: 37.58,
  lng: 126.98,
  start: '2026-11-01',
  end: '2026-11-30',
  time: '10:00~20:00',
  free: false,
  forAll: true,
  link: '',
  image: '',
  ...over,
});
const place = (over: Partial<FunItem> & { g: FunItem['fun']['g']; word: string; walkin?: boolean }): FunItem => {
  const { g, word, walkin = true, ...rest } = over;
  return { ...item({ id: 'kk-1', title: '곳', kind: word, place: `${word} · 망원`, time: '', start: DAY, end: DAY, ...rest }), fun: { g, word, walkin } } as FunItem;
};
const ids = (s: ReturnType<typeof buildShelves>) => s.flatMap((x) => x.cards.map((c) => c.item.id));
// a museum, a memorial, a palace, a historic site (「○○ 터」) — not 씨어터·센터·챕터
const MUSEUM = /박물관|기념관|역사관|고궁|사적|[^어센챕]터$/;

describe('the curated places (ADR-0115)', () => {
  it('ride along with the day: places and 동네, the day\'s own list without them', () => {
    expect(fun.filter((f) => f.fun.g === 'hood').length).toBe(20);
    expect(fun.filter((f) => f.fun.g !== 'hood').length).toBeGreaterThan(150);
    for (const f of fun) expect(isFun(f)).toBe(true);
    expect(realItems(items)).toEqual(events);
    for (const f of fun) if (f.fun.g !== 'hood') expect(f.link).toMatch(/^https:\/\/place\.map\.kakao\.com\/\d+$/);
  });
  it("a kind's usual hours: a bar in the evening, a market in the day, 찜질방 all night, 야구 in its season", () => {
    expect(hoursOf('LP바')).toEqual([18 * 60, 26 * 60]);
    expect(likelyOpen(place({ g: 'G2', word: '포차거리' }), 10 * 60, 0, 11)).toBe(false);
    expect(likelyOpen(place({ g: 'G2', word: '포차거리' }), 22 * 60, 0, 11)).toBe(true);
    // past midnight, before its 2:00 close less half an hour
    expect(likelyOpen(place({ g: 'G2', word: '포차거리' }), 60, 0, 11)).toBe(true);
    expect(likelyOpen(place({ g: 'G2', word: '전통시장' }), 21 * 60, 0, 11)).toBe(false);
    expect(likelyOpen(place({ g: 'G5', word: '찜질방' }), 3 * 60, 0, 11)).toBe(true);
    expect(likelyOpen(place({ g: 'G6', word: '야구장' }), 18 * 60, 0, 11)).toBe(false);
    expect(likelyOpen(place({ g: 'G6', word: '야구장' }), 18 * 60, 0, 7)).toBe(true);
    // the time to get there counts
    expect(likelyOpen(place({ g: 'G5', word: '방탈출' }), 22 * 60, 40, 11)).toBe(false);
  });
  it('the hour: late, morning, day, dusk around the sunset, night', () => {
    expect(bandOf(3 * 60, 1045)).toBe('late');
    expect(bandOf(9 * 60, 1045)).toBe('morning');
    expect(bandOf(14 * 60, 1045)).toBe('day');
    expect(bandOf(1045 - 30, 1045)).toBe('dusk');
    expect(bandOf(1045 + 30, 1045)).toBe('dusk');
    expect(bandOf(21 * 60, 1045)).toBe('night');
  });
});

describe('buildShelves (ADR-0114 2·3, ADR-0115 6)', () => {
  it.each([
    [14, 경복궁],
    [14, 망원],
    [14, 성수],
    [19, 경복궁],
    [19, 망원],
    [19, 성수],
    [22, 경복궁],
    [22, 망원],
    [22, 성수],
  ])('the 11-04 list at %i:00: the hour\'s order, none empty, ≤ 12, each item once, nothing shut, no museum in the first three', (h, o) => {
    const shelves = buildShelves(items, at(h), o, SUNSET);
    const keys = shelves.map((s) => s.key);
    // full shelves (≥ FULL cards) first, each part in the hour's order
    const rank = ORDER[bandOf(h * 60, SUNSET)];
    const full = shelves.filter((s) => s.cards.length >= FULL).map((s) => s.key);
    const short = shelves.filter((s) => s.cards.length < FULL).map((s) => s.key);
    expect(keys).toEqual([...full, ...short]);
    expect(full).toEqual([...full].sort((a, b) => rank.indexOf(a) - rank.indexOf(b)));
    expect(short).toEqual([...short].sort((a, b) => rank.indexOf(a) - rank.indexOf(b)));
    // ADR-0115 성공 기준 (Amendment 3): four full shelves or more besides 전시·박물관, and they lead
    expect(full.filter((k) => k !== 'exhibit').length).toBeGreaterThanOrEqual(4);
    for (const s of shelves) {
      expect(s.cards.length).toBeGreaterThan(0);
      expect(s.cards.length).toBeLessThanOrEqual(PER_SHELF);
    }
    const all = ids(shelves);
    expect(new Set(all).size).toBe(all.length);
    for (const s of shelves)
      for (const c of s.cards) {
        if (isFun(c.item)) {
          if (c.item.fun.g !== 'hood') expect(likelyOpen(c.item, h * 60, c.trip?.minutes ?? 0, 11)).toBe(true);
        } else expect(openNow(c.item, at(h), undefined, c.trip?.minutes ?? 0)).not.toBe('shut');
      }
    for (const s of shelves.slice(0, 3)) {
      expect(s.key).not.toBe('exhibit');
      for (const c of s.cards) expect(c.item.title).not.toMatch(MUSEUM);
    }
  });

  it("the hour's order itself: with every shelf full, the shelves come exactly as ORDER says", () => {
    const many = (k: string, n: number, over: (i: number) => Partial<CultureItem>) => Array.from({ length: n }, (_, i) => item({ id: `${k}${i}`, lat: 37.58, lng: 126.98, ...over(i) }));
    const kinds: [FunItem['fun']['g'], string][] = [['G1', '한강공원'], ['G2', '포차거리'], ['G5', '찜질방'], ['G7', '소극장']];
    const set = [
      ...kinds.flatMap(([g, word]) => Array.from({ length: 6 }, (_, i) => place({ id: `kk-${g}${i}`, g, word, lat: 37.58, lng: 126.98 }))),
      ...many('s', 6, () => ({ kind: '연극', time: '수요일 23:00' })),
      ...many('t', 6, () => ({ kind: '전시/미술', end: DAY, time: '10:00~23:30' })),
    ];
    // 22:00 is night: 무대, 라이브, 포차, 한강, 놀거리 … 오늘만 (no 동네·전시 here)
    expect(buildShelves(set, at(22), null, SUNSET).map((s) => s.key)).toEqual(ORDER.night.filter((k) => ['stage', 'g7', 'g2', 'g1', 'g5', 'today'].includes(k)));
    expect(ORDER.night.slice(0, 3)).toEqual(['stage', 'g7', 'g2']);
    expect(ORDER.dusk[0]).toBe('g1');
    expect(ORDER.late[0]).toBe('g5');
    for (const band of Object.values(ORDER)) expect(band.indexOf('exhibit')).toBe(band.length - 1);
  });

  it('찜질방 all night; a bar open past midnight', () => {
    expect(likelyOpen(place({ g: 'G5', word: '찜질방' }), 23 * 60 + 45, 20, 11)).toBe(true);
    expect(likelyOpen(place({ g: 'G2', word: '포차거리' }), 23 * 60 + 50, 30, 11)).toBe(true);
    expect(likelyOpen(place({ g: 'G2', word: '포차거리' }), 60 + 40, 0, 11)).toBe(false);
  });

  it('the curated shelves: nearest first, with how far; 6 cards or more at 14:00 near the busy 동네', () => {
    const shelves = buildShelves(items, at(14), 망원, SUNSET);
    for (const key of ['g4', 'g5', 'g7'] as ShelfKey[]) {
      const s = shelves.find((x) => x.key === key);
      if (!s) continue;
      const km = s.cards.map((c) => distanceKm(망원, c.item));
      expect(km).toEqual([...km].sort((a, b) => a - b));
      for (const c of s.cards) expect(c.trip).not.toBeNull();
    }
    expect(shelves.find((x) => x.key === 'g7')!.cards.length).toBeGreaterThanOrEqual(6);
  });

  it('동네: those with ≥ 2 things in them now, nearest first, each with its count', () => {
    const hoods = buildShelves(items, at(14), 망원, SUNSET).find((s) => s.key === 'hood')!;
    expect(hoods.cards.length).toBeGreaterThan(0);
    const km = hoods.cards.map((c) => distanceKm(망원, c.item));
    expect(km).toEqual([...km].sort((a, b) => a - b));
    for (const c of hoods.cards) {
      expect(c.count).toBeGreaterThanOrEqual(HOOD_MIN);
      expect(c.count).toBe(inHood(c.item, items, at(14), 망원).length);
    }
  });

  it('an item takes its own kind\'s shelf; the day\'s list: 무대, 오늘만·이번 주까지, 전시 in that order of taking', () => {
    const a = item({ id: 'a', kind: '연극', end: DAY, time: '수요일 19:00', lat: 37.5, lng: 127.1 });
    const b = item({ id: 'b', kind: '전시/미술', end: '2026-11-07', lat: 37.5, lng: 127.1 });
    const c = item({ id: 'c', kind: '전시/미술', lat: 37.5, lng: 127.1 });
    const d = place({ id: 'kk-d', g: 'G7', word: '소극장', lat: 37.5, lng: 127.1 });
    const shelves = buildShelves([c, b, a, d], at(14), 경복궁, SUNSET);
    expect(Object.fromEntries(shelves.map((s) => [s.key, s.cards.map((x) => x.item.id)]))).toEqual({ g7: ['kk-d'], stage: ['a'], today: ['b'], exhibit: ['c'] });
    // a curated place's card line is its why
    expect(shelves.find((s) => s.key === 'g7')!.cards[0].why).toBe('소극장 · 망원');
  });

  it('a show that has started, a place shut for the day, a bar in the morning: left out', () => {
    const started = item({ id: 's', kind: '연극', time: '수요일 13:00' });
    const closed = item({ id: 'c', time: '10:00~13:00' });
    const later = item({ id: 'l', kind: '연극', time: '수요일 19:30' });
    const bar = place({ id: 'kk-b', g: 'G4', word: 'LP바' });
    const shelves = buildShelves([started, closed, later, bar], at(14), 경복궁, SUNSET);
    expect(ids(shelves)).toEqual(['l']);
    expect(shelves[0].cards[0].why).toBe('19:30 시작');
  });

  it('no basis: no distance; 동네 by how much is in them', () => {
    const shelves = buildShelves(items, at(14), null, SUNSET);
    for (const s of shelves) for (const c of s.cards) expect(c.trip).toBeNull();
    const counts = shelves.find((s) => s.key === 'hood')!.cards.map((c) => c.count!);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
  });

  it('nothing open: no shelves at all', () => {
    expect(buildShelves([item({ time: '10:00~13:00' })], at(14), 경복궁, SUNSET)).toEqual([]);
    expect(buildShelves([], at(14), 경복궁, SUNSET)).toEqual([]);
  });

  it("browseCard: the shelf's why and distance; null when shut", () => {
    const it0 = item({ id: 'a', end: DAY, time: '10:00~18:00' });
    expect(browseCard(it0, at(14), 경복궁)).toMatchObject({ why: '오늘까지 · 지금 열림 · 18:00까지', trip: { walk: true } });
    expect(browseCard(it0, at(19), 경복궁)).toBeNull();
  });
});

describe('the card sheet and the addresses (ADR-0114 4·5)', () => {
  it("todayTimes: today's read times, '' when not read", () => {
    expect(todayTimes(item({ time: '화-토요일 11:00~18:00(월, 일요일 휴관)' }), at(14))).toBe('11:00~18:00');
    expect(todayTimes(item({ time: '평일 19:30, 주말 15:00' }), at(14))).toBe('19:30');
    expect(todayTimes(item({ time: '상시' }), at(14))).toBe('');
  });

  it('pictures: https only, http asked for over https', () => {
    // resized on this site's zone (Amendment 1), KOPIS's www. dropped (it only redirects)
    expect(RESIZE).toBe('https://yeochana.com/cdn-cgi/image/width=256,quality=75,format=auto/');
    expect(imageUrl('http://www.kopis.or.kr/upload/pfmPoster/PF_1.jpg')).toBe(`${RESIZE}https://kopis.or.kr/upload/pfmPoster/PF_1.jpg`);
    expect(imageUrl('https://kopis.or.kr/upload/a.png')).toBe(`${RESIZE}https://kopis.or.kr/upload/a.png`);
    // the Seoul events site never answers Cloudflare's fetch: the text card at once
    expect(imageUrl('https://culture.seoul.go.kr/cmmn/file/getImage.do?atchFileId=1&thumb=Y')).toBeNull();
    for (const bad of ['', 'javascript:alert(1)', 'data:image/png;base64,AAAA', '//x.kr/a.jpg', 'ftp://x.kr/a.jpg', undefined]) expect(imageUrl(bad), String(bad)).toBeNull();
  });

  it('자세히: http(s) only', () => {
    expect(linkUrl('https://www.tinyticket.net/event/EV1')).toBe('https://www.tinyticket.net/event/EV1');
    expect(linkUrl(' http://galleryplanet.co.kr/a ')).toBe('http://galleryplanet.co.kr/a');
    for (const bad of ['', 'javascript:alert(1)', 'JavaScript:alert(1)', 'www.example.com', 'mailto:a@b.kr', 'tel:0212345678', undefined]) expect(linkUrl(bad), String(bad)).toBeNull();
  });
});

describe('머문 시간 (ADR-0114 7)', () => {
  it('in fives of seconds, 600 for ten minutes or more', () => {
    // fives (Amendment 1): 45 s is a bin's edge, so the verdict's 45-second line is read exactly
    expect([0, 4_999, 5_000, 44_999, 45_000, 49_999, 599_999, 600_000, 3_600_000, -5].map(dwellBucket)).toEqual([0, 0, 5, 40, 45, 45, 595, 600, 600, 0]);
  });
});
