// 유명한 곳 데이터 (ADR-0092, specs/famous-places.md §1·F5): scripts/famous.mjs on made-up places and on the shipped file.
import { describe, expect, it } from 'vitest';
import { normalizeSpots } from '../src/data';
import { applyFamous, isFamous, type FamousItem } from '../scripts/famous.mjs';
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
    const out = applyFamous([spot('a', { trail: true }), spot('b', { mood: 'new', book: { k: 'naver', u: 'https://x.test' } }), { ...spot('c'), famous: true } as S], inputs);
    expect(Object.keys(out[0])).toEqual(['id', 'name', 'mood', 'score', 'trail', 'famous']);
    expect(Object.keys(out[1])).toEqual(['id', 'name', 'mood', 'score', 'famous', 'book']);
    expect('famous' in out[2]).toBe(false);
    expect(applyFamous(out, inputs)).toEqual(out);
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
  it('famous: true on exactly the 71 places the rule picks (60 outdoors, 11 indoors), nowhere else', () => {
    expect(famous.every((s) => s.famous === true)).toBe(true);
    expect(famous.map((s) => s.id)).toEqual(fileSpots.filter((s) => isFamous(s, inputs.get(s.id))).map((s) => s.id));
    expect(famous).toHaveLength(71);
    expect(famous.filter((s) => s.indoor)).toHaveLength(11);
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
  it('only famous true is kept at load; any other value is dropped, the place stays', () => {
    const f = famous[0];
    const [ok, no, str] = normalizeSpots([f, { ...f, id: 'x', famous: false }, { ...f, id: 'y', famous: 'true' }]);
    expect(ok).toBe(f);
    expect('famous' in no).toBe(false);
    expect('famous' in str).toBe(false);
  });
});
