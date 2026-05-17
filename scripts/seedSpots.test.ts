import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { seedSpots } from './seedSpots.js';
import type { Pool } from 'pg';

// ---------------------------------------------------------------------------
// MSW server — intercepts native fetch
// ---------------------------------------------------------------------------

const KAKAO_API_URL = 'https://dapi.kakao.com/v2/local/search/keyword.json';

const FAKE_DOC_1 = {
  id: 'kakao_001',
  place_name: '성산일출봉',
  category_name: '여행 > 관광명소',
  category_group_code: 'AT4',
  x: '126.940918',
  y: '33.458448',
  road_address_name: '제주특별자치도 서귀포시 성산읍 일출로 284-12',
};

const FAKE_DOC_2 = {
  id: 'kakao_002',
  place_name: '카페 드 제주',
  category_name: '음식점 > 카페',
  category_group_code: 'CE7',
  x: '126.531900',
  y: '33.499615',
  road_address_name: '제주특별자치도 제주시 연동 123-4',
};

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// ---------------------------------------------------------------------------
// Pool mock helpers
// ---------------------------------------------------------------------------

function makePoolMock(): Pool {
  const queryMock = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
  return { query: queryMock } as unknown as Pool;
}

function getQueryMock(pool: Pool): ReturnType<typeof vi.fn> {
  return pool.query as ReturnType<typeof vi.fn>;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('seedSpots', () => {
  it('inserts unique spots returned by Kakao API', async () => {
    // Return 2 docs on the first page, is_end = true
    server.use(
      http.get(KAKAO_API_URL, () =>
        HttpResponse.json({
          documents: [FAKE_DOC_1, FAKE_DOC_2],
          meta: { total_count: 2, pageable_count: 2, is_end: true },
        }),
      ),
    );

    process.env['KAKAO_REST_API_KEY'] = 'test_key';
    const pool = makePoolMock();
    const result = await seedSpots(pool);

    // Both docs are unique → both should be inserted (across all 18 queries)
    expect(result.inserted).toBeGreaterThanOrEqual(2);
  });

  it('deduplicates spots with the same kakao_place_id across queries', async () => {
    // Return the same doc for every query page
    server.use(
      http.get(KAKAO_API_URL, () =>
        HttpResponse.json({
          documents: [FAKE_DOC_1],
          meta: { total_count: 1, pageable_count: 1, is_end: true },
        }),
      ),
    );

    process.env['KAKAO_REST_API_KEY'] = 'test_key';
    const pool = makePoolMock();
    const result = await seedSpots(pool);

    // FAKE_DOC_1 seen in first query then deduplicated in all subsequent queries
    expect(result.inserted).toBe(1);
    // All subsequent occurrences counted as skipped (17 more queries × 1 doc)
    expect(result.skipped).toBeGreaterThan(0);
  });

  it('calls pool.query with correct upsert SQL params for the first spot', async () => {
    server.use(
      http.get(KAKAO_API_URL, () =>
        HttpResponse.json({
          documents: [FAKE_DOC_1],
          meta: { total_count: 1, pageable_count: 1, is_end: true },
        }),
      ),
    );

    process.env['KAKAO_REST_API_KEY'] = 'test_key';
    const pool = makePoolMock();
    await seedSpots(pool);

    const queryFn = getQueryMock(pool);
    // pool.query should have been called at least once for the upsert
    expect(queryFn.mock.calls.length).toBeGreaterThan(0);

    // The first upsert call's second arg should hold the params array
    const firstCall = queryFn.mock.calls[0];
    expect(firstCall).toBeDefined();
    if (firstCall !== undefined) {
      const params = firstCall[1] as unknown[];
      expect(Array.isArray(params)).toBe(true);
      // $2 is kakao_place_id
      expect(params[1]).toBe('kakao_001');
      // $3 is name
      expect(params[2]).toBe('성산일출봉');
      // $4 is region (first query is 제주시 관광명소 → jeju-city)
      expect(params[3]).toBe('jeju-city');
      // $6 is price_range
      expect(params[5]).toBe('mid');
    }
  });

  it('continues without throwing when Kakao API fails for one query', async () => {
    let callCount = 0;
    server.use(
      http.get(KAKAO_API_URL, () => {
        callCount++;
        if (callCount === 1) {
          return new HttpResponse(null, { status: 500 });
        }
        return HttpResponse.json({
          documents: [FAKE_DOC_2],
          meta: { total_count: 1, pageable_count: 1, is_end: true },
        });
      }),
    );

    process.env['KAKAO_REST_API_KEY'] = 'test_key';
    const pool = makePoolMock();
    // Should not throw even when one Kakao page fails
    const result = await seedSpots(pool);

    // At least one doc from successful subsequent calls
    expect(result.inserted).toBeGreaterThanOrEqual(1);
  });
});
