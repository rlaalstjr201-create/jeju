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

  describe('Jeju bbox filter', () => {
    it('Kakao matched but coords outside Jeju bbox → matched=false (산방산 오매칭 케이스)', async () => {
      server.use(
        http.get(ENDPOINT, () =>
          HttpResponse.json(makeKakaoResponse([
            makeKakaoPlace({ y: '34.862', x: '128.539' }), // 경남 거제 산방산
          ])),
        ),
      );

      const verifier = makeVerifier();
      const result = await verifier.verify('산방산');

      expect(result.matched).toBe(false);
      expect(result.lat).toBeNull();
      expect(result.lng).toBeNull();
    });

    it('Kakao matched and coords inside Jeju bbox → matched=true', async () => {
      server.use(
        http.get(ENDPOINT, () =>
          HttpResponse.json(makeKakaoResponse([
            makeKakaoPlace({ y: '33.458485', x: '126.942678' }), // 성산일출봉
          ])),
        ),
      );

      const verifier = makeVerifier();
      const result = await verifier.verify('성산일출봉');

      expect(result.matched).toBe(true);
      expect(result.lat).toBeCloseTo(33.458485, 4);
    });

    it('coords on Jeju bbox boundary (lat=33.0, lng=126.0) → matched=true', async () => {
      server.use(
        http.get(ENDPOINT, () =>
          HttpResponse.json(makeKakaoResponse([
            makeKakaoPlace({ y: '33.0', x: '126.0', place_name: '경계테스트' }),
          ])),
        ),
      );

      const verifier = makeVerifier();
      const result = await verifier.verify('경계테스트');

      expect(result.matched).toBe(true);
    });

    it('추자도 coords (lat=33.95) → matched=true (bbox 34.0으로 확장, ADR-0031)', async () => {
      server.use(
        http.get(ENDPOINT, () =>
          HttpResponse.json(makeKakaoResponse([
            makeKakaoPlace({ y: '33.935432', x: '126.32276', place_name: '신양항' }), // 신양항(하추자항)
          ])),
        ),
      );

      const verifier = makeVerifier();
      const result = await verifier.verify('신양항');

      expect(result.matched).toBe(true);
      expect(result.lat).toBeCloseTo(33.935432, 4);
    });

    it('lat=34.86 (경남 거제) → matched=false (bbox 34.0 상한 초과)', async () => {
      server.use(
        http.get(ENDPOINT, () =>
          HttpResponse.json(makeKakaoResponse([
            makeKakaoPlace({ y: '34.86', x: '128.54' }),
          ])),
        ),
      );

      const verifier = makeVerifier();
      const result = await verifier.verify('산방산');

      expect(result.matched).toBe(false);
    });
  });

  describe('name-match filter (isSubstantialMatch)', () => {
    it('generic phrase query "제주 서귀포 현지인 맛집" → matched=false even if bbox passes', async () => {
      server.use(
        http.get(ENDPOINT, () =>
          HttpResponse.json(makeKakaoResponse([makeKakaoPlace({ place_name: '제주 서귀포 현지인 맛집' })])),
        ),
      );

      const verifier = makeVerifier();
      const result = await verifier.verify('제주 서귀포 현지인 맛집');

      expect(result.matched).toBe(false);
    });

    it('specific spot name "선흘곶식당" exactly matching result → matched=true', async () => {
      server.use(
        http.get(ENDPOINT, () =>
          HttpResponse.json(makeKakaoResponse([makeKakaoPlace({ place_name: '선흘곶식당' })])),
        ),
      );

      const verifier = makeVerifier();
      const result = await verifier.verify('선흘곶식당');

      expect(result.matched).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// searchRaw tests
// ---------------------------------------------------------------------------

describe('KakaoLocalVerifier.searchRaw', () => {
  it('returns KakaoSearchHit array for Jeju results', async () => {
    server.use(
      http.get(ENDPOINT, () => HttpResponse.json(makeKakaoResponse([makeKakaoPlace()]))),
    );

    const verifier = makeVerifier();
    const results = await verifier.searchRaw('성산일출봉');

    expect(results).toHaveLength(1);
    expect(results[0]!.name).toBe('성산일출봉');
    expect(results[0]!.placeId).toBe('12345678');
    expect(results[0]!.lat).toBeCloseTo(33.458485, 4);
    expect(results[0]!.lng).toBeCloseTo(126.942678, 4);
    expect(results[0]!.category).toBe('여행 > 관광,명소 > 자연');
  });

  it('filters out non-Jeju results', async () => {
    const seoulPlace = makeKakaoPlace({
      place_name: '서울 카페',
      x: '126.978',  // Seoul lng
      y: '37.566',   // Seoul lat
    });
    server.use(
      http.get(ENDPOINT, () => HttpResponse.json(makeKakaoResponse([seoulPlace]))),
    );

    const verifier = makeVerifier();
    const results = await verifier.searchRaw('서울 카페');

    expect(results).toHaveLength(0);
  });

  it('sends size param equal to limit', async () => {
    let capturedUrl: string | undefined;
    server.use(
      http.get(ENDPOINT, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json(makeKakaoResponse([]));
      }),
    );

    const verifier = makeVerifier();
    await verifier.searchRaw('test', 3);

    const params = new URL(capturedUrl!).searchParams;
    expect(params.get('size')).toBe('3');
  });

  it('default limit is 5', async () => {
    let capturedUrl: string | undefined;
    server.use(
      http.get(ENDPOINT, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json(makeKakaoResponse([]));
      }),
    );

    const verifier = makeVerifier();
    await verifier.searchRaw('test');

    const params = new URL(capturedUrl!).searchParams;
    expect(params.get('size')).toBe('5');
  });

  it('401 → throws KakaoLocalVerifierError', async () => {
    server.use(
      http.get(ENDPOINT, () => HttpResponse.json({ msg: 'KOE401' }, { status: 401 })),
    );

    const verifier = makeVerifier();
    await expect(verifier.searchRaw('test')).rejects.toBeInstanceOf(KakaoLocalVerifierError);
  });
});
