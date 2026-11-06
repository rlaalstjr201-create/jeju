// 서울 밤 놀거리 (ADR-0122): the G10 shelf among the curated places — bars 19~02, clubs 22~05, its place in the hour's order
// (fourth at night after 무대·라이브·포차, second past midnight), clubs on Friday and Saturday nights only (Amendment 1), and the pre-registered rules (review/seoul-night/criteria-03.md)
// the curation script keeps.
import { describe, expect, it } from 'vitest';
import FILE from '../data/seoul/fun-seoul.json';
import { ORDER, SHELVES, buildShelves } from '../src/seoul/browse';
import type { CultureItem, Now } from '../src/culture/culture';
import { hoursOf, likelyOpen, type FunItem } from '../src/seoul/fun';
import { ADULT, CUT, KINDS, LP_JAZZ, OWNER_DROP, brandOf, isMass, kindOf, okCategory, oneEach, passes, r6Out } from '../scripts/seoul-night/curate-03.mjs';

const DAY = '2026-11-04';
const at = (h: number, m = 0): Now => ({ day: DAY, weekday: 3, minute: h * 60 + m });
const SUNSET = 17 * 60 + 25;
const bar = (id: string, word: string): FunItem =>
  ({ id: `kk-${id}`, title: `곳${id}`, kind: word, place: `${word} · 한남`, gu: '', lat: 37.534, lng: 127.0, start: DAY, end: DAY, time: '', free: false, forAll: true, link: `https://place.map.kakao.com/${id}`, image: '', fun: { g: 'G10', word, walkin: true } }) as FunItem;

describe('밤 놀거리 hours (ADR-0122 7)', () => {
  it('bars 19~02, clubs 22~05; a 루프탑바 is a bar, not the daytime 루프탑', () => {
    for (const w of ['칵테일바', '와인바', '하이볼바', '루프탑바', '음악바', '바']) expect(hoursOf(w)).toEqual([1140, 1560]);
    expect(hoursOf('클럽')).toEqual([1320, 1740]);
    expect(hoursOf('루프탑')).toEqual([720, 1440]);
  });
  it('a bar at 19:00 and past midnight to 01:30, not at 15:00, any day', () => {
    expect(likelyOpen(bar('1', '칵테일바'), 19 * 60, 0, 11, 2)).toBe(true);
    expect(likelyOpen(bar('1', '칵테일바'), 60 + 30, 0, 11, 2)).toBe(true);
    expect(likelyOpen(bar('1', '칵테일바'), 60 + 31, 0, 11, 2)).toBe(false);
    expect(likelyOpen(bar('1', '칵테일바'), 15 * 60, 0, 11, 2)).toBe(false);
  });
  it('a club on Friday and Saturday nights only, 22:00 to 04:30 the next morning (Amendment 1)', () => {
    const club = bar('2', '클럽');
    // Friday 23:00, Saturday 23:00 open; Wednesday and Sunday 23:00 shut
    expect(likelyOpen(club, 23 * 60, 0, 11, 5)).toBe(true);
    expect(likelyOpen(club, 23 * 60, 0, 11, 6)).toBe(true);
    expect(likelyOpen(club, 23 * 60, 0, 11, 3)).toBe(false);
    expect(likelyOpen(club, 23 * 60, 0, 11, 0)).toBe(false);
    // past midnight it is the evening before's: Saturday 04:00 (Friday night) and Sunday 04:00 (Saturday night) open, Friday 04:00 not
    expect(likelyOpen(club, 4 * 60, 0, 11, 6)).toBe(true);
    expect(likelyOpen(club, 4 * 60, 0, 11, 0)).toBe(true);
    expect(likelyOpen(club, 4 * 60, 0, 11, 5)).toBe(false);
    // Friday 23:50 with 30 minutes to go: arriving 00:20, still Friday night
    expect(likelyOpen(club, 23 * 60 + 50, 30, 11, 5)).toBe(true);
    expect(likelyOpen(club, 20 * 60, 0, 11, 5)).toBe(false);
    // no weekday known: not shown
    expect(likelyOpen(club, 23 * 60, 0, 11)).toBe(false);
  });
});

describe('the 밤 놀거리 shelf (ADR-0122 1·8)', () => {
  it('is a shelf in every band, fourth at night after 무대·라이브·포차 (ADR-0115 6), second past midnight', () => {
    expect(SHELVES).toContain('g10');
    for (const band of Object.values(ORDER)) expect(band).toContain('g10');
    expect(ORDER.night.slice(0, 4)).toEqual(['stage', 'g7', 'g2', 'g10']);
    expect(ORDER.late.slice(0, 2)).toEqual(['g5', 'g10']);
    expect(ORDER.day.indexOf('g10')).toBeGreaterThan(5);
  });
  it('a club on its shelf on a Friday night, not on a Wednesday', () => {
    const clubs: CultureItem[] = Array.from({ length: 6 }, (_, i) => bar(String(i), '클럽'));
    expect(buildShelves(clubs, { day: '2026-11-06', weekday: 5, minute: 23 * 60 }, null, SUNSET).map((s) => s.key)).toEqual(['g10']);
    expect(buildShelves(clubs, at(23), null, SUNSET)).toEqual([]);
  });
  it('holds the G10 places open now with the card line 「칵테일바 · 한남」; none in the afternoon', () => {
    const list: CultureItem[] = Array.from({ length: 6 }, (_, i) => bar(String(i), i % 2 ? '와인바' : '칵테일바'));
    const night = buildShelves(list, at(23), null, SUNSET);
    expect(night.map((s) => s.key)).toEqual(['g10']);
    expect(night[0].cards).toHaveLength(6);
    expect(night[0].cards[0].why).toMatch(/^(칵테일바|와인바) · 한남$/);
    expect(buildShelves(list, at(15), null, SUNSET)).toEqual([]);
  });
});

describe('the curation rules (criteria-03.md)', () => {
  it('bars and clubs only; no 유흥주점·단란주점, no 포차·오뎅바', () => {
    expect(okCategory('음식점 > 술집 > 칵테일바')).toBe(true);
    expect(okCategory('음식점 > 술집 > 와인바')).toBe(true);
    expect(okCategory('가정,생활 > 유흥시설 > 나이트,클럽')).toBe(true);
    expect(okCategory('가정,생활 > 유흥시설 > 유흥주점')).toBe(false);
    expect(okCategory('가정,생활 > 유흥시설 > 단란주점')).toBe(false);
    expect(okCategory('음식점 > 술집 > 실내포장마차')).toBe(false);
    expect(okCategory('음식점 > 카페')).toBe(false);
  });
  it('the 유흥 forms by name (R3: a club category says 유흥시설)', () => {
    for (const n of ['OO헌팅포차', '감성주점 OO', 'OO토킹바', '호빠 OO', 'OO성인나이트']) expect(ADULT.test(n), n).toBe(true);
    for (const n of ['르챔버', '페이스 서울', '바 참']) expect(ADULT.test(n), n).toBe(false);
  });
  it('R6: LP·재즈·라이브 bars and the places already among the curated ones are out before judging', () => {
    const fun = new Set(['kk-9']);
    expect(r6Out({ id: 'kk-1', name: '어느 LP바', category: '술집' }, fun)).toBe(true);
    expect(r6Out({ id: 'kk-2', name: '재즈 바', category: '술집' }, fun)).toBe(true);
    expect(r6Out({ id: 'kk-3', name: '어느 곳', category: '카페 > 테마카페 > 라이브카페' }, fun)).toBe(true);
    expect(r6Out({ id: 'kk-9', name: '르챔버', category: '술집 > 칵테일바' }, fun)).toBe(true);
    expect(r6Out({ id: 'kk-4', name: '르챔버', category: '술집 > 칵테일바' }, fun)).toBe(false);
  });
  it('a franchise out (the fixed list or a 카카오 brand level) unless a 본점·1호점', () => {
    expect(isMass('생활맥주 망원점')).toBe(true);
    expect(isMass('어느 바', '음식점 > 술집 > 칵테일바 > 오내혼술집')).toBe(true);
    expect(isMass('어느 바 본점', '음식점 > 술집 > 칵테일바 > 오내혼술집')).toBe(false);
    expect(isMass('르챔버', '음식점 > 술집 > 칵테일바')).toBe(false);
  });
  it('the brand keeps a name that ends in 점 whole (the shops round: 48 「…상점」 as one brand)', () => {
    expect(brandOf('르챔버 청담점')).toBe('르챔버');
    expect(brandOf('알맹상점')).toBe('알맹상점');
  });
  it('the thresholds: 500 searches (or 500 posts with none measured), 200 posts, a post since 2026-08-08', () => {
    const ev = (total: number, date: string) => ({ total, posts: [{ date, title: 't' }] });
    expect(CUT).toMatchObject({ volume: 500, volumeNullBlog: 500, blog: 200, since: '20260808' });
    expect(passes(500, ev(200, '20260808'))).toBe(true);
    expect(passes(499, ev(5000, '20261101'))).toBe(false);
    expect(passes(5000, ev(199, '20261101'))).toBe(false);
    expect(passes(null, ev(500, '20261101'))).toBe(true);
    expect(passes(5000, { failed: true })).toBe(false);
  });
  it('the kind from the 카카오 category, the name and the words', () => {
    expect(kindOf('가정,생활 > 유흥시설 > 나이트,클럽', '페이스', ['클럽'])).toBe('클럽');
    expect(kindOf('술집 > 칵테일바', '어느 루프탑', ['루프탑바'])).toBe('루프탑바');
    expect(kindOf('술집', '하이볼 연구소', ['하이볼바'])).toBe('하이볼바');
    expect(kindOf('술집 > 와인바', '어느 곳', ['와인바'])).toBe('와인바');
    expect(kindOf('술집 > 칵테일바', 'DJ 바', ['바 추천'])).toBe('음악바');
    expect(kindOf('술집 > 칵테일바', '르챔버', ['칵테일바'])).toBe('칵테일바');
    expect(kindOf('술집', '어느 곳', ['스피크이지 바', '위스키바'])).toBe('칵테일바');
    expect(kindOf('술집', '어느 곳', ['바 추천'])).toBe('바');
  });
  it('one keep a brand: 본점 first, else the more posts (9절)', () => {
    const r = oneEach([
      { id: 'kk-1', name: '바A 성수점', total: 900 },
      { id: 'kk-2', name: '바A 본점', total: 100 },
      { id: 'kk-3', name: '바B', total: 50 },
      { id: 'kk-4', name: '바B 한남점', total: 80 },
      { id: 'kk-5', name: '바C', total: 10 },
    ]);
    expect([...r.keep].sort()).toEqual(['kk-2', 'kk-4', 'kk-5']);
    expect(r.out.map((x) => x.id).sort()).toEqual(['kk-1', 'kk-3']);
  });
});

describe('the shipped 밤 놀거리 places (data/seoul/fun-seoul.json)', () => {
  const g10 = FILE.places.filter((p) => p.g === 'G10');
  it('each a known kind with its card line, a 카카오맵 link, no 유흥 name, no franchise, no LP·재즈, one place once', () => {
    expect(g10.length).toBe(23); // criteria-03: keep 28, none already a curated place, no brand twice; 5 OWNER_DROP (Amendment 1)
    for (const id of Object.keys(OWNER_DROP)) expect(g10.some((p) => p.id === id), id).toBe(false);
    for (const p of g10) {
      expect(KINDS).toContain(p.word);
      expect(p.line.startsWith(`${p.word} · `)).toBe(true);
      expect(p.url).toMatch(/^https:\/\/place\.map\.kakao\.com\/\d+$/);
      expect(ADULT.test(p.name), p.name).toBe(false);
      expect(LP_JAZZ.test(p.name), p.name).toBe(false);
      expect(isMass(p.name), p.name).toBe(false);
    }
    expect(new Set(FILE.places.map((p) => p.id)).size).toBe(FILE.places.length);
    expect(new Set(g10.map((p) => brandOf(p.name))).size).toBe(g10.length);
  });
});
