// 지금 주변 문화생활 (ADR-0112): the Seoul rows kept, the time words read, and the few picked.
import { describe, expect, it } from 'vitest';
import { cultureItems, decode, dropReason, type SeoulRow } from '../functions/_lib/culture-filter';
import { nowness, openNow, parseCultureTime, pickCulture, type Now } from '../src/culture';
import { distanceKm } from '../src/pick';
import rows from './fixtures/seoul-culture-20261104.json';

const DAY = '2026-11-04'; // a Wednesday
const at = (h: number, m = 0): Now => ({ day: DAY, weekday: 3, minute: h * 60 + m });
const items = cultureItems(rows as SeoulRow[], DAY);
const row = (over: Partial<SeoulRow>): SeoulRow => ({
  TITLE: '전시',
  CODENAME: '전시/미술',
  STRTDATE: '2026-11-01 00:00:00.0',
  END_DATE: '2026-11-30 00:00:00.0',
  LAT: '37.57',
  LOT: '126.98',
  PLACE: '갤러리',
  PRO_TIME: '10:00~18:00',
  USE_TRGT: '누구나',
  ...over,
});
const daysOf = (t: ReturnType<typeof parseCultureTime>) => (t ? Object.keys(t).map(Number).sort() : null);

describe('거르기 (ADR-0112 3)', () => {
  it('the 11-04 rows: classes, kids-only and online left out; one row per title', () => {
    const why: Record<string, number> = {};
    for (const r of rows as SeoulRow[]) {
      const w = dropReason(r, DAY) ?? 'kept';
      why[w] = (why[w] ?? 0) + 1;
    }
    expect(why.class).toBeGreaterThan(40);
    expect(why['kids-only']).toBeGreaterThan(20);
    expect(items.length).toBeLessThan(130);
    expect(new Set(items.map((i) => i.title)).size).toBe(items.length);
    for (const i of items) expect(/어린이|키즈|유아|프로그램\s*안내|강좌/.test(i.title), i.title).toBe(false);
  });
  it('one by one: series class, notice, drop-in night tour, kids, coords swapped or outside Seoul, online, not today', () => {
    expect(dropReason(row({ CODENAME: '교육/체험', TITLE: '[구립도서관] 길 위의 인문학 3회차' }), DAY)).toBe('class');
    expect(dropReason(row({ CODENAME: '기타', TITLE: '[마포구립서강도서관] 11월 문화프로그램 안내' }), DAY)).toBe('class');
    expect(dropReason(row({ CODENAME: '교육/체험', TITLE: '[운현궁] 야간 특별 프로그램' }), DAY)).toBeNull();
    expect(dropReason(row({ USE_TRGT: '어린이(초등1~3학년 학급 단체)' }), DAY)).toBe('kids-only');
    expect(dropReason(row({ TITLE: '[구립도서관] 어린이열람실 북큐레이션' }), DAY)).toBe('kids-only');
    expect(dropReason(row({ TITLE: '해봄맘껏Time' }), DAY)).toBe('kids-only');
    expect(dropReason(row({ LAT: '126.98', LOT: '37.57' }), DAY)).toBe('coords');
    expect(dropReason(row({ LAT: '35.1', LOT: '129.1' }), DAY)).toBe('coords');
    expect(dropReason(row({ PRO_TIME: '온라인 북큐레이션' }), DAY)).toBe('online');
    expect(dropReason(row({ END_DATE: '2026-11-03 00:00:00.0' }), DAY)).toBe('not-today');
  });
  it('HTML entities are undone', () => {
    expect(decode('A &amp; B &lt;전시&gt; &#39;봄&#39;')).toBe("A & B <전시> '봄'");
    // one out of range stays as written (it must not throw: the whole day's list would fail)
    expect(decode('가 &#99999999; 나')).toBe('가 &#99999999; 나');
  });
});

describe('시간 읽기 (plans/now-culture.md §4-1, 품질 01 원인 1)', () => {
  it('spans, starts, day ranges and closed days', () => {
    const t = parseCultureTime('화-일요일 10:00~18:00 / 월요일 휴관');
    expect(daysOf(t)).toEqual([0, 2, 3, 4, 5, 6]);
    expect(t?.[3]).toEqual({ spans: [[600, 1080]], starts: [] });
    expect(daysOf(parseCultureTime('10:00~18:00 매주 월요일, 공휴일 휴관'))).toEqual([0, 2, 3, 4, 5, 6]);
    expect(daysOf(parseCultureTime('12:00~18:00(일,월 휴관)'))).toEqual([2, 3, 4, 5, 6]);
    expect(daysOf(parseCultureTime('매주 수, 목, 금 10:00~12:00'))).toEqual([3, 4, 5]);
    expect(daysOf(parseCultureTime('토, 일 11:00~17:00'))).toEqual([0, 6]);
    expect(parseCultureTime('수 19:30')).toEqual({ 3: { spans: [], starts: [1170] } });
    expect(daysOf(parseCultureTime('매주 금 19:00'))).toEqual([5]);
    expect(parseCultureTime('9:30~17:00 (16시30분까지 입장가능)')?.[1]?.spans).toEqual([[570, 1020]]);
    expect(daysOf(parseCultureTime('토요일 휴관 10:00~17:00'))).toEqual([0, 1, 2, 3, 4, 5]);
  });
  it('each weekday keeps its own times: no Saturday 19:30 for a weekday-evening show', () => {
    const a = parseCultureTime('평일 19:30, 주말.공휴일 15:00 (월,화 공연없음)');
    expect(daysOf(a)).toEqual([0, 3, 4, 5, 6]);
    expect(a?.[3]?.starts).toEqual([1170]);
    expect(a?.[6]?.starts).toEqual([900]);
    const b = parseCultureTime('월,수,목 19:30 / 금 15:00, 19:30 / 토,일 15:00');
    expect(b?.[4]?.starts).toEqual([1170]);
    expect(b?.[5]?.starts).toEqual([900, 1170]);
    expect(b?.[6]?.starts).toEqual([900]);
    const c = parseCultureTime('평일 11:00~19:00 / 토 12:00~18:00');
    expect(c?.[6]?.spans).toEqual([[720, 1080]]);
    expect(c?.[0]).toBeUndefined();
    expect(parseCultureTime('11:00~19:00, 목요일 21:00까지 연장')?.[4]?.spans).toEqual([[660, 1140]]);
  });
  it('not sure → null: several programmes, dates, seasons, 협의, 상시, no clock time', () => {
    for (const t of ['프로그램별 상이', '공연별 상이', '시간 협의', '상설운영', '11.4.(수) - 11.6.(금) 10:30 | 19:30', '10월31일, 11월1, 7, 8일, 20일 12:00~16:00', '격주 토요일 15:30~17:30', '도서관 운영시간 내', '평일 10:00~20:00 / 주말(하절기) 10:00~19:00 (동절기) 10:00~18:00', '']) {
      expect(parseCultureTime(t), t).toBeNull();
    }
  });
  it('the 11-04 kept rows: most are read', () => {
    const read = items.filter((i) => parseCultureTime(i.time)).length;
    expect(read / items.length).toBeGreaterThan(0.6);
  });
});

describe('지금 열림 (ADR-0112 4, 품질 01 원인 2)', () => {
  const base = cultureItems([row({})], DAY)[0];
  it('inside its span open, before later, after shut; a closed weekday shut', () => {
    expect(openNow(base, at(12))).toBe('open');
    expect(openNow(base, at(9))).toBe('later');
    expect(openNow(base, at(18))).toBe('shut');
    expect(openNow({ ...base, time: '10:00~18:00 수요일 휴관' }, at(12))).toBe('shut');
  });
  it('a show only before it starts, and only with time to get there', () => {
    const show = { ...base, kind: '연극', time: '수 19:30' };
    expect(openNow(show, at(18))).toBe('later');
    expect(openNow(show, at(19), undefined, 20)).toBe('later');
    expect(openNow(show, at(19, 15), undefined, 20)).toBe('shut');
    expect(openNow(show, at(19, 31))).toBe('shut');
    // a show written as a span is entered at the span's start
    expect(openNow({ ...show, time: '수 19:00~21:00' }, at(19, 30))).toBe('shut');
  });
  it('unread time: indoor shut 19:00–09:00; a 야간 one kept; a festival with no time left out', () => {
    const unknown = { ...base, time: '프로그램별 상이' };
    expect(openNow(unknown, at(14))).toBe('unknown');
    expect(openNow(unknown, at(19))).toBe('shut');
    expect(openNow({ ...unknown, title: '궁궐 야간 관람' }, at(21))).toBe('unknown');
    expect(openNow({ ...unknown, kind: '축제-문화/예술' }, at(14))).toBe('shut');
  });
  it('지금성: 오늘까지 0, 이번 주 1, 상설에 가까울수록 크다', () => {
    expect(nowness({ ...base, end: DAY }, DAY)).toBe(0);
    expect(nowness({ ...base, end: '2026-11-08' }, DAY)).toBe(1);
    expect(nowness({ ...base, start: '2026-01-01', end: '2026-12-31' }, DAY)).toBe(4);
  });
});

describe('고르기 (ADR-0112 2·5)', () => {
  const PLACES = { 대학로: { lat: 37.5822, lng: 127.0019 }, 광화문: { lat: 37.5759, lng: 126.9768 }, 성수: { lat: 37.5446, lng: 127.056 } };
  it('at most 2 for the home and 6 for the list; 같은 종류 둘(전시 셋), 같은 장소 하나; nothing shut', () => {
    for (const o of Object.values(PLACES)) {
      for (const now of [at(14), at(19, 30), at(22)]) {
        const { home, list } = pickCulture(items, o, now);
        expect(home.length).toBeLessThanOrEqual(2);
        expect(list.length).toBeLessThanOrEqual(6);
        const kinds: Record<string, number> = {};
        for (const p of list) kinds[p.item.kind] = (kinds[p.item.kind] ?? 0) + 1;
        for (const [k, v] of Object.entries(kinds)) expect(v, k).toBeLessThanOrEqual(k.startsWith('전시') ? 3 : 2);
        expect(new Set(list.map((p) => p.item.place.replace(/\s+/g, ''))).size).toBe(list.length);
        for (const p of list) expect(openNow(p.item, now)).not.toBe('shut');
        for (const p of home) expect(list).toContain(p);
      }
    }
  });
  it('nothing past 5km; the home within 3km', () => {
    for (const o of Object.values(PLACES)) {
      for (const now of [at(14), at(19, 30)]) {
        const { home, list } = pickCulture(items, o, now);
        for (const p of list) expect(distanceKm(o, p.item)).toBeLessThanOrEqual(5);
        for (const p of home) expect(distanceKm(o, p.item)).toBeLessThanOrEqual(3);
      }
    }
  });
  it('22:00: no indoor exhibition whose time is not read', () => {
    for (const o of Object.values(PLACES)) {
      for (const p of pickCulture(items, o, at(22)).list) {
        if (p.item.kind.startsWith('전시')) expect(parseCultureTime(p.item.time), p.item.title).not.toBeNull();
      }
    }
  });
});
