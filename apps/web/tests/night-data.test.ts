// 밤 산길 데이터 (ADR-0091, specs/night-trails.md §1): scripts/night.mjs on fixtures and on the committed review/night round.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyNight, basisProblems, candidates, drawSample, loadNightCalls, roundProblems, scoreAudit, type NightCall, type SourceItem } from '../scripts/night.mjs';
import { loadInputs } from '../scripts/sunset.mjs';
import { fileSpots } from './fixtures';

const root = resolve(__dirname, '..');
const read = (p: string) => JSON.parse(readFileSync(resolve(root, p), 'utf8'));

type S = { id: string; name: string; mood: string; season?: unknown[]; book?: unknown; hide?: string; trail?: boolean };
const spot = (id: string, over: Partial<S> = {}): S => ({ id, name: id, mood: 'rest', ...over });
const item = (id: string, over: Partial<SourceItem> = {}): SourceItem => ({ id, name: id, tags: [], intro: null, comment: null, summary: null, ...over });
const call = (id: string, trail = true): NightCall => ({ id, trail, basis: 'x' });

describe('candidates (§1 후보)', () => {
  // made-up places: a word in the name or the source text, a name ending (악·산·봉, 악)), or 걷기
  const spots = [
    spot('a', { name: '가나오름' }),
    spot('b', { name: '다라악' }),
    spot('c', { name: '악기 공방' }),
    spot('d', { name: '마바산' }),
    spot('e', { name: '산들 식당', mood: 'food' }),
    spot('f', { name: '사아봉' }),
    spot('g', { name: '봉구 카페', mood: 'food' }),
    spot('h', { name: '자차(카타악)' }),
    spot('i', { name: '바닷가 국숫집', mood: 'food' }),
    spot('j', { name: '모래 해변', mood: 'walk' }),
    spot('k', { name: '하늘 정원' }),
    spot('l', { name: '조용한 책방' }),
  ];
  const raw = { ...item('i', { name: '바닷가 국숫집', comment: '올레시장 근처 국숫집' }), category: 'restaurant', image: 'https://x.test/i.webp', lat: 33.4 };
  const inputs = new Map<string, SourceItem>(spots.map((s) => [s.id, item(s.id, { name: s.name })]));
  inputs.set('i', raw);
  inputs.set('k', item('k', { name: '하늘 정원', summary: '삼나무 숲길을 걷는 정원' }));

  it('is every place with a word in its name or source text, and every 걷기 — nothing else', () => {
    expect(candidates(spots, inputs).map((c) => c.id)).toEqual(['a', 'b', 'd', 'f', 'h', 'i', 'j', 'k']);
  });
  it('carries what the judge reads, not the whole source item', () => {
    const i = candidates(spots, inputs).find((c) => c.id === 'i')!;
    expect(i).toEqual({ id: 'i', name: '바닷가 국숫집', mood: 'food', tags: [], intro: null, comment: '올레시장 근처 국숫집', summary: null });
  });
});

describe('drawSample (§1 블라인드 표본)', () => {
  const calls = [
    ...Array.from({ length: 70 }, (_, i) => call(`t${String(i).padStart(2, '0')}`, true)),
    ...Array.from({ length: 80 }, (_, i) => call(`f${String(i).padStart(2, '0')}`, false)),
  ];
  it('is 60 true + 60 false, no place twice, the same for the same seed whatever the order of the round', () => {
    const a = drawSample(calls, 7);
    expect(a).toHaveLength(120);
    expect(new Set(a).size).toBe(120);
    expect(a.filter((id) => id.startsWith('t'))).toHaveLength(60);
    expect(drawSample(calls, 7)).toEqual(a);
    expect(drawSample([...calls].reverse(), 7)).toEqual(a);
    expect(drawSample(calls, 8)).not.toEqual(a);
  });
  it('shuffles the two sides together', () => {
    expect(drawSample(calls, 7).slice(0, 60).every((id) => id.startsWith('t'))).toBe(false);
  });
  it('stops when a side has fewer than 60', () => {
    expect(() => drawSample(calls.slice(15), 7)).toThrow(/needs 60/);
  });
});

describe('scoreAudit (§1 통과 기준)', () => {
  const first = [...Array.from({ length: 60 }, (_, i) => call(`t${i}`, true)), ...Array.from({ length: 60 }, (_, i) => call(`f${i}`, false))];
  const ids = first.map((c) => c.id);
  /** the blind judge agrees except on the first `tToF` true (calls them false) and the first `fToT` false (calls them true) */
  const blind = (tToF: number, fToT: number) => first.map((c, i) => ({ id: c.id, trail: c.trail ? i >= tToF : i - 60 < fToT }));

  it('passes at 95% agreement with at most 3 true → false, and not one step past either', () => {
    const at = (tToF: number, fToT: number) => scoreAudit(first, ids, blind(tToF, fToT)).agreement;
    expect(at(0, 6)).toMatchObject({ n: 120, agree: 114, trueToFalse: 0, pass: true });
    expect(at(3, 3)).toMatchObject({ agree: 114, trueToFalse: 3, pass: true });
    expect(at(0, 7)).toMatchObject({ agree: 113, pass: false });
    expect(at(4, 0)).toMatchObject({ agree: 116, trueToFalse: 4, pass: false });
  });
  it('rows are in sample order with both calls', () => {
    const { rows } = scoreAudit(first, ids, blind(1, 0));
    expect(rows.map((r) => r.id)).toEqual(ids);
    expect(rows[0]).toEqual({ id: 't0', first: true, audit: false, agree: false });
  });
  it('stops unless every sampled place has exactly one blind true/false', () => {
    expect(() => scoreAudit(first, ids, blind(0, 0).slice(1))).toThrow(/no blind judgment/);
    expect(() => scoreAudit(first, ids, [...blind(0, 0), { id: 'zz', trail: true }])).toThrow(/not in the sample/);
    expect(() => scoreAudit(first, ids, [...blind(0, 0), { id: 't0', trail: true }])).toThrow(/twice/);
    expect(() => scoreAudit(first, ids, [{ id: 't0', trail: 'yes' as unknown as boolean }])).toThrow(/true\/false/);
  });
});

describe('applyNight (fixtures)', () => {
  const spots = (): S[] => [{ ...spot('a'), season: [], book: { k: 'naver' } }, spot('b'), { ...spot('c'), hide: 'closed' }, spot('d', { trail: true })];
  const loaded = { calls: [call('a'), call('b', false), call('c'), call('d', false)], pass: true };

  it('puts trail: true on the true ones, before the booking fields; takes an old one off; a second run changes no byte', () => {
    const once = applyNight(spots(), loaded);
    expect(Object.keys(once[0])).toEqual(['id', 'name', 'mood', 'season', 'trail', 'book']);
    expect(Object.keys(once[2]).slice(-2)).toEqual(['trail', 'hide']);
    expect(once[1]).toEqual(spot('b'));
    expect(once[3]).toEqual(spot('d'));
    expect(JSON.stringify(applyNight(once, loaded))).toBe(JSON.stringify(once));
  });
  it('changes nothing else', () => {
    const plain = (list: S[]) => list.map(({ trail: _t, ...s }) => s);
    expect(plain(applyNight(spots(), loaded))).toEqual(plain(spots()));
  });
  it('a round whose audit did not pass ships none, and takes old ones off', () => {
    expect(applyNight(spots(), { ...loaded, pass: false }).some((s) => 'trail' in s)).toBe(false);
  });
  it('stops on a judgment for a place that does not ship, the same place twice, or a trail that is not true/false', () => {
    expect(() => applyNight(spots(), { calls: [call('z')], pass: true })).toThrow(/not shipped/);
    expect(() => applyNight(spots(), { calls: [call('a'), call('a')], pass: true })).toThrow(/twice/);
    expect(() => applyNight(spots(), { calls: [{ id: 'a', trail: 'yes' as unknown as boolean, basis: 'x' }], pass: true })).toThrow(/true\/false/);
  });
});

describe('roundProblems · basisProblems (fixtures)', () => {
  const inputs = new Map([['a', item('a', { name: '하늘오름', summary: '정상까지 숲길이 이어진다' })], ['b', item('b')]]);
  it('a basis is a short phrase word for word from the place\'s own source text, or 「애매: 」 and one', () => {
    expect(basisProblems([{ id: 'a', trail: true, basis: '숲길이 이어진다' }, { id: 'a', trail: false, basis: '애매: 하늘오름' }], inputs)).toEqual([]);
    expect(basisProblems([{ id: 'a', trail: true, basis: '' }], inputs)[0]).toMatch(/no basis/);
    expect(basisProblems([{ id: 'a', trail: true, basis: '애매: ' }], inputs)[0]).toMatch(/no basis/);
    expect(basisProblems([{ id: 'a', trail: true, basis: '숲길이 길게 이어진다' }], inputs)[0]).toMatch(/not in the source/);
    expect(basisProblems([{ id: 'a', trail: true, basis: '가'.repeat(41) }], inputs)[0]).toMatch(/over 40/);
  });
  it('a round judges every candidate exactly once, true/false, and nothing else', () => {
    const ok = { id: 'b', trail: false, basis: 'b' };
    expect(roundProblems([{ id: 'a', trail: true, basis: '하늘오름' }, ok], ['a', 'b'], inputs)).toEqual([]);
    expect(roundProblems([ok], ['a', 'b'], inputs)).toEqual(['a: candidate not judged']);
    expect(roundProblems([ok, ok], ['b'], inputs)).toEqual(['b: judged twice']);
    expect(roundProblems([ok, { id: 'z', trail: true, basis: 'z' }], ['b'], inputs)[0]).toBe('z: not a candidate');
    expect(roundProblems([{ ...ok, trail: 'no' as unknown as boolean }], ['b'], inputs)).toEqual(['b: trail "no" is not true/false']);
  });
});

describe('review/night round 01 (committed)', () => {
  const list = read('review/night/candidates.json') as { id: string }[];
  const calls = read('review/night/trail-01.json') as NightCall[];
  const sample = read('review/night/audit-01-sample.json') as { round: string; seed: number; items: Record<string, unknown>[] };

  it('judges every candidate once, each basis a short phrase from that place\'s own source text', () => {
    expect(roundProblems(calls, list.map((c) => c.id), loadInputs())).toEqual([]);
  });
  it('the blind sample is what its seed draws from trail-01, and carries no judgment', () => {
    expect(sample.round).toBe('01');
    expect(sample.items.map((i) => i.id)).toEqual(drawSample(calls, sample.seed));
    for (const i of sample.items) expect(Object.keys(i)).toEqual(['id', 'name', 'tags', 'intro', 'comment', 'summary']);
  });
});

describe('shipped spots.json (round 01 passed)', () => {
  const shipped = readFileSync(resolve(root, 'public/spots.json'), 'utf8');
  it('is what night.mjs makes, and a second run changes no byte (idempotent)', () => {
    const loaded = loadNightCalls();
    expect(loaded).toMatchObject({ round: '01', pass: true });
    const once = applyNight(fileSpots, loaded);
    expect(JSON.stringify(once)).toBe(shipped);
    expect(JSON.stringify(applyNight(once, loaded))).toBe(shipped);
  });
  it('trail: true on exactly the round\'s 156 true places, nowhere else; no basis shipped', () => {
    const on = new Set(read('review/night/trail-01.json').filter((c: NightCall) => c.trail).map((c: NightCall) => c.id));
    expect(on.size).toBe(156);
    const marked = fileSpots.filter((s) => 'trail' in s);
    expect(marked.every((s) => s.trail === true)).toBe(true);
    expect(marked.map((s) => s.id).sort()).toEqual([...on].sort());
    expect(shipped).not.toMatch(/"basis"/);
  });
});
