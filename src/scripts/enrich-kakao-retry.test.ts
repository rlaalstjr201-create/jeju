import { describe, it, expect } from 'vitest';
import { stripBrackets, isCategoryCompatible } from './enrich-kakao-retry.js';

describe('stripBrackets', () => {
  it('removes parenthetical alias', () => {
    expect(stripBrackets('궁대오름(궁대악)')).toBe('궁대오름');
  });
  it('removes multiple aliases', () => {
    expect(stripBrackets('물메(물미, 수산봉)')).toBe('물메');
  });
  it('removes full-width parentheses', () => {
    expect(stripBrackets('영아리（youngari）')).toBe('영아리');
  });
  it('removes trailing space alias', () => {
    expect(stripBrackets('남원항 (남원포구)')).toBe('남원항');
  });
  it('removes leading space alias', () => {
    expect(stripBrackets(' 제주신화월드 용푸(Yong Fu Family Feast)')).toBe('제주신화월드 용푸');
  });
  it('no change when no brackets', () => {
    expect(stripBrackets('성산일출봉')).toBe('성산일출봉');
  });
  it('handles empty string', () => {
    expect(stripBrackets('')).toBe('');
  });
  it('handles name that is only brackets', () => {
    const result = stripBrackets('(별칭만있는곳)');
    expect(result).toBe('');
  });
});

describe('isCategoryCompatible', () => {
  it('allows 미분류 for any spot category', () => {
    expect(isCategoryCompatible('sightseeing', '')).toBe(true);
    expect(isCategoryCompatible('restaurant', '')).toBe(true);
  });
  it('rejects 음식점(FD6) for sightseeing', () => {
    expect(isCategoryCompatible('sightseeing', 'FD6')).toBe(false);
  });
  it('rejects 카페(CE7) for sightseeing', () => {
    expect(isCategoryCompatible('sightseeing', 'CE7')).toBe(false);
  });
  it('rejects 음식점(FD6) for cultural_space', () => {
    expect(isCategoryCompatible('cultural_space', 'FD6')).toBe(false);
  });
  it('rejects 관광명소(AT4) for restaurant', () => {
    expect(isCategoryCompatible('restaurant', 'AT4')).toBe(false);
  });
  it('rejects 문화시설(CT1) for cafe', () => {
    expect(isCategoryCompatible('cafe', 'CT1')).toBe(false);
  });
  it('allows 음식점(FD6) for restaurant', () => {
    expect(isCategoryCompatible('restaurant', 'FD6')).toBe(true);
  });
  it('allows 카페(CE7) for cafe', () => {
    expect(isCategoryCompatible('cafe', 'CE7')).toBe(true);
  });
  it('allows 관광명소(AT4) for sightseeing', () => {
    expect(isCategoryCompatible('sightseeing', 'AT4')).toBe(true);
  });
  it('rejects 음식점(FD6) for experience', () => {
    expect(isCategoryCompatible('experience', 'FD6')).toBe(false);
  });
  it('allows 카페(CE7) for experience (공방이 카페 분류될 수 있음)', () => {
    expect(isCategoryCompatible('experience', 'CE7')).toBe(true);
  });
  it('allows 관광명소(AT4) for experience', () => {
    expect(isCategoryCompatible('experience', 'AT4')).toBe(true);
  });
});
