import { describe, it, expect } from 'vitest';
import { haversineMeters, GridIndex, buildMergePayload, type GridEntry } from './seed-visitjeju-recollect.js';

const makeEntry = (id: string, lat: number, lng: number, overrides: Partial<GridEntry> = {}): GridEntry => ({
  id,
  lat,
  lng,
  tier: 'hidden',
  category: 'sightseeing',
  visitjejuContentId: null,
  llmSummary: null,
  thumbnailUrl: null,
  llmTags: [],
  awardsHint: [],
  ...overrides,
});

const makeSpot = (overrides: Partial<{ contentsid: string; introduction: string; llmTags: string[]; thumbnailUrl: string | null; category: string }> = {}) => ({
  contentsid: 'CONT_A',
  introduction: '더 긴 설명 텍스트입니다',
  llmTags: [],
  thumbnailUrl: null,
  category: 'sightseeing',
  ...overrides,
});

describe('haversineMeters', () => {
  it('returns 0 for identical points', () => {
    expect(haversineMeters(33.5, 126.5, 33.5, 126.5)).toBe(0);
  });

  it('returns ~111m for 0.001° lat separation', () => {
    const d = haversineMeters(33.0, 126.5, 33.001, 126.5);
    expect(d).toBeGreaterThan(100);
    expect(d).toBeLessThan(120);
  });

  it('returns >100m for points 0.0015° apart (~167m)', () => {
    const d = haversineMeters(33.0, 126.5, 33.0015, 126.5);
    expect(d).toBeGreaterThan(100);
  });
});

describe('GridIndex', () => {
  it('finds entry within 100m', () => {
    const idx = new GridIndex();
    idx.add(makeEntry('a', 33.0, 126.5));
    const found = idx.findWithin100m(33.0001, 126.5); // ~11m north
    expect(found?.id).toBe('a');
  });

  it('returns null when no entry within 100m', () => {
    const idx = new GridIndex();
    idx.add(makeEntry('a', 33.0, 126.5));
    const found = idx.findWithin100m(33.002, 126.5); // ~222m north
    expect(found).toBeNull();
  });

  it('finds entry across grid cell boundary via 3×3 neighbor search', () => {
    const idx = new GridIndex();
    idx.add(makeEntry('b', 33.0009, 126.5)); // near top of cell [33000,126500]
    const found = idx.findWithin100m(33.001, 126.5); // in next cell [33001,126500], ~11m away
    expect(found?.id).toBe('b');
  });

  it('returns closest when multiple entries are within range', () => {
    const idx = new GridIndex();
    idx.add(makeEntry('near', 33.0001, 126.5)); // ~11m
    idx.add(makeEntry('far', 33.0007, 126.5));  // ~78m
    const found = idx.findWithin100m(33.0, 126.5);
    expect(found?.id).toBe('near');
  });
});

describe('buildMergePayload', () => {
  const base = makeEntry('ex1', 33.0, 126.5, { llmSummary: '짧은 설명', llmTags: ['자연'] });

  it('sets visitjejuContentId from spot when existing is null', () => {
    const payload = buildMergePayload(base, makeSpot(), []);
    expect(payload.tier).toBe('reference');
    expect(payload.visitjejuContentId).toBe('CONT_A');
  });

  it('keeps existing visitjejuContentId when already set', () => {
    const entry = makeEntry('ex2', 33.0, 126.5, { visitjejuContentId: 'CONT_EXISTING' });
    const payload = buildMergePayload(entry, makeSpot({ contentsid: 'CONT_NEW' }), []);
    expect(payload.visitjejuContentId).toBe('CONT_EXISTING');
  });

  it('sets llmSummary when spot introduction is longer than existing', () => {
    const payload = buildMergePayload(
      base,
      makeSpot({ introduction: '기존보다 훨씬 긴 설명 텍스트입니다 여기서부터 길어집니다' }),
      [],
    );
    expect(payload.llmSummary).toBe('기존보다 훨씬 긴 설명 텍스트입니다 여기서부터 길어집니다');
  });

  it('returns undefined llmSummary when spot introduction is shorter', () => {
    const entry = makeEntry('ex3', 33.0, 126.5, { llmSummary: '기존의 아주 긴 설명 텍스트입니다.' });
    const payload = buildMergePayload(entry, makeSpot({ introduction: '짧음' }), []);
    expect(payload.llmSummary).toBeUndefined();
  });

  it('merges llmTags without duplicates', () => {
    const payload = buildMergePayload(base, makeSpot({ introduction: '짧음', llmTags: ['자연', '제주'] }), []);
    expect(payload.llmTags).toContain('자연');
    expect(payload.llmTags).toContain('제주');
    expect(payload.llmTags.filter((t) => t === '자연').length).toBe(1);
  });

  it('sets thumbnailUrl from spot when existing is null', () => {
    const payload = buildMergePayload(base, makeSpot({ introduction: '짧음', thumbnailUrl: 'https://example.com/t.jpg' }), []);
    expect(payload.thumbnailUrl).toBe('https://example.com/t.jpg');
  });

  it('merges awardsHint without duplicates', () => {
    const entry = makeEntry('ex4', 33.0, 126.5, { awardsHint: ['blue_ribbon'] });
    const payload = buildMergePayload(entry, makeSpot({ introduction: '짧음' }), ['blue_ribbon', 'michelin']);
    expect(payload.awardsHint).toContain('blue_ribbon');
    expect(payload.awardsHint).toContain('michelin');
    expect(payload.awardsHint.filter((a) => a === 'blue_ribbon').length).toBe(1);
  });

  it('corrects invalid category (c1 raw code → spot.category)', () => {
    const entry = makeEntry('ex5', 33.0, 126.5, { category: 'c1' });
    const payload = buildMergePayload(entry, makeSpot({ category: 'cultural_space' }), []);
    expect(payload.category).toBe('cultural_space');
  });

  it('corrects invalid category (natural → spot.category)', () => {
    const entry = makeEntry('ex5b', 33.0, 126.5, { category: 'natural' });
    const payload = buildMergePayload(entry, makeSpot({ category: 'sightseeing' }), []);
    expect(payload.category).toBe('sightseeing');
  });

  it('preserves valid existing category over spot category', () => {
    const entry = makeEntry('ex6', 33.0, 126.5, { category: 'restaurant' });
    const payload = buildMergePayload(entry, makeSpot({ category: 'sightseeing' }), []);
    expect(payload.category).toBe('restaurant');
  });
});
