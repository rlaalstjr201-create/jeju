import { describe, it, expect } from 'vitest';
import { extractAwards, mergeAwards } from './enrich-awards.js';

describe('extractAwards', () => {
  it('returns [] for text with no awards', () => {
    expect(extractAwards('맛있는 식당 제주도 여행')).toEqual([]);
  });

  it('detects 블루리본', () => {
    expect(extractAwards('블루리본 선정 맛집')).toEqual(['blue_ribbon']);
  });

  it('ignores 미쉐린 when 타이어 is in context', () => {
    expect(extractAwards('미쉐린 타이어 서비스')).toEqual([]);
  });

  it('detects michelin from 미쉐린 가이드', () => {
    expect(extractAwards('미쉐린 가이드 선정 맛집')).toEqual(['michelin']);
  });

  it('detects both michelin and michelin_star from 미슐랭 스타', () => {
    const result = extractAwards('미슐랭 스타 레스토랑');
    expect(result).toContain('michelin');
    expect(result).toContain('michelin_star');
    expect(result).toHaveLength(2);
  });

  it('detects korea_top100', () => {
    expect(extractAwards('한국관광100선에 선정된 곳')).toEqual(['korea_top100']);
  });

  it('detects bib_gourmand', () => {
    expect(extractAwards('빕그루망 레스토랑')).toEqual(['bib_gourmand']);
  });

  it('detects baeknyeon_gaje', () => {
    expect(extractAwards('백년가게 인증 식당')).toEqual(['baeknyeon_gaje']);
  });

  it('detects multiple awards without duplicates', () => {
    const result = extractAwards('블루리본 선정, 백년가게 인증, 한국관광 100선 포함');
    expect(result).toContain('blue_ribbon');
    expect(result).toContain('baeknyeon_gaje');
    expect(result).toContain('korea_top100');
    expect(result).toHaveLength(3);
  });
});

describe('mergeAwards', () => {
  it('returns union when there is no overlap', () => {
    expect(mergeAwards(['blue_ribbon'], ['michelin'])).toEqual(['blue_ribbon', 'michelin']);
  });

  it('deduplicates overlapping entries', () => {
    const result = mergeAwards(['blue_ribbon', 'michelin'], ['michelin', 'bib_gourmand']);
    expect(result).toContain('blue_ribbon');
    expect(result).toContain('michelin');
    expect(result).toContain('bib_gourmand');
    expect(result).toHaveLength(3);
  });

  it('returns new awards when existing is empty', () => {
    expect(mergeAwards([], ['michelin'])).toEqual(['michelin']);
  });

  it('returns existing awards when new is empty', () => {
    expect(mergeAwards(['blue_ribbon'], [])).toEqual(['blue_ribbon']);
  });
});
