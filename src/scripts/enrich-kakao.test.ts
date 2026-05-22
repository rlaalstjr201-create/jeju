import { describe, it, expect } from 'vitest';
import { isKakaoJejuBbox, matchKakaoResult } from './enrich-kakao.js';
import type { KakaoDoc } from './enrich-kakao.js';

// ── isKakaoJejuBbox ────────────────────────────────────────────────

describe('isKakaoJejuBbox', () => {
  it('returns true for Jeju center', () => {
    expect(isKakaoJejuBbox(33.4, 126.5)).toBe(true);
  });

  it('returns true for 추자도 (ADR-0031: lat 34.0까지)', () => {
    expect(isKakaoJejuBbox(33.97, 126.9)).toBe(true);
  });

  it('returns false for Seoul', () => {
    expect(isKakaoJejuBbox(37.5, 127.0)).toBe(false);
  });

  it('returns false just outside lat upper bound (34.1)', () => {
    expect(isKakaoJejuBbox(34.1, 126.5)).toBe(false);
  });

  it('returns false just outside lng upper bound (127.1)', () => {
    expect(isKakaoJejuBbox(33.4, 127.1)).toBe(false);
  });
});

// ── matchKakaoResult ───────────────────────────────────────────────

const jejuDoc: KakaoDoc = { id: '111', place_name: '테스트 장소', x: '126.5', y: '33.4' };
const seoulDoc: KakaoDoc = { id: '222', place_name: '서울 장소', x: '127.0', y: '37.5' };
// ~444m north of 33.4 — outside 300m radius
const farJejuDoc: KakaoDoc = { id: '333', place_name: '먼 장소', x: '126.5', y: '33.404' };

describe('matchKakaoResult', () => {
  it('returns matched=false for empty docs', () => {
    const result = matchKakaoResult([], 33.4, 126.5, false);
    expect(result.matched).toBe(false);
  });

  it('returns matched=false when Kakao coords are outside Jeju bbox', () => {
    const result = matchKakaoResult([seoulDoc], 37.5, 127.0, false);
    expect(result.matched).toBe(false);
  });

  it('returns matched=true for normal row within 300m', () => {
    const result = matchKakaoResult([jejuDoc], 33.4, 126.5, false);
    expect(result.matched).toBe(true);
    expect(result.unverified).toBe(false);
    expect(result.coordRestoreCandidate).toBe(false);
    expect(result.placeId).toBe('111');
    expect(result.placeUrl).toBe('https://place.map.kakao.com/111');
  });

  it('returns matched=false for normal row with distance > 300m', () => {
    const result = matchKakaoResult([farJejuDoc], 33.4, 126.5, false);
    expect(result.matched).toBe(false);
  });

  it('returns matched=true with unverified=true and coordRestoreCandidate=true for review_excluded row with Jeju coords', () => {
    const result = matchKakaoResult([jejuDoc], null, null, true);
    expect(result.matched).toBe(true);
    expect(result.unverified).toBe(true);
    expect(result.coordRestoreCandidate).toBe(true);
    expect(result.kakaoLat).toBe(33.4);
    expect(result.kakaoLng).toBe(126.5);
  });

  it('returns matched=false for review_excluded row with non-Jeju coords', () => {
    const result = matchKakaoResult([seoulDoc], null, null, true);
    expect(result.matched).toBe(false);
  });

  it('returns matched=true for normal row with null spotLat/spotLng (no distance check)', () => {
    const result = matchKakaoResult([jejuDoc], null, null, false);
    expect(result.matched).toBe(true);
    expect(result.unverified).toBe(false);
  });
});
