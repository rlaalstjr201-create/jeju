import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Pool } from 'pg';
import { PostgresRecommenderAdapter } from './PostgresRecommenderAdapter.js';
import { SpotPreferences } from '../../domain/recommender/SpotPreferences.js';
import type { RecommendationContext } from '../../domain/recommender/RecommendationContext.js';
import type { Spot } from '../../domain/spot/Spot.js';
import type { Traveller } from '../../domain/traveller/Traveller.js';
import type { Trip } from '../../domain/trip/Trip.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContext(preferences: SpotPreferences): RecommendationContext {
  return {
    traveller: {} as Traveller,
    trip: {} as Trip,
    preferences,
  };
}

function makeSpotRow(overrides: Partial<{
  id: string;
  kakao_place_id: string;
  name: string;
  region: string;
  category: string;
  price_range: string;
  curation_score: number;
  popularity_score: number;
  curation_comment: string | null;
  thumbnail_url: string | null;
  lat: number;
  lng: number;
}> = {}) {
  return {
    id: 'spot-1',
    kakao_place_id: 'kakao-1',
    name: 'Test Spot',
    region: 'jeju-city',
    category: 'cafe',
    price_range: 'budget',
    curation_score: 4.5,
    popularity_score: 3.2,
    curation_comment: null,
    thumbnail_url: null,
    lat: 33.5,
    lng: 126.5,
    ...overrides,
  };
}

function makeExpectedSpot(row: ReturnType<typeof makeSpotRow>): Spot {
  return {
    id: row.id,
    kakaoPlaceId: row.kakao_place_id,
    name: row.name,
    region: row.region as Spot['region'],
    category: row.category,
    priceRange: row.price_range as Spot['priceRange'],
    curationScore: row.curation_score,
    popularityScore: row.popularity_score,
    curationComment: row.curation_comment,
    thumbnailUrl: row.thumbnail_url,
    lat: row.lat,
    lng: row.lng,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PostgresRecommenderAdapter', () => {
  let mockPool: { query: ReturnType<typeof vi.fn> };
  let adapter: PostgresRecommenderAdapter;

  beforeEach(() => {
    mockPool = { query: vi.fn() };
    adapter = new PostgresRecommenderAdapter(mockPool as unknown as Pool, 12);
  });

  // -------------------------------------------------------------------------
  // Test 1: cold-start path
  // -------------------------------------------------------------------------

  it('cold-start: preferences.isEmpty → queries ORDER BY curation_score DESC', async () => {
    const row = makeSpotRow({ category: 'oreum' });
    mockPool.query.mockResolvedValue({ rows: [row] });

    const preferences = SpotPreferences.fromShortlist({ spots: [] } as never);
    expect(preferences.isEmpty).toBe(true);

    const context = makeContext(preferences);
    const spots = await adapter.recommendForShortlist(context);

    expect(mockPool.query).toHaveBeenCalledOnce();
    const [sql, params] = mockPool.query.mock.calls[0] as [string, unknown[]];

    expect(sql).toContain('ORDER BY curation_score DESC');
    expect(sql).not.toContain('CASE category');
    expect(params).toEqual([12]);

    expect(spots).toHaveLength(1);
    expect(spots[0]).toEqual(makeExpectedSpot(row));
  });

  // -------------------------------------------------------------------------
  // Test 2: warm path – single category
  // -------------------------------------------------------------------------

  it('warm – single category: query includes CASE WHEN and category = ANY', async () => {
    const row = makeSpotRow({ category: 'cafe', curation_score: 4.8 });
    mockPool.query.mockResolvedValue({ rows: [row] });

    // Build SpotPreferences with known weights via the private constructor path.
    // We use Object.create to call fromShortlist with a fake Shortlist that
    // has exactly one spot with category 'cafe'.
    const fakeShortlist = {
      spots: [{ category: 'cafe', id: 's1', name: 'Café', region: 'jeju-city', priceRange: 'budget', kakaoPlaceId: 'k1', curationScore: 4, popularityScore: 3, curationComment: null, thumbnailUrl: null, lat: 33, lng: 126 }],
    };
    const preferences = SpotPreferences.fromShortlist(fakeShortlist as never);
    expect(preferences.isEmpty).toBe(false);
    expect(preferences.weightFor('cafe')).toBe(1.0);

    const context = makeContext(preferences);
    const spots = await adapter.recommendForShortlist(context);

    expect(mockPool.query).toHaveBeenCalledOnce();
    const [sql, params] = mockPool.query.mock.calls[0] as [string, unknown[]];

    expect(sql).toContain('CASE category');
    expect(sql).toContain('WHEN $1 THEN curation_score * $2');
    expect(sql).toContain('ELSE curation_score * 0.1');
    expect(sql).toContain('category = ANY($3)');
    expect(sql).toContain('ORDER BY weighted_score DESC');
    expect(sql).toContain('LIMIT $4');

    // params: category, weight, categories array, limit
    expect(params[0]).toBe('cafe');
    expect(params[1]).toBe(1.0);
    expect(params[2]).toEqual(['cafe']);
    expect(params[3]).toBe(12);

    expect(spots[0]).toEqual(makeExpectedSpot(row));
  });

  // -------------------------------------------------------------------------
  // Test 3: warm path – multiple categories
  // -------------------------------------------------------------------------

  it('warm – two categories: all categories appear in CASE WHEN', async () => {
    const row1 = makeSpotRow({ id: 'spot-1', category: 'oreum', curation_score: 4.9 });
    const row2 = makeSpotRow({ id: 'spot-2', category: 'cafe', curation_score: 4.3 });
    mockPool.query.mockResolvedValue({ rows: [row1, row2] });

    const fakeShortlist = {
      spots: [
        { category: 'oreum', id: 's1', name: 'Oreum', region: 'eastern', priceRange: 'free', kakaoPlaceId: 'k1', curationScore: 5, popularityScore: 4, curationComment: null, thumbnailUrl: null, lat: 33.4, lng: 126.6 },
        { category: 'oreum', id: 's2', name: 'Oreum 2', region: 'eastern', priceRange: 'free', kakaoPlaceId: 'k2', curationScore: 5, popularityScore: 4, curationComment: null, thumbnailUrl: null, lat: 33.4, lng: 126.6 },
        { category: 'cafe', id: 's3', name: 'Café', region: 'jeju-city', priceRange: 'budget', kakaoPlaceId: 'k3', curationScore: 4, popularityScore: 3, curationComment: null, thumbnailUrl: null, lat: 33.5, lng: 126.5 },
      ],
    };
    // oreum weight = 2/3, cafe weight = 1/3
    const preferences = SpotPreferences.fromShortlist(fakeShortlist as never);
    expect(preferences.isEmpty).toBe(false);

    const context = makeContext(preferences);
    const spots = await adapter.recommendForShortlist(context);

    expect(mockPool.query).toHaveBeenCalledOnce();
    const [sql, params] = mockPool.query.mock.calls[0] as [string, unknown[]];

    // Both categories must appear as WHEN clauses
    expect(sql).toContain('WHEN $1 THEN curation_score * $2');
    expect(sql).toContain('WHEN $3 THEN curation_score * $4');
    expect(sql).toContain('category = ANY($5)');
    expect(sql).toContain('LIMIT $6');

    // All four scalar params followed by categories array and limit
    const categoriesParam = params[4] as string[];
    expect(categoriesParam).toHaveLength(2);
    expect(categoriesParam).toContain('oreum');
    expect(categoriesParam).toContain('cafe');
    expect(params[5]).toBe(12);

    expect(spots).toHaveLength(2);
  });

  // -------------------------------------------------------------------------
  // Test 4: empty result set
  // -------------------------------------------------------------------------

  it('empty result: query returns 0 rows → returns []', async () => {
    mockPool.query.mockResolvedValue({ rows: [] });

    // Test with cold-start path
    const preferences = SpotPreferences.fromShortlist({ spots: [] } as never);
    const context = makeContext(preferences);
    const spots = await adapter.recommendForShortlist(context);

    expect(spots).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Test 5: custom limit is forwarded
  // -------------------------------------------------------------------------

  it('custom limit constructor arg is passed to query', async () => {
    mockPool.query.mockResolvedValue({ rows: [] });
    const customAdapter = new PostgresRecommenderAdapter(
      mockPool as unknown as Pool,
      5,
    );

    const preferences = SpotPreferences.fromShortlist({ spots: [] } as never);
    const context = makeContext(preferences);
    await customAdapter.recommendForShortlist(context);

    const [, params] = mockPool.query.mock.calls[0] as [string, unknown[]];
    expect(params).toEqual([5]);
  });

  // -------------------------------------------------------------------------
  // Test 6: rowToSpot mapping — curation_comment non-null
  // -------------------------------------------------------------------------

  it('rowToSpot maps curation_comment correctly when non-null', async () => {
    const row = makeSpotRow({ curation_comment: 'Beautiful view' });
    mockPool.query.mockResolvedValue({ rows: [row] });

    const preferences = SpotPreferences.fromShortlist({ spots: [] } as never);
    const context = makeContext(preferences);
    const spots = await adapter.recommendForShortlist(context);

    expect(spots[0]?.curationComment).toBe('Beautiful view');
  });
});
