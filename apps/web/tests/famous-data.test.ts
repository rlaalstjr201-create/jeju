// 유명한 곳 데이터 (ADR-0092, specs/famous-places.md §1·F5): scripts/famous.mjs on made-up places and on the shipped file.
import { describe, expect, it } from 'vitest';
import { normalizeSpots } from '../src/data';
import { applyFamous, isFamous, loadPop, popScores, type FamousItem } from '../scripts/famous.mjs';
import { loadInputs } from '../scripts/sunset.mjs';
import { fileSpots } from './fixtures';

type S = { id: string; name: string; mood: string; score: number; indoor?: boolean; hide?: string; trail?: true; book?: unknown };
const spot = (id: string, over: Partial<S> = {}): S => ({ id, name: id, mood: 'walk', score: 5, ...over });
const item = (id: string, over: Partial<FamousItem> = {}): FamousItem => ({ id, name: id, category: 'sightseeing', tags: [], ...over });

describe('isFamous (§1, made-up places)', () => {
  it('a 관광지 scored 5, or a 공영관광지 scored 4 or more — whatever the mood, indoors too', () => {
    expect(isFamous(spot('a'), item('a'))).toBe(true);
    expect(isFamous(spot('b', { mood: 'rest' }), item('b'))).toBe(true);
    expect(isFamous(spot('c', { mood: 'new', indoor: true }), item('c'))).toBe(true);
    expect(isFamous(spot('d', { score: 4 }), item('d'))).toBe(false);
    expect(isFamous(spot('e', { score: 4 }), item('e', { category: 'experience', tags: ['공영관광지'] }))).toBe(true);
    expect(isFamous(spot('f', { score: 4 }), item('f', { category: 'cultural_space', tags: ['공영관광지인증'] }))).toBe(true);
    expect(isFamous(spot('g', { score: 3 }), item('g', { tags: ['공영관광지'] }))).toBe(false);
    expect(isFamous(spot('h'), item('h', { category: 'experience' }))).toBe(false);
  });
  it('never 먹기, a hidden place, a restaurant / cafe / shopping source, a cafe word, or a 제주올레 course', () => {
    expect(isFamous(spot('a', { mood: 'food' }), item('a'))).toBe(false);
    expect(isFamous(spot('b', { hide: 'closed' }), item('b'))).toBe(false);
    for (const category of ['restaurant', 'cafe', 'shopping']) expect(isFamous(spot('c', { mood: 'rest' }), item('c', { category, tags: ['공영관광지'] })), category).toBe(false);
    expect(isFamous(spot('d', { name: '바다 카페' }), item('d'))).toBe(false);
    expect(isFamous(spot('e'), item('e', { tags: ['정원', '제주빵집'] }))).toBe(false);
    expect(isFamous(spot('f', { name: '제주올레 3코스' }), item('f'))).toBe(false);
    expect(isFamous(spot('g'), undefined)).toBe(false);
  });
  it('applyFamous: true where isFamous says so, after trail and before a 체험\'s booking fields; an old famous is taken off', () => {
    const inputs = new Map([['a', item('a')], ['b', item('b')], ['c', item('c', { category: 'cafe' })]]);
    const counts = new Map([['a', 9], ['b', 999]]);
    const out = applyFamous([spot('a', { trail: true }), spot('b', { mood: 'new', book: { k: 'naver', u: 'https://x.test' } }), { ...spot('c'), famous: true, pop: 0.5 } as S], inputs, counts);
    expect(out[0]).toMatchObject({ famous: true, pop: 0 });
    expect(Object.keys(out[0])).toEqual(['id', 'name', 'mood', 'score', 'trail', 'famous', 'pop']);
    expect(Object.keys(out[1])).toEqual(['id', 'name', 'mood', 'score', 'famous', 'pop', 'book']);
    expect(out[1]).toMatchObject({ pop: 1 });
    expect('famous' in out[2] || 'pop' in out[2]).toBe(false);
    expect(applyFamous(out, inputs, counts)).toEqual(out);
  });
  it('popScores (criteria §4): log10(1 + n) placed 0–1 among the places, 3 decimals; a missing or failed count stops it', () => {
    // log10: n = 0 → 0, 9 → 1, 99 → 2
    expect([...popScores(new Map([['a', 0], ['b', 9], ['c', 99]]), ['a', 'b', 'c'])]).toEqual([['a', 0], ['b', 0.5], ['c', 1]]);
    expect(() => popScores(new Map([['a', 0], ['b', null]]), ['a', 'b'])).toThrow(/b/);
    expect(() => popScores(new Map([['a', 0]]), ['a', 'x'])).toThrow(/x/);
  });
});

describe('shipped spots.json (F5)', () => {
  const inputs = loadInputs() as unknown as Map<string, FamousItem>;
  const famous = fileSpots.filter((s) => 'famous' in s);

  it('is what famous.mjs makes, and a second run changes no byte (idempotent)', () => {
    const once = applyFamous(fileSpots, inputs);
    expect(JSON.stringify(once)).toBe(JSON.stringify(fileSpots));
    expect(JSON.stringify(applyFamous(once, inputs))).toBe(JSON.stringify(fileSpots));
  });
  it('famous: true on exactly the 73 places the rule and the owner pick (61 outdoors, 12 indoors), nowhere else', () => {
    expect(famous.every((s) => s.famous === true)).toBe(true);
    expect(famous.map((s) => s.id)).toEqual(fileSpots.filter((s) => isFamous(s, inputs.get(s.id))).map((s) => s.id));
    expect(famous).toHaveLength(73);
    expect(famous.filter((s) => s.indoor)).toHaveLength(12);
  });
  it('the owner\'s two (Amendment 1): 쇠소깍 and 국립제주박물관 by id, not the shops named 쇠소깍…', () => {
    const ids = ['056167bb-a013-49eb-894a-cefa6592257b', 'a01f0b63-31ac-4898-8286-da9686bf8895'];
    expect(ids.map((id) => fileSpots.find((s) => s.id === id)).map((s) => [s?.name, s?.famous])).toEqual([['쇠소깍', true], ['국립제주박물관', true]]);
    expect(fileSpots.filter((s) => s.name.startsWith('쇠소깍') && s.famous).map((s) => s.name)).toEqual(['쇠소깍']);
    expect(isFamous({ ...spot('x'), id: ids[0], mood: 'food' }, undefined)).toBe(false);
  });
  it('no 먹기, no cafe or restaurant source, no ocean-view cafe of 쉬기, no 올레 course; the owner\'s examples are in', () => {
    expect(famous.filter((s) => s.mood === 'food')).toEqual([]);
    expect(famous.filter((s) => ['cafe', 'restaurant', 'shopping'].includes(inputs.get(s.id)!.category as string))).toEqual([]);
    const named = (n: string) => fileSpots.filter((s) => s.name === n);
    for (const n of ['해일리 카페', '해지개', '애월더선셋', '제주올레 1코스', '제주올레 7코스']) {
      expect(named(n).length, n).toBeGreaterThan(0);
      expect(named(n).some((s) => s.famous), n).toBe(false);
    }
    for (const n of ['성산일출봉', '섭지코지', '광치기해변', '천지연폭포', '정방폭포']) expect(named(n).some((s) => s.famous), n).toBe(true);
  });
  it('pop on every 유명한 곳, from the latest review/famous/pop-NN.json (pop-03 검색량, Amendment 4; no 확인 실패), 0–1, the most looked-for 1', () => {
    const counts = loadPop();
    expect(counts.get(famous.find((s) => s.name === '서귀포시립기당미술관')!.id)).toBe(910); // pop-03 월간 검색수 (기당미술관)
    expect(famous.every((s) => typeof s.pop === 'number' && s.pop >= 0 && s.pop <= 1 && Number.isInteger(counts.get(s.id)))).toBe(true);
    expect(fileSpots.filter((s) => 'pop' in s && !s.famous)).toEqual([]);
    expect(famous.filter((s) => s.pop === 1).map((s) => s.name)).toEqual(['천지연폭포']);
  });
  it('only famous true is kept at load; any other value is dropped, the place stays', () => {
    const f = famous[0];
    const [ok, no, str] = normalizeSpots([f, { ...f, id: 'x', famous: false }, { ...f, id: 'y', famous: 'true' }]);
    expect(ok).toBe(f);
    expect('famous' in no).toBe(false);
    expect('famous' in str).toBe(false);
  });
});
