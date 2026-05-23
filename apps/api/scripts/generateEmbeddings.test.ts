import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { generateEmbeddings } from './generateEmbeddings.js';
import type { Pool } from 'pg';

// ---------------------------------------------------------------------------
// MSW server
// ---------------------------------------------------------------------------

const VOYAGE_API_URL = 'https://api.voyageai.com/v1/embeddings';

const FAKE_EMBEDDING_DIM = 1024;

function makeEmbedding(seed: number): number[] {
  return Array.from({ length: FAKE_EMBEDDING_DIM }, (_, i) => (seed + i) * 0.001);
}

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// ---------------------------------------------------------------------------
// Types & helpers
// ---------------------------------------------------------------------------

interface FakeSpotRow {
  id: string;
  name: string;
  category: string;
}

const FAKE_SPOTS: FakeSpotRow[] = [
  { id: 'spot-uuid-001', name: '성산일출봉', category: '여행' },
  { id: 'spot-uuid-002', name: '한림공원', category: '여행' },
];

/** Pool that returns FAKE_SPOTS for the SELECT then succeeds for UPDATEs */
function makePoolMock(): Pool {
  let selectCalled = false;
  const queryMock = vi.fn().mockImplementation((sql: unknown) => {
    if (
      !selectCalled &&
      typeof sql === 'string' &&
      sql.includes('WHERE embedding IS NULL')
    ) {
      selectCalled = true;
      return Promise.resolve({ rows: FAKE_SPOTS, rowCount: FAKE_SPOTS.length });
    }
    return Promise.resolve({ rows: [], rowCount: 1 });
  });
  return { query: queryMock } as unknown as Pool;
}

/** Pool that always returns empty rows (no spots to embed) */
function makeEmptyPoolMock(): Pool {
  const queryMock = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
  return { query: queryMock } as unknown as Pool;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('generateEmbeddings', () => {
  it('processes all spots returned by SELECT and returns correct count', async () => {
    server.use(
      http.post(VOYAGE_API_URL, async () =>
        HttpResponse.json({
          data: FAKE_SPOTS.map((_, i) => ({
            index: i,
            embedding: makeEmbedding(i),
          })),
        }),
      ),
    );

    process.env['VOYAGE_API_KEY'] = 'test_voyage_key';
    const pool = makePoolMock();
    const result = await generateEmbeddings(pool);

    expect(result.processed).toBe(FAKE_SPOTS.length);
  });

  it('calls pool.query with pgvector bracket-array string format for UPDATE', async () => {
    server.use(
      http.post(VOYAGE_API_URL, async () =>
        HttpResponse.json({
          data: FAKE_SPOTS.map((_, i) => ({
            index: i,
            embedding: makeEmbedding(i),
          })),
        }),
      ),
    );

    process.env['VOYAGE_API_KEY'] = 'test_voyage_key';
    const pool = makePoolMock();
    await generateEmbeddings(pool);

    const queryFn = pool.query as ReturnType<typeof vi.fn>;
    const allCalls = queryFn.mock.calls as unknown[][];

    // Filter for UPDATE calls
    const updateCalls = allCalls.filter((call) => {
      const sql = call[0];
      return typeof sql === 'string' && sql.includes('UPDATE spots');
    });

    expect(updateCalls.length).toBe(FAKE_SPOTS.length);

    // Validate the vector string format in each UPDATE call
    for (const call of updateCalls) {
      const params = call[1];
      if (!Array.isArray(params)) continue;
      const vectorStr = params[0];
      if (typeof vectorStr !== 'string') continue;

      expect(vectorStr.startsWith('[')).toBe(true);
      expect(vectorStr.endsWith(']')).toBe(true);
      const values = vectorStr.slice(1, -1).split(',');
      expect(values.length).toBe(FAKE_EMBEDDING_DIM);
    }
  });

  it('returns processed=0 when no spots have null embeddings', async () => {
    process.env['VOYAGE_API_KEY'] = 'test_voyage_key';
    const pool = makeEmptyPoolMock();
    const result = await generateEmbeddings(pool);

    expect(result.processed).toBe(0);
    // Only the SELECT should have been called; no UPDATEs
    const queryFn = pool.query as ReturnType<typeof vi.fn>;
    expect(queryFn).toHaveBeenCalledTimes(1);
  });

  it('handles Voyage AI HTTP error gracefully and returns processed=0', async () => {
    server.use(
      http.post(VOYAGE_API_URL, async () => new HttpResponse(null, { status: 503 })),
    );

    process.env['VOYAGE_API_KEY'] = 'test_voyage_key';
    const pool = makePoolMock();

    // generateEmbeddings should NOT throw even when Voyage AI is down
    const result = await generateEmbeddings(pool);
    // The entire single batch fails → nothing processed
    expect(result.processed).toBe(0);
  });
});
