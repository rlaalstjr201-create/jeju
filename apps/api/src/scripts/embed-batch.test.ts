import { describe, it, expect } from 'vitest';
import { parseSpotIds } from './embed-batch.js';
import { isVisitjejuOnly } from './seed-pipeline.js';

describe('parseSpotIds', () => {
  it('returns undefined when --spot-ids not provided', () => {
    expect(parseSpotIds([])).toBeUndefined();
    expect(parseSpotIds(['--other-flag'])).toBeUndefined();
  });

  it('returns parsed array when --spot-ids=id1,id2 provided', () => {
    expect(parseSpotIds(['--spot-ids=spot-1,spot-2,spot-3'])).toEqual([
      'spot-1',
      'spot-2',
      'spot-3',
    ]);
  });

  it('returns undefined when --spot-ids= is empty', () => {
    expect(parseSpotIds(['--spot-ids='])).toBeUndefined();
  });

  it('trims whitespace from each id', () => {
    expect(parseSpotIds(['--spot-ids= a , b '])).toEqual(['a', 'b']);
  });
});

describe('isVisitjejuOnly', () => {
  it('returns false when --visitjeju-only not present', () => {
    expect(isVisitjejuOnly([])).toBe(false);
    expect(isVisitjejuOnly(['--other'])).toBe(false);
  });

  it('returns true when --visitjeju-only is present', () => {
    expect(isVisitjejuOnly(['--visitjeju-only'])).toBe(true);
  });
});
