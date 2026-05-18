import { describe, it, expect } from 'vitest';
import { haversineMeters } from './haversine.js';
import { CandidateDeduper } from './CandidateDeduper.js';

// ---------------------------------------------------------------------------
// haversineMeters
// ---------------------------------------------------------------------------

describe('haversineMeters', () => {
  it('same point → 0 meters', () => {
    expect(haversineMeters(33.458, 126.942, 33.458, 126.942)).toBe(0);
  });

  it('성산일출봉 to 만장굴 ≈ 17–18 km', () => {
    // Seongsan: 33.4589, 126.9427  /  Manjanggul: 33.5286, 126.7692
    const dist = haversineMeters(33.4589, 126.9427, 33.5286, 126.7692);
    expect(dist).toBeGreaterThan(15_000);
    expect(dist).toBeLessThan(22_000);
  });

  it('two points 50 m apart → < 100 m', () => {
    // Move ~50 m east at 33.458 lat (≈ 0.00055° lng at this latitude)
    const dist = haversineMeters(33.458, 126.942, 33.458, 126.94255);
    expect(dist).toBeLessThan(100);
    expect(dist).toBeGreaterThan(1);
  });

  it('two points 200 m apart → > 100 m', () => {
    const dist = haversineMeters(33.458, 126.942, 33.4598, 126.942);
    expect(dist).toBeGreaterThan(100);
    expect(dist).toBeLessThan(500);
  });
});

// ---------------------------------------------------------------------------
// CandidateDeduper
// ---------------------------------------------------------------------------

describe('CandidateDeduper', () => {
  it('empty deduper — never reports duplicate', () => {
    const deduper = new CandidateDeduper([]);
    expect(deduper.isDuplicate(33.458, 126.942)).toBe(false);
  });

  it('point within 100 m of existing → duplicate', () => {
    const existing = [{ lat: 33.458, lng: 126.942 }];
    const deduper = new CandidateDeduper(existing);
    // ~5 m offset
    expect(deduper.isDuplicate(33.4580, 126.94205)).toBe(true);
  });

  it('point > 100 m from existing → not duplicate', () => {
    const existing = [{ lat: 33.458, lng: 126.942 }];
    const deduper = new CandidateDeduper(existing);
    // ~200 m north
    expect(deduper.isDuplicate(33.4598, 126.942)).toBe(false);
  });

  it('accept() adds to seen set — subsequent call with same point is duplicate', () => {
    const deduper = new CandidateDeduper([]);
    deduper.accept(33.458, 126.942);
    expect(deduper.isDuplicate(33.4580, 126.94205)).toBe(true);
  });

  it('multiple existing points — matches closest', () => {
    const existing = [
      { lat: 33.400, lng: 126.500 }, // far away
      { lat: 33.458, lng: 126.942 }, // close
    ];
    const deduper = new CandidateDeduper(existing);
    expect(deduper.isDuplicate(33.458, 126.9422)).toBe(true);  // close to 2nd
    expect(deduper.isDuplicate(33.500, 126.600)).toBe(false);  // far from both
  });

  it('exactly at RADIUS_METERS boundary (100 m) → counted as duplicate', () => {
    // 100 m north of reference: Δlat ≈ 0.000899°
    const deduper = new CandidateDeduper([{ lat: 33.458, lng: 126.942 }]);
    const atBoundary = haversineMeters(33.458, 126.942, 33.458899, 126.942);
    expect(atBoundary).toBeCloseTo(100, -1); // within 10 m of 100
    expect(deduper.isDuplicate(33.458899, 126.942)).toBe(true);
  });
});
