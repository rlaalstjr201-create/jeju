import { describe, it, expect } from 'vitest';
import { isSubstantialMatch } from './SpotNameMatcher.js';

describe('isSubstantialMatch', () => {
  it('blocks "제주 서귀포 현지인 맛집" — GENERIC_ALWAYS hit', () => {
    expect(isSubstantialMatch('제주 서귀포 현지인 맛집', '제주 서귀포 현지인 맛집')).toBe(false);
  });

  it('blocks "제주한달살이숙소" — GENERIC_ALWAYS hit via /한달살이/', () => {
    expect(isSubstantialMatch('제주한달살이숙소', '제주한달살이숙소')).toBe(false);
  });

  it('passes "흑돼지" query matching "제주 흑돼지 거리"', () => {
    expect(isSubstantialMatch('흑돼지', '제주 흑돼지 거리')).toBe(true);
  });

  it('passes "선흘곶식당" — short name with /식당$/ suffix must NOT be blocked', () => {
    expect(isSubstantialMatch('선흘곶식당', '선흘곶식당')).toBe(true);
  });
});
