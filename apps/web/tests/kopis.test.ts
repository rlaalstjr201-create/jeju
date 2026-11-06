// KOPIS 공연 (ADR-0113 2·3·4): the detail read, 회차 turned into the Seoul list's time words, 종류, 거르기, 출연, and the merge.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CultureItem } from '../functions/_lib/culture-filter';
import { kopisCast, kopisDrop, kopisItems, kopisKind, kopisTime, listIds, mergeCulture, parseShow, type KopisShow } from '../functions/_lib/kopis';
import { openNow, parseCultureTime } from '../src/culture/culture';

const DAY = '2026-11-04'; // a Wednesday
const fx = (name: string) => readFileSync(resolve(__dirname, 'fixtures/kopis', name), 'utf8');
const VENUES: Record<string, [number, number]> = { FC1: [37.5822, 127.0019], FCX: [35.1, 129.1] };
const show = (over: Partial<KopisShow>): KopisShow => ({
  id: 'PF1',
  title: '연극 한 편',
  from: '2026-11-01',
  to: '2026-11-30',
  venue: 'FC1',
  place: '대학로 극장',
  cast: '',
  genre: '연극',
  child: false,
  dt: '화요일 ~ 금요일(20:00), 토요일(15:00,19:00)',
  age: '만 13세 이상',
  price: '전석 30,000원',
  poster: 'http://www.kopis.or.kr/upload/p.jpg',
  link: '',
  ...over,
});
const daysOf = (s: string) => {
  const t = parseCultureTime(s);
  return t ? Object.fromEntries(Object.entries(t).map(([d, v]) => [d, v!.starts])) : null;
};

describe('회차 → 시간 말 (ADR-0113 2)', () => {
  it('the measured forms read as each weekday\'s own starts', () => {
    expect(kopisTime('화요일 ~ 금요일(20:00), 토요일(15:00,19:00)')).toBe('화-금요일 20:00 / 토요일 15:00, 19:00');
    expect(daysOf(kopisTime('화요일 ~ 금요일(20:00), 토요일(15:00,19:00)'))).toEqual({ 2: [1200], 3: [1200], 4: [1200], 5: [1200], 6: [900, 1140] });
    expect(kopisTime('수요일(19:00)')).toBe('수요일 19:00');
    expect(daysOf(kopisTime('수요일(19:00)'))).toEqual({ 3: [1140] });
    expect(kopisTime('화요일(18:00,19:10), 일요일(16:30,17:40)')).toBe('화요일 18:00, 19:10 / 일요일 16:30, 17:40');
    expect(daysOf(kopisTime('화요일(18:00,19:10), 일요일(16:30,17:40)'))).toEqual({ 0: [990, 1060], 2: [1080, 1150] });
    expect(kopisTime('토요일 ~ 일요일(10:00,13:00)')).toBe('토-일요일 10:00, 13:00');
    expect(daysOf(kopisTime('토요일 ~ 일요일(10:00,13:00)'))).toEqual({ 0: [600, 780], 6: [600, 780] });
  });
  it('HOL is left out; only HOL or words in place of a time: not read (the show is left out)', () => {
    expect(kopisTime('토요일(15:00), HOL(15:00)')).toBe('토요일 15:00');
    expect(kopisTime('HOL(14:00,18:00)')).toBe('');
    expect(kopisTime('공연 일정 문의')).toBe('');
    expect(kopisTime('목요일(공연 시간 미정)')).toBe('');
    expect(kopisDrop(show({ dt: 'HOL(14:00)' }), VENUES, DAY)).toBe('no-time');
  });
  it('a show whose start has passed is shut, one to come is later', () => {
    const [it0] = kopisItems([show({})], VENUES, DAY);
    expect(openNow(it0, { day: DAY, weekday: 3, minute: 19 * 60 })).toBe('later');
    expect(openNow(it0, { day: DAY, weekday: 3, minute: 20 * 60 + 30 })).toBe('shut');
    // Monday: no show
    expect(openNow(it0, { day: '2026-11-02', weekday: 1, minute: 12 * 60 })).toBe('shut');
  });
});

describe('종류·거르기·출연 (ADR-0113 2·3·4)', () => {
  it('genres map to the Seoul list\'s kinds', () => {
    expect(kopisKind('연극')).toBe('연극');
    expect(kopisKind('뮤지컬')).toBe('뮤지컬/오페라');
    expect(kopisKind('서양음악(클래식)')).toBe('클래식');
    expect(kopisKind('대중음악')).toBe('콘서트');
    expect(kopisKind('한국음악(국악)')).toBe('국악');
    expect(kopisKind('무용(서양/한국무용)')).toBe('무용');
    expect(kopisKind('서커스/마술')).toBe('기타');
    expect(kopisKind('복합')).toBe('기타');
  });
  it('kids, no venue coordinates, not today are left out', () => {
    expect(kopisDrop(show({}), VENUES, DAY)).toBeNull();
    expect(kopisDrop(show({ child: true }), VENUES, DAY)).toBe('kids-only');
    expect(kopisDrop(show({ title: '가족 뮤지컬 꼬마버스' }), VENUES, DAY)).toBe('kids-only');
    expect(kopisDrop(show({ title: '키즈 클래식' }), VENUES, DAY)).toBe('kids-only');
    expect(kopisDrop(show({ title: '어린이 인형극' }), VENUES, DAY)).toBe('kids-only');
    expect(kopisDrop(show({ venue: 'FC9' }), VENUES, DAY)).toBe('coords');
    expect(kopisDrop(show({ venue: 'FCX' }), VENUES, DAY)).toBe('coords');
    expect(kopisDrop(show({ to: '2026-11-03' }), VENUES, DAY)).toBe('not-today');
  });
  it('cast: the first two names, none when blank', () => {
    expect(kopisCast('김상우, 이원우, 홍길동 등')).toBe('김상우·이원우');
    expect(kopisCast('김상우 등')).toBe('김상우');
    expect(kopisCast(' ')).toBe('');
    expect(kopisItems([show({ cast: '김상우, 이원우' })], VENUES, DAY)[0].cast).toBe('김상우·이원우');
    expect('cast' in kopisItems([show({ cast: ' ' })], VENUES, DAY)[0]).toBe(false);
  });
  it('an item has the Seoul list\'s shape: kp- id, venue coordinates, https poster, one per title', () => {
    const items = kopisItems([show({}), show({ id: 'PF2', place: '다른 극장' }), show({ id: 'PF3', title: '무료 공연', price: '전석무료', age: '전체 관람가', genre: '대중음악' })], VENUES, DAY);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ id: 'kp-PF1', kind: '연극', lat: 37.5822, lng: 127.0019, start: '2026-11-01', end: '2026-11-30', free: false, forAll: false, image: 'https://www.kopis.or.kr/upload/p.jpg' });
    expect(items[1]).toMatchObject({ id: 'kp-PF3', kind: '콘서트', free: true, forAll: true });
  });
});

describe('KOPIS XML (real answers, 2026-11-04, no key in them)', () => {
  it('the list\'s ids and each detail', () => {
    expect(listIds(fx('list.xml')).length).toBeGreaterThan(2);
    const shows = ['PF305348.xml', 'PF305174.xml', 'PF302924.xml'].map((f) => parseShow(fx(f))!);
    for (const s of shows) {
      expect(s.id).toMatch(/^PF\d+$/);
      expect(s.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(s.venue).toMatch(/^FC\d+$/);
      expect(kopisTime(s.dt)).not.toBe('');
    }
    expect(shows[0]).toMatchObject({ id: 'PF305348', title: 'AZITO PLAY, 동물', genre: '대중음악', dt: '수요일(19:00)', cast: '', child: false });
    expect(kopisCast(shows[1].cast)).toBe('김상우·이원우');
    expect(kopisTime(shows[2].dt)).not.toMatch(/HOL/);
    expect(parseShow('<dbs></dbs>')).toBeNull();
    expect(parseShow('<dbs><db><mt20id>PF1</mt20id><fcltynm>아스트라홀 (아스트라홀)</fcltynm></db></dbs>')!.place).toBe('아스트라홀');
    expect(parseShow('<dbs><db><mt20id>PF1</mt20id><fcltynm>세종문화회관 (세종대극장)</fcltynm></db></dbs>')!.place).toBe('세종문화회관 세종대극장');
    expect(shows[1].place).toBe('극장 PLOT');
  });
});

describe('합치기 (ADR-0113 3)', () => {
  const seoul = { id: 'sc-a', title: '[세종문화회관] 햄릿', kind: '연극', place: '세종문화회관', gu: '종로구', lat: 37.57, lng: 126.97, start: DAY, end: DAY, time: '19:30', free: false, forAll: true, link: '', image: '' } as CultureItem;
  it('a show the Seoul list has by title is left out, Seoul\'s kept', () => {
    const shows = kopisItems([show({ title: '[세종문화회관]  햄릿' }), show({ id: 'PF2', title: '다른 연극' })], VENUES, DAY);
    const merged = mergeCulture([seoul], shows);
    expect(merged.map((i) => i.id)).toEqual(['sc-a', 'kp-PF2']);
  });
});
