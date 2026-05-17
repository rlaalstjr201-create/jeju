import { describe, it, expect } from 'vitest';
import { computeZScore, computePopularityScore } from './PopularityScoreCalculator.js';

describe('computeZScore', () => {
  it('returns empty array for empty input', () => {
    expect(computeZScore([])).toEqual([]);
  });

  it('returns [0] for a single value', () => {
    expect(computeZScore([42])).toEqual([0]);
  });

  it('returns all zeros when all values are identical', () => {
    expect(computeZScore([5, 5, 5])).toEqual([0, 0, 0]);
  });

  it('returns correct z-scores for known values', () => {
    const values = [2, 4, 4, 4, 5, 5, 7, 9];
    const zScores = computeZScore(values);
    // mean=5, variance=4, stdDev=2
    // z-score for 2 = (2-5)/2 = -1.5
    expect(zScores[0]).toBeCloseTo(-1.5, 5);
    // z-score for 9 = (9-5)/2 = 2.0
    expect(zScores[7]).toBeCloseTo(2.0, 5);
  });
});

describe('computePopularityScore', () => {
  it('returns a number between 0 and 100', () => {
    const score = computePopularityScore(
      { cardSales: 100, navi: 80, mobility: 60 },
      { w1: 1, w2: 1, w3: 1 },
    );
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('returns 50 when all signals are equal (no variance)', () => {
    const score = computePopularityScore(
      { cardSales: 50, navi: 50, mobility: 50 },
      { w1: 1, w2: 1, w3: 1 },
    );
    // All z-scores are 0, so raw=0, normalized=(0+3)/6*100=50
    expect(score).toBe(50);
  });
});
