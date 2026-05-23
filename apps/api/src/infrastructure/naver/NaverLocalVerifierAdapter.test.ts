import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { NaverLocalVerifierAdapter, NaverLocalVerifierError } from './NaverLocalVerifierAdapter.js';

// ---------------------------------------------------------------------------
// MSW server
// ---------------------------------------------------------------------------

const BASE_URL = 'https://openapi.naver.com';
const ENDPOINT = `${BASE_URL}/v1/search/local.json`;

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeNaverLocalItem(overrides: Record<string, unknown> = {}) {
  return {
    title: '우리두리식당',
    link: 'https://map.naver.com/...',
    category: '음식점',
    description: '...',
    telephone: '',
    address: '제주특별자치도 제주시...',
    roadAddress: '...',
    mapx: '1265427571',  // 126.5427571
    mapy: '334853897',   // 33.4853897
    ...overrides,
  };
}

function makeNaverResponse(items: ReturnType<typeof makeNaverLocalItem>[]) {
  return { items };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeVerifier() {
  return new NaverLocalVerifierAdapter({
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
    baseUrl: BASE_URL,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NaverLocalVerifierAdapter.verify', () => {
  it('matched result → returns matched=true, lat, lng', async () => {
    server.use(
      http.get(ENDPOINT, () => HttpResponse.json(makeNaverResponse([makeNaverLocalItem()]))),
    );

    const verifier = makeVerifier();
    const result = await verifier.verify('우리두리식당');

    expect(result.matched).toBe(true);
    expect(result.lat).toBeCloseTo(33.4853897, 4);
    expect(result.lng).toBeCloseTo(126.5427571, 4);
  });

  it('sends X-Naver-Client-Id and X-Naver-Client-Secret headers', async () => {
    let capturedRequest: Request | undefined;
    server.use(
      http.get(ENDPOINT, ({ request }) => {
        capturedRequest = request;
        return HttpResponse.json(makeNaverResponse([makeNaverLocalItem()]));
      }),
    );

    const verifier = makeVerifier();
    await verifier.verify('우리두리식당');

    expect(capturedRequest!.headers.get('X-Naver-Client-Id')).toBe('test-client-id');
    expect(capturedRequest!.headers.get('X-Naver-Client-Secret')).toBe('test-client-secret');
  });

  it('no items → matched=false', async () => {
    server.use(
      http.get(ENDPOINT, () => HttpResponse.json(makeNaverResponse([]))),
    );

    const verifier = makeVerifier();
    const result = await verifier.verify('없는장소');

    expect(result.matched).toBe(false);
    expect(result.lat).toBeNull();
    expect(result.lng).toBeNull();
  });

  it('coords outside Jeju bbox → matched=false', async () => {
    server.use(
      http.get(ENDPOINT, () =>
        HttpResponse.json(makeNaverResponse([
          makeNaverLocalItem({ mapx: '1285390000', mapy: '348620000' }), // 경남 거제 (lat=34.862, lng=128.539)
        ])),
      ),
    );

    const verifier = makeVerifier();
    const result = await verifier.verify('산방산');

    expect(result.matched).toBe(false);
    expect(result.lat).toBeNull();
    expect(result.lng).toBeNull();
  });

  it('401 → throws NaverLocalVerifierError', async () => {
    server.use(
      http.get(ENDPOINT, () =>
        HttpResponse.json({ errorCode: 'SE01', errorMessage: 'Unauthorized' }, { status: 401 }),
      ),
    );

    const verifier = makeVerifier();
    await expect(verifier.verify('test')).rejects.toBeInstanceOf(NaverLocalVerifierError);
  });

  it('network error → throws NaverLocalVerifierError', async () => {
    server.use(http.get(ENDPOINT, () => HttpResponse.error()));

    const verifier = makeVerifier();
    await expect(verifier.verify('test')).rejects.toBeInstanceOf(NaverLocalVerifierError);
  });

  it('Naver matched response includes category field', async () => {
    server.use(
      http.get(ENDPOINT, () =>
        HttpResponse.json(makeNaverResponse([
          makeNaverLocalItem({ category: '음식점>제주도향토음식' }),
        ])),
      ),
    );

    const verifier = makeVerifier();
    const result = await verifier.verify('우리두리식당');

    expect(result.matched).toBe(true);
    expect((result as { category: string | null }).category).toBe('음식점>제주도향토음식');
  });

  it('Naver no match → category is null', async () => {
    server.use(
      http.get(ENDPOINT, () => HttpResponse.json(makeNaverResponse([]))),
    );

    const verifier = makeVerifier();
    const result = await verifier.verify('없는장소');

    expect(result.matched).toBe(false);
    expect((result as { category: string | null }).category).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// searchRaw tests
// ---------------------------------------------------------------------------

describe('NaverLocalVerifierAdapter.searchRaw', () => {
  it('returns NaverSearchHit array for Jeju results', async () => {
    server.use(
      http.get(ENDPOINT, () => HttpResponse.json(makeNaverResponse([makeNaverLocalItem()]))),
    );

    const adapter = makeVerifier();
    const results = await adapter.searchRaw('우리두리식당');

    expect(results).toHaveLength(1);
    expect(results[0]!.name).toBe('우리두리식당');
    expect(results[0]!.lat).toBeCloseTo(33.4853897, 4);
    expect(results[0]!.lng).toBeCloseTo(126.5427571, 4);
    expect(results[0]!.category).toBe('음식점');
  });

  it('strips HTML tags from title', async () => {
    server.use(
      http.get(ENDPOINT, () => HttpResponse.json(makeNaverResponse([makeNaverLocalItem({ title: '<b>우리두리식당</b>' })]))),
    );

    const adapter = makeVerifier();
    const results = await adapter.searchRaw('우리두리식당');

    expect(results[0]!.name).toBe('우리두리식당');
  });

  it('filters out non-Jeju results', async () => {
    const seoulItem = makeNaverLocalItem({
      title: '서울 카페',
      mapx: '1269780000',  // Seoul lng: 126.978 * 1e7
      mapy: '375660000',   // Seoul lat: 37.566 * 1e7
    });
    server.use(
      http.get(ENDPOINT, () => HttpResponse.json(makeNaverResponse([seoulItem]))),
    );

    const adapter = makeVerifier();
    const results = await adapter.searchRaw('서울 카페');

    expect(results).toHaveLength(0);
  });

  it('sends correct headers and display param', async () => {
    let capturedRequest: Request | undefined;
    server.use(
      http.get(ENDPOINT, ({ request }) => {
        capturedRequest = request;
        return HttpResponse.json(makeNaverResponse([]));
      }),
    );

    const adapter = makeVerifier();
    await adapter.searchRaw('test', 3);

    expect(capturedRequest!.headers.get('X-Naver-Client-Id')).toBe('test-client-id');
    expect(capturedRequest!.headers.get('X-Naver-Client-Secret')).toBe('test-client-secret');
    const params = new URL(capturedRequest!.url).searchParams;
    expect(params.get('display')).toBe('3');
    expect(params.get('query')).toBe('test');
  });

  it('default limit is 5', async () => {
    let capturedUrl: string | undefined;
    server.use(
      http.get(ENDPOINT, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json(makeNaverResponse([]));
      }),
    );

    const adapter = makeVerifier();
    await adapter.searchRaw('test');

    const params = new URL(capturedUrl!).searchParams;
    expect(params.get('display')).toBe('5');
  });

  it('401 → throws NaverLocalVerifierError', async () => {
    server.use(
      http.get(ENDPOINT, () => HttpResponse.json({ error: 'unauthorized' }, { status: 401 })),
    );

    const adapter = makeVerifier();
    await expect(adapter.searchRaw('test')).rejects.toBeInstanceOf(NaverLocalVerifierError);
  });

  it('empty items array → returns empty array', async () => {
    server.use(
      http.get(ENDPOINT, () => HttpResponse.json(makeNaverResponse([]))),
    );

    const adapter = makeVerifier();
    const results = await adapter.searchRaw('없는장소');

    expect(results).toHaveLength(0);
  });
});
