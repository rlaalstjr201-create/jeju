import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { VisitjejuAdapter, VisitjejuApiError } from './VisitjejuAdapter.js';

// ---------------------------------------------------------------------------
// MSW server
// ---------------------------------------------------------------------------

const BASE_URL = 'https://api.visitjeju.net';
const ENDPOINT = `${BASE_URL}/vsjApi/contents/searchList`;

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeRawItem(overrides: Record<string, unknown> = {}) {
  return {
    contentsid: 'CNTS-001',
    contentscd: { value: 'c1' },
    title: '성산일출봉',
    address: '제주특별자치도 서귀포시 성산읍 일출로 284-12',
    roadaddress: '제주특별자치도 서귀포시 성산읍 일출로 284-12',
    latitude: '33.458485',
    longitude: '126.942678',
    tag: '일출,오름,세계유산',
    introduction: '유네스코 세계자연유산',
    repPhoto: {
      thumbnailpath: 'https://tong.visitjeju.net/a/t.jpg',
      imgpath: 'https://tong.visitjeju.net/a/o.jpg',
    },
    region1cd: { value: 'A01' },
    region2cd: { value: 'A0104' },
    ...overrides,
  };
}

function makeApiResponse(overrides: {
  items?: unknown[];
  currentPage?: number;
  pageSize?: number;
  totalCount?: number;
} = {}) {
  const items = overrides.items ?? [makeRawItem()];
  const currentPage = overrides.currentPage ?? 1;
  const pageSize = overrides.pageSize ?? 100;
  const totalCount = overrides.totalCount ?? items.length;
  return { result: 'success', currentPage, pageSize, totalCount, items };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAdapter() {
  return new VisitjejuAdapter({ apiKey: 'test-api-key', baseUrl: BASE_URL });
}

async function collectAll<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of iter) out.push(item);
  return out;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('VisitjejuAdapter.fetchAll', () => {
  it('single page — yields all items with flattened fields', async () => {
    server.use(
      http.get(ENDPOINT, () => HttpResponse.json(makeApiResponse({ items: [makeRawItem(), makeRawItem({ contentsid: 'CNTS-002', title: '만장굴' })] }))),
    );

    const adapter = makeAdapter();
    const spots = await collectAll(adapter.fetchAll());

    expect(spots).toHaveLength(2);
    expect(spots[0]).toMatchObject({
      contentsid: 'CNTS-001',
      contentscd: 'c1',
      title: '성산일출봉',
      latitude: '33.458485',
      longitude: '126.942678',
      region1cd: 'A01',
      region2cd: 'A0104',
    });
    expect(spots[0]!.repPhoto).toMatchObject({
      thumbnailpath: 'https://tong.visitjeju.net/a/t.jpg',
    });
  });

  it('auto-paginates — fetches page 2 when totalCount > pageSize', async () => {
    const page1Items = Array.from({ length: 3 }, (_, i) => makeRawItem({ contentsid: `P1-${i}` }));
    const page2Items = Array.from({ length: 2 }, (_, i) => makeRawItem({ contentsid: `P2-${i}` }));

    let requestCount = 0;
    server.use(
      http.get(ENDPOINT, ({ request }) => {
        requestCount++;
        const url = new URL(request.url);
        const page = Number(url.searchParams.get('page') ?? '1');
        return HttpResponse.json(
          makeApiResponse({
            items: page === 1 ? page1Items : page2Items,
            currentPage: page,
            pageSize: 3,
            totalCount: 5,
          }),
        );
      }),
    );

    const adapter = makeAdapter();
    const spots = await collectAll(adapter.fetchAll({ pageSize: 3 }));

    expect(spots).toHaveLength(5);
    expect(requestCount).toBe(2);
    expect(spots[0]!.contentsid).toBe('P1-0');
    expect(spots[3]!.contentsid).toBe('P2-0');
  });

  it('passes category filter as query param `cid`', async () => {
    let capturedUrl: string | undefined;
    server.use(
      http.get(ENDPOINT, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json(makeApiResponse());
      }),
    );

    const adapter = makeAdapter();
    await collectAll(adapter.fetchAll({ category: 'c4' }));

    expect(capturedUrl).toBeDefined();
    const params = new URL(capturedUrl!).searchParams;
    expect(params.get('cid')).toBe('c4');
  });

  it('passes region filter as query param `region1cd`', async () => {
    let capturedUrl: string | undefined;
    server.use(
      http.get(ENDPOINT, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json(makeApiResponse());
      }),
    );

    const adapter = makeAdapter();
    await collectAll(adapter.fetchAll({ region: 'A02' }));

    const params = new URL(capturedUrl!).searchParams;
    expect(params.get('region1cd')).toBe('A02');
  });

  it('null repPhoto → yielded as null', async () => {
    server.use(
      http.get(ENDPOINT, () =>
        HttpResponse.json(makeApiResponse({ items: [makeRawItem({ repPhoto: null })] })),
      ),
    );

    const adapter = makeAdapter();
    const spots = await collectAll(adapter.fetchAll());
    expect(spots[0]!.repPhoto).toBeNull();
  });

  it('empty items array → yields nothing', async () => {
    server.use(
      http.get(ENDPOINT, () => HttpResponse.json(makeApiResponse({ items: [], totalCount: 0 }))),
    );

    const adapter = makeAdapter();
    const spots = await collectAll(adapter.fetchAll());
    expect(spots).toHaveLength(0);
  });

  it('non-200 HTTP status → throws VisitjejuApiError', async () => {
    server.use(
      http.get(ENDPOINT, () => HttpResponse.json({ error: 'unauthorized' }, { status: 401 })),
    );

    const adapter = makeAdapter();
    await expect(collectAll(adapter.fetchAll())).rejects.toBeInstanceOf(VisitjejuApiError);
  });

  it('network error → throws VisitjejuApiError', async () => {
    server.use(http.get(ENDPOINT, () => HttpResponse.error()));

    const adapter = makeAdapter();
    await expect(collectAll(adapter.fetchAll())).rejects.toBeInstanceOf(VisitjejuApiError);
  });

  it('includes apiKey and locale=kr in every request', async () => {
    const capturedParams: URLSearchParams[] = [];
    server.use(
      http.get(ENDPOINT, ({ request }) => {
        capturedParams.push(new URL(request.url).searchParams);
        return HttpResponse.json(makeApiResponse());
      }),
    );

    const adapter = makeAdapter();
    await collectAll(adapter.fetchAll());

    expect(capturedParams[0]!.get('apiKey')).toBe('test-api-key');
    expect(capturedParams[0]!.get('locale')).toBe('kr');
  });
});
