// S1' 데이터 (plans/tomorrow-picker.md "전 항목 검수", ADR-0028) — spots.json 자체와, build-spots.mjs가
// review/input 대비 완전성을 지켰는지를 검사한다. 옛 S1(총 400개 이상 등)은 275곳 실패로 S1'가 대체했다.
import { gzipSync } from 'node:zlib';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cardTextProblem, PRICE_HOURS } from '../src/card-text';
import { fileSpots } from './fixtures';

const root = resolve(__dirname, '..');
const FIELDS = ['bookable', 'id', 'image', 'kakaoPlaceId', 'lat', 'lng', 'mood', 'name', 'reason'];
const FOOD_FIELDS = [...FIELDS, 'sub'];
const DAY_WORDS = /월요일|화요일|수요일|목요일|금요일|토요일|일요일|매주|정기휴무/;

describe("S1' 레코드 형식", () => {
  it('every record has exactly the 9 fields (food: +sub), coords in Jeju, https image, mood ∈ {rest,walk,new,food}', () => {
    const bad = fileSpots.filter((s) => {
      const expectedFields = s.mood === 'food' ? FOOD_FIELDS : FIELDS;
      return (
        Object.keys(s).sort().join() !== [...expectedFields].sort().join() ||
        !(s.lat >= 33.1 && s.lat <= 33.6 && s.lng >= 126.1 && s.lng <= 127.0) ||
        !s.image.startsWith('https://') ||
        !['rest', 'walk', 'new', 'food'].includes(s.mood) ||
        typeof s.bookable !== 'boolean' ||
        (s.kakaoPlaceId !== null && typeof s.kakaoPlaceId !== 'string')
      );
    });
    expect(bad.map((s) => s.id)).toEqual([]);
  });

  it("food spots all have sub ∈ {meal, cafe}; non-food spots have no sub field", () => {
    const badFood = fileSpots.filter((s) => s.mood === 'food' && s.sub !== 'meal' && s.sub !== 'cafe');
    expect(badFood.map((s) => s.id)).toEqual([]);
    const badNonFood = fileSpots.filter((s) => s.mood !== 'food' && 'sub' in s);
    expect(badNonFood.map((s) => s.id)).toEqual([]);
    expect(fileSpots.some((s) => s.sub === 'meal')).toBe(true);
    expect(fileSpots.some((s) => s.sub === 'cafe')).toBe(true);
  });

  it("reason is 15~70 chars and has no price/hours/weekday/rating wording (S1')", () => {
    const bad = fileSpots.filter((s) => {
      const n = [...s.reason].length;
      return n < 15 || n > 70 || PRICE_HOURS.test(s.reason) || DAY_WORDS.test(s.reason) || cardTextProblem(s) !== null;
    });
    expect(bad.map((s) => s.id)).toEqual([]);
  });

  it('id is unique; kakaoPlaceId is unique among non-null values', () => {
    expect(new Set(fileSpots.map((s) => s.id)).size).toBe(fileSpots.length);
    const withKakao = fileSpots.map((s) => s.kakaoPlaceId).filter((k): k is string => k !== null);
    expect(new Set(withKakao).size).toBe(withKakao.length);
  });

  it('bookable is true iff the source item was category=experience', () => {
    // Cross-check against review/input: bookable can only be true for ids whose input category is 'experience'.
    const expByInput = new Map<string, boolean>();
    for (const f of readdirSync(resolve(root, 'review/input')).filter((f) => /^batch-\d{3}\.json$/.test(f))) {
      for (const item of JSON.parse(readFileSync(resolve(root, 'review/input', f), 'utf8'))) {
        expByInput.set(item.id, item.category === 'experience');
      }
    }
    const bad = fileSpots.filter((s) => expByInput.get(s.id) !== s.bookable);
    expect(bad.map((s) => s.id)).toEqual([]);
  });

  it('the two faithfulness-audit ids are excluded', () => {
    for (const id of ['441cd149-a579-40bf-b83c-49701ee287a4', '0d356242-13ce-4c6c-9b9b-3a69888a4cf5']) {
      expect(fileSpots.find((s) => s.id === id)).toBeUndefined();
    }
  });
});

describe("S1' 완전성 (review/input 대비)", () => {
  const inputIds = new Set<string>();
  for (const f of readdirSync(resolve(root, 'review/input')).filter((f) => /^batch-\d{3}\.json$/.test(f))) {
    for (const item of JSON.parse(readFileSync(resolve(root, 'review/input', f), 'utf8'))) inputIds.add(item.id);
  }
  // Same merge order as build-spots.mjs: batch verdicts first, then adj overrides by id.
  const verdictIds = new Set<string>();
  for (const f of readdirSync(resolve(root, 'review/out')).filter((f) => /^batch-\d{3}\.json$/.test(f)).sort()) {
    for (const v of JSON.parse(readFileSync(resolve(root, 'review/out', f), 'utf8'))) verdictIds.add(v.id);
  }
  for (const f of readdirSync(resolve(root, 'review/out')).filter((f) => /^adj-\d{3}\.json$/.test(f)).sort()) {
    for (const v of JSON.parse(readFileSync(resolve(root, 'review/out', f), 'utf8'))) verdictIds.add(v.id);
  }

  it('every kept spot exists as a prefilter-passing input item', () => {
    expect(fileSpots.every((s) => inputIds.has(s.id))).toBe(true);
    expect(inputIds.size).toBeGreaterThan(0);
  });

  it('every prefilter-passing input item has a verdict (batch or adj) — 0 missing (plan S1\' 100% coverage)', () => {
    const missing = [...inputIds].filter((id) => !verdictIds.has(id)).sort();
    expect(missing).toEqual([]);
  });
});

describe("S1' 기분별 분포", () => {
  const count = (mood: string) => fileSpots.filter((s) => s.mood === mood).length;
  it.each(['rest', 'walk', 'new', 'food'])('%s has at least one spot', (mood) => {
    expect(count(mood)).toBeGreaterThan(0);
  });
  it('food (맛집) is included, per ADR-0028', () => {
    expect(count('food')).toBeGreaterThan(0);
  });
});

describe('spots.json size', () => {
  it('gzip size is reported (no hard cap in S1\' — dataset intentionally grew from ~275 to full review)', () => {
    const kb = gzipSync(readFileSync(resolve(root, 'public/spots.json'))).length / 1024;
    expect(kb).toBeGreaterThan(0);
    // eslint-disable-next-line no-console
    console.log(`spots.json gzip: ${kb.toFixed(1)} KB`);
  });
});
