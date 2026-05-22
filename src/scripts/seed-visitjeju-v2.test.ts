import { describe, it, expect } from 'vitest';
import {
  classifyCategory,
  normalizeRegion,
  validateCoords,
  normalizeForDedup,
  jaccardBigram,
  haversineMeters,
  isDedupMatch,
  type DedupItem,
} from './seed-visitjeju-v2.js';

// ── classifyCategory ──────────────────────────────────────────────

describe('classifyCategory', () => {
  it('c1 no keywords → sightseeing', () => {
    expect(classifyCategory('c1', '우도', '', '')).toBe('sightseeing');
  });

  it('c1 title has 박물관 → cultural_space', () => {
    expect(classifyCategory('c1', '제주민속자연사박물관', '', '')).toBe('cultural_space');
  });

  it('c1 introduction has 미술관 → cultural_space', () => {
    expect(classifyCategory('c1', '이중섭거리', '이중섭미술관과 이어지는 문화거리', '')).toBe('cultural_space');
  });

  it('c1 tag has 체험 → experience', () => {
    expect(classifyCategory('c1', '해녀의집', '', '해녀,체험,제주')).toBe('experience');
  });

  it('c1 introduction has 서핑 → experience', () => {
    expect(classifyCategory('c1', '중문해수욕장', '서핑과 스노클링 체험 가능', '')).toBe('experience');
  });

  it('c1 문화공간 > 체험 priority: 박물관+체험 → cultural_space', () => {
    expect(classifyCategory('c1', '제주해녀박물관', '해녀 문화체험 공간', '체험')).toBe('cultural_space');
  });

  it('c4 no cafe keywords → restaurant', () => {
    expect(classifyCategory('c4', '흑돼지구이', '제주 흑돼지 전문점', '고기,제주')).toBe('restaurant');
  });

  it('c4 title has 카페 → cafe', () => {
    expect(classifyCategory('c4', '바다뷰카페', '', '')).toBe('cafe');
  });

  it('c4 tag has 베이커리 → cafe', () => {
    expect(classifyCategory('c4', '굴무기낭', '발효빵 전문점', '베이커리,비건')).toBe('cafe');
  });

  it('c4 introduction has 빙수 → cafe', () => {
    expect(classifyCategory('c4', '달콤한 곳', '여름 빙수로 유명한 곳', '')).toBe('cafe');
  });

  it('c4 카페 > 맛집 priority: 카페+식당 → cafe', () => {
    expect(classifyCategory('c4', '카페&식당', '카페와 식사를 동시에', '맛집,카페')).toBe('cafe');
  });
});

// ── normalizeRegion ───────────────────────────────────────────────

describe('normalizeRegion', () => {
  it('region1 → jeju-city', () => {
    expect(normalizeRegion('region1')).toBe('jeju-city');
  });

  it('region2 → seogwipo', () => {
    expect(normalizeRegion('region2')).toBe('seogwipo');
  });

  it('region3 → island (섬 속의 섬)', () => {
    expect(normalizeRegion('region3')).toBe('island');
  });

  it('unknown value → jeju-city fallback', () => {
    expect(normalizeRegion('A01')).toBe('jeju-city');
    expect(normalizeRegion('')).toBe('jeju-city');
    expect(normalizeRegion('region99')).toBe('jeju-city');
  });
});

// ── validateCoords ────────────────────────────────────────────────

describe('validateCoords', () => {
  it('null, null → state null', () => {
    expect(validateCoords(null, null)).toEqual({ state: 'null' });
  });

  it('undefined → state null', () => {
    expect(validateCoords(undefined, undefined)).toEqual({ state: 'null' });
  });

  it('NaN string → state null', () => {
    expect(validateCoords('abc', '126.5')).toEqual({ state: 'null' });
  });

  it('valid Jeju coords (number) → state ok', () => {
    const r = validateCoords(33.5, 126.5);
    expect(r.state).toBe('ok');
    if (r.state === 'ok') {
      expect(r.lat).toBeCloseTo(33.5);
      expect(r.lng).toBeCloseTo(126.5);
    }
  });

  it('valid Jeju coords (string) → state ok with parsed numbers', () => {
    const r = validateCoords('33.4532', '126.9012');
    expect(r.state).toBe('ok');
    if (r.state === 'ok') {
      expect(r.lat).toBeCloseTo(33.4532);
      expect(r.lng).toBeCloseTo(126.9012);
    }
  });

  it('outside bbox (Seoul) → state bbox with actual coords preserved', () => {
    const r = validateCoords(37.5665, 126.978);
    expect(r.state).toBe('bbox');
    if (r.state === 'bbox') {
      expect(r.lat).toBeCloseTo(37.5665);
    }
  });

  it('boundary lower edge included → state ok', () => {
    expect(validateCoords(33.10, 126.10).state).toBe('ok');
  });

  it('boundary upper edge included → state ok', () => {
    expect(validateCoords(33.60, 126.99).state).toBe('ok');
  });

  it('just outside upper lat boundary → state bbox', () => {
    expect(validateCoords(33.61, 126.5).state).toBe('bbox');
  });
});

// ── dedup v3 functions ────────────────────────────────────────────

describe('normalizeForDedup', () => {
  it('removes spaces and brackets', () => {
    expect(normalizeForDedup('제주도 공방 (노꼬메)')).toBe('제주도공방노꼬메');
  });

  it('lowercases English', () => {
    expect(normalizeForDedup('Café Jeju')).toBe('caféjeju');
  });

  it('removes dots and dashes', () => {
    expect(normalizeForDedup('스타벅스.제주점-애월')).toBe('스타벅스제주점애월');
  });
});

describe('jaccardBigram', () => {
  it('identical strings → 1', () => {
    expect(jaccardBigram('이중섭미술관', '이중섭미술관')).toBe(1);
  });

  it('completely different strings → 0', () => {
    expect(jaccardBigram('성산일출봉', '카페한라산')).toBe(0);
  });

  it('partial overlap returns value in (0,1)', () => {
    const sim = jaccardBigram('이중섭미술관', '이중섭거리');
    expect(sim).toBeGreaterThan(0);
    expect(sim).toBeLessThan(1);
  });

  it('empty strings both → 1', () => {
    expect(jaccardBigram('', '')).toBe(1);
  });

  it('one empty one not → 0', () => {
    expect(jaccardBigram('', '제주')).toBe(0);
  });
});

describe('haversineMeters', () => {
  it('same point → 0', () => {
    expect(haversineMeters(33.5, 126.5, 33.5, 126.5)).toBe(0);
  });

  it('~0.001° lat separation ≈ 111m', () => {
    const d = haversineMeters(33.0, 126.5, 33.001, 126.5);
    expect(d).toBeGreaterThan(100);
    expect(d).toBeLessThan(120);
  });

  it('>100m when 0.002° lat apart', () => {
    expect(haversineMeters(33.0, 126.5, 33.002, 126.5)).toBeGreaterThan(100);
  });
});

describe('isDedupMatch', () => {
  const base: DedupItem = {
    contentsid: 'CONT_A',
    normName: '성산일출봉',
    category: 'sightseeing',
    lat: 33.459,
    lng: 126.942,
  };

  it('same contentsid → duplicate regardless of everything else', () => {
    const other: DedupItem = { contentsid: 'CONT_A', normName: '완전다른이름', category: 'cafe', lat: 35.0, lng: 129.0 };
    expect(isDedupMatch(base, other)).toBe(true);
  });

  it('same name + same category + < 100m → duplicate', () => {
    const other: DedupItem = { contentsid: 'CONT_B', normName: '성산일출봉', category: 'sightseeing', lat: 33.4591, lng: 126.942 };
    expect(isDedupMatch(base, other)).toBe(true);
  });

  it('same name + different category → NOT duplicate (ADR-0053 카테고리 일치 조건)', () => {
    const cafe: DedupItem = { contentsid: 'CONT_C', normName: '성산일출봉', category: 'cafe', lat: 33.459, lng: 126.942 };
    expect(isDedupMatch(base, cafe)).toBe(false);
  });

  it('name length diff ≥ 3 → NOT duplicate', () => {
    // "스타벅스"(4) vs "스타벅스성산점"(7) → diff=3 → not dup
    const a: DedupItem = { contentsid: 'C1', normName: '스타벅스', category: 'cafe', lat: 33.5, lng: 126.5 };
    const b: DedupItem = { contentsid: 'C2', normName: '스타벅스성산점', category: 'cafe', lat: 33.5, lng: 126.5 };
    expect(isDedupMatch(a, b)).toBe(false);
  });

  it('distance ≥ 100m → NOT duplicate', () => {
    // ~222m north
    const far: DedupItem = { contentsid: 'CONT_D', normName: '성산일출봉', category: 'sightseeing', lat: 33.461, lng: 126.942 };
    expect(isDedupMatch(base, far)).toBe(false);
  });

  it('jaccard < 0.7 → NOT duplicate', () => {
    const dissim: DedupItem = { contentsid: 'CONT_E', normName: '성산이색카페', category: 'sightseeing', lat: 33.459, lng: 126.942 };
    const sim = jaccardBigram('성산일출봉', '성산이색카페');
    expect(sim).toBeLessThan(0.7);
    expect(isDedupMatch(base, dissim)).toBe(false);
  });

  it('high jaccard + close coords + same category → duplicate', () => {
    // 이중섭미술관 vs 이중섭미술관 (동일명, 다른 contentid)
    const a: DedupItem = { contentsid: 'X1', normName: '이중섭미술관', category: 'cultural_space', lat: 33.25, lng: 126.56 };
    const b: DedupItem = { contentsid: 'X2', normName: '이중섭미술관', category: 'cultural_space', lat: 33.2501, lng: 126.5601 };
    expect(isDedupMatch(a, b)).toBe(true);
  });
});
