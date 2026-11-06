// 서울 카페·디저트 (ADR-0120): the G8 shelf among the curated places — its kinds' usual hours, its place in the hour's order,
// one place once on the home (the 먹기 shelf passes over a café the 카페·디저트 shelf took), and the pre-registered rules
// (review/seoul-cafe/criteria-01.md) the curation script keeps.
import { describe, expect, it } from 'vitest';
import FILE from '../data/seoul/fun-seoul.json';
import { ORDER, SHELVES, buildShelves, homeShelves } from '../src/seoul/browse';
import type { CultureItem, Now } from '../src/culture/culture';
import { hoursOf, likelyOpen, type FunItem } from '../src/seoul/fun';
import type { Spot } from '../src/pick/pick';
import { CUT, OWNER_DROP, isMass, kindOf, passes } from '../scripts/seoul-cafe/curate.mjs';

const DAY = '2026-11-04';
const at = (h: number, m = 0): Now => ({ day: DAY, weekday: 3, minute: h * 60 + m });
const SUNSET = 17 * 60 + 25;
const cafe = (id: string, word: string, title = `곳${id}`, kakao = id): FunItem =>
  ({ id: `kk-${kakao}`, title, kind: word, place: `${word} · 망원`, gu: '', lat: 37.556, lng: 126.906, start: DAY, end: DAY, time: '', free: false, forAll: true, link: `https://place.map.kakao.com/${kakao}`, image: '', fun: { g: 'G8', word, walkin: true } }) as FunItem;

describe('카페·디저트 hours (ADR-0120 5)', () => {
  it("each kind's usual hours", () => {
    expect(hoursOf('베이커리')).toEqual([480, 1200]);
    expect(hoursOf('도넛')).toEqual([480, 1200]);
    expect(hoursOf('카페')).toEqual([600, 1320]);
    expect(hoursOf('로스터리')).toEqual([600, 1320]);
    expect(hoursOf('케이크')).toEqual([660, 1260]);
    expect(hoursOf('디저트')).toEqual([660, 1260]);
    expect(hoursOf('찻집')).toEqual([660, 1260]);
    expect(hoursOf('젤라또')).toEqual([720, 1320]);
    expect(hoursOf('아이스크림')).toEqual([720, 1320]);
  });
  it('a bakery in the morning, not past half an hour before eight; a café to 21:30', () => {
    expect(likelyOpen(cafe('1', '베이커리'), 8 * 60, 0, 11)).toBe(true);
    expect(likelyOpen(cafe('1', '베이커리'), 7 * 60 + 50, 0, 11)).toBe(false);
    expect(likelyOpen(cafe('1', '베이커리'), 19 * 60 + 31, 0, 11)).toBe(false);
    expect(likelyOpen(cafe('2', '카페'), 21 * 60 + 30, 0, 11)).toBe(true);
    expect(likelyOpen(cafe('2', '카페'), 21 * 60 + 20, 20, 11)).toBe(false);
    expect(likelyOpen(cafe('2', '카페'), 2 * 60, 0, 11)).toBe(false);
  });
});

describe('the 카페·디저트 shelf (ADR-0120 1·6)', () => {
  it('is a shelf, in every band, second in the morning and by day (after 시장 and 이번 주 서울, ADR-0118 5), back at night', () => {
    expect(SHELVES).toContain('g8');
    for (const band of Object.values(ORDER)) expect(band).toContain('g8');
    expect(ORDER.morning.indexOf('g8')).toBe(1);
    expect(ORDER.day.indexOf('g8')).toBe(1);
    expect(ORDER.night.indexOf('g8')).toBeGreaterThan(5);
    expect(ORDER.late.indexOf('g8')).toBeGreaterThan(5);
  });
  it('holds the G8 places open now, its card line 「베이커리 · 망원」; none at night', () => {
    const list: CultureItem[] = Array.from({ length: 6 }, (_, i) => cafe(String(i), i % 2 ? '카페' : '베이커리'));
    const day = buildShelves(list, at(14), null, SUNSET);
    expect(day.map((s) => s.key)).toEqual(['g8']);
    expect(day[0].cards).toHaveLength(6);
    expect(day[0].cards[0].why).toMatch(/^(베이커리|카페) · 망원$/);
    expect(buildShelves(list, at(23), null, SUNSET)).toEqual([]);
  });
  it('one place once on the home: 먹기 passes over a café the 카페·디저트 shelf took (카카오 id or name)', () => {
    const cards = Array.from({ length: 6 }, (_, i) => ({ item: cafe(String(500 + i), '베이커리', `빵집${i}`), why: '', trip: null }));
    const sp = (id: string, name: string, kakao: string | null) => ({ id, name, kakaoPlaceId: kakao }) as Spot;
    const out = homeShelves([{ key: 'g8', cards }], { food: [sp('nt-1', '다른 이름', '500'), sp('nt-2', '빵집1', null), sp('nt-3', '국밥집', '999')] }, 15 * 60, SUNSET);
    const food = out.find((s) => s.key === 'food');
    expect(food && 'spots' in food ? food.spots.map((x) => x.id) : null).toEqual(['nt-3']);
  });
});

describe('the curation rules (criteria-01.md)', () => {
  it('mass franchises out unless a 리저브·본점·1호점·플래그십', () => {
    expect(isMass('스타벅스 역삼점')).toBe(true);
    expect(isMass('파리바게뜨 강남본사점')).toBe(true);
    expect(isMass('스타벅스 리저브 청담')).toBe(false);
    expect(isMass('프릳츠 도화점')).toBe(false);
  });
  it('the thresholds: 1,000 searches (or 1,000 posts with none measured), 300 posts, a post since 2026-08-08', () => {
    const ev = (total: number, date: string) => ({ total, posts: [{ date, title: 't' }] });
    expect(CUT).toMatchObject({ volume: 1000, volumeNullBlog: 1000, blog: 300, since: '20260808' });
    expect(passes(1000, ev(300, '20260808'))).toBe(true);
    expect(passes(999, ev(5000, '20261101'))).toBe(false);
    expect(passes(5000, ev(299, '20261101'))).toBe(false);
    expect(passes(5000, ev(5000, '20260807'))).toBe(false);
    expect(passes(null, ev(999, '20261101'))).toBe(false);
    expect(passes(null, ev(1000, '20261101'))).toBe(true);
    expect(passes(5000, { failed: true })).toBe(false);
  });
  it('the kind from the 카카오 category, the name and the words', () => {
    expect(kindOf('간식 > 제과,베이커리', '나폴레옹과자점', ['베이커리'])).toBe('베이커리');
    expect(kindOf('간식 > 도넛', '도넛집', ['도넛'])).toBe('도넛');
    expect(kindOf('간식 > 아이스크림', '젤라또 가게', ['디저트 맛집'])).toBe('젤라또');
    expect(kindOf('간식 > 아이스크림', '소프트', ['디저트 맛집'])).toBe('아이스크림');
    expect(kindOf('카페 > 전통찻집', '찻집', ['카페 추천'])).toBe('찻집');
    expect(kindOf('카페 > 커피전문점', '커피 로스터스', ['카페 추천'])).toBe('로스터리');
    expect(kindOf('카페', '어느 카페', ['티하우스'])).toBe('찻집');
    expect(kindOf('카페', '어느 카페', ['티하우스', '카페 추천'])).toBe('카페');
  });
});

describe('the shipped 카페·디저트 places (data/seoul/fun-seoul.json)', () => {
  const g8 = FILE.places.filter((p) => p.g === 'G8');
  it('each a known kind with its card line, a 카카오맵 link, no mass franchise, no id twice', () => {
    expect(g8.length).toBe(77); // criteria-01: keep 84, one already a G4 place (ㅎㄷ카페), six second branches (Amendment 1)
    for (const id of Object.keys(OWNER_DROP)) expect(g8.some((p) => p.id === id), id).toBe(false);
    for (const p of g8) {
      expect(Object.keys({ 베이커리: 1, 도넛: 1, 카페: 1, 로스터리: 1, 케이크: 1, 디저트: 1, 찻집: 1, 젤라또: 1, 아이스크림: 1 })).toContain(p.word);
      expect(p.line.startsWith(`${p.word} · `)).toBe(true);
      expect(p.url).toMatch(/^https:\/\/place\.map\.kakao\.com\/\d+$/);
      expect(isMass(p.name), p.name).toBe(false);
    }
    expect(new Set(FILE.places.map((p) => p.id)).size).toBe(FILE.places.length);
  });
});
