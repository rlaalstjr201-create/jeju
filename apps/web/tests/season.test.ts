// 철 판정 (ADR-0080, specs/seasonal-spots.md S2): months, observed windows, order, KST boundary, format check.
import { describe, expect, it } from 'vitest';
import { normalizeSpots } from '../src/data';
import { dayOf } from '../src/dates';
import { seasonOn, seasonText, validSeason, type Season } from '../src/season';
import { fileSpots } from './fixtures';

const MARCH: Season[] = [{ kind: 'rapeseed', months: [3] }];
const CHERRY: Season[] = [{ kind: 'cherry', from: '2027-03-24', to: '2027-04-02' }];

describe('S2 seasonOn', () => {
  it('[3]: March 1 and March 31 are in season, Feb 28 and Apr 1 are not', () => {
    expect(seasonOn(MARCH, '2027-03-01')).toBe('rapeseed');
    expect(seasonOn(MARCH, '2027-03-31')).toBe('rapeseed');
    expect(seasonOn(MARCH, '2027-02-28')).toBeNull();
    expect(seasonOn(MARCH, '2027-04-01')).toBeNull();
  });

  it('cherry 2027-03-24..04-02: both ends in, the days outside and the next year out', () => {
    for (const d of ['2027-03-24', '2027-04-02']) expect(seasonOn(CHERRY, d)).toBe('cherry');
    for (const d of ['2027-03-23', '2027-04-03', '2028-03-25']) expect(seasonOn(CHERRY, d)).toBeNull();
  });

  it('two kinds the same day: the first in ADR-0080 5 order, whatever the data order', () => {
    const both: Season[] = [{ kind: 'tangerine', months: [3] }, { kind: 'rapeseed', months: [3] }, { kind: 'plum', from: '2027-03-01', to: '2027-03-14' }];
    expect(seasonOn(both, '2027-03-05')).toBe('plum');
    expect(seasonOn(both, '2027-03-20')).toBe('rapeseed');
  });

  it('no season: null', () => {
    expect(seasonOn(undefined, '2027-03-05')).toBeNull();
  });

  it('KST boundary: 2026-02-28T14:59:59Z is February, 15:00:00Z is March', () => {
    expect(seasonOn(MARCH, dayOf(new Date('2026-02-28T14:59:59Z')))).toBeNull();
    expect(seasonOn(MARCH, dayOf(new Date('2026-02-28T15:00:00Z')))).toBe('rapeseed');
  });

  it('words: {글자} 철', () => {
    expect(seasonText('rapeseed')).toBe('유채꽃 철');
    expect(seasonText('tangerine')).toBe('귤 따기 철');
  });
});

describe('validSeason', () => {
  it('months 1~12 or a from ≤ to window of a known kind', () => {
    expect(validSeason(MARCH)).toBe(true);
    expect(validSeason(CHERRY)).toBe(true);
    for (const bad of [[], {}, [{ kind: 'beach', months: [7] }], [{ kind: 'rapeseed', months: [] }], [{ kind: 'rapeseed', months: [13] }], [{ kind: 'rapeseed', months: null }], [{ kind: 'cherry', from: '2027-04-02', to: '2027-03-24' }], [{ kind: 'cherry', from: '3월' }], [{ kind: 'cherry', from: '2027-02-30', to: '2027-03-05' }], [{ kind: 'cherry', from: '2027-03-01', to: '2027-13-01' }]]) {
      expect(validSeason(bad)).toBe(false);
    }
  });
});

describe('normalizeSpots: season', () => {
  it('a season the app cannot read is dropped, the place stays; a good one is kept as is', () => {
    const [a, b] = normalizeSpots([{ ...fileSpots[0], season: [{ kind: 'beach', months: [7] }] }, { ...fileSpots[1], season: MARCH }]);
    expect(a.id).toBe(fileSpots[0].id);
    expect('season' in a).toBe(false);
    expect(b.season).toEqual(MARCH);
  });
});
