import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { KakaoLocalVerifier, KakaoLocalVerifierError } from './KakaoLocalVerifier.js';

// ---------------------------------------------------------------------------
// MSW server
// ---------------------------------------------------------------------------

const BASE_URL = 'https://dapi.kakao.com';
const ENDPOINT = `${BASE_URL}/v2/local/search/keyword`;

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeKakaoPlace(overrides: Record<string, unknown> = {}) {
  return {
    id: '12345678',
    place_name: '성산일출봉',
    category_name: '여행 > 관광,명소 > 자연',
    address_name: '제주특별자치도 서귀포시 성산읍',
    road_address_name: '제주특별자치도 서귀포시 성산읍 일출로 284-12',
    x: '126.942678',  // lng
    y: '33.458485',   // lat
    place_url: 'https://place.map.kakao.com/12345678',
    ...overrides,
  };
}

function makeKakaoResponse(documents: ReturnType<typeof makeKakaoPlace>[]) {
  return { documents, meta: { total_count: documents.length, pageable_count: documents.length, is_end: true } };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeVerifier() {
  return new KakaoLocalVerifier({ restApiKey: 'test-kakao-key', baseUrl: BASE_URL });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('KakaoLocalVerifier.verify', () => {
  it('matched result → returns matched=true with kakaoPlaceId, lat, lng', async () => {
    server.use(
      http.get(ENDPOINT, () => HttpResponse.json(makeKakaoResponse([makeKakaoPlace()]))),
    );

    const verifier = makeVerifier();
    const result = await verifier.verify('성산일출봉', 33.458, 126.942);

    expect(result.matched).toBe(true);
    expect(result.kakaoPlaceId).toBe('12345678');
    expect(result.lat).toBeCloseTo(33.458485, 4);
    expect(result.lng).toBeCloseTo(126.942678, 4);
    expect(result.categoryName).toBe('여행 > 관광,명소 > 자연');
  });

  it('sends Authorization header and query param', async () => {
    let capturedRequest: Request | undefined;
    server.use(
      http.get(ENDPOINT, ({ request }) => {
        capturedRequest = request;
        return HttpResponse.json(makeKakaoResponse([makeKakaoPlace()]));
      }),
    );

    const verifier = makeVerifier();
    await verifier.verify('만장굴');

    expect(capturedRequest!.headers.get('Authorization')).toBe('KakaoAK test-kakao-key');
    const params = new URL(capturedRequest!.url).searchParams;
    expect(params.get('query')).toBe('만장굴');
  });

  it('hint coordinates are passed to narrow search (x, y, radius)', async () => {
    let capturedUrl: string | undefined;
    server.use(
      http.get(ENDPOINT, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json(makeKakaoResponse([makeKakaoPlace()]));
      }),
    );

    const verifier = makeVerifier();
    await verifier.verify('성산일출봉', 33.458, 126.942);

    const params = new URL(capturedUrl!).searchParams;
    expect(params.get('x')).toBe('126.942');
    expect(params.get('y')).toBe('33.458');
    expect(params.get('radius')).toBeDefined();
  });

  it('no documents → returns matched=false with all nulls', async () => {
    server.use(
      http.get(ENDPOINT, () => HttpResponse.json(makeKakaoResponse([]))),
    );

    const verifier = makeVerifier();
    const result = await verifier.verify('없는장소');

    expect(result.matched).toBe(false);
    expect(result.kakaoPlaceId).toBeNull();
    expect(result.lat).toBeNull();
    expect(result.lng).toBeNull();
  });

  it('401 → throws KakaoLocalVerifierError', async () => {
    server.use(
      http.get(ENDPOINT, () =>
        HttpResponse.json({ msg: 'KOE401' }, { status: 401 }),
      ),
    );

    const verifier = makeVerifier();
    await expect(verifier.verify('test')).rejects.toBeInstanceOf(KakaoLocalVerifierError);
  });

  it('network error → throws KakaoLocalVerifierError', async () => {
    server.use(http.get(ENDPOINT, () => HttpResponse.error()));

    const verifier = makeVerifier();
    await expect(verifier.verify('test')).rejects.toBeInstanceOf(KakaoLocalVerifierError);
  });

  it('verify without hint → no x/y/radius params', async () => {
    let capturedUrl: string | undefined;
    server.use(
      http.get(ENDPOINT, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json(makeKakaoResponse([]));
      }),
    );

    const verifier = makeVerifier();
    await verifier.verify('테스트');

    const params = new URL(capturedUrl!).searchParams;
    expect(params.has('x')).toBe(false);
    expect(params.has('y')).toBe(false);
  });
});
