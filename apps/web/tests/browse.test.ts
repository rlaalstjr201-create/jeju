// 오늘 서울 둘러보기 (ADR-0114 2·3): the shelves from the day's list — one shelf per item (the earlier wins), at most 7 × 12,
// none empty, nothing shut now; the picture and link addresses; 머문 시간 in tens.
import { describe, expect, it } from 'vitest';
import { cultureItems, type CultureItem, type SeoulRow } from '../functions/_lib/culture-filter';
import { NEAR_KM, PER_SHELF, SHELVES, browseCard, buildShelves, imageUrl, linkUrl, todayTimes } from '../src/browse';
import { openNow, type Now } from '../src/culture';
import { distanceKm } from '../src/pick';
import { dwellBucket } from '../src/track';
import rows from './fixtures/seoul-culture-20261104.json';

const DAY = '2026-11-04'; // a Wednesday
const at = (h: number, m = 0): Now => ({ day: DAY, weekday: 3, minute: h * 60 + m });
const items = cultureItems(rows as SeoulRow[], DAY);
const 경복궁 = { lat: 37.5796, lng: 126.977 };
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
const ids = (s: ReturnType<typeof buildShelves>) => s.flatMap((x) => x.cards.map((c) => c.item.id));

describe('buildShelves (ADR-0114 2·3)', () => {
  it('the 11-04 list at 14:00 from 경복궁: shelves in their order, none empty, ≤ 7 × 12, each item once', () => {
    const shelves = buildShelves(items, at(14), 경복궁);
    expect(shelves.length).toBeGreaterThan(1);
    expect(shelves.length).toBeLessThanOrEqual(7);
    const keys = shelves.map((s) => s.key);
    expect(keys).toEqual(SHELVES.filter((k) => keys.includes(k)));
    for (const s of shelves) {
      expect(s.cards.length).toBeGreaterThan(0);
      expect(s.cards.length).toBeLessThanOrEqual(PER_SHELF);
    }
    const all = ids(shelves);
    expect(new Set(all).size).toBe(all.length);
    // nothing shut now
    for (const s of shelves) for (const c of s.cards) expect(openNow(c.item, at(14), undefined, c.trip?.minutes ?? 0)).not.toBe('shut');
  });

  it('지금 근처: within 3 km, nearest first, with how far; the others each say why now', () => {
    const near = buildShelves(items, at(14), 경복궁).find((s) => s.key === 'near')!;
    expect(near).toBeTruthy();
    const km = near.cards.map((c) => distanceKm(경복궁, c.item));
    expect(km).toEqual([...km].sort((a, b) => a - b));
    for (const k of km) expect(k).toBeLessThanOrEqual(NEAR_KM);
    for (const c of near.cards) expect(c.trip).not.toBeNull();
  });

  it('no basis: no 지금 근처 and no distance', () => {
    const shelves = buildShelves(items, at(14), null);
    expect(shelves.map((s) => s.key)).not.toContain('near');
    for (const s of shelves) for (const c of s.cards) expect(c.trip).toBeNull();
  });

  it('an item takes the first shelf it fits; a later shelf never shows it again', () => {
    // a free play ending today, near: 지금 근처 only
    const a = item({ id: 'a', kind: '연극', end: DAY, free: true, time: '수요일 19:00' });
    // far, ends today, a free play: 오늘만·오늘까지 only
    const b = item({ id: 'b', kind: '연극', end: DAY, free: true, time: '수요일 19:00', lat: 37.5, lng: 127.1 });
    // far, ends Saturday: 이번 주에 끝나요
    const c = item({ id: 'c', kind: '전시/미술', end: '2026-11-07', lat: 37.5, lng: 127.1 });
    // far, a month on: 연극·뮤지컬, 라이브·인디, 전시, 무료
    const d = item({ id: 'd', kind: '뮤지컬/오페라', time: '수요일 19:30', lat: 37.5, lng: 127.1 });
    const e = item({ id: 'e', kind: '콘서트', time: '수요일 20:00', lat: 37.5, lng: 127.1 });
    const f = item({ id: 'f', kind: '국악', place: '인디 라이브 클럽', time: '수요일 20:00', lat: 37.5, lng: 127.1 });
    const g = item({ id: 'g', kind: '전시/미술', lat: 37.5, lng: 127.1 });
    const h = item({ id: 'h', kind: '클래식', free: true, time: '수요일 19:00', lat: 37.5, lng: 127.1 });
    // fits no shelf: left out
    const x = item({ id: 'x', kind: '클래식', time: '수요일 19:00', lat: 37.5, lng: 127.1 });
    const shelves = buildShelves([x, h, g, f, e, d, c, b, a], at(14), 경복궁);
    expect(shelves.map((s) => [s.key, s.cards.map((c) => c.item.id)])).toEqual([
      ['near', ['a']],
      ['today', ['b']],
      ['week', ['c']],
      ['stage', ['d']],
      ['live', ['f', 'e']], // equal standing and distance: as the list has them
      ['exhibit', ['g']],
      ['free', ['h']],
    ]);
  });

  it('a show that has started, and a place shut for the day, are left out (openNow shut)', () => {
    const started = item({ id: 's', kind: '연극', time: '수요일 13:00' });
    const closed = item({ id: 'c', time: '10:00~13:00' });
    const later = item({ id: 'l', kind: '연극', time: '수요일 19:30' });
    const shelves = buildShelves([started, closed, later], at(14), 경복궁);
    expect(ids(shelves)).toEqual(['l']);
    expect(shelves[0].cards[0].why).toBe('19:30 시작');
  });

  it('at most 12 a shelf; one cut by the 12 can still be on a later shelf', () => {
    const many = Array.from({ length: 15 }, (_, i) => item({ id: `m${i}`, end: DAY, free: true, lat: 37.5, lng: 127.1 }));
    const shelves = buildShelves(many, at(14), 경복궁);
    expect(shelves.map((s) => [s.key, s.cards.length])).toEqual([
      ['today', 12],
      ['exhibit', 3],
    ]);
    expect(new Set(ids(shelves)).size).toBe(15);
  });

  it('nothing open: no shelves at all', () => {
    expect(buildShelves([item({ time: '10:00~13:00' })], at(14), 경복궁)).toEqual([]);
    expect(buildShelves([], at(14), 경복궁)).toEqual([]);
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
    expect(imageUrl('http://www.kopis.or.kr/upload/pfmPoster/PF_1.jpg')).toBe('https://www.kopis.or.kr/upload/pfmPoster/PF_1.jpg');
    expect(imageUrl('https://culture.seoul.go.kr/cmmn/file/getImage.do?atchFileId=1&thumb=Y')).toBe('https://culture.seoul.go.kr/cmmn/file/getImage.do?atchFileId=1&thumb=Y');
    for (const bad of ['', 'javascript:alert(1)', 'data:image/png;base64,AAAA', '//x.kr/a.jpg', 'ftp://x.kr/a.jpg', undefined]) expect(imageUrl(bad), String(bad)).toBeNull();
  });

  it('자세히: http(s) only', () => {
    expect(linkUrl('https://www.tinyticket.net/event/EV1')).toBe('https://www.tinyticket.net/event/EV1');
    expect(linkUrl(' http://galleryplanet.co.kr/a ')).toBe('http://galleryplanet.co.kr/a');
    for (const bad of ['', 'javascript:alert(1)', 'JavaScript:alert(1)', 'www.example.com', 'mailto:a@b.kr', 'tel:0212345678', undefined]) expect(linkUrl(bad), String(bad)).toBeNull();
  });
});

describe('머문 시간 (ADR-0114 7)', () => {
  it('in tens of seconds, 600 for ten minutes or more', () => {
    expect([0, 9_999, 10_000, 44_999, 45_000, 599_999, 600_000, 3_600_000, -5].map(dwellBucket)).toEqual([0, 0, 10, 40, 40, 590, 600, 600, 0]);
  });
});
