import { describe, it, expect } from 'vitest';
import { buildBuzzQuery, computeStats } from './enrich-buzz.js';

describe('buildBuzzQuery', () => {
  it('appends 제주 to a normal name', () => {
    expect(buildBuzzQuery('한라산')).toBe('한라산 제주');
  });

  it('appends 제주 to a name with spaces', () => {
    expect(buildBuzzQuery('name with spaces')).toBe('name with spaces 제주');
  });

  it('appends 제주 even when name already contains 제주', () => {
    expect(buildBuzzQuery('name 제주')).toBe('name 제주 제주');
  });
});

describe('computeStats', () => {
  it('[100, 200, 300] → min=100, max=300, median=200, p95=300', () => {
    expect(computeStats([100, 200, 300])).toEqual({ min: 100, max: 300, median: 200, p95: 300 });
  });

  it('[1, 2, 3, 4, 5] → min=1, max=5, median=3, p95=5', () => {
    expect(computeStats([1, 2, 3, 4, 5])).toEqual({ min: 1, max: 5, median: 3, p95: 5 });
  });

  it('empty array → all zeros', () => {
    expect(computeStats([])).toEqual({ min: 0, max: 0, median: 0, p95: 0 });
  });

  it('single element [500] → min=max=median=p95=500', () => {
    expect(computeStats([500])).toEqual({ min: 500, max: 500, median: 500, p95: 500 });
  });

  it('even count [10, 20, 30, 40] → median=25, p95=40', () => {
    expect(computeStats([10, 20, 30, 40])).toEqual({ min: 10, max: 40, median: 25, p95: 40 });
  });
});
