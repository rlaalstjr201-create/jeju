// 자동 지역 데이터 계약 (plans/nationwide-app.md 0·2, U5): the index's form and a file's records as the app's places.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { listed } from '../src/pick';
import { normalizeNation, parseIndex } from '../src/nation';

const fixture = (f: string): unknown => JSON.parse(readFileSync(resolve(__dirname, 'fixtures/nation', f), 'utf8'));

describe('index.json', () => {
  it('keeps the rows it can use: known moods, coded 시도, 시군구 with a point and a listed file', () => {
    const ix = parseIndex(fixture('index.json'))!;
    expect(ix.rules).toEqual({ moods: ['walk', 'new', 'food'], indoor: true });
    expect(ix.files).toEqual({ '51': 'a1b2c3d4e5', '47': '0123456789', '36110': 'fedcba9876' });
    expect(ix.sido.map((s) => s.c)).toEqual(['11', '36110', '47', '51']);
    // 세종 as 3611036110 is not a 시군구 code (/^\d{4,8}$/); 종로구's file is not listed; 양양군 has no point
    expect(ix.sgg.map((s) => s.c)).toEqual(['51150', '51210', '47940']);
    expect(ix.sgg[0]).toEqual({ c: '51150', n: '강릉시', s: '51', lat: 37.75, lng: 128.88, f: '51' });
  });

  it('indoor is offered only when the rules say true', () => {
    const base = fixture('index.json') as Record<string, unknown>;
    expect(parseIndex({ ...base, rules: { moods: ['walk'], indoor: false } })!.rules).toEqual({ moods: ['walk'], indoor: false });
    expect(parseIndex({ ...base, rules: { moods: ['walk'] } })!.rules.indoor).toBe(false);
  });

  it('null for what is not an index of this version', () => {
    const base = fixture('index.json') as Record<string, unknown>;
    for (const bad of [null, [], 'x', { ...base, v: 2 }, { ...base, rules: null }, { ...base, sgg: {} }, { ...base, files: [] }]) expect(parseIndex(bad)).toBeNull();
  });
});

describe('normalizeNation', () => {
  const spots = normalizeNation(fixture('51.json'));
  const byId = (id: string) => spots.find((s) => s.id === id);

  it('a record becomes a place: reason empty, the first mood, score 3, no 카카오 id, not bookable', () => {
    expect(byId('nt-125417')).toEqual({
      id: 'nt-125417',
      name: '국립대관령자연휴양림',
      lat: 37.71485534800313,
      lng: 128.79051549291611,
      mood: 'walk',
      moods: ['walk'],
      reason: '',
      image: 'https://tong.visitkorea.or.kr/cms/resource/12/3016112_image2_1.jpg',
      kakaoPlaceId: null,
      bookable: false,
      score: 3,
      sgg: '51150',
    });
  });

  it('photos over https, names tidied, indoor only when true, no cat', () => {
    expect(byId('nt-127951')).toMatchObject({ image: 'https://tong.visitkorea.or.kr/cms/resource/77/3349677_image2_1.jpg', indoor: true, sub: 'sight' });
    expect(byId('nt-2609150')).toMatchObject({ name: '뉴욕제과', mood: 'food', sub: 'cafe', indoor: true });
    expect(byId('nt-900006')).not.toHaveProperty('indoor');
    for (const s of spots) expect(s).not.toHaveProperty('cat');
  });

  it('every 새로운 것 is 구경 (sight) — a 체험 would leave the picks without a booking route (ADR-0074)', () => {
    expect(byId('nt-900001')).toMatchObject({ mood: 'new', sub: 'sight' });
    for (const s of spots.filter((s) => s.mood === 'new')) expect(s.sub).toBe('sight');
    expect(spots.every(listed)).toBe(true);
  });

  it('keeps all its moods; the first is its mood', () => {
    expect(byId('nt-900007')).toMatchObject({ mood: 'walk', moods: ['walk', 'new'] });
  });

  it('leaves out a 먹기 without meal / cafe, rest / famous only, no point, a bad 시군구 code, another id, a non-record', () => {
    for (const id of ['nt-900002', 'nt-900003', 'nt-900004', 'nt-900005', 'bs-126081']) expect(byId(id), id).toBeUndefined();
    expect(spots.map((s) => s.id)).toEqual(['nt-125417', 'nt-127951', 'nt-133494', 'nt-2609150', 'nt-125756', 'nt-900001', 'nt-900006', 'nt-900007']);
  });

  it('leaves out the 시군구 a 검수한 곳 covers', () => {
    const ids = normalizeNation(fixture('51.json'), ['51150']).map((s) => s.id);
    expect(ids).toEqual(['nt-2609150', 'nt-125756']);
  });

  it('an island 군 (울릉) only when the start is that 군', () => {
    expect(byId('nt-900008')).toBeUndefined();
    expect(normalizeNation(fixture('51.json'), [], '51150').some((s) => s.id === 'nt-900008')).toBe(false);
    expect(normalizeNation(fixture('51.json'), [], '47940').find((s) => s.id === 'nt-900008')).toMatchObject({ sgg: '47940', mood: 'walk' });
  });

  it('throws on what is not a list (the source then fails and is asked again, data.ts)', () => {
    expect(() => normalizeNation({})).toThrow();
  });
});
