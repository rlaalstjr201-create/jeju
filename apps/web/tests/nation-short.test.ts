// 이름 줄 글자 (plans/nationwide-app.md 1.5, U6): the word after 여차나: for a 시군구.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseIndex, sggShorts } from '../src/nation';

const ix = parseIndex(JSON.parse(readFileSync(resolve(__dirname, '../data/nation/index.json'), 'utf8')))!;
const short = sggShorts(ix);
const of = (sido: string, name: string) => short[ix.sgg.find((s) => s.n === name && ix.sido.find((x) => x.c === s.s)?.s === sido)!.c];

describe('sggShort', () => {
  it('시·군·구 off when 2 letters or more are left', () => {
    expect(of('강원', '강릉시')).toBe('강릉');
    expect(of('세종', '세종시')).toBe('세종');
    expect(of('서울', '성동구')).toBe('성동');
  });

  it('the 시도 before a name of 2 letters (중구, 동구) or a word another 시군구 has too (고성군)', () => {
    expect(of('서울', '중구')).toBe('서울 중구');
    expect(of('대구', '중구')).toBe('대구 중구');
    expect(of('강원', '고성군')).toBe('강원 고성');
    expect(of('경남', '고성군')).toBe('경남 고성');
  });

  it('a 일반구 is its 시 (수원시 장안구 → 수원), and the 구 of one 시 do not clash', () => {
    expect(of('경기', '수원시 장안구')).toBe('수원');
    expect(of('경북', '포항시 남구')).toBe('포항');
    expect(of('경기', '화성시')).toBe('화성');
  });

  it('past 6 letters the 시도 goes again (전남광주 동구 → 동구); every word fits', () => {
    expect(of('전남광주', '동구')).toBe('동구');
    expect(Object.keys(short).sort()).toEqual(ix.sgg.map((s) => s.c).sort());
    expect(Object.values(short).filter((w) => !w || w.length > 6)).toEqual([]);
  });

  it('a made-up index: the rules alone', () => {
    const sido = [{ c: '1', n: '가도', s: '가' }, { c: '2', n: '나도', s: '나나' }];
    const sgg = (c: string, n: string, s: string) => ({ c, n, s, lat: 0, lng: 0, f: s });
    const w = sggShorts({ sido, sgg: [sgg('1001', '해구', '1'), sgg('1002', '바다시', '1'), sgg('2001', '바다군', '2'), sgg('2002', '긴긴이름시', '2')] });
    expect(w).toEqual({ '1001': '가 해구', '1002': '가 바다', '2001': '나나 바다', '2002': '긴긴이름' });
  });
});
