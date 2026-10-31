import { describe, expect, it } from 'vitest';
// @ts-expect-error -- plain .mjs script, no types
import { judge, judge2, sample, score, shuffle } from '../scripts/nation/rules.mjs';

const item = (id: string, lclsSystm3: string, contenttypeid = 12, title = '어느 곳') => ({ id, title, addr1: '서울 어딘가', contenttypeid, lclsSystm3 });

describe('자동 지역 규칙 (review/nation/rules-criteria.md)', () => {
  it('음식점은 먹기·실내, 카페·제과는 cafe, 주점은 뺀다', () => {
    expect(judge(item('a', 'FD010100', 39))).toMatchObject({ keep: true, mood: 'food', sub: 'meal', indoor: true });
    expect(judge(item('b', 'FD050100', 39))).toMatchObject({ mood: 'food', sub: 'cafe' });
    expect(judge(item('c', 'FD030100', 39))).toMatchObject({ sub: 'cafe' });
    expect(judge(item('d', 'FD040100', 39))).toMatchObject({ keep: false, reject: 'EXCLUDED' });
  });
  it('표의 대표 코드', () => {
    expect(judge(item('e', 'NA020900'))).toMatchObject({ mood: 'walk', indoor: false });
    expect(judge(item('f', 'VE070100', 14))).toMatchObject({ mood: 'new', sub: 'sight', indoor: true });
    expect(judge(item('g', 'HS030100'))).toMatchObject({ mood: 'new', sub: 'sight', indoor: false });
    expect(judge(item('h', 'EX050200'))).toMatchObject({ mood: 'new', sub: 'do', indoor: true });
    expect(judge(item('i', 'LS020200', 28))).toMatchObject({ mood: 'new', sub: 'do', indoor: false });
    expect(judge(item('j', 'SH060200', 38))).toMatchObject({ mood: 'new', sub: 'sight', indoor: false });
    expect(judge(item('k', 'EX060800'))).toMatchObject({ sub: 'do', indoor: true });
  });
  it('뺄 코드와 모르는 코드', () => {
    for (const c of ['AC050100', 'HS010900', 'VE090300', 'VE110200', 'LS010400', 'VE100200']) expect(judge(item(c, c)).reject).toBe('EXCLUDED');
    expect(judge(item('z', 'ZZ999999')).reject).toBe('UNMAPPED');
  });
  it('체인은 빼지만 교촌마을은 남긴다', () => {
    expect(judge(item('s', 'FD050100', 39, '스타벅스 강릉점')).reject).toBe('CHAIN');
    expect(judge(item('t', 'HS010600', 12, '경주 교촌마을')).keep).toBe(true);
  });
  it('섞기는 결정적', () => {
    expect(shuffle([1, 2, 3, 4, 5], 7)).toEqual(shuffle([1, 2, 3, 4, 5], 7));
  });
  it('표본은 규칙 결과·코드를 보이지 않는다', () => {
    const items = Array.from({ length: 40 }, (_, n) => item(`x${n}`, n % 4 ? 'NA020900' : 'AC050100'));
    const results = items.map(judge);
    const s = sample([{ items }], results);
    expect(s.length).toBeGreaterThan(0);
    for (const r of s) expect(Object.keys(r).sort()).toEqual(['addr1', 'id', 'title', 'type']);
  });
  it('점수: unsure는 기분·실내 비교에서 뺀다', () => {
    const results = [judge(item('a', 'NA020900')), judge(item('b', 'VE070100', 14)), judge(item('c', 'NA020900'))];
    const s = score(results, [
      { id: 'a', keep: true, mood: 'walk', indoor: false },
      { id: 'b', keep: true, mood: 'new', indoor: false },
      { id: 'c', keep: true, mood: 'new', indoor: true, unsure: true },
    ]);
    expect(s.compared).toBe(2);
    expect(s.mood.rate).toBe(1);
    expect(s.indoor.rate).toBe(0.5);
    expect(s.wetMiss).toMatchObject({ count: 1, of: 1 });
  });
});

describe('자동 지역 규칙 v2 (review/nation/rules-criteria-02.md, ADR-0105)', () => {
  it('쉬기 코드(해변·공원·전망대 밖, 온천·찜질방 실내), 계곡은 예약 없이 가는 놀거리', () => {
    expect(judge2(item('a', 'NA020900'))).toMatchObject({ keep: true, mood: 'rest', indoor: false });
    expect(judge2(item('b', 'VE030100'))).toMatchObject({ mood: 'rest', indoor: false });
    expect(judge2(item('c', 'EX050100'))).toMatchObject({ mood: 'rest', indoor: true });
    expect(judge2(item('d', 'NA010400'))).toMatchObject({ mood: 'new', sub: 'do', walkin: true });
    expect(judge2(item('e', 'NA010100'))).toMatchObject({ mood: 'walk' });
  });
  it('예약해야만 하는 코드·이름은 뺀다(BOOKING), 그 밖의 놀거리는 walkin', () => {
    expect(judge2(item('f', 'EX030100'))).toMatchObject({ keep: false, reject: 'BOOKING' });
    expect(judge2(item('g', 'LS020100', 28, '양양 서프스쿨'))).toMatchObject({ keep: false, reject: 'BOOKING' });
    expect(judge2(item('h', 'EX030200'))).toMatchObject({ mood: 'new', sub: 'do', walkin: true });
    expect(judge2(item('i', 'LS011900', 28, '레일바이크'))).toMatchObject({ mood: 'new', sub: 'do', walkin: true });
    expect(judge2(item('j', 'VE070100', 14))).toMatchObject({ mood: 'new', sub: 'sight' });
    expect(judge2(item('j', 'VE070100', 14))).not.toHaveProperty('walkin');
  });
});
