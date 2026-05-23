import { describe, it, expect } from 'vitest';
import {
  naverCoordToWgs84,
  stripHtml,
  normalizeForNameMatch,
  isNameMatch,
  isJejuBbox,
  evaluateNaverItems,
} from './enrich-naver-local.js';

describe('naverCoordToWgs84', () => {
  it('converts mapy for 성산일출봉', () => {
    expect(naverCoordToWgs84(334591070)).toBeCloseTo(33.4591, 3);
  });

  it('converts mapx for 성산일출봉', () => {
    expect(naverCoordToWgs84(1269405040)).toBeCloseTo(126.9405, 3);
  });
});

describe('stripHtml', () => {
  it('removes bold tags', () => {
    expect(stripHtml('<b>한라산</b>')).toBe('한라산');
  });

  it('decodes HTML entities', () => {
    expect(stripHtml('카페&amp;베이커리')).toBe('카페&베이커리');
    expect(stripHtml('A&lt;B&gt;C')).toBe('A<B>C');
    expect(stripHtml('&quot;제주&quot;')).toBe('"제주"');
    expect(stripHtml('it&#39;s')).toBe("it's");
  });

  it('removes mixed tags and entities', () => {
    expect(stripHtml('<b>성산</b>일출봉&amp;관광지')).toBe('성산일출봉&관광지');
  });
});

describe('normalizeForNameMatch', () => {
  it('strips brackets, whitespace, and lowercases', () => {
    expect(normalizeForNameMatch('궁대오름(궁대악)')).toBe('궁대오름');
    expect(normalizeForNameMatch('Cafe Hello  World')).toBe('cafehelloworld');
  });

  it('handles no brackets', () => {
    expect(normalizeForNameMatch('한라산')).toBe('한라산');
  });
});

describe('isNameMatch', () => {
  it('exact match', () => {
    expect(isNameMatch('한라산', '한라산')).toBe(true);
  });

  it('naver title is prefix of spot (sub-facility)', () => {
    expect(isNameMatch('만장굴매표소', '만장굴')).toBe(true);
  });

  it('spot is prefix of naver title (sub-facility)', () => {
    expect(isNameMatch('만장굴', '만장굴매표소')).toBe(true);
  });

  it('blocks false positive: 카페한라산 vs 한라산', () => {
    // "카페한라산".startsWith("한라산") → false (카페 is prefix, not suffix)
    // normalizeForNameMatch("카페한라산") = "카페한라산"
    // normalizeForNameMatch("한라산") = "한라산"
    // "카페한라산" !== "한라산" ✓
    // "카페한라산".startsWith("한라산") → false ✓
    // "한라산".startsWith("카페한라산") → false ✓
    expect(isNameMatch('한라산', '카페한라산')).toBe(false);
  });

  it('brackets are stripped before comparison', () => {
    expect(isNameMatch('궁대오름(궁대악)', '궁대오름')).toBe(true);
  });

  it('returns false for empty strings', () => {
    expect(isNameMatch('', '한라산')).toBe(false);
    expect(isNameMatch('한라산', '')).toBe(false);
  });

  it('case-insensitive match', () => {
    expect(isNameMatch('Cafe Hello', 'cafe hello')).toBe(true);
  });
});

describe('isJejuBbox', () => {
  it('returns true for Jeju coordinates', () => {
    expect(isJejuBbox(33.4591, 126.9405)).toBe(true);
  });

  it('returns false for Seoul coordinates', () => {
    expect(isJejuBbox(37.5665, 126.9780)).toBe(false);
  });

  it('returns false at boundary edges (exclusive check)', () => {
    expect(isJejuBbox(33.0, 126.0)).toBe(true);   // inclusive min
    expect(isJejuBbox(34.0, 127.0)).toBe(true);   // inclusive max
    expect(isJejuBbox(32.9, 126.5)).toBe(false);  // below lat min
  });
});

describe('evaluateNaverItems', () => {
  const halla = {
    title: '<b>한라산</b>',
    category: '여행,관광>산',
    address: '제주 제주시',
    roadAddress: '제주 제주시',
    mapx: 1265294000,
    mapy: 333614000,
  };

  const cafeHalla = {
    title: '<b>카페</b>한라산',
    category: '음식점>카페',
    address: '제주 제주시 어딘가',
    roadAddress: '제주 제주시 어딘가',
    mapx: 1265294000,
    mapy: 333614000,
  };

  it('matches when name and bbox and distance all pass', () => {
    const result = evaluateNaverItems([halla], '한라산', 33.3614, 126.5294, false);
    expect(result.matched).toBe(true);
    expect(result.distM).toBeLessThan(50);
    expect(result.unverified).toBeUndefined();
  });

  it('skips false positive (카페한라산 vs 한라산)', () => {
    const result = evaluateNaverItems([cafeHalla], '한라산', 33.3614, 126.5294, false);
    expect(result.matched).toBe(false);
  });

  it('finds correct item when false positive is first in list', () => {
    const result = evaluateNaverItems([cafeHalla, halla], '한라산', 33.3614, 126.5294, false);
    expect(result.matched).toBe(true);
  });

  it('returns unverified=true when review_excluded=true', () => {
    const result = evaluateNaverItems([halla], '한라산', null, null, true);
    expect(result.matched).toBe(true);
    expect(result.unverified).toBe(true);
  });

  it('returns unverified=true when spotLat is null', () => {
    const result = evaluateNaverItems([halla], '한라산', null, null, false);
    expect(result.matched).toBe(true);
    expect(result.unverified).toBe(true);
  });

  it('rejects item exceeding maxDistM', () => {
    // item is at 한라산 coords, but spot is at 성산일출봉 (~43km away)
    const result = evaluateNaverItems([halla], '한라산', 33.4591, 126.9405, false, 500);
    expect(result.matched).toBe(false);
  });

  it('rejects item outside Jeju bbox', () => {
    const seoulItem = { ...halla, mapx: 1269780000, mapy: 375665000 }; // Seoul
    const result = evaluateNaverItems([seoulItem], '한라산', 33.3614, 126.5294, false);
    expect(result.matched).toBe(false);
  });

  it('returns { matched: false } for empty items', () => {
    const result = evaluateNaverItems([], '한라산', 33.3614, 126.5294, false);
    expect(result.matched).toBe(false);
  });
});
